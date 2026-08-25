/* global process, Buffer */
// Endpoint for automated insurance mail and PDF processing.
// Receives email JSON metadata and attachments (Base64), runs them through Gemini,
// queries Supabase, matches the case, uploads the documents, and alerts via WhatsApp.
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { enviarTextoWhatsapp, normalizarTelefono, evolutionConfig } from "../whatsapp/evolution.js";

// Helper to generate UUID
function generateUUID() {
  return crypto.randomUUID();
}

// Helper to query active employee phone numbers from DB
async function obtenerTelefonosNotificacion(supabase) {
  try {
    const { data } = await supabase.from("telefonos_notificacion").select("telefono").eq("activo", true);
    if (data && data.length > 0) {
      return [...new Set(data.map((t) => normalizarTelefono(t.telefono)))];
    }
  } catch {
    /* fallback */
  }
  return [normalizarTelefono(process.env.SHOP_WHATSAPP || "8095757986")];
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!sbUrl || !serviceKey || !geminiKey) {
    return res.status(500).json({
      error: "Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY)."
    });
  }

  const { subject, body, attachments } = req.body || {};

  // Initialize Supabase and Gemini Clients
  const supabase = createClient(sbUrl, serviceKey, {
    auth: { persistSession: false }
  });
  const ai = new GoogleGenAI({ apiKey: geminiKey });
  const action = req.query?.action || req.body?.action;

  // El bot de correo automático (sin acción y sin casoId explícito) está desactivado a solicitud del usuario
  if (!action && !req.body?.casoId && !req.query?.casoId) {
    return res.status(200).json({ success: false, message: "El bot de correo automático ha sido desactivado." });
  }

  if (action === "listar_modelos") {
    try {
      const list = await ai.models.list();
      const names = [];
      for await (const m of list) {
        names.push({ name: m.name, displayName: m.displayName, supportedGenerationMethods: m.supportedGenerationMethods });
      }
      return res.status(200).json({ success: true, models: names });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Función auxiliar de fallback para evitar errores 429 (Rate Limits) en producción
  async function ejecutarConModelosGemini(contents, responseSchema) {
    const MODEL_CANDIDATES = [
      "gemini-3.6-flash",
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-3.5-flash-lite"
    ];
    let lastError = null;

    for (const model of MODEL_CANDIDATES) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema
          }
        });
        if (response && response.text) {
          return JSON.parse(response.text);
        }
      } catch (err) {
        console.warn(`[Gemini Fallback] Modelo ${model} no disponible:`, err?.message || err);
        lastError = err;
      }
    }

    const msg = lastError?.message || "";
    if (msg.includes("429") || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("La IA está recibiendo muchas solicitudes en este instante. Por favor reintenta en 10 segundos.");
    }
    throw new Error("No se pudo completar el análisis con IA: " + (lastError?.message || "Error de conexión"));
  }

  // --------------------------------------------------------------------------
  // ACCIÓN 1: PROCESAR DOCUMENTOS CON IA (Carnet de Seguro y/o Matrícula)
  // --------------------------------------------------------------------------
  if (action === "procesar_documentos") {
    const { imagenes = [] } = req.body || {};
    if (!imagenes || imagenes.length === 0) {
      return res.status(400).json({ error: "No se enviaron imágenes de documentos para procesar." });
    }

    try {
      const parts = [
        {
          text: `
          Eres un perito experto en digitalización de documentos vehiculares de la República Dominicana (Carnets de Seguros y Matrículas de la DGII).
          Analiza detenidamente la(s) imagen(es) provista(s) y extrae todos los datos legibles para precargar una cotización de taller de colisiones.
          
          REGLAS DE EXTRACCIÓN CRÍTICAS:
          - cliente_nombre: DEBES extraer prioritariamente el nombre que aparece impreso en el CARNET DEL SEGURO (el Asegurado/Conductor). Si hay diferencias de nombre entre la matrícula y el carnet del seguro, coloca el nombre que está en el CARNET DEL SEGURO.
          - aseguradora_nombre: Identifica y extrae con total precisión el nombre de la aseguradora del carnet del seguro (ej: "Seguros Reservas", "La Colonial de Seguros", "Atlántica de Seguros", "Coop-Seguros", "Seguros Sura", "Seguros La Internacional", "Mapfre", etc.). Observa detenidamente logotipos o marcas de agua para no dejar este campo en blanco.
          - telefono: Teléfono de contacto si está visible.
          - email: Correo electrónico si está visible.
          - rnc_cedula: Cédula o RNC del asegurado o propietario.
          - marca: Marca del vehículo (ej: Toyota, Honda, Hyundai, Kia, Nissan, etc.).
          - modelo: Modelo del vehículo (ej: Corolla, Civic, Tucson, Sportage, CR-V, etc.).
          - anio: Año del vehículo como texto (ej: "2020").
          - color: Color del vehículo.
          - placa: Número de placa del vehículo.
          - chasis: Número de chasis / VIN del vehículo (17 caracteres alfanuméricos).
          - tipo_vehiculo: Tipo de carrocería si se deduce (ej: "Sedan", "Jeepeta / SUV", "Camioneta", etc.).
          - numero_poliza: Número de póliza de seguro.
          - numero_reclamo: Número de reclamo o siniestro si aparece en el carnet o volante.
          `
        }
      ];

      for (const img of imagenes) {
        let rawBase64 = img.base64 || img;
        if (rawBase64.includes("base64,")) {
          rawBase64 = rawBase64.split("base64,")[1];
        }
        parts.push({
          inlineData: {
            mimeType: img.mimeType || "image/jpeg",
            data: rawBase64
          }
        });
      }

      const docSchema = {
        type: "object",
        properties: {
          cliente_nombre: { type: "string" },
          telefono: { type: "string" },
          email: { type: "string" },
          rnc_cedula: { type: "string" },
          marca: { type: "string" },
          modelo: { type: "string" },
          anio: { type: "string" },
          color: { type: "string" },
          placa: { type: "string" },
          chasis: { type: "string" },
          tipo_vehiculo: { type: "string" },
          aseguradora_nombre: { type: "string" },
          numero_poliza: { type: "string" },
          numero_reclamo: { type: "string" }
        }
      };

      const extracted = await ejecutarConModelosGemini(
        [{ role: "user", parts }],
        docSchema
      );

      return res.status(200).json({ success: true, data: extracted });
    } catch (err) {
      console.error("Error procesando documentos con IA:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // ACCIÓN 2: PROCESAR AUDIO O DICTADO DE PIEZAS Y MANO DE OBRA
  // --------------------------------------------------------------------------
  if (action === "procesar_audio_piezas") {
    const { audioBase64, mimeType = "audio/webm", textoTranscrito } = req.body || {};

    if (!audioBase64 && !textoTranscrito) {
      return res.status(400).json({ error: "No se proporcionó audio ni texto para procesar." });
    }

    try {
      const parts = [
        {
          text: `
          Eres el perito automotriz en jefe de "Dominguez Auto Pintura".
          Tu trabajo es escuchar la nota de voz grabada por el técnico/evaluador del taller y estructurar con total precisión la lista exacta de piezas y mano de obra a cotizar.

          REGLAS ESTRICTAS DE NOMENCLATURA CANÓNICA DE PIEZAS (CARROCERÍA):
          Aplica rigurosamente las siguientes abreviaturas en mayúsculas:
          - Delantero / Delantera -> "DELT"
          - Trasero / Trasera -> "TRAS"
          - Derecho / Derecha (Right Hand) -> "RH"
          - Izquierdo / Izquierda (Left Hand) -> "LH"
          - Superior -> "SUP"
          - Inferior -> "INF"
          - Interior -> "INT"
          - Exterior -> "EXT"
          - Con Guía -> "C/G"
          - Sin Guía -> "S/G"
          - Central -> "CENT"

          EJEMPLOS DE ESTANDARIZACIÓN DE PIEZAS:
          - "Puerta delantera derecha" -> "PUERTA DELT RH"
          - "Guardalodo delantero izquierdo" -> "GUARDALODO DELT LH"
          - "Bumper delantero" -> "BUMPER DELT"
          - "Halógeno izquierdo" -> "HALOGENO LH"
          - "Foco delantero derecho" -> "FOCO DELT RH"
          - "Stop trasero izquierdo" -> "STOP TRAS LH"
          - "Guía de bumper trasero derecho" -> "GUIA BUMPER TRAS RH"
          - "Compuerta trasera" -> "COMPUERTA TRAS"
          - "Punta de chasis delantera derecha" -> "PUNTA DE CHASIS DELT RH"
          - "Parrilla delantera superior" -> "PARRILLA DELT SUP"

          REGLAS ESTRICTAS DE SERVICIOS / MANO DE OBRA (ABREVIATURAS OBLIGATORIAS):
          Debes identificar con precisión cada labor y clasificarla usando exactamente estas abreviaturas oficiales de Domínguez Auto Pintura:
          - "Desabollar y pintar" / "Desabolladura y pintura" -> Nombre: "DESAB Y PINT"
          - "Cambiar y pintar" / "Reemplazar y pintar" -> Nombre: "CAMB Y PINT"
          - "Cambiar" / "Reemplazar" / "Instalar" (solo cambio) -> Nombre: "CAMBIAR"
          - "Desmontar" / "Desmontar y montar" -> Nombre: "DESMONTAR"
          - "Pintar" / "Pintura" (solo pintura) -> Nombre: "PINTURA"
          - "Enderezar" -> Nombre: "ENDEREZAR"
          - "Alinear chasis" -> Nombre: "ALINEAR CHASIS"
          - "Pulir" / "Pulido general" -> Nombre: "PULIDO"

          Para cada servicio, asigna en el campo "pieza" el nombre canónico de la pieza sobre la que se trabaja (ej: pieza: "PUERTA DELT RH", "GUARDALODO DELT LH", "BUMPER TRAS", etc.).

          DISTINCIÓN ENTRE PIEZAS Y SERVICIOS:
          - Si el evaluador menciona una pieza a comprar/reemplazar (ej: "Bumper delantero, foco izquierdo"), agrégala a la lista de "piezas".
          - Si el evaluador menciona una labor a realizar (ej: "Desabollar y pintar puerta delantera derecha, cambiar y pintar guardalodo"), agrégala a la lista de "servicios".
          - Si menciona ambos (ej: "Bumper delantero nuevo y desabollar y pintar capó"), coloca "BUMPER DELT" en piezas y "DESAB Y PINT" con pieza "CAPO" en servicios.
          - Si menciona cantidades (ej: "2 amortiguadores"), asigna cantidad = 2. De lo contrario, cantidad = 1.

          EXTRACCIÓN Y SEPARACIÓN POR PRECIOS:
          - Si el evaluador dice un precio inmediatamente después de describir un trabajo o pieza (ej: "desabollar y pintar puerta trasera derecha, 5500" o "bumper delantero, 4200"), extrae ese número en el campo "precio" (ej: precio: 5500).
          - REGLA DE ORO DE SEPARACIÓN: Un precio mencionado delimita estrictamente el final de ese item. Lo que se mencione DESPUÉS de ese precio debe ser tratado obligatoriamente como una nueva pieza o servicio independiente (ej: "desabollar y pintar puerta trasera derecha, 5500, desabollar guardalodo delantero, 3000" debe generar dos servicios diferentes: uno para la puerta de 5500 y otro para el guardalodo de 3000).
          `
        }
      ];

      if (audioBase64) {
        let cleanBase64 = audioBase64;
        if (cleanBase64.includes("base64,")) {
          cleanBase64 = cleanBase64.split("base64,")[1];
        }
        parts.push({
          inlineData: {
            mimeType: mimeType.split(";")[0].trim(),
            data: cleanBase64
          }
        });
      }

      if (textoTranscrito) {
        parts.push({
          text: `Texto transcrito por el dictado: "${textoTranscrito}"`
        });
      }

      const itemsSchema = {
        type: "object",
        properties: {
          transcripcion_resumen: { type: "string" },
          piezas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                cantidad: { type: "integer" },
                precio: { type: "number" },
                itbis_pct: { type: "number" },
                incluye_itbis: { type: "boolean" }
              },
              required: ["nombre", "cantidad"]
            }
          },
          servicios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nombre: { type: "string" },
                pieza: { type: "string" },
                cantidad: { type: "integer" },
                precio: { type: "number" },
                itbis_pct: { type: "number" },
                incluye_itbis: { type: "boolean" }
              },
              required: ["nombre", "cantidad"]
            }
          }
        },
        required: ["piezas", "servicios"]
      };

      const parsed = await ejecutarConModelosGemini(
        [{ role: "user", parts }],
        itemsSchema
      );

      return res.status(200).json({ success: true, data: parsed });
    } catch (err) {
      console.error("Error procesando audio con IA:", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // FLOW A: EMAIL WITHOUT PDF ATTACHMENTS (Info / Context notification)
  // --------------------------------------------------------------------------
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    try {
      const textSchema = {
        type: "object",
        properties: {
          chasis: { type: "string" },
          numero_reclamo: { type: "string" },
          numero_poliza: { type: "string" },
          aseguradora: { type: "string" },
          resumen_contexto: { type: "string" }
        },
        required: ["resumen_contexto"]
      };

      const prompt = `
        You are an expert system for managing auto repair quotes and insurance communications in the Dominican Republic.
        Analyze this email subject and body and extract:
        - chasis (the 17-character VIN number if mentioned, else null).
        - numero_reclamo (the claim number if mentioned, else null).
        - numero_poliza (the policy number if mentioned, else null).
        - aseguradora (identify the insurance company name, must be one of: 'Reservas', 'Colonial', 'Atlántica', 'Coop-Seguro', 'Sura', 'Internacional', or 'Personal').
        - resumen_contexto (A concise summary in Spanish of what the email is about and what action or reply is required from the workshop. Keep it short, clear and highly actionable).

        Subject: ${subject || ""}
        Body: ${body || ""}
      `;

      const data = await ejecutarConModelosGemini(
        [{ role: "user", parts: [{ text: prompt }] }],
        textSchema
      );
      let customerDetails = "";
      
      // Try to find case if chassis or claim was found
      if (data.chasis || data.numero_reclamo) {
        const queryChasis = (data.chasis || "").trim().toUpperCase();
        const queryReclamo = (data.numero_reclamo || "").trim();
        
        let caseData = null;
        if (queryChasis) {
          const { data: cases } = await supabase
            .from("casos")
            .select("id, chasis, cliente:clientes(nombre)")
            .ilike("chasis", `%${queryChasis}%`)
            .limit(1);
          if (cases && cases.length > 0) caseData = cases[0];
        }
        if (!caseData && queryReclamo) {
          const { data: cases } = await supabase
            .from("casos")
            .select("id, chasis, cliente:clientes(nombre)")
            .ilike("numero_reclamo", `%${queryReclamo}%`)
            .limit(1);
          if (cases && cases.length > 0) caseData = cases[0];
        }

        if (caseData) {
          customerDetails = `👤 *Cliente:* ${caseData.cliente?.nombre || "Asignado"}\n🚗 *Chasis:* ...${caseData.chasis.slice(-6)}\n`;
        }
      }

      // Send WhatsApp notification summary to all active employee recipients
      if (evolutionConfig().ok) {
        const telefonosRecipientes = await obtenerTelefonosNotificacion(supabase);
        const asegName = data.aseguradora ? `[Seguros ${data.aseguradora}]` : "[Seguros]";
        for (const num of telefonosRecipientes) {
          await enviarTextoWhatsapp({
            number: num,
            text: `📧 *Notificación de Correo (Sin PDFs) - ${asegName}*\n\n` +
                  `${customerDetails}` +
                  `📝 *Resumen del Correo:* \n${data.resumen_contexto}`
          });
        }
      }

      return res.status(200).json({ success: true, mode: "text_summary" });

    } catch (err) {
      console.error("Error processing email text flow:", err);
      return res.status(500).json({ error: "Internal server error in text flow", message: err.message });
    }
  }

  // --------------------------------------------------------------------------
  // FLOW B: EMAIL WITH PDF ATTACHMENTS (Quotation / Approvals)
  // --------------------------------------------------------------------------
  try {
    let extractedData = null;
    const processedAttachments = [];

    // Process each attachment using Gemini
    for (const attachment of attachments) {
      if (!attachment.data || !attachment.contentType.includes("pdf")) {
        continue;
      }

      // Call Gemini 1.5 Flash to extract information from the PDF
      const schema = {
        type: "object",
        properties: {
          chasis: { type: "string" },
          numero_reclamo: { type: "string" },
          numero_poliza: { type: "string" },
          aseguradora: { type: "string" },
          es_suplidor_dominguez: { type: "boolean" },
          piezas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                descripcion: { type: "string" },
                precio_seguro: { type: "number" },
                cantidad: { type: "integer" }
              },
              required: ["descripcion", "precio_seguro"]
            }
          },
          mano_de_obra_total: { type: "number" }
        },
        required: ["chasis", "es_suplidor_dominguez", "piezas"]
      };

      const prompt = `
        You are an expert system for managing auto repair quotes and insurance approvals in the Dominican Republic.
        Analyze this insurance PDF (Ajuste Técnico or Parts Order) and extract:
        - chasis (the 17-character VIN number of the vehicle, make sure it is exactly 17 characters).
        - numero_reclamo (the claim number, e.g. AUTO-2026-7417).
        - numero_poliza (the policy number, e.g. AUTO-106563-2).
        - aseguradora (identify the insurance company name, must be one of: 'Reservas', 'Colonial', 'Atlántica', 'Coop-Seguro', 'Sura', 'Internacional', or 'Personal').
        - es_suplidor_dominguez (true if the PDF is a parts order and the selected supplier/suplidor for parts is "Dominguez Auto Pintura").
        - piezas (array of parts approved: description, price, quantity).
        - mano_de_obra_total (numeric total labor amount approved).
      `;

      const data = await ejecutarConModelosGemini(
        [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: "application/pdf",
                  data: attachment.data // base64 string
                }
              }
            ]
          }
        ],
        schema
      );
      if (data && data.chasis) {
        extractedData = data; // Keep the parsed data
        processedAttachments.push({
          name: attachment.name || "documento_seguro.pdf",
          base64: attachment.data
        });
      }
    }

    if (!extractedData || !extractedData.chasis) {
      return res.status(422).json({ error: "Could not extract valid vehicle VIN/Chassis from the PDF attachments." });
    }

    // Query Supabase to find the matching Case
    const normalizedChasis = extractedData.chasis.trim().toUpperCase();
    const normalizedReclamo = (extractedData.numero_reclamo || "").trim();

    let caseData = null;

    // Check if caseId is passed in the request (e.g. from the manual page upload)
    const casoIdParam = req.body?.casoId || req.query?.casoId;
    if (casoIdParam) {
      const { data: directCase } = await supabase
        .from("casos")
        .select("id, placa, chasis, numero_reclamo, estado, cliente:clientes(nombre)")
        .eq("id", casoIdParam)
        .limit(1);
      if (directCase && directCase.length > 0) {
        caseData = directCase[0];
      }
    }

    if (!caseData) {
      // Search by Chassis first
      const { data: casesByChasis } = await supabase
        .from("casos")
        .select("id, placa, chasis, numero_reclamo, estado, cliente:clientes(nombre)")
        .ilike("chasis", `%${normalizedChasis}%`)
        .limit(1);

      if (casesByChasis && casesByChasis.length > 0) {
        caseData = casesByChasis[0];
      } else if (normalizedReclamo) {
        // Fallback: Search by Claim number
        const { data: casesByReclamo } = await supabase
          .from("casos")
          .select("id, placa, chasis, numero_reclamo, estado, cliente:clientes(nombre)")
          .ilike("numero_reclamo", `%${normalizedReclamo}%`)
          .limit(1);

        if (casesByReclamo && casesByReclamo.length > 0) {
          caseData = casesByReclamo[0];
        }
      }
    }

    const asegNombreLabel = extractedData.aseguradora ? `Seguros ${extractedData.aseguradora}` : "Seguro";

    if (!caseData) {
      // Send alert of unmapped email to the shop
      if (evolutionConfig().ok) {
        const numTaller = normalizarTelefono(process.env.SHOP_WHATSAPP || "8095757986");
        await enviarTextoWhatsapp({
          number: numTaller,
          text: `⚠️ *Cotización de ${asegNombreLabel} sin Caso Asignado*\n\n` +
                `Llegó un correo de cotización para el Chasis: *${normalizedChasis}* (Reclamo: ${normalizedReclamo}), pero no pudimos encontrar ningún caso que coincida en la base de datos de Dominguez Auto Pintura.\n\n` +
                `Por favor, crea el caso o revisa el chasis en el sistema.`
        });
      }
      return res.status(404).json({ error: "Case not found for the extracted Chassis or Claim number." });
    }

    const casoId = caseData.id;

    // Upload PDFs to Storage & Save to documentos_caso (Only for automatic email webhook flow)
    if (!casoIdParam) {
      const { data: docTypes } = await supabase
        .from("tipos_documento")
        .select("id")
        .eq("nombre", "Cotización del seguro")
        .limit(1);

      const tipoId = docTypes && docTypes.length > 0 ? docTypes[0].id : null;

      for (const file of processedAttachments) {
        const buffer = Buffer.from(file.base64, "base64");
        const storagePath = `${casoId}/${generateUUID()}.pdf`;

        // Upload to storage bucket
        const { error: uploadErr } = await supabase.storage
          .from("documentos-casos")
          .upload(storagePath, buffer, { contentType: "application/pdf" });

        if (uploadErr) throw uploadErr;

        // Save document record
        await supabase.from("documentos_caso").insert({
          caso_id: casoId,
          tipo_id: tipoId,
          nombre_archivo: file.name,
          storage_path: storagePath,
          url: ""
        });
      }
    }

    // Compare prices with local active quotation
    const { data: quotes } = await supabase
      .from("cotizaciones")
      .select("id, numero, total, subtotal, items_piezas, items_mano_obra")
      .eq("caso_id", casoId)
      .order("created_at", { ascending: false })
      .limit(1);

    const activeQuote = quotes && quotes.length > 0 ? quotes[0] : null;
    let comparisonReport = "";
    let priceDivergence = false;

    if (activeQuote) {
      const localParts = activeQuote.items_piezas || [];

      // Fuzzy compare approved parts with our local parts
      const discrepancies = [];
      
      extractedData.piezas.forEach(approvedPart => {
        // Find match by simple substring or similarity
        const matchingPart = localParts.find(lp => 
          lp.descripcion.toLowerCase().includes(approvedPart.descripcion.toLowerCase()) ||
          approvedPart.descripcion.toLowerCase().includes(lp.descripcion.toLowerCase())
        );

        if (matchingPart) {
          const localPrice = Number(matchingPart.precio || 0);
          const approvedPrice = Number(approvedPart.precio_seguro || 0);
          if (approvedPrice !== localPrice) {
            priceDivergence = true;
            discrepancies.push(`- *${approvedPart.descripcion}:* Local RD$ ${localPrice.toLocaleString()} ➔ Seguro RD$ ${approvedPrice.toLocaleString()}`);
          }
        } else {
          priceDivergence = true;
          discrepancies.push(`- *${approvedPart.descripcion}:* Aprobada por seguro (RD$ ${approvedPart.precio_seguro.toLocaleString()}) pero no listada en cotización local.`);
        }
      });

      if (priceDivergence) {
        comparisonReport = `\n\n🔍 *Diferencias encontradas:*\n${discrepancies.join("\n")}`;
      }
    }

    // Send WhatsApp Notifications to all active employee recipients
    if (evolutionConfig().ok) {
      const telefonosRecipientes = await obtenerTelefonosNotificacion(supabase);
      const clienteNombre = caseData.cliente?.nombre || "Cliente";

      for (const num of telefonosRecipientes) {
        // Alert A: Supplier is Dominguez Auto Pintura (Profit Trigger!)
        if (extractedData.es_suplidor_dominguez) {
          await enviarTextoWhatsapp({
            number: num,
            text: `🔥 *¡APROBACIÓN DE SUMINISTRO PROPIO!* \n\n` +
                  `El seguro *${asegNombreLabel}* ha asignado a *DOMINGUEZ AUTO PINTURA* como suplidor para la compra de las piezas del cliente *${clienteNombre}* (Chasis: ...${normalizedChasis.slice(-6)}).\n\n` +
                  `Los documentos ya están guardados en el caso. Favor proceder con la facturación y despacho.`
          });
        }

        // Alert B: Price discrepancy report
        if (priceDivergence) {
          await enviarTextoWhatsapp({
            number: num,
            text: `⚠️ *Cotización de ${asegNombreLabel} Procesada (Con diferencias)*\n\n` +
                  `Cliente: *${clienteNombre}*\n` +
                  `Vehículo: Chasis ...${normalizedChasis.slice(-6)}\n` +
                  `Reclamo: ${normalizedReclamo}` +
                  `${comparisonReport}\n\n` +
                  `Los documentos han sido cargados al caso automáticamente.`
          });
        } else {
          // Alert C: perfect match notification
          await enviarTextoWhatsapp({
            number: num,
            text: `✅ *Cotización de ${asegNombreLabel} Procesada (Todo en orden)*\n\n` +
                  `Cliente: *${clienteNombre}*\n` +
                  `Vehículo: Chasis ...${normalizedChasis.slice(-6)}\n` +
                  `Reclamo: ${normalizedReclamo}\n\n` +
                  `Los montos coinciden perfectamente. Los documentos han sido vinculados al caso con éxito.`
          });
        }
      }
    }

    return res.status(200).json({ success: true, case_id: casoId, mode: "pdf_comparison" });

  } catch (error) {
    console.error("Error processing insurance mail:", error);
    return res.status(500).json({ error: "Internal server error in PDF flow", message: error.message });
  }
}
