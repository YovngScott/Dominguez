// Función serverless (Vercel) que manda por WhatsApp la lista de piezas de una
// cotización a varios suplidores de una vez. Usa el mismo Evolution API que las
// citas. Devuelve el resultado de cada uno por separado para poder decir en
// pantalla a quién sí le llegó y a quién no.
import {
  evolutionConfig,
  normalizarTelefono,
  enviarTextoWhatsapp,
  validarSesionSupabase,
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

  const { destinatarios } = req.body || {};
  if (!Array.isArray(destinatarios) || destinatarios.length === 0) {
    return res.status(400).json({ error: "No se indicó a qué suplidores enviar." });
  }

  const pais = process.env.WHATSAPP_DEFAULT_COUNTRY || "1";
  const resultados = [];

  // En serie y no en paralelo: Evolution limita los envíos seguidos y mandarlos
  // todos de golpe hace que WhatsApp los tome como spam.
  for (const d of destinatarios) {
    const number = normalizarTelefono(d?.telefono, pais);
    if (!number) {
      resultados.push({ id: d?.id, ok: false, error: "El teléfono guardado no es válido." });
      continue;
    }
    if (!String(d?.texto || "").trim()) {
      resultados.push({ id: d?.id, ok: false, error: "El mensaje llegó vacío." });
      continue;
    }
    const r = await enviarTextoWhatsapp({ number, text: d.texto });
    resultados.push({ id: d?.id, ok: r.ok, error: r.ok ? null : r.error });
  }

  const enviados = resultados.filter((r) => r.ok).length;
  return res.status(200).json({ success: enviados > 0, enviados, resultados });
}
