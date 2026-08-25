/* global process */
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import {
  enviarTextoWhatsapp,
  normalizarTelefono,
  obtenerBase64Mensaje,
} from "../whatsapp/evolution.js";

const ID_FALLBACK_EXCLUIDOS = "00000000-0000-0000-0000-000000000098";
const ID_FALLBACK_TELEFONOS = "00000000-0000-0000-0000-000000000099";

// Aseguradoras oficiales autorizadas
const ASEGURADORAS_AUTORIZADAS = [
  "SEGUROS RESERVAS",
  "LA COLONIAL DE SEGUROS",
  "ATLÁNTICA DE SEGUROS",
  "COOP-SEGUROS",
  "SEGUROS SURA",
  "SEGUROS LA INTERNACIONAL"
];

// Helper para obtener números excluidos de respuestas del bot
async function obtenerNumerosExcluidos(supabase) {
  try {
    const { data, error } = await supabase.from("numeros_excluidos").select("telefono");
    if (!error && data && data.length > 0) {
      return data.map((e) => normalizarTelefono(e.telefono));
    }
  } catch { /* fallback */ }

  try {
    const { data: fallbackData } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_EXCLUIDOS)
      .limit(1);

    if (fallbackData?.[0]?.token_acceso) {
      const lista = JSON.parse(fallbackData[0].token_acceso);
      return lista.map((e) => normalizarTelefono(e.telefono));
    }
  } catch { /* ignore */ }

  return [];
}

// Helper para obtener teléfonos de notificación de empleados
async function obtenerTelefonosNotificacion(supabase) {
  try {
    const { data } = await supabase.from("telefonos_notificacion").select("telefono").eq("activo", true);
    if (data && data.length > 0) {
      return [...new Set(data.map((t) => normalizarTelefono(t.telefono)))];
    }
  } catch { /* fallback */ }

  try {
    const { data: fallbackData } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_TELEFONOS)
      .limit(1);

    if (fallbackData?.[0]?.token_acceso) {
      const lista = JSON.parse(fallbackData[0].token_acceso);
      return [...new Set(lista.filter((t) => t.activo).map((t) => normalizarTelefono(t.telefono)))];
    }
  } catch { /* ignore */ }

  return [normalizarTelefono(process.env.SHOP_WHATSAPP || "8095757986")];
}

// Helper para buscar o crear marcas y modelos
async function findOrCreateMarca(supabase, nombre) {
  const n = (nombre || "").trim();
  if (!n) return null;
  const { data: existe } = await supabase.from("marcas").select("id").ilike("nombre", n).limit(1);
  if (existe?.[0]) return existe[0].id;
  const { data: nueva } = await supabase.from("marcas").insert({ nombre: n }).select("id").single();
  return nueva?.id || null;
}

async function findOrCreateModelo(supabase, marcaId, nombre) {
  const n = (nombre || "").trim();
  if (!n || !marcaId) return null;
  const { data: existe } = await supabase.from("modelos").select("id").eq("marca_id", marcaId).ilike("nombre", n).limit(1);
  if (existe?.[0]) return existe[0].id;
  const { data: nuevo } = await supabase.from("modelos").insert({ marca_id: marcaId, nombre: n }).select("id").single();
  return nuevo?.id || null;
}

async function findOrCreateAseguradora(supabase, nombre) {
  const n = (nombre || "").trim();
  if (!n) return null;
  const { data: existe } = await supabase.from("aseguradoras").select("id").ilike("nombre", `%${n}%`).limit(1);
  if (existe?.[0]) return existe[0].id;
  const { data: nueva } = await supabase.from("aseguradoras").insert({ nombre: n }).select("id").single();
  return nueva?.id || null;
}

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

  // 2) Evitar bucle infinito si el mensaje es enviado por la propia instancia
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
  const senderNorm = normalizarTelefono(senderNumber);

  try {
    const supabase = createClient(sbUrl, serviceKey, {
      auth: { persistSession: false }
    });
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // 3) Verificar si el número está en la LISTA DE EXCLUIDOS (Socios / Dueños)
    const excluidos = await obtenerNumerosExcluidos(supabase);
    if (excluidos.some((e) => e && (senderNorm.endsWith(e) || e.endsWith(senderNorm)))) {
      return res.status(200).send("Ignorado: Número excluido de respuestas del bot (Socio/Dueño)");
    }

    // 4) Identificar rol del remitente (Suplidor o Contacto de Seguro)
    const [{ data: listSuplidores }, { data: listContactos }] = await Promise.all([
      supabase.from("suplidores").select("id, nombre, telefono"),
      supabase.from("aseguradora_contactos").select("id, nombre, telefono, aseguradora:aseguradoras(nombre)")
    ]);

    const suplidor = listSuplidores?.find((s) => {
      const tel = (s.telefono || "").replace(/\D/g, "");
      return tel && (senderNumber.endsWith(tel) || tel.endsWith(senderNumber));
    });

    const contactoSeguro = listContactos?.find((c) => {
      const tel = (c.telefono || "").replace(/\D/g, "");
      return tel && (senderNumber.endsWith(tel) || tel.endsWith(senderNumber));
    });

    // 5) Extraer contenido del mensaje (Texto, Imagen o Audio)
    let userText = data.message?.conversation || data.message?.extendedTextMessage?.text || "";
    let imagePart = null;
    let audioPart = null;
    let rawBase64 = null;

    if (data.message?.imageMessage) {
      const mimetype = data.message.imageMessage.mimetype || "image/jpeg";
      const caption = data.message.imageMessage.caption || "";
      const base64 = await obtenerBase64Mensaje(messageId);
      if (base64) {
        let cleanBase64 = base64;
        if (cleanBase64.includes("base64,")) {
          cleanBase64 = cleanBase64.split("base64,")[1];
        }
        rawBase64 = cleanBase64;
        imagePart = {
          inlineData: {
            mimeType: mimetype,
            data: cleanBase64
          }
        };
        userText += (userText ? "\n" : "") + `[Foto enviada por el cliente: ${caption}]`;
      }
    }

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

    // 6) SI SE ENVIÓ UNA IMAGEN: Evaluar si es Carnet de Seguro o Matrícula y crear el caso
    let casoCreado = null;
    if (imagePart && rawBase64) {
      try {
        const docPrompt = `
          Analiza esta imagen y determina si corresponde a un CARNET DE SEGURO vehicular o a una MATRÍCULA vehicular de la República Dominicana.
          Extrae con precisión todos los datos legibles.
        `;

        const docSchema = {
          type: "object",
          properties: {
            es_documento_valido: { type: "boolean" },
            tipo_documento: { type: "string", enum: ["carnet_seguro", "matricula", "otro"] },
            cliente_nombre: { type: "string" },
            cedula_o_rnc: { type: "string" },
            aseguradora_nombre: { type: "string" },
            numero_poliza: { type: "string" },
            numero_reclamo: { type: "string" },
            marca: { type: "string" },
            modelo: { type: "string" },
            anio: { type: "integer" },
            color: { type: "string" },
            placa: { type: "string" },
            chasis: { type: "string" }
          },
          required: ["es_documento_valido", "tipo_documento"]
        };

        const docRes = await ai.models.generateContent({
          model: "gemini-3.6-flash",
          contents: [
            {
              role: "user",
              parts: [
                { text: docPrompt },
                { inlineData: { mimeType: "image/jpeg", data: rawBase64 } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: docSchema
          }
        });

        const docData = JSON.parse(docRes.text || "{}");

        if (docData.es_documento_valido && (docData.tipo_documento === "carnet_seguro" || docData.tipo_documento === "matricula")) {
          // Buscar o crear cliente
          const nombreCli = (docData.cliente_nombre || pushName || "Cliente WhatsApp").trim();
          let clienteId = null;
          const { data: existCli } = await supabase.from("clientes").select("id").ilike("nombre_completo", nombreCli).limit(1);
          if (existCli?.[0]) {
            clienteId = existCli[0].id;
          } else {
            const { data: newCli } = await supabase
              .from("clientes")
              .insert({
                nombre_completo: nombreCli,
                telefono: senderNumber,
                rnc_cedula: docData.cedula_o_rnc || null
              })
              .select("id")
              .single();
            clienteId = newCli?.id;
          }

          // Buscar o crear marca y modelo
          const marcaId = await findOrCreateMarca(supabase, docData.marca || "Por definir");
          const modeloId = await findOrCreateModelo(supabase, marcaId, docData.modelo || "Por definir");

          // Buscar aseguradora
          const asgNombre = docData.aseguradora_nombre || "Personal";
          const asgId = await findOrCreateAseguradora(supabase, asgNombre);

          // Crear o actualizar caso en estado 'en_espera_piezas'
          const { data: newCaso, error: casoErr } = await supabase
            .from("casos")
            .insert({
              cliente_id: clienteId,
              aseguradora_id: asgId,
              marca_id: marcaId,
              modelo_id: modeloId,
              anio: docData.anio || null,
              color: docData.color || null,
              placa: docData.placa || null,
              chasis: docData.chasis || null,
              numero_poliza: docData.numero_poliza || null,
              numero_reclamo: docData.numero_reclamo || null,
              estado: "en_espera_piezas",
              notas: `Caso precargado automáticamente por IA vía WhatsApp (${docData.tipo_documento === "carnet_seguro" ? "Carnet de Seguro" : "Matrícula"}).`
            })
            .select()
            .single();

          if (!casoErr && newCaso) {
            casoCreado = {
              id: newCaso.id,
              cliente: nombreCli,
              aseguradora: asgNombre,
              vehiculo: `${docData.marca || ""} ${docData.modelo || ""}`.trim() || "Vehículo",
              placa: docData.placa || "N/A"
            };

            // Notificar a los empleados del taller por WhatsApp
            const telAlertas = await obtenerTelefonosNotificacion(supabase);
            const msgAlerta = `📥 *Nuevo Caso Precargado por WhatsApp (IA)*\n\n👤 *Cliente:* ${nombreCli}\n📱 *Teléfono:* ${senderNumber}\n🏢 *Seguro:* ${asgNombre} (Póliza: ${docData.numero_poliza || "S/N"})\n🚗 *Vehículo:* ${casoCreado.vehiculo} ${docData.anio || ""} (Placa: ${docData.placa || "S/P"})\n📌 *Estado:* En espera de piezas\n📍 *Acción:* Datos precargados. Cliente invitado a inspección física.`;

            for (const tel of telAlertas) {
              await enviarTextoWhatsapp({ number: tel, text: msgAlerta }).catch(() => {});
            }
          }
        }
      } catch (errDoc) {
        console.warn("Error analizando documento con IA:", errDoc.message);
      }
    }

    // 7) Cargar historial de conversación para memoria contextual
    let logHistory = [];
    try {
      const { data: logs } = await supabase
        .from("chat_whatsapp_logs")
        .select("role, content")
        .eq("jid", remoteJid)
        .order("created_at", { ascending: true })
        .limit(8);
      if (logs) logHistory = logs;
    } catch { /* ignore */ }

    const contents = [];
    if (logHistory.length > 0) {
      logHistory.forEach((log) => {
        contents.push({
          role: log.role === "bot" ? "model" : "user",
          parts: [{ text: log.content }]
        });
      });
    }

    const currentParts = [{ text: `Mensaje actual de ${pushName}: ${userText}` }];
    if (imagePart) currentParts.push(imagePart);
    if (audioPart) currentParts.push(audioPart);

    contents.push({
      role: "user",
      parts: currentParts
    });

    // 8) Construir el System Prompt Oficial con todas las reglas de Dominguez Auto Pintura
    const systemPrompt = `
      Eres el Asistente Inteligente de Atención al Cliente de "Dominguez Auto Pintura", taller de desabolladura, pintura automotriz y colisiones ubicado en la Av. Hatuey #16, Santiago, República Dominicana. Teléfonos principales: 809-575-7986 y 809-330-3554.

      ${casoCreado ? `[AVISO INTERNO DE SISTEMA: El cliente acaba de enviar un carnet de seguro o matrícula válido. El caso ya fue CREADO con éxito en el sistema en estado "En espera de piezas" bajo el código ${casoCreado.id}. Confírmale amablemente al cliente que sus datos han quedado precargados y anímale a pasar por el taller a la evaluación física].` : ""}

      SALUDO EMPÁTICO Y TONO:
      - Responde con muchísima empatía, respeto, calidez caribeña y profesionalismo.
      - Cuando un cliente escribe por un choque o daño, exprésale empatía con este tono:
        "¡Lamentamos mucho el percance que tuvo con su vehículo! 🙏🏼 Lo más importante es que usted esté bien. Por la parte del vehículo, no se preocupe que de eso nos encargamos nosotros para dejárselo como nuevo. 🚘✨"

      PROCESO DE SERVICIO Y COTIZACIÓN:
      1. Visita al taller: Puede traer el vehículo a nuestras instalaciones en la Av. Hatuey #16, Santiago. (Si el vehículo no puede rodar por el golpe, que nos deje saber para orientarle).
      2. Evaluación física presencial: Nuestros técnicos revisan detalladamente el impacto externo y posibles daños estructurales o internos ocultos.
      3. Presupuesto garantizado.
      4. Aprobación y piezas: Si es con seguro, se tramita con su aseguradora y en cuanto las piezas lleguen al taller, se le coordina su cita para traer el carro a reparar.
      5. Entrega impecable.

      HORARIOS DE INSPECCIÓN / EVALUACIÓN PRESENCIAL:
      - Lunes a Viernes: de 8:00 AM a 12:00 PM (llegar máx. 11:30 AM) y de 2:00 PM a 6:00 PM (llegar máx. 5:30 PM).
      - Sábados: de 8:00 AM a 1:00 PM (llegar máx. 12:30 PM).
      - REGLA DE ORO DE CITAS: NO se agendan citas por chat para venir a cotizar. Se le invita a pasar en los horarios indicados dentro del rango de llegada. Las citas reales se coordinan únicamente para cuando las piezas ya están físicas en el taller para iniciar la reparación.

      REGLAS CRÍTICAS DE ASEGURADORAS:
      - SIEMPRE PREGUNTA AL CLIENTE CUÁL ES SU COMPAÑÍA DE SEGURO.
      - Aseguradoras con las que SÍ trabajamos directamente:
        1. SEGUROS RESERVAS
        2. LA COLONIAL DE SEGUROS
        3. ATLÁNTICA DE SEGUROS
        4. COOP-SEGUROS
        5. SEGUROS SURA
        6. SEGUROS LA INTERNACIONAL
      
      - SI EL CLIENTE TIENE UNO DE ESTOS 6 SEGUROS:
        Pídele amablemente una foto del CARNET DEL SEGURO y una foto de la MATRÍCULA del vehículo para precargar su caso de inmediato. Explícale que al visitarnos le preparamos la cotización, la enviamos a su aseguradora y cuando el seguro apruebe y lleguen las piezas, le coordinamos su cita para recibir el vehículo.
      
      - SI EL CLIENTE NO TIENE NINGUNO DE ESOS 6 SEGUROS (O ES PARTICULAR):
        Dile de manera muy amable y comprensiva que no trabajamos directamente con esa aseguradora. Explícale que con gusto le preparamos su presupuesto y se le entrega inmediatamente al terminar la inspección física.
        * IMPORTANTE: La cotización particular tiene un costo de RD$ 2,000 pesos, pero si decide realizar la reparación con nosotros en el taller, esos RD$ 2,000 pesos se le descuentan íntegramente del total final del trabajo.

      REGLAS DE PRECIOS POR FOTO:
      - NUNCA des precios o presupuestos por foto o WhatsApp. Explica siempre que por foto no es posible ver descuadres de chasis ni piezas internas afectadas.

      Formato: Mensajes claros, con negritas (*texto*), saltos de línea ordenados y emojis profesionales.
    `;

    // 9) Invocar a Gemini
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt
      }
    });

    const replyText = response.text || "Disculpa, no he podido procesar tu mensaje. Por favor contáctanos al 809-575-7986.";

    // 10) Enviar respuesta por WhatsApp
    await enviarTextoWhatsapp({ number: senderNumber, text: replyText });

    // 11) Registrar en logs de memoria
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
    } catch { /* ignore */ }

    return res.status(200).json({ success: true, from: pushName, replied: replyText });
  } catch (error) {
    console.error("Error en webhook de WhatsApp:", error);
    return res.status(500).json({ error: "Error interno del servidor", detalle: error.message });
  }
}
