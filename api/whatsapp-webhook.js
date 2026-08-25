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

// Helper para buscar si el cliente ya existe registrado en la base de datos
async function buscarClienteExistente(supabase, senderNumber, senderNorm) {
  try {
    const s10 = senderNumber.length >= 10 ? senderNumber.slice(-10) : senderNumber;
    
    // 1. Buscar en la tabla clientes
    const { data: listCli } = await supabase
      .from("clientes")
      .select("id, nombre_completo, telefono, email, rnc_cedula");

    if (listCli && listCli.length > 0) {
      const match = listCli.find((c) => {
        const telLimpio = (c.telefono || "").replace(/\D/g, "");
        return (
          telLimpio &&
          (telLimpio.includes(s10) ||
            s10.includes(telLimpio) ||
            telLimpio.endsWith(s10) ||
            s10.endsWith(telLimpio))
        );
      });
      if (match) return match;
    }

    // 2. Buscar en la tabla citas por teléfono
    const { data: listCitas } = await supabase
      .from("citas")
      .select("id, nombre_cliente, telefono, vehiculo, cliente_id");

    if (listCitas && listCitas.length > 0) {
      const matchCita = listCitas.find((ct) => {
        const telLimpio = (ct.telefono || "").replace(/\D/g, "");
        return (
          telLimpio &&
          (telLimpio.includes(s10) ||
            s10.includes(telLimpio) ||
            telLimpio.endsWith(s10) ||
            s10.endsWith(telLimpio))
        );
      });
      if (matchCita) {
        return {
          id: matchCita.cliente_id || `cita_${matchCita.id}`,
          nombre_completo: matchCita.nombre_cliente || "Cliente del Taller",
          telefono: matchCita.telefono
        };
      }
    }
  } catch (e) {
    console.warn("Error buscando cliente existente:", e.message);
  }
  return null;
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

    // 4) Identificar rol del remitente (Suplidor, Contacto de Seguro o Cliente Registrado)
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

    // Búsqueda inteligente de cliente existente en la base de datos
    const clienteExistente = !suplidor && !contactoSeguro ? await buscarClienteExistente(supabase, senderNumber, senderNorm) : null;
    let casosCliente = [];
    let citasCliente = [];

    if (clienteExistente) {
      const [{ data: casosData }, { data: citasData }] = await Promise.all([
        supabase
          .from("casos")
          .select("id, estado, placa, chasis, anio, color, numero_reclamo, numero_poliza, aseguradora:aseguradoras(nombre), marca:marcas(nombre), modelo:modelos(nombre)")
          .eq("cliente_id", clienteExistente.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("citas")
          .select("id, fecha, hora, vehiculo, servicio, estado")
          .eq("cliente_id", clienteExistente.id)
          .order("fecha", { ascending: false })
          .limit(3)
      ]);
      casosCliente = casosData || [];
      citasCliente = citasData || [];
    }

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

    // 6) SI ES CLIENTE NUEVO Y ENVIÓ UNA IMAGEN: Evaluar si es Carnet de Seguro o Matrícula y crear el caso
    let casoCreado = null;
    if (!clienteExistente && imagePart && rawBase64) {
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

          // Crear caso en estado 'en_espera_piezas'
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

    // 8) Construir el System Prompt Oficial
    const systemPrompt = `
      Eres el Asistente Inteligente de Atención al Cliente de "Dominguez Auto Pintura", taller de desabolladura, pintura automotriz y colisiones ubicado en la Av. Hatuey #16, Santiago, República Dominicana. Teléfonos principales: 809-575-7986 y 809-330-3554.

      ${clienteExistente ? `
      ========================================================================
      🚨 INFORMACIÓN DE CLIENTE REGISTRADO EN EL SISTEMA:
      - Nombre del cliente: "${clienteExistente.nombre_completo}"
      - Teléfono: "${clienteExistente.telefono}"
      - Casos y vehículos registrados en el taller:
      ${casosCliente.length > 0 ? casosCliente.map((c) => `  * Caso #${c.id.slice(0, 8)}: ${c.marca?.nombre || ''} ${c.modelo?.nombre || ''} ${c.anio || ''} (${c.color || 'Color S/E'}, Placa: ${c.placa || 'S/P'}), Seguro: ${c.aseguradora?.nombre || 'Particular'}, Póliza: ${c.numero_poliza || 'N/A'}, Reclamo: ${c.numero_reclamo || 'N/A'}, Estado: "${c.estado}"`).join("\n") : "  (Sin casos activos en este momento)"}
      ${citasCliente.length > 0 ? `- Citas registradas:\n${citasCliente.map((ct) => `  * Fecha: ${ct.fecha}, Hora: ${ct.hora || 'S/H'}, Motivo: ${ct.servicio || 'Revisión'}, Estado: ${ct.estado || 'Programada'}`).join("\n")}` : ""}

      REGLA SUPREMA PARA CLIENTES YA REGISTRADOS:
      1. ESTE CLIENTE YA ESTÁ EN NUESTRA BASE DE DATOS. YA SABEMOS SU NOMBRE, SU SEGURO Y SU VEHÍCULO.
      2. PROHIBIDO Y NUNCA PEDIRLE:
         - ¿Cuál es su compañía de seguro? (¡PROHIBIDO PREGUNTAR ESTO! YA LO SABEMOS: ${casosCliente[0]?.aseguradora?.nombre || 'Seguro Registrado'})
         - Fotos del carnet de seguro
         - Fotos de la matrícula
         - Datos de su vehículo
      3. Trátalo con máxima familiaridad y respeto por su nombre (ej: "¡Hola ${clienteExistente.nombre_completo}!").
      4. Si el cliente avisa que va a traer o dejar el vehículo hoy o a una hora fija (ej: "estaré dejando el carro a las 5pm"):
         - Confírmale con gusto que le esperamos a esa hora para recibir su vehículo en el taller.
         - NO le pidas seguro ni le hables de cotizaciones nuevas, porque ya es un cliente activo que viene a dejar su vehículo acordado.
      5. Si pregunta por el estado de su reparación o vehículo, infórmale con amabilidad según el estado de su caso.
      ========================================================================
      ` : `
      ========================================================================
      👤 CLIENTE NUEVO (NO REGISTRADO EN EL SISTEMA):
      ${casoCreado ? `[AVISO: El cliente envió carnet/matrícula válido y su caso ya fue creado en "En espera de piezas" bajo el ID ${casoCreado.id}. Confírmale que sus datos fueron precargados].` : ""}
      
      SALUDO EMPÁTICO Y TONO:
      - Tono empático, cálido, caribeño y profesional:
        "¡Lamentamos mucho el percance que tuvo con su vehículo! 🙏🏼 Lo más importante es que usted esté bien. Por la parte del vehículo, no se preocupe que de eso nos encargamos nosotros para dejárselo como nuevo. 🚘✨"

      PROCESO DE SERVICIO Y COTIZACIÓN:
      1. Visita al taller en Av. Hatuey #16, Santiago.
      2. Evaluación física presencial de impacto externo y daños estructurales/ocultos.
      3. Presupuesto garantizado.
      4. Aprobación y piezas: con seguro se envía a la aseguradora y cuando lleguen las piezas se le coordina cita de reparación.

      HORARIOS DE INSPECCIÓN / EVALUACIÓN PRESENCIAL:
      - Lunes a Viernes: 8:00 AM a 12:00 PM (llegar máx. 11:30 AM) y 2:00 PM a 6:00 PM (llegar máx. 5:30 PM).
      - Sábados: 8:00 AM a 1:00 PM (llegar máx. 12:30 PM).
      - REGLA DE CITAS: NO se agendan citas por chat para cotizar. Se le invita a pasar en los horarios indicados.

      REGLAS CRÍTICAS DE ASEGURADORAS:
      - PREGUNTAR AL CLIENTE CUÁL ES SU COMPAÑÍA DE SEGURO.
      - Aseguradoras autorizadas: SEGUROS RESERVAS, LA COLONIAL DE SEGUROS, ATLÁNTICA DE SEGUROS, COOP-SEGUROS, SEGUROS SURA, SEGUROS LA INTERNACIONAL.
      - Si tiene una de estas 6: pedir foto del CARNET DE SEGURO y MATRÍCULA para precargar su caso.
      - Si NO tiene una de estas 6 (o es particular): explicar amablemente que la cotización se le entrega de inmediato en el taller, con costo de RD$ 2,000 descontables si repara con nosotros.
      ========================================================================
      `}

      REGLAS DE PRECIOS POR FOTO:
      - NUNCA des precios o presupuestos por foto o WhatsApp. Explica siempre que por foto no es posible ver descuadres de chasis ni daños ocultos.

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
          role: suplidor ? "suplidor" : (contactoSeguro ? "seguro" : (clienteExistente ? "cliente_registrado" : "cliente_nuevo")),
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
