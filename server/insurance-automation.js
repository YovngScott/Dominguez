/* global process, Buffer */
import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  compareQuoteLines,
  extractIdentifiers,
  formatReviewAlert,
  normalizeIdentifier,
} from "./insurance-core.js";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_BUCKET_PENDING = "seguros-pendientes";
const PDF_BUCKET_CASES = "documentos-casos";

function json(res, status, body) {
  return res.status(status).json(body);
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function authorizeRequest(supabase, req, res, action) {
  const configured = process.env.STAGE_INSURANCE_SHARED_SECRET;
  const supplied = req.headers["x-stage-insurance-secret"];
  if (configured && supplied && timingSafeEqual(configured, supplied)) return "integration";

  // El panel puede revisar y resolver mensajes con la sesión real de Supabase.
  // La ingestión queda reservada al secreto servidor-a-servidor.
  if (action !== "ingest") {
    const authorization = String(req.headers.authorization || "");
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    if (token) {
      const { data: auth, error: authError } = await supabase.auth.getUser(token);
      if (!authError && auth?.user) {
        const { data: profile, error: profileError } = await supabase
          .from("perfiles")
          .select("rol, activo")
          .eq("user_id", auth.user.id)
          .maybeSingle();
        if (!profileError && profile?.activo && profile.rol === "administrativo_general") {
          return "dashboard";
        }
      }
    }
  }
  json(res, 401, { error: "Integración o sesión administrativa no autorizada." });
  return null;
}

function emailAddress(value) {
  const match = String(value || "").match(/<([^>]+)>/);
  return String(match?.[1] || value || "").trim().toLowerCase();
}

function safeFileName(value) {
  return String(value || "documento-seguro.pdf")
    .split("")
    .map((char) => (char.charCodeAt(0) < 32 || "\\/:*?\"<>|".includes(char) ? "_" : char))
    .join("")
    .slice(0, 180) || "documento-seguro.pdf";
}

function buildClients() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!url || !key || !gemini) throw new Error("Faltan credenciales de Supabase o Gemini.");
  return {
    supabase: createClient(url, key, { auth: { persistSession: false } }),
    ai: new GoogleGenAI({ apiKey: gemini }),
  };
}

async function generateStructured(ai, parts, schema) {
  const candidates = [
    process.env.GEMINI_INSURANCE_MODEL,
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ].filter(Boolean);
  let lastError;
  for (const model of [...new Set(candidates)]) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts }],
        config: { responseMimeType: "application/json", responseSchema: schema, temperature: 0 },
      });
      if (!response.text) throw new Error("Gemini devolvió una respuesta vacía.");
      return JSON.parse(response.text);
    } catch (error) {
      lastError = error;
      console.warn(`[seguros] Falló extracción con ${model}:`, error?.message || error);
    }
  }
  throw new Error(`No se pudo extraer el documento: ${lastError?.message || "modelos no disponibles"}`);
}

async function authorizedSender(supabase, sender) {
  const email = emailAddress(sender);
  if (!email) return { ok: false, insurer: null };
  const [{ data: contacts }, { data: suppliers }] = await Promise.all([
    supabase
      .from("aseguradora_contactos")
      .select("email, aseguradora:aseguradoras(nombre)")
      .ilike("email", email)
      .limit(1),
    supabase.from("suplidores").select("email, nombre").ilike("email", email).eq("activo", true).limit(1),
  ]);
  if (contacts?.[0]) return { ok: true, insurer: contacts[0].aseguradora?.nombre || null };
  if (suppliers?.[0]) return { ok: true, insurer: suppliers[0].nombre || null };
  return { ok: false, insurer: null };
}

async function findCase(supabase, chassis, plate, directId) {
  const select = "id, placa, chasis, estado, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre)";
  if (directId) {
    const { data } = await supabase.from("casos").select(select).eq("id", directId).maybeSingle();
    return data || null;
  }
  if (chassis) {
    const { data } = await supabase.from("casos").select(select).ilike("chasis", chassis).limit(1);
    if (data?.[0]) return data[0];
  }
  if (plate) {
    const { data } = await supabase.from("casos").select(select).ilike("placa", plate).limit(1);
    if (data?.[0]) return data[0];
  }
  return null;
}

async function latestQuote(supabase, caseId) {
  const { data, error } = await supabase
    .from("cotizaciones")
    .select("id, numero, total, subtotal, items_piezas, items_mano_obra, created_at")
    .eq("caso_id", caseId)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    chassis: { type: "string" },
    plate: { type: "string" },
    insurer: { type: "string" },
    document_type: { type: "string" },
    confidence: { type: "number" },
    summary: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["pieza", "mano_obra"] },
          description: { type: "string" },
          quantity: { type: "number" },
          unit_price: { type: "number" },
          discount: { type: "number" },
          effective_subtotal: { type: "number" },
          tax: { type: "number" },
          total: { type: "number" },
        },
        required: ["type", "description", "quantity", "effective_subtotal"],
      },
    },
  },
  required: ["chassis", "plate", "insurer", "confidence", "summary", "lines"],
};

async function extractInsurance(ai, payload, pdfs) {
  const ids = extractIdentifiers(`${payload.subject || ""}\n${payload.body || ""}`);
  const prompt = `
Eres un perito de Domínguez Auto Pintura. Extrae fielmente órdenes/cotizaciones de aseguradoras dominicanas.
No inventes líneas ni montos. El siniestro/reclamo NO se usa para vincular el caso.
Busca chasis y placa primero en el asunto/cuerpo y, si faltan, en los PDF.
Cada renglón debe clasificarse como pieza o mano_obra. Para cada uno conserva cantidad, precio unitario,
descuento, subtotal efectivo que realmente paga el seguro antes de ITBIS, ITBIS y total con ITBIS.
Si el documento muestra "Valor", "Monto" o "Precio total" después de descuento/cobertura, ese es effective_subtotal.
No conviertas un total general de mano de obra en una línea si existen renglones individuales.
Si algo no es legible, usa cadena vacía/0 y baja confidence; nunca adivines.

Asunto: ${payload.subject || "(sin asunto)"}
Remitente: ${payload.sender || ""}
Cuerpo: ${(payload.body || "").slice(0, 6000)}
Chasis detectado en encabezado: ${ids.chassis || "no"}
Placa detectada en encabezado: ${ids.plate || "no"}
`;
  const parts = [{ text: prompt }];
  for (const pdf of pdfs) parts.push({ inlineData: { mimeType: "application/pdf", data: pdf.base64 } });
  const extracted = await generateStructured(ai, parts, EXTRACTION_SCHEMA);
  extracted.chassis = ids.chassis || normalizeIdentifier(extracted.chassis) || "";
  extracted.plate = ids.plate || normalizeIdentifier(extracted.plate) || "";
  return extracted;
}

async function insertReview(supabase, payload, values, pdfs) {
  const { data: review, error } = await supabase
    .from("revisiones_seguro")
    .insert({
      source_message_id: payload.messageId,
      source_account: payload.accountEmail || null,
      remitente: payload.sender || null,
      asunto: payload.subject || null,
      recibido_en: payload.receivedAt || new Date().toISOString(),
      ...values,
    })
    .select("id")
    .single();
  if (error) throw error;

  for (const pdf of pdfs) {
    const buffer = Buffer.from(pdf.base64, "base64");
    if (!buffer.length || buffer.length > MAX_PDF_BYTES) throw new Error(`PDF inválido o demasiado grande: ${pdf.name}`);
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const path = `${review.id}/${hash}-${safeFileName(pdf.name)}`;
    const { error: uploadError } = await supabase.storage
      .from(PDF_BUCKET_PENDING)
      .upload(path, buffer, { contentType: "application/pdf", upsert: false });
    if (uploadError) throw uploadError;
    const { error: rowError } = await supabase.from("revisiones_seguro_archivos").insert({
      revision_id: review.id,
      nombre_archivo: safeFileName(pdf.name),
      storage_path: path,
      sha256: hash,
      tamano: buffer.length,
    });
    if (rowError) throw rowError;
  }
  return review.id;
}

async function ingest(supabase, ai, payload) {
  if (!payload.messageId) throw new Error("messageId es obligatorio para prevenir duplicados.");
  const { data: existing } = await supabase
    .from("revisiones_seguro")
    .select("id, estado")
    .eq("source_message_id", payload.messageId)
    .maybeSingle();
  if (existing) return { duplicate: true, reviewId: existing.id, status: existing.estado };

  const senderStatus = await authorizedSender(supabase, payload.sender);
  if (!senderStatus.ok) {
    return { ignored: true, reason: "remitente_no_autorizado" };
  }
  const pdfs = (Array.isArray(payload.attachments) ? payload.attachments : [])
    .filter((file) => file?.base64 && (/pdf/i.test(file.mimeType || "") || /\.pdf$/i.test(file.name || "")))
    .slice(0, 8);

  if (!pdfs.length) {
    const summary = await generateStructured(ai, [{ text: `Resume en español, sin inventar, este correo de seguro para el taller. Remitente: ${payload.sender || ""}\nAsunto: ${payload.subject || ""}\n${(payload.body || "").slice(0, 9000)}` }], {
      type: "object",
      properties: { summary: { type: "string" } },
      required: ["summary"],
    });
    const ids = extractIdentifiers(`${payload.subject || ""}\n${payload.body || ""}`);
    const caseData = await findCase(supabase, ids.chassis, ids.plate, null);
    const reviewId = await insertReview(supabase, payload, {
      caso_id: caseData?.id || null,
      chasis_detectado: ids.chassis,
      placa_detectada: ids.plate,
      autorizado_remitente: senderStatus.ok,
      estado: "revision",
      motivo_revision: "correo_sin_pdf",
      resumen: summary.summary,
      extraccion: { tipo: "correo_sin_pdf" },
    }, []);
    return {
      reviewId,
      alert: `📧 *Correo de seguro sin PDF*\n\nRemitente: ${payload.sender || "No identificado"}\nAsunto: ${payload.subject || "(sin asunto)"}\n\n${summary.summary}\n\nQuedó en revisión; el bot no respondió el correo.`,
    };
  }

  const extraction = await extractInsurance(ai, payload, pdfs);
  const caseData = await findCase(supabase, extraction.chassis, extraction.plate, payload.caseId || null);
  const quote = caseData ? await latestQuote(supabase, caseData.id) : null;
  const comparison = quote ? compareQuoteLines(quote, extraction.lines) : null;
  const lowConfidence = Number(extraction.confidence || 0) < 0.8;
  const reasons = [
    !senderStatus.ok && "remitente_no_autorizado",
    !caseData && "caso_no_vinculado",
    caseData && !quote && "caso_sin_cotizacion",
    lowConfidence && "extraccion_baja_confianza",
    comparison?.hasDifferences && "diferencias_detectadas",
  ].filter(Boolean);
  const reviewValues = {
    caso_id: caseData?.id || null,
    cotizacion_id: quote?.id || null,
    chasis_detectado: extraction.chassis || null,
    placa_detectada: extraction.plate || null,
    aseguradora: extraction.insurer || senderStatus.insurer,
    autorizado_remitente: senderStatus.ok,
    confianza: Math.max(0, Math.min(1, Number(extraction.confidence || 0))),
    estado: "revision",
    motivo_revision: reasons.join(",") || "aprobacion_obligatoria",
    resumen: extraction.summary,
    extraccion: extraction,
    comparacion: comparison,
  };
  const reviewId = await insertReview(supabase, payload, reviewValues, pdfs);
  const review = {
    sender: payload.sender,
    subject: payload.subject,
    caseMatched: Boolean(caseData),
    caseId: caseData?.id,
    caseLabel: caseData ? `${caseData.cliente?.nombre_completo || "Cliente"} · ${caseData.marca?.nombre || ""} ${caseData.modelo?.nombre || ""}`.trim() : null,
    plate: extraction.plate,
    chassis: extraction.chassis,
    comparison,
  };
  return { reviewId, alert: formatReviewAlert(review), comparison, reasons };
}

async function listReviews(supabase, req) {
  let query = supabase
    .from("revisiones_seguro")
    .select("id, source_account, remitente, asunto, recibido_en, caso_id, cotizacion_id, chasis_detectado, placa_detectada, aseguradora, autorizado_remitente, confianza, estado, motivo_revision, resumen, comparacion, creado_en")
    .order("creado_en", { ascending: false })
    .limit(Math.min(100, Math.max(1, Number(req.query.limit || 50))));
  if (req.query.status) query = query.eq("estado", String(req.query.status));
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function detailReview(supabase, id) {
  const [{ data: review, error }, { data: files }] = await Promise.all([
    supabase.from("revisiones_seguro").select("*").eq("id", id).single(),
    supabase.from("revisiones_seguro_archivos").select("id, nombre_archivo, storage_path, tamano, documento_caso_id").eq("revision_id", id),
  ]);
  if (error) throw error;
  const signed = await Promise.all((files || []).map(async (file) => {
    const { data } = await supabase.storage.from(PDF_BUCKET_PENDING).createSignedUrl(file.storage_path, 600);
    return { ...file, url: data?.signedUrl || null };
  }));
  return { ...review, archivos: signed };
}

async function approveReview(supabase, id) {
  const review = await detailReview(supabase, id);
  if (review.estado !== "revision") throw new Error("Esta revisión ya fue resuelta.");
  if (!review.caso_id) throw new Error("Primero debes vincular la revisión con un caso.");
  if (!review.autorizado_remitente) throw new Error("El remitente no está en Contactos/Suplidores autorizados.");
  if (!review.cotizacion_id) throw new Error("El caso no tiene una cotización para comparar.");
  if (Number(review.confianza || 0) < 0.8) throw new Error("La extracción tiene baja confianza; corrígela o recházala.");
  if (review.comparacion?.hasDifferences) {
    throw new Error("Hay diferencias: el bot no puede guardar este PDF. Ajusta el caso manualmente y rechaza la revisión.");
  }

  const { data: types } = await supabase.from("tipos_documento").select("id").eq("nombre", "Cotización del seguro").limit(1);
  const typeId = types?.[0]?.id || null;
  for (const file of review.archivos) {
    if (file.documento_caso_id) continue;
    const { data: blob, error: downloadError } = await supabase.storage.from(PDF_BUCKET_PENDING).download(file.storage_path);
    if (downloadError) throw downloadError;
    const buffer = Buffer.from(await blob.arrayBuffer());
    const finalPath = `${review.caso_id}/seguro-${id}-${safeFileName(file.nombre_archivo)}`;
    const { error: uploadError } = await supabase.storage.from(PDF_BUCKET_CASES).upload(finalPath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    const { data: doc, error: docError } = await supabase.from("documentos_caso").insert({
      caso_id: review.caso_id,
      tipo_id: typeId,
      nombre_archivo: file.nombre_archivo,
      storage_path: finalPath,
      url: "",
    }).select("id").single();
    if (docError) throw docError;
    await supabase.from("revisiones_seguro_archivos").update({ documento_caso_id: doc.id }).eq("id", file.id);
    await supabase.storage.from(PDF_BUCKET_PENDING).remove([file.storage_path]);
  }
  const { error } = await supabase.from("revisiones_seguro").update({
    estado: "aprobado",
    aprobado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  }).eq("id", id).eq("estado", "revision");
  if (error) throw error;
  return { ok: true };
}

async function rejectReview(supabase, id) {
  const review = await detailReview(supabase, id);
  if (review.estado !== "revision") throw new Error("Esta revisión ya fue resuelta.");
  const paths = review.archivos.map((file) => file.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from(PDF_BUCKET_PENDING).remove(paths);
    if (storageError) throw storageError;
  }
  const { error: filesError } = await supabase.from("revisiones_seguro_archivos").delete().eq("revision_id", id);
  if (filesError) throw filesError;
  const { error } = await supabase.from("revisiones_seguro").update({
    estado: "rechazado",
    rechazado_en: new Date().toISOString(),
    actualizado_en: new Date().toISOString(),
  }).eq("id", id).eq("estado", "revision");
  if (error) throw error;
  return { ok: true };
}

export default async function handler(req, res) {
  let clients;
  try {
    clients = buildClients();
    const action = String(req.query.action || req.body?.action || "list").replace(/^insurance_/, "");
    if (!await authorizeRequest(clients.supabase, req, res, action)) return;
    if (action === "ingest" && req.method === "POST") return json(res, 200, await ingest(clients.supabase, clients.ai, req.body || {}));
    if (action === "list" && req.method === "GET") return json(res, 200, { data: await listReviews(clients.supabase, req) });
    if (action === "detail" && req.method === "GET") return json(res, 200, { data: await detailReview(clients.supabase, String(req.query.id || "")) });
    if (action === "approve" && req.method === "POST") return json(res, 200, await approveReview(clients.supabase, String(req.body?.id || "")));
    if (action === "reject" && req.method === "POST") return json(res, 200, await rejectReview(clients.supabase, String(req.body?.id || "")));
    return json(res, 405, { error: "Acción o método no permitido." });
  } catch (error) {
    console.error("[seguro-automatizacion]", error);
    const status = /ya fue resuelta|Primero debes|no está|baja confianza|no tiene|Hay diferencias/.test(error?.message || "") ? 409 : 500;
    return json(res, status, { error: error?.message || "Error interno en automatización de seguros." });
  }
}
