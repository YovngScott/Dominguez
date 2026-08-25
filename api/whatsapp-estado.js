/* global process */
// Endpoint consolidado para estado de WhatsApp, sincronización global de cuentas/teléfonos/excluidos y envío de alertas de prueba.
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

function getFallbackRecord(id, email, nombre, lista) {
  return {
    id,
    email,
    nombre_cuenta: nombre,
    proveedor: "dominio_personalizado",
    token_acceso: JSON.stringify(lista),
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
      .not("id", "in", `("${ID_FALLBACK_TELEFONOS}","${ID_FALLBACK_EXCLUIDOS}")`)
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
        } catch {
          /* ignore */
        }
      }
    }
    return res.status(200).json({ data: result, error: null });
  }

  if (action === "guardar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;

    try {
      await supabase.from("telefonos_notificacion").upsert(payload);
    } catch {
      /* fallback */
    }

    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_TELEFONOS)
      .limit(1);

    let lista = [];
    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try {
        lista = JSON.parse(existing[0].token_acceso);
      } catch {
        /* ignore */
      }
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

    try {
      await supabase.from("telefonos_notificacion").delete().eq("id", id);
    } catch {
      /* fallback */
    }

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
      } catch {
        /* ignore */
      }
    }

    return res.status(200).json({ success: true, data: lista });
  }

  // --------------------------------------------------------------------------
  // 3. ACCIONES PARA NÚMEROS EXCLUIDOS (Socios / Números que el bot no responde)
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
        } catch {
          /* ignore */
        }
      }
    }
    return res.status(200).json({ data: result, error: null });
  }

  if (action === "guardar_excluido" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;

    try {
      await supabase.from("numeros_excluidos").upsert(payload);
    } catch {
      /* fallback */
    }

    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_EXCLUIDOS)
      .limit(1);

    let lista = [];
    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try {
        lista = JSON.parse(existing[0].token_acceso);
      } catch {
        /* ignore */
      }
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

    try {
      await supabase.from("numeros_excluidos").delete().eq("id", id);
    } catch {
      /* fallback */
    }

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
      } catch {
        /* ignore */
      }
    }

    return res.status(200).json({ success: true, data: lista });
  }

  // --------------------------------------------------------------------------
  // 4. PROBAR ENVÍO DE ALERTA POR WHATSAPP A UN EMPLEADO
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
  // 5. FLUJO PARA VINCULAR WHATSAPP Y AUTO-CONFIGURAR WEBHOOK
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
