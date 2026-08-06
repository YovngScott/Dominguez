import { supabase } from "./supabaseClient";

// Envía la confirmación de cita por WhatsApp llamando a la función serverless
// /api/enviar-whatsapp, que es la que habla con Evolution API. esHoy = true hace
// que el mensaje diga que la cita es para HOY.
export async function enviarWhatsappCita({ to, nombre, fecha, hora, vehiculo, servicio, esHoy, esActualizacion = false }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const r = await fetch("/api/enviar-whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify({ to, nombre, fecha, hora, vehiculo, servicio, esHoy, esActualizacion }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success) throw new Error(data.error || `Error ${r.status} al enviar el WhatsApp.`);
  return data;
}

// Manda el mismo tipo de mensaje a varios suplidores de una vez (pedirles
// precio de las piezas). destinatarios = [{ id, telefono, texto }].
// Devuelve { enviados, resultados } con el detalle de cada uno.
export async function enviarWhatsappSuplidores(destinatarios) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const r = await fetch("/api/whatsapp-suplidores", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify({ destinatarios }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status} al enviar los WhatsApp.`);
  return data;
}
