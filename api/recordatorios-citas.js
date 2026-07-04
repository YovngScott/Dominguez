// Trabajo programado (Vercel Cron): manda un recordatorio de WhatsApp a los
// clientes con cita MAÑANA. Se ejecuta una vez al día (ver "crons" en
// vercel.json). No usa sesión de usuario: se autentica con CRON_SECRET (lo
// agrega Vercel automáticamente en las llamadas de cron) y consulta Supabase
// con la service-role key.
//
// Variables de entorno necesarias en Vercel:
//   CRON_SECRET                 → secreto del cron (Vercel lo envía como Bearer).
//   SUPABASE_SERVICE_ROLE_KEY   → para leer/actualizar citas desde el servidor.
//   (más las de Evolution y VITE_SUPABASE_URL que ya existen)
import {
  normalizarTelefono,
  enviarTextoWhatsapp,
  evolutionConfig,
  textoCita,
} from "../whatsapp/evolution.js";

// Fecha (YYYY-MM-DD) de "mañana" en hora de República Dominicana (UTC-4, sin
// horario de verano). Vercel corre en UTC, por eso se ajusta.
function fechaMananaRD() {
  const offsetMs = 4 * 60 * 60 * 1000; // UTC-4
  const ahoraRD = new Date(Date.now() - offsetMs);
  ahoraRD.setUTCDate(ahoraRD.getUTCDate() + 1);
  return ahoraRD.toISOString().slice(0, 10);
}

function fechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("es-DO", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function handler(req, res) {
  // Seguridad: solo el cron de Vercel (o quien tenga el secreto) puede dispararlo.
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "No autorizado." });
  }

  if (!evolutionConfig().ok) {
    return res.status(500).json({ error: "Evolution no configurado." });
  }

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !serviceKey) {
    return res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY o la URL de Supabase." });
  }

  const manana = fechaMananaRD();
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };

  // Citas de mañana, no canceladas, con teléfono y sin recordatorio ya enviado.
  const select =
    "id,nombre,telefono,fecha,hora,motivo,caso:casos(placa,marca:marcas(nombre),modelo:modelos(nombre))";
  const filtro =
    `fecha=eq.${manana}` +
    `&estado=neq.cancelada` +
    `&telefono=not.is.null` +
    `&recordatorio_enviado_at=is.null`;

  let citas = [];
  try {
    const r = await fetch(`${sbUrl}/rest/v1/citas?select=${encodeURIComponent(select)}&${filtro}`, {
      headers,
    });
    citas = await r.json();
    if (!Array.isArray(citas)) throw new Error(JSON.stringify(citas));
  } catch (e) {
    return res.status(502).json({ error: "No se pudieron leer las citas: " + e.message });
  }

  const pais = process.env.WHATSAPP_DEFAULT_COUNTRY || "1";
  let enviados = 0;
  const fallos = [];

  for (const c of citas) {
    const number = normalizarTelefono(c.telefono, pais);
    if (!number) continue;
    const vehiculo = [c.caso?.marca?.nombre, c.caso?.modelo?.nombre, c.caso?.placa]
      .filter(Boolean)
      .join(" ");
    const text = textoCita(
      { nombre: c.nombre, fecha: fechaLarga(c.fecha), hora: c.hora, vehiculo, servicio: c.motivo },
      "recordatorio"
    );
    const envio = await enviarTextoWhatsapp({ number, text });
    if (envio.ok) {
      enviados += 1;
      // Marca la cita como recordada (para no reenviar mañana).
      await fetch(`${sbUrl}/rest/v1/citas?id=eq.${c.id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ recordatorio_enviado_at: new Date().toISOString() }),
      }).catch(() => {});
    } else {
      fallos.push({ id: c.id, error: envio.error });
    }
  }

  return res.status(200).json({ fecha: manana, total: citas.length, enviados, fallos });
}
