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

  let adjuntos;
  try {
    adjuntos = await prepararAdjuntos(attachment || []);
  } catch (error) {
    return res.status(422).json({ error: error.message || "No se pudo preparar un adjunto." });
  }

  const body = {
    sender: { email: "segurosycotizaciones@dominguezapintura.com", name: "Dominguez Auto Pintura" },
    to,
    subject,
    htmlContent: htmlContent || "<p></p>",
  };
  if (replyTo?.email) body.replyTo = replyTo;
  if (adjuntos.length) body.attachment = adjuntos;

  // Copia oculta a la bandeja del negocio para que el envío quede visible en Gmail
  // (Brevo entrega directo por API, sin pasar por Gmail, así que sin bcc no queda rastro ahí).
  const bccEmail = process.env.BREVO_BCC_EMAIL;
  if (bccEmail) body.bcc = [{ email: bccEmail }];

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

// El navegador manda URLs firmadas, no Base64, para no superar el límite de
// Vercel (413). Aquí se descargan y se pasan a Brevo como adjuntos binarios.
// Esto evita además que Brevo intente identificar un WebP desde una URL aunque
// el archivo ya haya sido convertido a JPG en el cliente.
async function prepararAdjuntos(adjuntos) {
  const lista = Array.isArray(adjuntos) ? adjuntos : [];
  const resultado = [];
  let totalBytes = 0;
  // Brevo limita el mensaje completo a 20 MB. Los adjuntos se transmiten en
  // base64 (un 33% mayor), por eso el contenido binario debe quedar bastante
  // por debajo; 13 MB deja margen para el PDF, cabeceras y MIME.
  const MAX_TOTAL = 13 * 1024 * 1024;

  for (const adjunto of lista) {
    if (adjunto?.content && adjunto?.name) {
      const bytes = Math.floor((adjunto.content.length * 3) / 4);
      totalBytes += bytes;
      if (totalBytes > MAX_TOTAL) {
        throw new Error("Los adjuntos son demasiado pesados para enviarlos por correo.");
      }
      resultado.push({ content: adjunto.content, name: adjunto.name });
      continue;
    }
    if (!adjunto?.url || !adjunto?.name) continue;

    const respuesta = await fetch(adjunto.url);
    if (!respuesta.ok) throw new Error(`No se pudo descargar el adjunto "${adjunto.name}".`);
    const bytes = new Uint8Array(await respuesta.arrayBuffer());
    totalBytes += bytes.byteLength;
    if (totalBytes > MAX_TOTAL) {
      throw new Error("Los adjuntos superan el tamaño permitido para el correo.");
    }
    resultado.push({ content: Buffer.from(bytes).toString("base64"), name: adjunto.name });
  }
  return resultado;
}
