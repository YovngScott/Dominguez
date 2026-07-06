// Función serverless (Vercel) que envía un WhatsApp de confirmación de cita a
// través de Evolution API (Railway). La clave y la URL viven solo en variables
// de entorno. Verifica que quien la llama tenga sesión de Supabase.
import {
  evolutionConfig,
  normalizarTelefono,
  enviarTextoWhatsapp,
  validarSesionSupabase,
  textoCita,
} from "../whatsapp/evolution.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  if (!evolutionConfig().ok) {
    return res.status(500).json({
      error: "Falta configurar EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE en Vercel.",
    });
  }

  if (!(await validarSesionSupabase(req))) {
    return res.status(401).json({ error: "No autenticado." });
  }

  const { to, nombre, fecha, hora, vehiculo, servicio, esHoy } = req.body || {};

  const number = normalizarTelefono(to, process.env.WHATSAPP_DEFAULT_COUNTRY || "1");
  if (!number) return res.status(400).json({ error: "Falta un teléfono válido del destinatario." });

  const text = textoCita({ nombre, fecha, hora, vehiculo, servicio, esHoy }, "confirmacion");
  const r = await enviarTextoWhatsapp({ number, text });
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  return res.status(200).json({ success: true, id: r.id });
}
