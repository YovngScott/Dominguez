// Genera un enlace "Click to Chat" oficial de WhatsApp (wa.me) con el mensaje
// de confirmación de cita ya escrito. Es gratis y no requiere API ni tokens:
// al abrirlo se abre WhatsApp (app o web) con el número y el texto listos; solo
// falta pulsar "Enviar".

// Normaliza el teléfono a dígitos con código de país. RD (10 dígitos locales)
// antepone el país por defecto. Ej. "809-555-1234" → "18095551234".
function normalizar(telefono, pais) {
  const d = String(telefono || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) return pais + d;
  return d;
}

export function linkWhatsappCita({ telefono, nombre, fecha, hora, vehiculo, servicio, pais = "1" }) {
  const num = normalizar(telefono, pais);
  if (!num) return "";

  const lineas = [
    `Hola ${nombre || ""}, tu cita en Dominguez Auto Pintura quedó registrada. ✅`,
    "",
    `📅 Fecha: ${fecha || "—"}`,
    `🕒 Hora: ${hora || "por confirmar"}`,
  ];
  if (vehiculo) lineas.push(`🚗 Vehículo: ${vehiculo}`);
  if (servicio) lineas.push(`🔧 Servicio: ${servicio}`);
  lineas.push("", "Si necesitas reprogramar, respóndenos por aquí. ¡Te esperamos!");

  return `https://wa.me/${num}?text=${encodeURIComponent(lineas.join("\n"))}`;
}
