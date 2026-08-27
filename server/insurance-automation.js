/* global process, Buffer */
import crypto from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  assessPdfPackage,
  compareQuoteLines,
  extractIdentifiers,
  formatReviewAlert,
  isDominguezSupplier,
  normalizeIdentifier,
} from "./insurance-core.js";

const MAX_PDF_BYTES = 15 * 1024 * 1024;
const PDF_BUCKET_PENDING = "seguros-pendientes";
const PDF_BUCKET_CASES = "documentos-casos";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

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

  // Supabase Cron ejecuta la lectura de Gmail aunque no haya nadie con el
  // Centro de mensajes abierto. Esta credencial solo autoriza esa operación.
  const cronSecret = process.env.GMAIL_POLL_SECRET;
  const suppliedCronSecret = req.headers["x-supabase-cron-secret"];
  if (action === "gmail_poll" && cronSecret && suppliedCronSecret && timingSafeEqual(cronSecret, suppliedCronSecret)) {
    return "scheduler";
  }

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

function oauthCredentials() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Falta configurar GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET.");
  return { clientId, clientSecret };
}

function credentialKey() {
  const secret = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY || process.env.STAGE_INSURANCE_SHARED_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("No hay una clave de cifrado disponible para Gmail.");
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptCredential(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", credentialKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptCredential(value) {
  const [version, iv, tag, encrypted] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Credencial de Gmail inválida.");
  const decipher = crypto.createDecipheriv("aes-256-gcm", credentialKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function oauthRedirectUri(req) {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI) return process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const protocol = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "dominguez.vercel.app").split(",")[0].trim();
  return `${protocol}://${host}/api/gmail-callback`;
}

function encodeOauthState(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", credentialKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function decodeOauthState(state) {
  const [encoded, signature] = String(state || "").split(".");
  if (!encoded || !signature) throw new Error("Autorización de Google inválida.");
  const expected = crypto.createHmac("sha256", credentialKey()).update(encoded).digest();
  const received = Buffer.from(signature, "base64url");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new Error("Autorización de Google inválida.");
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  if (!payload.redirectUri || Number(payload.expiresAt || 0) < Date.now()) throw new Error("La autorización de Google venció.");
  return payload;
}

async function googleRequest(url, init = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error_description || body?.error?.message || `Google respondió ${response.status}.`);
  return body;
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
    "gemini-3.5-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
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
  if (contacts?.[0]) return { ok: true, kind: "insurance", insurer: contacts[0].aseguradora?.nombre || null };
  if (suppliers?.[0]) return { ok: true, kind: "supplier", insurer: suppliers[0].nombre || null };
  return { ok: false, kind: "unknown", insurer: null };
}

async function assistantConfiguration(supabase) {
  const [{ data: config }, { data: actions }] = await Promise.all([
    supabase.from("asistente_correo_config").select("nombre, prompt_protegido, prompt_personalizado, version").eq("id", "principal").maybeSingle(),
    supabase.from("asistente_correo_acciones").select("nombre, condicion, instruccion, prioridad").eq("activa", true).order("orden"),
  ]);
  return {
    protectedPrompt: config?.prompt_protegido || "Analiza todos los correos. Nunca respondas ni inventes datos.",
    customPrompt: config?.prompt_personalizado || "",
    actions: actions || [],
  };
}

const EMAIL_CLASSIFICATION_SCHEMA = {
  type: "object",
  properties: {
    category: { type: "string", enum: ["seguro", "suplidor", "cliente", "factura", "cita", "interno", "publicidad", "otro"] },
    priority: { type: "string", enum: ["baja", "normal", "alta", "critica"] },
    summary: { type: "string" },
    suggested_action: { type: "string" },
    requires_review: { type: "boolean" },
  },
  required: ["category", "priority", "summary", "suggested_action", "requires_review"],
};

async function classifyEmail(ai, payload, pdfs, configuration) {
  const actions = configuration.actions.map((action) =>
    `- ${action.nombre} [${action.prioridad}]: si ${action.condicion}, entonces ${action.instruccion}`
  ).join("\n");
  const parts = [{ text: `${configuration.protectedPrompt}\n\nCOMPORTAMIENTO DEL PROPIETARIO:\n${configuration.customPrompt || "Sin instrucciones adicionales."}\n\nACCIONES CONFIGURADAS:\n${actions || "Sin acciones adicionales."}\n\nClasifica este correo entrante. Usa la categoría publicidad para spam, promociones masivas, boletines, publicidad y notificaciones sociales sin valor operativo. No clasifiques como publicidad un correo real de una aseguradora, suplidor, cliente o empleado aunque sea automático. El resumen debe ser breve, específico y accionable. No digas que ejecutaste acciones que no ejecutaste.\nRemitente: ${payload.sender || "No identificado"}\nAsunto: ${payload.subject || "(sin asunto)"}\nCuerpo: ${(payload.body || "").slice(0, 12000)}\nPDF adjuntos: ${pdfs.length}` }];
  for (const pdf of pdfs) parts.push({ inlineData: { mimeType: "application/pdf", data: pdf.base64 } });
  return generateStructured(ai, parts, EMAIL_CLASSIFICATION_SCHEMA);
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
    documents: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          legible: { type: "boolean" },
          confidence: { type: "number" },
          summary: { type: "string" },
          sections_present: { type: "array", items: { type: "string", enum: ["pieza", "mano_obra"] } },
          supplier: { type: "string" },
        },
        required: ["name", "legible", "confidence", "summary"],
      },
    },
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
          supplier: { type: "string" },
          section: { type: "string", enum: ["pieza", "mano_obra", "otro"] },
        },
        required: ["type", "description", "quantity", "effective_subtotal", "supplier", "section"],
      },
    },
  },
  required: ["chassis", "plate", "insurer", "confidence", "summary", "documents", "lines"],
};

async function extractInsurance(ai, payload, pdfs, configuration) {
  const ids = extractIdentifiers(`${payload.subject || ""}\n${payload.body || ""}`);
  const prompt = `
Eres un perito de Domínguez Auto Pintura. Extrae fielmente órdenes/cotizaciones de aseguradoras dominicanas.
No inventes líneas ni montos. El siniestro/reclamo NO se usa para vincular el caso.
Busca chasis y placa primero en el asunto/cuerpo y, si faltan, en los PDF.
Cada renglón debe clasificarse como pieza o mano_obra y debe incluir el proveedor que aparece en esa línea o sección.
Detecta si cada PDF contiene sección de piezas, mano de obra, ambas o ninguna. Para cada uno conserva cantidad, precio unitario,
descuento, subtotal efectivo que realmente paga el seguro antes de ITBIS, ITBIS y total con ITBIS.
Si el documento muestra "Valor", "Monto" o "Precio total" después de descuento/cobertura, ese es effective_subtotal.
No conviertas un total general de mano de obra en una línea si existen renglones individuales.
Analiza los ${pdfs.length} PDF como UN SOLO PAQUETE, pero devuelve una entrada en documents para cada archivo y no omitas ninguno.
Si un PDF solo contiene piezas, NO declares eliminada ninguna línea de mano de obra de nuestra cotización: esa sección queda como no incluida/no evaluable.
Si un PDF solo contiene mano de obra, aplica la misma regla para piezas. Solo marca una línea como eliminada cuando la sección correspondiente sí está presente y la línea no aparece.
No mezcles piezas o mano de obra cuyo proveedor no sea Domínguez Auto Pintura; conserva esas líneas con su proveedor para clasificarlas como otro proveedor.
Si un solo PDF no es legible o genera duda, baja su confidence: el paquete completo quedará bloqueado.
Si algo no es legible, usa cadena vacía/0 y baja confidence; nunca adivines.

REGLAS INMUTABLES Y CONFIGURACIÓN:
${configuration.protectedPrompt}
${configuration.customPrompt || ""}

Asunto: ${payload.subject || "(sin asunto)"}
Remitente: ${payload.sender || ""}
Cuerpo: ${(payload.body || "").slice(0, 6000)}
Chasis detectado en encabezado: ${ids.chassis || "no"}
Placa detectada en encabezado: ${ids.plate || "no"}
`;
  const parts = [{ text: prompt }];
  for (const [index, pdf] of pdfs.entries()) {
    parts.push({ text: `PDF ${index + 1}: ${safeFileName(pdf.name)}` });
    parts.push({ inlineData: { mimeType: "application/pdf", data: pdf.base64 } });
  }
  const extracted = await generateStructured(ai, parts, EXTRACTION_SCHEMA);
  extracted.chassis = ids.chassis || normalizeIdentifier(extracted.chassis) || "";
  extracted.plate = ids.plate || normalizeIdentifier(extracted.plate) || "";
  return extracted;
}

function insuranceScope(extraction) {
  const aliases = String(process.env.DOMINGUEZ_SUPPLIER_ALIASES || "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  const lines = Array.isArray(extraction?.lines) ? extraction.lines : [];
  const documents = Array.isArray(extraction?.documents) ? extraction.documents : [];
  // Algunos formatos de aseguradora imprimen el suplidor una sola vez en el
  // encabezado del PDF y dejan vacía esa columna en cada línea. En ese caso
  // heredamos el suplidor del documento, pero solo si no hay documentos de
  // terceros mezclados (para no atribuir líneas ajenas a Dominguez).
  const documentSuppliers = documents.map((document) => String(document.supplier || "").trim()).filter(Boolean);
  const allDocumentsForUs = documentSuppliers.length > 0 && documentSuppliers.every((supplier) => isDominguezSupplier(supplier, aliases));
  const anyDocumentForUs = documentSuppliers.some((supplier) => isDominguezSupplier(supplier, aliases));
  const dominguezLines = lines.filter((line) => isDominguezSupplier(line.supplier, aliases) || (allDocumentsForUs && !String(line.supplier || "").trim()));
  const sections = new Set();
  for (const document of documents) {
    for (const section of document.sections_present || []) sections.add(section);
  }
  // Compatibilidad con modelos antiguos que no devuelvan sections_present.
  if (!sections.size) for (const line of lines) if (line.section !== "otro") sections.add(line.type);
  const sectionsPresent = { pieza: sections.has("pieza"), mano_obra: sections.has("mano_obra") };
  const hasPartsForUs = dominguezLines.some((line) => (line.section || line.type) === "pieza");
  const hasLaborForUs = dominguezLines.some((line) => (line.section || line.type) === "mano_obra");
  const unknownSupplier = lines.some((line) => !String(line.supplier || "").trim()) && !allDocumentsForUs;
  return {
    aliases,
    dominguezLines,
    sectionsPresent,
    hasPartsForUs,
    hasLaborForUs,
    orderClosed: hasPartsForUs,
    otherSupplierOnly: lines.length > 0 && !dominguezLines.length && !unknownSupplier,
    supplierUnknown: unknownSupplier,
    supplierDocumentMatch: anyDocumentForUs,
  };
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
  if (error) {
    // Dos revisiones pueden coincidir (botón manual, cron o reintento de Vercel).
    // La base sigue siendo la autoridad: el segundo proceso reutiliza la fila
    // ganadora en vez de detener toda la cuenta por la restricción UNIQUE.
    if (error.code === "23505") {
      const { data: existing, error: existingError } = await supabase
        .from("revisiones_seguro")
        .select("id")
        .eq("source_message_id", payload.messageId)
        .single();
      if (!existingError && existing?.id) return existing.id;
    }
    throw error;
  }

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
  if (existing?.estado === "error") {
    // Los errores técnicos son reintentables. Sustituimos el marcador de error
    // por el resultado real; no contiene PDFs aprobados ni acciones del usuario.
    const { error: retryDeleteError } = await supabase.from("revisiones_seguro").delete().eq("id", existing.id).eq("estado", "error");
    if (retryDeleteError) throw retryDeleteError;
  } else if (existing) {
    return { duplicate: true, reviewId: existing.id, status: existing.estado };
  }

  const senderStatus = await authorizedSender(supabase, payload.sender);
  const pdfs = (Array.isArray(payload.attachments) ? payload.attachments : [])
    .filter((file) => file?.base64 && (/pdf/i.test(file.mimeType || "") || /\.pdf$/i.test(file.name || "")))
    .slice(0, 8);
  const configuration = await assistantConfiguration(supabase);
  const classification = await classifyEmail(ai, payload, pdfs, configuration);
  if (classification.category === "publicidad") return { ignored: true, reason: "spam_or_promotion" };
  const ids = extractIdentifiers(`${payload.subject || ""}\n${payload.body || ""}`);

  if (!pdfs.length) {
    const caseData = await findCase(supabase, ids.chassis, ids.plate, null);
    const reviewId = await insertReview(supabase, payload, {
      caso_id: caseData?.id || null,
      chasis_detectado: ids.chassis,
      placa_detectada: ids.plate,
      autorizado_remitente: senderStatus.ok,
      estado: "revision",
      motivo_revision: "correo_sin_pdf",
      resumen: classification.summary,
      categoria_correo: classification.category,
      prioridad_correo: classification.priority,
      accion_sugerida: classification.suggested_action,
      extraccion: { tipo: "correo_sin_pdf", clasificacion: classification },
    }, []);
    return {
      reviewId,
      category: classification.category,
      alert: `📧 *Correo clasificado*\n\nRemitente: ${payload.sender || "No identificado"}\nAsunto: ${payload.subject || "(sin asunto)"}\n\n${classification.summary}\n\nAcción sugerida: ${classification.suggested_action}\n\nEl asistente no respondió el correo.`,
    };
  }

  const isInsurance = senderStatus.kind === "insurance" || classification.category === "seguro";
  if (!isInsurance) {
    const caseData = await findCase(supabase, ids.chassis, ids.plate, payload.caseId || null);
    const reviewId = await insertReview(supabase, payload, {
      caso_id: caseData?.id || null,
      chasis_detectado: ids.chassis,
      placa_detectada: ids.plate,
      autorizado_remitente: senderStatus.ok,
      estado: "revision",
      motivo_revision: "correo_general_con_pdf",
      resumen: classification.summary,
      categoria_correo: classification.category,
      prioridad_correo: classification.priority,
      accion_sugerida: classification.suggested_action,
      extraccion: { tipo: "correo_general_con_pdf", clasificacion: classification },
    }, pdfs);
    return { reviewId, category: classification.category, requiresReview: true };
  }

  const extraction = await extractInsurance(ai, payload, pdfs, configuration);
  const caseData = await findCase(supabase, extraction.chassis, extraction.plate, payload.caseId || null);
  const quote = caseData ? await latestQuote(supabase, caseData.id) : null;
  const scope = insuranceScope(extraction);
  // Solo comparamos las líneas cuyo proveedor es Dominguez. Las de terceros
  // quedan visibles en la extracción, pero nunca generan diferencias nuestras.
  const comparison = quote
    ? compareQuoteLines(quote, scope.dominguezLines, { sectionsPresent: scope.sectionsPresent })
    : null;
  const packageStatus = assessPdfPackage(pdfs.length, extraction.documents, comparison);
  const lowConfidence = Number(extraction.confidence || 0) < 0.8 || packageStatus.incomplete || packageStatus.uncertain;
  const reasons = [
    !senderStatus.ok && "remitente_no_autorizado",
    !caseData && "caso_no_vinculado",
    caseData && !quote && "caso_sin_cotizacion",
    lowConfidence && "extraccion_baja_confianza",
    comparison?.hasDifferences && "diferencias_detectadas",
    scope.otherSupplierOnly && "pdf_otro_proveedor",
    scope.supplierUnknown && "proveedor_no_identificado",
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
    resumen: scope.orderClosed
      ? `🔒 Orden cerrada: ${extraction.summary} Hay piezas asignadas a Dominguez Auto Pintura; verificar compra y recepción.`
      : comparison?.hasDifferences
        ? `${extraction.summary} Se detectaron diferencias en al menos uno de los ${pdfs.length} PDF; todo el paquete requiere revisión.`
        : extraction.summary,
    categoria_correo: "seguro",
    prioridad_correo: scope.otherSupplierOnly ? "baja" : (reasons.length ? "alta" : classification.priority),
    accion_sugerida: scope.otherSupplierOnly
      ? "Conservar como referencia; no requiere acción de Dominguez."
      : comparison?.hasDifferences
      ? "Revisar todas las diferencias antes de aceptar cualquier PDF de este correo."
      : classification.suggested_action,
    extraccion: { ...extraction, clasificacion: classification, pdf_count: pdfs.length, alcance: scope },
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
    orderClosed: Boolean(scope.orderClosed),
  };
  return { reviewId, alert: formatReviewAlert(review), comparison, reasons };
}

async function recordIngestError(supabase, ai, payload, error) {
  if (!payload?.messageId) return null;
  const { data: existing } = await supabase.from("revisiones_seguro").select("id").eq("source_message_id", payload.messageId).maybeSingle();
  if (existing) return existing.id;
  let summary = `No se pudo analizar el correo "${payload.subject || "(sin asunto)"}". Error técnico: ${error?.message || "desconocido"}. No se respondió ni se guardó ningún documento.`;
  try {
    const generated = await generateStructured(ai, [{ text: `Redacta un resumen breve en español para un operador. No inventes causas ni soluciones. Correo: ${payload.subject || "(sin asunto)"}. Remitente: ${payload.sender || "desconocido"}. Error real: ${error?.message || "desconocido"}. Aclara que no se respondió el correo.` }], {
      type: "object", properties: { summary: { type: "string" } }, required: ["summary"],
    });
    summary = generated.summary;
  } catch {
    // Si la propia IA está caída, conservamos un resumen técnico veraz.
  }
  return insertReview(supabase, payload, {
    estado: "error",
    motivo_revision: "error_procesamiento",
    resumen: summary,
    categoria_correo: "otro",
    prioridad_correo: "critica",
    accion_sugerida: "Reintentar el análisis o revisar manualmente este correo.",
    extraccion: { tipo: "error", mensaje: error?.message || "Error desconocido" },
  }, []);
}

function gmailAuthUrl(req, loginHint = "") {
  const { clientId } = oauthCredentials();
  const redirectUri = oauthRedirectUri(req);
  const state = encodeOauthState({ redirectUri, expiresAt: Date.now() + 10 * 60_000 });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: `${GMAIL_SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  if (loginHint) params.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function completeGmailOauth(supabase, req) {
  const pending = decodeOauthState(req.query.state);
  const { clientId, clientSecret } = oauthCredentials();
  const tokens = await googleRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: String(req.query.code || ""), client_id: clientId, client_secret: clientSecret,
      redirect_uri: pending.redirectUri, grant_type: "authorization_code",
    }),
  });
  const profile = await googleRequest("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  const email = String(profile.emailAddress || "").trim().toLowerCase();
  if (!email) throw new Error("Google no devolvió la dirección de la cuenta.");
  const { data: existing } = await supabase.from("asistente_correo_cuentas").select("id, refresh_token_cifrado").eq("email", email).maybeSingle();
  if (!existing) {
    const { count } = await supabase.from("asistente_correo_cuentas").select("id", { count: "exact", head: true });
    if (Number(count || 0) >= 4) throw new Error("Ya alcanzaste el máximo de cuatro cuentas de correo.");
  }
  const encrypted = tokens.refresh_token ? encryptCredential(tokens.refresh_token) : existing?.refresh_token_cifrado;
  if (!encrypted) throw new Error("Google no devolvió acceso sin conexión. Revoca el permiso anterior y vuelve a conectar.");
  const { error } = await supabase.from("asistente_correo_cuentas").upsert({
    ...(existing?.id ? { id: existing.id } : {}), email, etiqueta: "Correo del taller",
    refresh_token_cifrado: encrypted, activa: true, ultimo_error: null,
    actualizada_en: new Date().toISOString(),
  }, { onConflict: "email" });
  if (error) throw error;
  return email;
}

async function gmailAccessToken(account) {
  const { clientId, clientSecret } = oauthCredentials();
  const tokens = await googleRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: decryptCredential(account.refresh_token_cifrado), grant_type: "refresh_token",
    }),
  });
  return tokens.access_token;
}

function gmailHeader(headers, name) {
  return headers?.find((header) => String(header.name).toLowerCase() === name.toLowerCase())?.value || "";
}

function gmailMessageKey(message, accountId, providerMessageId) {
  const internetId = gmailHeader(message.payload?.headers, "Message-ID")
    .trim().toLowerCase().replace(/^<|>$/g, "").slice(0, 500);
  return internetId ? `gmail:rfc822:${internetId}` : `gmail:account:${accountId}:${providerMessageId}`;
}

function isOwnGmailSender(sender, accountEmail) {
  const from = emailAddress(sender);
  return Boolean(from && accountEmail && from === String(accountEmail).trim().toLowerCase());
}

function ignoredGmailLabels(labelIds) {
  const labels = new Set(labelIds || []);
  return ["SPAM", "TRASH", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"].some((label) => labels.has(label));
}

export { gmailMessageKey, ignoredGmailLabels, isOwnGmailSender };

function gmailBody(part) {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) return Buffer.from(part.body.data, "base64url").toString("utf8");
  for (const child of part.parts || []) {
    const value = gmailBody(child);
    if (value.trim()) return value;
  }
  if (part.mimeType === "text/html" && part.body?.data) {
    return Buffer.from(part.body.data, "base64url").toString("utf8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

function gmailAttachmentParts(part) {
  if (!part) return [];
  return [...(part.filename ? [part] : []), ...(part.parts || []).flatMap(gmailAttachmentParts)];
}

async function processGmailAccount(supabase, ai, account, seenMessageKeys) {
  const accessToken = await gmailAccessToken(account);
  const since = account.ultima_revision ? new Date(new Date(account.ultima_revision).getTime() - 2 * 60_000) : new Date(Date.now() - 24 * 60 * 60_000);
  const ids = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({ userId: "me", q: `in:inbox -in:chats after:${Math.floor(since.getTime() / 1000)}`, maxResults: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const listed = await googleRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`, { headers: { authorization: `Bearer ${accessToken}` } });
    ids.push(...(listed.messages || []).map((message) => message.id).filter(Boolean));
    pageToken = ids.length < 500 ? String(listed.nextPageToken || "") : "";
  } while (pageToken);

  let processed = 0;
  let duplicates = 0;
  let ignored = 0;
  let failures = 0;
  const failureMessages = [];
  for (const messageId of ids.reverse()) {
    let messagePayload = { messageId: `${account.id}:${messageId}`, accountEmail: account.email };
    try {
      const message = await googleRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`, { headers: { authorization: `Bearer ${accessToken}` } });
      const globalMessageKey = gmailMessageKey(message, account.id, messageId);
      if (seenMessageKeys.has(globalMessageKey)) {
        duplicates += 1;
        continue;
      }
      seenMessageKeys.add(globalMessageKey);
      messagePayload.messageId = globalMessageKey;
      if (ignoredGmailLabels(message.labelIds)) {
        ignored += 1;
        continue;
      }
      const attachments = [];
      for (const part of gmailAttachmentParts(message.payload).slice(0, 12)) {
        const isPdf = /pdf/i.test(part.mimeType || "") || /\.pdf$/i.test(part.filename || "");
        if (!isPdf || !part.body?.attachmentId || Number(part.body.size || 0) > MAX_PDF_BYTES) continue;
        const file = await googleRequest(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(part.body.attachmentId)}`, { headers: { authorization: `Bearer ${accessToken}` } });
        if (file.data) attachments.push({ name: part.filename || "documento.pdf", mimeType: "application/pdf", base64: Buffer.from(file.data, "base64url").toString("base64") });
      }
      messagePayload = {
        ...messagePayload,
        sender: gmailHeader(message.payload?.headers, "From"), subject: gmailHeader(message.payload?.headers, "Subject"),
        body: gmailBody(message.payload).slice(0, 12000),
        receivedAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString(),
        attachments,
      };
      // No mostrar copias de correos enviados por el propio taller, aunque
      // Gmail las haya dejado en Recibidos o en una etiqueta compartida.
      if (isOwnGmailSender(messagePayload.sender, account.email)) {
        ignored += 1;
        continue;
      }
      const result = await ingest(supabase, ai, messagePayload);
      if (result?.ignored) ignored += 1;
      else if (result?.duplicate) duplicates += 1;
      else processed += 1;
    } catch (messageError) {
      failures += 1;
      failureMessages.push(String(messageError?.message || messageError));
      try {
        await recordIngestError(supabase, ai, messagePayload, messageError);
      } catch (recordError) {
        failureMessages.push(`No se pudo registrar el fallo: ${String(recordError?.message || recordError)}`);
      }
    }
  }
  const { error } = await supabase.from("asistente_correo_cuentas").update({
    ultima_revision: new Date().toISOString(),
    ultimo_error: failures ? `${failures} correo(s) requieren atención. ${failureMessages[0] || "Revisa el Centro de mensajes."}`.slice(0, 800) : null,
    ultimo_message_id: ids.at(-1) || account.ultimo_message_id || null, actualizada_en: new Date().toISOString(),
  }).eq("id", account.id);
  if (error) throw error;
  return { processed, duplicates, ignored, failures };
}

async function pollGmailAccounts(supabase, ai) {
  const lockToken = crypto.randomUUID();
  const startedAt = new Date();
  const lockedUntil = new Date(startedAt.getTime() + 4 * 60_000).toISOString();
  const { data: lock, error: lockError } = await supabase
    .from("asistente_correo_poll_estado")
    .update({
      lock_token: lockToken,
      bloqueado_hasta: lockedUntil,
      ultima_ejecucion_inicio: startedAt.toISOString(),
      actualizado_en: startedAt.toISOString(),
    })
    .eq("id", "gmail")
    .or(`bloqueado_hasta.is.null,bloqueado_hasta.lt.${startedAt.toISOString()}`)
    .select("id")
    .maybeSingle();
  if (lockError) throw lockError;
  if (!lock) return { skipped: true, reason: "poll_in_progress" };

  try {
    const { data: accounts, error } = await supabase.from("asistente_correo_cuentas").select("*").eq("activa", true).order("conectada_en");
    if (error) throw error;
    let messages = 0;
    let duplicates = 0;
    let ignored = 0;
    let failures = 0;
    const seenMessageKeys = new Set();
    for (const account of accounts || []) {
      try {
        const result = await processGmailAccount(supabase, ai, account, seenMessageKeys);
        messages += result.processed;
        duplicates += result.duplicates;
        ignored += result.ignored;
        failures += result.failures;
      } catch (accountError) {
        failures += 1;
        await supabase.from("asistente_correo_cuentas").update({ ultimo_error: String(accountError?.message || accountError).slice(0, 800), actualizada_en: new Date().toISOString() }).eq("id", account.id);
      }
    }
    const result = { accounts: accounts?.length || 0, messages, duplicates, ignored, failures };
    await supabase.from("asistente_correo_poll_estado").update({
      lock_token: null,
      bloqueado_hasta: null,
      ultima_ejecucion_fin: new Date().toISOString(),
      ultimo_resultado: result,
      ultimo_error: null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", "gmail").eq("lock_token", lockToken);
    return result;
  } catch (pollError) {
    await supabase.from("asistente_correo_poll_estado").update({
      lock_token: null,
      bloqueado_hasta: null,
      ultima_ejecucion_fin: new Date().toISOString(),
      ultimo_error: String(pollError?.message || pollError).slice(0, 800),
      actualizado_en: new Date().toISOString(),
    }).eq("id", "gmail").eq("lock_token", lockToken);
    throw pollError;
  }
}

async function listGmailAccounts(supabase) {
  const { data, error } = await supabase.from("asistente_correo_cuentas").select("id,email,etiqueta,activa,ultima_revision,ultimo_error,conectada_en").order("conectada_en");
  if (error) throw error;
  return data || [];
}

async function disconnectGmailAccount(supabase, id) {
  const { data: account, error } = await supabase.from("asistente_correo_cuentas").select("*").eq("id", id).single();
  if (error) throw error;
  try {
    const token = decryptCredential(account.refresh_token_cifrado);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" } });
  } catch { /* La eliminación local no depende de que Google responda. */ }
  const { error: deleteError } = await supabase.from("asistente_correo_cuentas").delete().eq("id", id);
  if (deleteError) throw deleteError;
  return { ok: true };
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
  let action = "";
  try {
    clients = buildClients();
    action = String(req.query.action || req.body?.action || "list").replace(/^insurance_/, "");
    if (action === "oauth_callback" && req.method === "GET") {
      const email = await completeGmailOauth(clients.supabase, req);
      return res.redirect(302, `/mensajes?correo=conectado&email=${encodeURIComponent(email)}`);
    }
    if (!await authorizeRequest(clients.supabase, req, res, action)) return;
    if (action === "ingest" && req.method === "POST") return json(res, 200, await ingest(clients.supabase, clients.ai, req.body || {}));
    if (action === "gmail_accounts" && req.method === "GET") return json(res, 200, { data: await listGmailAccounts(clients.supabase), oauthConfigured: Boolean((process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID) && process.env.GOOGLE_OAUTH_CLIENT_SECRET) });
    if (action === "gmail_oauth_url" && req.method === "POST") return json(res, 200, { url: gmailAuthUrl(req, String(req.body?.email || "").trim().toLowerCase()) });
    if (action === "gmail_poll" && req.method === "POST") return json(res, 200, await pollGmailAccounts(clients.supabase, clients.ai));
    if (action === "gmail_disconnect" && req.method === "POST") return json(res, 200, await disconnectGmailAccount(clients.supabase, String(req.body?.id || "")));
    if (action === "list" && req.method === "GET") return json(res, 200, { data: await listReviews(clients.supabase, req) });
    if (action === "detail" && req.method === "GET") return json(res, 200, { data: await detailReview(clients.supabase, String(req.query.id || "")) });
    if (action === "approve" && req.method === "POST") return json(res, 200, await approveReview(clients.supabase, String(req.body?.id || "")));
    if (action === "reject" && req.method === "POST") return json(res, 200, await rejectReview(clients.supabase, String(req.body?.id || "")));
    return json(res, 405, { error: "Acción o método no permitido." });
  } catch (error) {
    console.error("[seguro-automatizacion]", error);
    if (action === "oauth_callback") return res.redirect(302, `/mensajes?correo=error&detalle=${encodeURIComponent(error?.message || "No se pudo conectar Gmail.")}`);
    if (action === "ingest" && clients) {
      try { await recordIngestError(clients.supabase, clients.ai, req.body || {}, error); }
      catch (recordError) { console.error("[seguro-automatizacion] No se pudo registrar el fallo:", recordError); }
    }
    const status = /ya fue resuelta|Primero debes|no está|baja confianza|no tiene|Hay diferencias/.test(error?.message || "") ? 409 : 500;
    return json(res, status, { error: error?.message || "Error interno en automatización de seguros." });
  }
}
