/* global process */
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  enviarTextoWhatsapp,
  normalizarTelefono,
  obtenerBase64Mensaje,
} from "../whatsapp/evolution.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!sbUrl || !serviceKey || !geminiKey) {
    return res.status(500).json({
      error: "Falta configurar variables de entorno (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY)."
    });
  }

  // 1) Validar que sea un evento de mensaje entrante
  const { event, data } = req.body || {};
  if (event !== "messages.upsert" || !data) {
    return res.status(200).send("Ignorado: No es un evento messages.upsert");
  }

  // 2) Evitar bucle infinito si el mensaje es enviado por la propia instancia (nosotros mismos)
  if (data.key?.fromMe) {
    return res.status(200).send("Ignorado: Mensaje enviado por la propia instancia (fromMe = true)");
  }

  const remoteJid = data.key?.remoteJid;
  if (!remoteJid || remoteJid.includes("@g.us")) {
    return res.status(200).send("Ignorado: Mensaje de grupo o JID no válido");
  }

  const pushName = data.pushName || "Cliente";
  const messageId = data.key?.id;
  const senderNumber = remoteJid.split("@")[0].replace(/\D/g, "");

  try {
    // Inicializar clientes
    const supabase = createClient(sbUrl, serviceKey, {
      auth: { persistSession: false }
    });
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // 3) Identificar rol del remitente (Suplidor, Contacto de Seguro o Cliente final)
    const [{ data: listSuplidores }, { data: listContactos }] = await Promise.all([
      supabase.from("suplidores").select("id, nombre, telefono"),
      supabase.from("aseguradora_contactos").select("id, nombre, telefono, aseguradora:aseguradoras(nombre)")
    ]);

    const suplidor = listSuplidores?.find(s => {
      const tel = (s.telefono || "").replace(/\D/g, "");
      return tel && (senderNumber.endsWith(tel) || tel.endsWith(senderNumber));
    });

    const contactoSeguro = listContactos?.find(c => {
      const tel = (c.telefono || "").replace(/\D/g, "");
      return tel && (senderNumber.endsWith(tel) || tel.endsWith(senderNumber));
    });

    // 4) Extraer el contenido del mensaje
    let userText = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
    let imagePart = null;
    let audioPart = null;

    // Procesar imagen
    if (data.message?.imageMessage) {
      const mimetype = data.message.imageMessage.mimetype || "image/jpeg";
      const caption = data.message.imageMessage.caption || "";
      const base64 = await obtenerBase64Mensaje(messageId);
      if (base64) {
        let cleanBase64 = base64;
        if (cleanBase64.includes("base64,")) {
          cleanBase64 = cleanBase64.split("base64,")[1];
        }
        imagePart = {
          inlineData: {
            mimeType: mimetype,
            data: cleanBase64
          }
        };
        userText += (userText ? "\n" : "") + `[Foto enviada por el cliente: ${caption}]`;
      }
    }

    // Procesar audio
    if (data.message?.audioMessage) {
      const mimetype = data.message.audioMessage.mimetype || "audio/ogg; codecs=opus";
      const base64 = await obtenerBase64Mensaje(messageId);
      if (base64) {
        let cleanBase64 = base64;
        if (cleanBase64.includes("base64,")) {
          cleanBase64 = cleanBase64.split("base64,")[1];
        }
        audioPart = {
          inlineData: {
            mimeType: mimetype.split(";")[0].trim(),
            data: cleanBase64
          }
        };
        userText += (userText ? "\n" : "") + "[Nota de voz enviada por el cliente]";
      }
    }

    if (!userText.trim() && !imagePart && !audioPart) {
      return res.status(200).send("Ignorado: Mensaje vacío o tipo no soportado");
    }

    // 5) Cargar historial de conversación para darle memoria al bot
    // Intentamos cargar la tabla de logs; si no existe o falla, ignoramos el historial
    let logHistory = [];
    try {
      const { data: logs } = await supabase
        .from("chat_whatsapp_logs")
        .select("role, content")
        .eq("jid", remoteJid)
        .order("created_at", { ascending: true })
        .limit(6);
      if (logs) logHistory = logs;
    } catch (e) {
      console.warn("La tabla chat_whatsapp_logs no está lista en Supabase:", e.message);
    }

    const contents = [];
    if (logHistory.length > 0) {
      logHistory.forEach(log => {
        contents.push({
          role: log.role === "bot" ? "model" : "user",
          parts: [{ text: log.content }]
        });
      });
    }

    // Agregar el mensaje actual al final del historial
    const currentParts = [{ text: `Mensaje actual de ${pushName}: ${userText}` }];
    if (imagePart) currentParts.push(imagePart);
    if (audioPart) currentParts.push(audioPart);

    contents.push({
      role: "user",
      parts: currentParts
    });

    // 6) Construir prompt con instrucciones de negocio de Dominguez Auto Pintura
    const systemPrompt = `
      Eres el Asistente Inteligente de Atención al Cliente de "Dominguez Auto Pintura", taller automotriz especializado en desabolladura, pintura y colisiones ubicado en Av. Hatuey #16, Santiago, República Dominicana. Teléfonos principales: 809-575-7986 y 809-330-3554.
      Respondes de manera sumamente atenta, empática, clara y servicial en español, con un tono caribeño, respetuoso, cálido y profesional.

      REGLAS DE IDENTIFICACIÓN:
      ${suplidor ? `* El remitente es un SUPLIDOR REGISTRADO del taller llamado "${suplidor.nombre}". Salúdalo cordialmente por su nombre y maneja la conversación de forma corporativa. Si está enviando precios de piezas o cotizaciones, indícales que el departamento de compras del taller lo revisará y procesará de inmediato.` : ""}
      ${contactoSeguro ? `* El remitente es un CONTACTO DE ASEGURADORA llamado "${contactoSeguro.nombre}" de la compañía "${contactoSeguro.aseguradora?.nombre || 'Seguros'}". Respóndele con máxima formalidad y prioridad ejecutiva.` : ""}
      ${(!suplidor && !contactoSeguro) ? `* El remitente es un CLIENTE final de taller llamado "${pushName}". Dale un servicio al cliente excepcional, amable y directo.` : ""}

      REGLAS CRÍTICAS DE COTIZACIÓN POR FOTO:
      - BAJO NINGUNA CIRCUNSTANCIA DEBES DAR PRECIOS, NÚMEROS O COTIZACIONES DE TRABAJO POR FOTO.
      - Si el cliente envía fotos de su carro dañado o te pregunta "cuánto cuesta reparar esto", debes explicarle con tacto y amabilidad que para poder darle un presupuesto exacto y garantizado, es imprescindible que traiga el vehículo físicamente al taller. Explica que esto se debe a que por fotos no es posible evaluar daños estructurales internos u ocultos tras el golpe. Invítalo amablemente a visitarnos en la Av. Hatuey #16, Santiago o a agendar una cita por aquí mismo.

      REGLAS DE MULTIMEDIA:
      - Si el usuario te envía fotos, descríbele brevemente lo que logras apreciar (ej: "vemos que el guardalodo tiene un golpe..."), pero finaliza reiterando la invitación para la evaluación formal en el taller.
      - Si te envía una nota de voz (audio), el transcriptor ya procesó la voz y la adjuntó. Respóndele a lo que pide en su nota de voz.

      Mantén las respuestas con formato claro para WhatsApp (usa negritas con asteriscos, emojis, saltos de línea amigables y mantén una longitud razonable).
    `;

    // 7) Invocar a Gemini
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt
      }
    });

    const replyText = response.text || "Disculpa, no he podido procesar tu solicitud en este momento. Por favor escríbenos nuevamente.";

    // 8) Enviar la respuesta de vuelta por WhatsApp
    await enviarTextoWhatsapp({ number: senderNumber, text: replyText });

    // 9) Guardar la conversación en la tabla de logs para mantener memoria
    try {
      await supabase.from("chat_whatsapp_logs").insert([
        {
          jid: remoteJid,
          sender_name: pushName,
          role: suplidor ? "suplidor" : (contactoSeguro ? "seguro" : "cliente"),
          content: userText
        },
        {
          jid: remoteJid,
          sender_name: "Dominguez Auto Pintura",
          role: "bot",
          content: replyText
        }
      ]);
    } catch (e) {
      console.warn("No se pudo guardar la conversación en logs:", e.message);
    }

    return res.status(200).json({ success: true, from: pushName, replied: replyText });
  } catch (error) {
    console.error("Error en webhook de WhatsApp:", error);
    return res.status(500).json({ error: "Error interno del servidor", detalle: error.message });
  }
}
