/* global process */
// Endpoint consolidado para estado de WhatsApp y sincronización global de cuentas y teléfonos.
import { estadoWhatsapp, conectarWhatsapp } from "../whatsapp/evolution.js";
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = (sbUrl && serviceKey) ? createClient(sbUrl, serviceKey, { auth: { persistSession: false } }) : null;

  const action = req.query?.action;

  // Acciones para gestión de cuentas de correo
  if (action === "listar_cuentas") {
    if (!supabase) return res.status(200).json({ data: [] });
    const { data, error } = await supabase.from("cuentas_correo_config").select("*").order("created_at", { ascending: true });
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

  // Acciones para teléfonos de empleados
  if (action === "listar_telefonos") {
    if (!supabase) return res.status(200).json({ data: [] });
    const { data, error } = await supabase.from("telefonos_notificacion").select("*").order("created_at", { ascending: true });
    return res.status(200).json({ data: data || [], error: error?.message || null });
  }

  if (action === "guardar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const payload = req.body;
    const { data, error } = await supabase.from("telefonos_notificacion").upsert(payload).select();
    if (error) {
      console.error("Error al guardar teléfono:", error);
      return res.status(500).json({ error: error.message });
    }
    return res.status(200).json({ success: true, data });
  }

  if (action === "eliminar_telefono" && req.method === "POST") {
    if (!supabase) return res.status(500).json({ error: "Missing Supabase service key" });
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing ID" });
    const { error } = await supabase.from("telefonos_notificacion").delete().eq("id", id);
    return res.status(200).json({ success: !error, error: error?.message || null });
  }

  // Flujo para vincular (conectar) WhatsApp
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
