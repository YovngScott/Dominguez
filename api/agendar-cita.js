// Endpoint PÚBLICO (sin login) para que un cliente solicite una cita desde la
// página pública. Inserta la cita en Supabase con la service-role key (la
// tabla tiene RLS solo para usuarios autenticados, por eso se hace aquí en el
// servidor). Best-effort: confirma por WhatsApp al cliente y avisa al taller.
import { normalizarTelefono, enviarTextoWhatsapp, evolutionConfig } from "../whatsapp/evolution.js";

const lim = (s, n) => String(s ?? "").trim().slice(0, n);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !serviceKey) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en Vercel." });
  }

  const b = req.body || {};
  const nombre = lim(b.nombre, 120);
  const telefono = lim(b.telefono, 30);
  const email = lim(b.email, 120);
  const marca = lim(b.marca, 60);
  const modelo = lim(b.modelo, 60);
  const anio = lim(b.anio, 10);
  const aseguradora = lim(b.aseguradora, 80);
  const reclamo = lim(b.reclamo, 60);
  const mensaje = lim(b.mensaje, 600);
  const fechaPref = lim(b.fecha, 10); // YYYY-MM-DD opcional

  if (!nombre || !telefono) {
    return res.status(400).json({ error: "El nombre y el teléfono son obligatorios." });
  }

  const vehiculo = [marca, modelo, anio].filter(Boolean).join(" ");
  const hoy = new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10); // RD (UTC-4)
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(fechaPref) ? fechaPref : hoy;

  const notaPartes = [
    email ? `Correo: ${email}` : null,
    vehiculo ? `Vehículo: ${vehiculo}` : null,
    aseguradora ? `Aseguradora: ${aseguradora}` : null,
    reclamo ? `Reclamo: ${reclamo}` : null,
    mensaje ? `Mensaje: ${mensaje}` : null,
  ].filter(Boolean);

  const fila = {
    fecha,
    nombre,
    telefono,
    motivo: vehiculo ? `Solicitud web · ${vehiculo}` : "Solicitud web",
    nota: notaPartes.join("\n") || null,
    estado: "pendiente",
    origen: "web",
  };

  // Inserta la cita (service role = salta RLS).
  try {
    const r = await fetch(`${sbUrl}/rest/v1/citas`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(fila),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return res.status(502).json({ error: "No se pudo registrar la solicitud.", detalle: t.slice(0, 200) });
    }
  } catch (e) {
    return res.status(502).json({ error: "No se pudo registrar la solicitud: " + e.message });
  }

  // Best-effort: WhatsApp de confirmación al cliente y aviso al taller.
  if (evolutionConfig().ok) {
    const pais = process.env.WHATSAPP_DEFAULT_COUNTRY || "1";
    const numCliente = normalizarTelefono(telefono, pais);
    if (numCliente) {
      enviarTextoWhatsapp({
        number: numCliente,
        text: `Hola ${nombre} 👋\n\nRecibimos su solicitud en *Dominguez Auto Pintura*${
          vehiculo ? ` para su *${vehiculo}*` : ""
        }. Le contactaremos en menos de 24 horas.\n\n¡Gracias por confiar en nosotros!`,
      }).catch(() => {});
    }
    const numTaller = normalizarTelefono(process.env.SHOP_WHATSAPP || "8095757986", pais);
    if (numTaller) {
      enviarTextoWhatsapp({
        number: numTaller,
        text: `🔔 *Nueva solicitud web*\n\nCliente: ${nombre}\nTel: ${telefono}${
          vehiculo ? `\nVehículo: ${vehiculo}` : ""
        }${aseguradora ? `\nAseguradora: ${aseguradora}` : ""}${mensaje ? `\nMensaje: ${mensaje}` : ""}`,
      }).catch(() => {});
    }
  }

  return res.status(200).json({ success: true });
}
