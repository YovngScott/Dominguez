// Endpoint consolidado para estado de WhatsApp, sincronización global de cuentas/teléfonos/excluidos/prompts y envío de alertas de prueba.
import {
  estadoWhatsapp,
  conectarWhatsapp,
  enviarTextoWhatsapp,
  normalizarTelefono,
  configurarWebhookEvolution
} from "../whatsapp/evolution.js";
import { createClient } from "@supabase/supabase-js";

const ID_FALLBACK_TELEFONOS = "00000000-0000-0000-0000-000000000099";
const ID_FALLBACK_EXCLUIDOS = "00000000-0000-0000-0000-000000000098";
const ID_FALLBACK_PROMPTS = "00000000-0000-0000-0000-000000000097";

export const DEFAULT_PROMPT_WHATSAPP = `Eres el Asistente Inteligente de Atención al Cliente de "Dominguez Auto Pintura", taller de desabolladura, pintura automotriz y colisiones ubicado en la Av. Hatuey #16, Santiago, República Dominicana. Teléfonos principales: 809-575-7986 y 809-330-3554.

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

Formato: Mensajes claros, con negritas (*texto*), saltos de línea ordenados y emojis profesionales.`;

export const DEFAULT_PROMPT_CORREOS = `Eres un sistema experto para procesar correos y cotizaciones de aseguradoras en República Dominicana (Seguros Reservas, La Colonial, Atlántica, Coop-Seguros, Sura, La Internacional).
Extrae con precisión: chasis (VIN), número de reclamo, número de póliza, aseguradora, cliente, piezas a reparar/cambiar con sus precios y un resumen claro de lo requerido.`;

function getFallbackRecord(id, email, nombre, listaOString) {
  return {
    id,
    email,
    nombre_cuenta: nombre,
    proveedor: "dominio_personalizado",
    token_acceso: typeof listaOString === "string" ? listaOString : JSON.stringify(listaOString),
    es_predeterminado: false,
    activo: true,
    frecuencia_minutos: 5,
    imap_host: "localhost",
    imap_port: 993,
    estado_oauth: "autorizado",
    autorizado_at: new Date().toISOString()
  };
}

export default async function handler(req, res) {
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = sbUrl && serviceKey ? createClient(sbUrl, serviceKey, { auth: { persistSession: false } }) : null;

  const action = req.query?.action;

  // --------------------------------------------------------------------------
  // 1. ACCIONES PARA CUENTAS DE CORREO
  // --------------------------------------------------------------------------
  if (action === "listar_cuentas") {
    if (!supabase) return res.status(200).json({ data: [] });
    const { data, error } = await supabase
      .from("cuentas_correo_config")
      .select("*")
      .not("id", "in", `("${ID_FALLBACK_TELEFONOS}","${ID_FALLBACK_EXCLUIDOS}","${ID_FALLBACK_PROMPTS}")`)
      .order("created_at", { ascending: true });
    return res.status(200).json({ data: data || [], error: error?.message || null });
  }

  if (action === "guardar_cuenta" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;
    if (payload?.es_predeterminado) {
      await supabase.from("cuentas_correo_config").update({ es_predeterminado: false }).neq("id", "0");
    }
    const { data, error } = await supabase.from("cuentas_correo_config").upsert(payload).select();
    if (error) {
      console.error("Error al guardar cuenta de correo:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ success: true, data });
  }

  if (action === "eliminar_cuenta" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing ID" });
    const { error } = await supabase.from("cuentas_correo_config").delete().eq("id", id);
    return res.status(200).json({ success: !error, error: error?.message || null });
  }

  // --------------------------------------------------------------------------
  // 2. ACCIONES PARA TELÉFONOS DE EMPLEADOS (Alertas)
  // --------------------------------------------------------------------------
  if (action === "listar_telefonos") {
    if (!supabase) return res.status(200).json({ data: [] });

    let result = [];
    const { data, error } = await supabase.from("telefonos_notificacion").select("*").order("created_at", { ascending: true });
    if (!error && data && data.length > 0) {
      result = data;
    } else {
      const { data: fallbackData } = await supabase
        .from("cuentas_correo_config")
        .select("token_acceso")
        .eq("id", ID_FALLBACK_TELEFONOS)
        .limit(1);

      if (fallbackData && fallbackData.length > 0 && fallbackData[0].token_acceso) {
        try {
          result = JSON.parse(fallbackData[0].token_acceso);
        } catch { /* ignore */ }
      }
    }
    return res.status(200).json({ data: result, error: null });
  }

  if (action === "guardar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;

    try { await supabase.from("telefonos_notificacion").upsert(payload); } catch { /* fallback */ }

    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_TELEFONOS)
      .limit(1);

    let lista = [];
    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try { lista = JSON.parse(existing[0].token_acceso); } catch { /* ignore */ }
    }
    const idx = lista.findIndex((t) => t.id === payload.id);
    if (idx >= 0) lista[idx] = payload;
    else lista.push(payload);

    await supabase
      .from("cuentas_correo_config")
      .upsert(getFallbackRecord(ID_FALLBACK_TELEFONOS, "telefonos@notificaciones.internal", "Configuración Teléfonos Empleados", lista));

    return res.status(200).json({ success: true, data: lista });
  }

  if (action === "eliminar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing ID" });

    try { await supabase.from("telefonos_notificacion").delete().eq("id", id); } catch { /* fallback */ }

    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_TELEFONOS)
      .limit(1);

    let lista = [];
    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try {
        lista = JSON.parse(existing[0].token_acceso);
        lista = lista.filter((t) => t.id !== id);
        await supabase
          .from("cuentas_correo_config")
          .upsert(getFallbackRecord(ID_FALLBACK_TELEFONOS, "telefonos@notificaciones.internal", "Configuración Teléfonos Empleados", lista));
      } catch { /* ignore */ }
    }

    return res.status(200).json({ success: true, data: lista });
  }

  // --------------------------------------------------------------------------
  // 3. ACCIONES PARA NÚMEROS EXCLUIDOS (Socios / Dueños)
  // --------------------------------------------------------------------------
  if (action === "listar_excluidos") {
    if (!supabase) return res.status(200).json({ data: [] });

    let result = [];
    const { data, error } = await supabase.from("numeros_excluidos").select("*").order("created_at", { ascending: true });
    if (!error && data && data.length > 0) {
      result = data;
    } else {
      const { data: fallbackData } = await supabase
        .from("cuentas_correo_config")
        .select("token_acceso")
        .eq("id", ID_FALLBACK_EXCLUIDOS)
        .limit(1);

      if (fallbackData && fallbackData.length > 0 && fallbackData[0].token_acceso) {
        try {
          result = JSON.parse(fallbackData[0].token_acceso);
        } catch { /* ignore */ }
      }
    }
    return res.status(200).json({ data: result, error: null });
  }

  if (action === "guardar_excluido" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;

    try { await supabase.from("numeros_excluidos").upsert(payload); } catch { /* fallback */ }

    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_EXCLUIDOS)
      .limit(1);

    let lista = [];
    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try { lista = JSON.parse(existing[0].token_acceso); } catch { /* ignore */ }
    }
    const idx = lista.findIndex((t) => t.id === payload.id);
    if (idx >= 0) lista[idx] = payload;
    else lista.push(payload);

    await supabase
      .from("cuentas_correo_config")
      .upsert(getFallbackRecord(ID_FALLBACK_EXCLUIDOS, "excluidos@bot.internal", "Configuración Números Excluidos Bot", lista));

    return res.status(200).json({ success: true, data: lista });
  }

  if (action === "eliminar_excluido" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing ID" });

    try { await supabase.from("numeros_excluidos").delete().eq("id", id); } catch { /* fallback */ }

    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_EXCLUIDOS)
      .limit(1);

    let lista = [];
    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try {
        lista = JSON.parse(existing[0].token_acceso);
        lista = lista.filter((t) => t.id !== id);
        await supabase
          .from("cuentas_correo_config")
          .upsert(getFallbackRecord(ID_FALLBACK_EXCLUIDOS, "excluidos@bot.internal", "Configuración Números Excluidos Bot", lista));
      } catch { /* ignore */ }
    }

    return res.status(200).json({ success: true, data: lista });
  }

  // --------------------------------------------------------------------------
  // 4. ACCIONES PARA PROMPTS PERSONALIZADOS DE LA IA
  // --------------------------------------------------------------------------
  if (action === "obtener_prompts") {
    let promptWhatsapp = DEFAULT_PROMPT_WHATSAPP;
    let promptCorreos = DEFAULT_PROMPT_CORREOS;

    if (supabase) {
      const { data } = await supabase
        .from("cuentas_correo_config")
        .select("token_acceso")
        .eq("id", ID_FALLBACK_PROMPTS)
        .limit(1);

      if (data?.[0]?.token_acceso) {
        try {
          const parsed = JSON.parse(data[0].token_acceso);
          if (parsed.prompt_whatsapp) promptWhatsapp = parsed.prompt_whatsapp;
          if (parsed.prompt_correos) promptCorreos = parsed.prompt_correos;
        } catch { /* ignore */ }
      }
    }

    return res.status(200).json({
      success: true,
      prompt_whatsapp: promptWhatsapp,
      prompt_correos: promptCorreos,
      default_prompt_whatsapp: DEFAULT_PROMPT_WHATSAPP,
      default_prompt_correos: DEFAULT_PROMPT_CORREOS
    });
  }

  if (action === "guardar_prompts" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const { prompt_whatsapp, prompt_correos } = req.body || {};

    const obj = {
      prompt_whatsapp: prompt_whatsapp || DEFAULT_PROMPT_WHATSAPP,
      prompt_correos: prompt_correos || DEFAULT_PROMPT_CORREOS,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from("cuentas_correo_config")
      .upsert(getFallbackRecord(ID_FALLBACK_PROMPTS, "prompts@ia.internal", "Configuración Prompts IA", obj));

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, message: "Prompts guardados correctamente." });
  }

  // --------------------------------------------------------------------------
  // 5. PROBAR ENVÍO DE ALERTA POR WHATSAPP A UN EMPLEADO
  // --------------------------------------------------------------------------
  if (action === "probar_telefono" && req.method === "POST") {
    const { telefono, nombre, rol } = req.body || {};
    if (!telefono) return res.status(400).json({ error: "Falta el número de teléfono" });

    const numNorm = normalizarTelefono(telefono);
    const msg = `🤖 *Prueba de Alerta de WhatsApp*\n\nHola *${nombre || "Empleado"}* (${rol || "Taller"}). Tu número ha sido configurado para recibir las alertas automáticas de cotizaciones y piezas en Dominguez Auto Pintura.`;

    const sendResult = await enviarTextoWhatsapp({ number: numNorm, text: msg });
    if (!sendResult.ok) {
      return res.status(500).json({ error: sendResult.error || "No se pudo enviar el mensaje por WhatsApp. Verifica la conexión de WhatsApp." });
    }
    return res.status(200).json({ success: true, message: "Alerta enviada por WhatsApp con éxito." });
  }

  // --------------------------------------------------------------------------
  // 6. FLUJO PARA VINCULAR WHATSAPP Y AUTO-CONFIGURAR WEBHOOK
  // --------------------------------------------------------------------------
  if (action === "configurar_webhook") {
    const r = await configurarWebhookEvolution();
    return res.status(200).json({ success: r.ok, error: r.error || null, data: r.data || null });
  }

  if (action === "conectar") {
    const number = req.query?.number ? String(req.query.number) : undefined;
    await configurarWebhookEvolution();
    const r = await conectarWhatsapp({ number });
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
    return res.status(200).json({ base64: r.base64, code: r.code, pairingCode: r.pairingCode });
  }

  // Flujo por defecto: Obtener estado de conexión WhatsApp
  const r = await estadoWhatsapp();
  return res.status(200).json({ state: r.state, ok: r.ok, error: r.error || null });
}
