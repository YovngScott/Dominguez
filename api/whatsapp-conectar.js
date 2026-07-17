// Devuelve el QR (y opcionalmente el código de emparejamiento) para vincular
// el WhatsApp del taller, sin salir de la app. Lo usa el modal "Conectar
// WhatsApp" del menú. Requiere sesión de Supabase (usuario logueado).
import { conectarWhatsapp, validarSesionSupabase } from "../whatsapp/evolution.js";

export default async function handler(req, res) {
  if (!(await validarSesionSupabase(req))) {
    return res.status(401).json({ error: "No autenticado." });
  }
  const number = req.query?.number ? String(req.query.number) : undefined;
  const r = await conectarWhatsapp({ number });
  if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
  return res.status(200).json({ base64: r.base64, code: r.code, pairingCode: r.pairingCode });
}
