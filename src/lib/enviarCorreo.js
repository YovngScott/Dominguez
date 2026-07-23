import { supabase } from "./supabaseClient";

// Envía un correo llamando a la función serverless /api/enviar-correo, que es
// la que tiene la API key de Brevo. attachment = [{ url, name }] (Brevo lo
// descarga de esa URL) o [{ content, name }] (contenido en base64, usado para
// las fotos: se convierten a JPG en el cliente antes de mandarlas).
export async function enviarCorreo({ to, subject, htmlContent, attachment, replyTo }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const r = await fetch("/api/enviar-correo", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify({ to, subject, htmlContent, attachment, replyTo }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success) throw new Error(data.error || `Error ${r.status} al enviar el correo.`);
  return data;
}
