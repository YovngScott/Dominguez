import { supabase } from "./supabaseClient";

// Envía la confirmación de cita por WhatsApp llamando a la función serverless
// /api/enviar-whatsapp, que es la que tiene el token de Meta. Los campos se
// mapean a las variables {{1}}..{{5}} de la plantilla (nombre, fecha, hora,
// vehículo, servicio).
export async function enviarWhatsappCita({ to, nombre, fecha, hora, vehiculo, servicio }) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const r = await fetch("/api/enviar-whatsapp", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token || ""}` },
    body: JSON.stringify({ to, nombre, fecha, hora, vehiculo, servicio }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.success) throw new Error(data.error || `Error ${r.status} al enviar el WhatsApp.`);
  return data;
}
