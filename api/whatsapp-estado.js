// Devuelve el estado de la conexión de WhatsApp (Evolution). Lo usa el Dashboard
// para avisar si el teléfono se desvinculó. Requiere sesión de Supabase.
import { estadoWhatsapp, validarSesionSupabase } from "../whatsapp/evolution.js";

export default async function handler(req, res) {
  if (!(await validarSesionSupabase(req))) {
    return res.status(401).json({ error: "No autenticado." });
  }
  const r = await estadoWhatsapp();
  return res.status(200).json({ state: r.state, ok: r.ok });
}
