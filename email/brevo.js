// Helper compartido para enviar correos con Brevo desde las funciones
// serverless. La API key vive en la variable de entorno BREVO_API_KEY (Vercel).

export const escHtml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export async function enviarEmailBrevo({ to, subject, htmlContent, replyTo }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey || !to?.length) return { ok: false };
  const body = {
    sender: { email: "segurosycotizaciones@dominguezapintura.com", name: "Dominguez Auto Pintura" },
    to,
    subject,
    htmlContent,
  };
  if (replyTo?.email) body.replyTo = replyTo;
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return { ok: !!(r && r.ok) };
}
