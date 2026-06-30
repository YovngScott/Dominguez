// Función serverless (Vercel) que envía un correo transaccional vía Brevo.
// La API key vive solo aquí (variable de entorno BREVO_API_KEY en Vercel),
// nunca en el navegador. Verifica que quien la llama tenga sesión de Supabase.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Falta configurar BREVO_API_KEY en Vercel." });

  // ── Autenticación: debe ser un usuario logueado de Supabase ──
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!token || !sbUrl || !sbAnon) return res.status(401).json({ error: "No autenticado." });
  try {
    const u = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbAnon, Authorization: `Bearer ${token}` },
    });
    if (!u.ok) return res.status(401).json({ error: "Sesión inválida." });
  } catch {
    return res.status(401).json({ error: "No se pudo validar la sesión." });
  }

  const { to, subject, htmlContent, attachment, replyTo } = req.body || {};
  if (!Array.isArray(to) || !to.length) return res.status(400).json({ error: "Falta el destinatario." });
  if (!subject) return res.status(400).json({ error: "Falta el asunto." });

  const body = {
    sender: { email: "segurosycotizaciones@dominguezapintura.com", name: "Dominguez Auto Pintura" },
    to,
    subject,
    htmlContent: htmlContent || "<p></p>",
  };
  if (replyTo?.email) body.replyTo = replyTo;
  if (Array.isArray(attachment) && attachment.length) body.attachment = attachment;

  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ error: data.message || "Error al enviar (Brevo).", code: data.code });
    return res.status(200).json({ success: true, messageId: data.messageId });
  } catch (e) {
    return res.status(502).json({ error: "No se pudo conectar con Brevo: " + e.message });
  }
}
