// Devuelve el estado de la conexión de WhatsApp o genera el QR para vincularlo.
// Consolidado en un solo endpoint para respetar el límite de 12 funciones de Vercel Hobby.
import { estadoWhatsapp, conectarWhatsapp, validarSesionSupabase } from "../whatsapp/evolution.js";

export default async function handler(req, res) {
  if (!(await validarSesionSupabase(req))) {
    return res.status(401).json({ error: "No autenticado." });
  }

  // Flujo para vincular (conectar) WhatsApp
  if (req.query?.action === "conectar") {
    const number = req.query?.number ? String(req.query.number) : undefined;
    const r = await conectarWhatsapp({ number });
    if (!r.ok) return res.status(r.status || 500).json({ error: r.error });
    return res.status(200).json({ base64: r.base64, code: r.code, pairingCode: r.pairingCode });
  }

  // Flujo por defecto: Obtener estado de conexión
  const r = await estadoWhatsapp();
  return res.status(200).json({ state: r.state, ok: r.ok, error: r.error || null });
}
