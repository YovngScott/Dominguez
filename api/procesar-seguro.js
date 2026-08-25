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

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: textSchema
        }
      });

      const data = JSON.parse(response.text);
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

      // Send WhatsApp notification summary
      if (evolutionConfig().ok) {
        const numTaller = normalizarTelefono(process.env.SHOP_WHATSAPP || "8095757986");
        const asegName = data.aseguradora ? `[Seguros ${data.aseguradora}]` : "[Seguros]";
        await enviarTextoWhatsapp({
          number: numTaller,
          text: `📧 *Notificación de Correo (Sin PDFs) - ${asegName}*\n\n` +
                `${customerDetails}` +
                `📝 *Resumen del Correo:* \n${data.resumen_contexto}`
        });
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

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
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
        config: {
          responseMimeType: "application/json",
          responseSchema: schema
        }
      });

      const data = JSON.parse(response.text);
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

    // Upload PDFs to Storage & Save to documentos_caso
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

    // Send WhatsApp Notifications
    if (evolutionConfig().ok) {
      const numTaller = normalizarTelefono(process.env.SHOP_WHATSAPP || "8095757986");
      const clienteNombre = caseData.cliente?.nombre || "Cliente";

      // Alert A: Supplier is Dominguez Auto Pintura (Profit Trigger!)
      if (extractedData.es_suplidor_dominguez) {
        await enviarTextoWhatsapp({
          number: numTaller,
          text: `🔥 *¡APROBACIÓN DE SUMINISTRO PROPIO!* \n\n` +
                `El seguro *${asegNombreLabel}* ha asignado a *DOMINGUEZ AUTO PINTURA* como suplidor para la compra de las piezas del cliente *${clienteNombre}* (Chasis: ...${normalizedChasis.slice(-6)}).\n\n` +
                `Los documentos ya están guardados en el caso. Favor proceder con la facturación y despacho.`
        });
      }

      // Alert B: Price discrepancy report
      if (priceDivergence) {
        await enviarTextoWhatsapp({
          number: numTaller,
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
          number: numTaller,
          text: `✅ *Cotización de ${asegNombreLabel} Procesada (Todo en orden)*\n\n` +
                `Cliente: *${clienteNombre}*\n` +
                `Vehículo: Chasis ...${normalizedChasis.slice(-6)}\n` +
                `Reclamo: ${normalizedReclamo}\n\n` +
                `Los montos coinciden perfectamente. Los documentos han sido vinculados al caso con éxito.`
        });
      }
    }

    return res.status(200).json({ success: true, case_id: casoId, mode: "pdf_comparison" });

  } catch (error) {
    console.error("Error processing insurance mail:", error);
    return res.status(500).json({ error: "Internal server error in PDF flow", message: error.message });
  }
}
