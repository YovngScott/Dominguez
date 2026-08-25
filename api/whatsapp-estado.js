/* global process */
// Endpoint consolidado para estado de WhatsApp, sincronización global de cuentas/teléfonos y envío de alertas de prueba.
import { estadoWhatsapp, conectarWhatsapp, enviarTextoWhatsapp, normalizarTelefono } from "../whatsapp/evolution.js";
import { createClient } from "@supabase/supabase-js";

const ID_FALLBACK_TELEFONOS = "00000000-0000-0000-0000-000000000099";

export default async function handler(req, res) {
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (sbUrl && serviceKey) ? createClient(sbUrl, serviceKey, { auth: { persistSession: false } }) : null;

  const action = req.query?.action;

  // 1. Acciones para cuentas de correo
  if (action === "listar_cuentas") {
    if (!supabase) return res.status(200).json({ data: [] });
    const { data, error } = await supabase
      .from("cuentas_correo_config")
      .select("*")
      .neq("id", ID_FALLBACK_TELEFONOS)
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

  // 2. Acciones para teléfonos de empleados (con fallback automático a UUID válido)
  if (action === "listar_telefonos") {
    if (!supabase) return res.status(200).json({ data: [] });
    // Intentar leer de la tabla telefonos_notificacion
    const { data, error } = await supabase.from("telefonos_notificacion").select("*").order("created_at", { ascending: true });
    if (!error && data) {
      return res.status(200).json({ data: data || [], error: null });
    }
    // Fallback: Leer de cuentas_correo_config bajo ID_FALLBACK_TELEFONOS
    const { data: fallbackData } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_TELEFONOS)
      .limit(1);

    if (fallbackData && fallbackData.length > 0 && fallbackData[0].token_acceso) {
      try {
        const parsed = JSON.parse(fallbackData[0].token_acceso);
        return res.status(200).json({ data: parsed, error: null });
      } catch {
        /* ignore */
      }
    }
    return res.status(200).json({ data: [], error: null });
  }

  if (action === "guardar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;

    // Intentar guardar en la tabla telefonos_notificacion
    const { data, error } = await supabase.from("telefonos_notificacion").upsert(payload).select();
    if (!error) {
      return res.status(200).json({ success: true, data });
    }

    // Fallback: Guardar la lista acumulada en cuentas_correo_config con UUID válido
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

    await supabase.from("cuentas_correo_config").upsert({
      id: ID_FALLBACK_TELEFONOS,
      email: "telefonos@notificaciones.internal",
      nombre_cuenta: "Configuración Teléfonos Empleados",
      token_acceso: JSON.stringify(lista),
      es_predeterminado: false,
      activo: true
    });

    return res.status(200).json({ success: true, data: lista });
  }

  if (action === "eliminar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing ID" });

    // Intentar eliminar de la tabla telefonos_notificacion
    await supabase.from("telefonos_notificacion").delete().eq("id", id);

    // Actualizar fallback en cuentas_correo_config
    const { data: existing } = await supabase
      .from("cuentas_correo_config")
      .select("token_acceso")
      .eq("id", ID_FALLBACK_TELEFONOS)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].token_acceso) {
      try {
        let lista = JSON.parse(existing[0].token_acceso);
        lista = lista.filter((t) => t.id !== id);
        await supabase.from("cuentas_correo_config").upsert({
          id: ID_FALLBACK_TELEFONOS,
          email: "telefonos@notificaciones.internal",
          nombre_cuenta: "Configuración Teléfonos Empleados",
          token_acceso: JSON.stringify(lista),
          es_predeterminado: false,
          activo: true
        });
      } catch {
        /* ignore */
      }
    }

    return res.status(200).json({ success: true });
  }

  // 3. Probar envío de alerta por WhatsApp a un empleado
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

  // 4. Flujo para vincular (conectar) WhatsApp
  if (action === "conectar") {
    const number = req.query?.number ? String(req.query.number) : undefined;
    const r = await conectarWhatsapp({ number });
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
    return res.status(200).json({ base64: r.base64, code: r.code, pairingCode: r.pairingCode });
  }

  // Flujo por defecto: Obtener estado de conexión WhatsApp
  const r = await estadoWhatsapp();
  return res.status(200).json({ state: r.state, ok: r.ok, error: r.error || null });
}
