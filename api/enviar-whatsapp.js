// Función serverless (Vercel) que envía un WhatsApp de confirmación de cita a
// través de Evolution API (desplegada en Railway). La clave y la URL viven solo
// aquí (variables de entorno en Vercel), nunca en el navegador. Verifica que
// quien la llama tenga sesión de Supabase, igual que /api/enviar-correo.
//
// Variables de entorno necesarias en Vercel:
//   EVOLUTION_API_URL   → URL pública de Railway, sin barra final.
//                         Ej: https://evolution-api-production-xxxx.up.railway.app
//   EVOLUTION_API_KEY   → el mismo valor que pusiste en AUTHENTICATION_API_KEY en Railway.
//   EVOLUTION_INSTANCE  → nombre de la instancia de WhatsApp que creaste (ej: "dominguez").
//   WHATSAPP_DEFAULT_COUNTRY → (opcional) código de país sin "+". Def: 1 (Rep. Dom.)

// Normaliza el teléfono a solo dígitos con código de país (lo que espera
// Evolution). RD: 10 dígitos locales → antepone el país. "809-555-1234" → "18095551234".
function normalizarTelefono(raw, paisPorDefecto) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) d = paisPorDefecto + d;
  return d;
}

// Arma el texto del mensaje. WhatsApp usa *asteriscos* para negrita.
function construirTexto({ nombre, fecha, hora, vehiculo, servicio }) {
  const v = (x, alt = "—") => {
    const s = String(x ?? "").trim();
    return s || alt;
  };
  const lineas = [
    `Hola ${v(nombre, "")} 👋`.trim(),
    "",
    "Tu cita en *Dominguez Auto Pintura* quedó registrada:",
    "",
    `📅 Fecha: ${v(fecha)}`,
    `🕒 Hora: ${v(hora, "por confirmar")}`,
  ];
  if (v(vehiculo, "") !== "") lineas.push(`🚗 Vehículo: ${vehiculo}`);
  if (v(servicio, "") !== "") lineas.push(`🔧 Motivo: ${servicio}`);
  lineas.push("", "Si necesitas reprogramar, respóndenos por aquí. ¡Te esperamos!");
  return lineas.join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const apiUrl = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCE;
  if (!apiUrl || !apiKey || !instancia) {
    return res.status(500).json({
      error: "Falta configurar EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_INSTANCE en Vercel.",
    });
  }

  // ── Autenticación: debe ser un usuario logueado de Supabase ──
  const authToken = (req.headers.authorization || "").replace("Bearer ", "").trim();
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!authToken || !sbUrl || !sbAnon) return res.status(401).json({ error: "No autenticado." });
  try {
    const u = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbAnon, Authorization: `Bearer ${authToken}` },
    });
    if (!u.ok) return res.status(401).json({ error: "Sesión inválida." });
  } catch {
    return res.status(401).json({ error: "No se pudo validar la sesión." });
  }

  const { to, nombre, fecha, hora, vehiculo, servicio } = req.body || {};

  const paisPorDefecto = process.env.WHATSAPP_DEFAULT_COUNTRY || "1";
  const number = normalizarTelefono(to, paisPorDefecto);
  if (!number) return res.status(400).json({ error: "Falta un teléfono válido del destinatario." });

  const text = construirTexto({ nombre, fecha, hora, vehiculo, servicio });

  // Evolution API v2 — enviar texto:  POST /message/sendText/{instance}
  //   headers: { apikey }   body: { number, text }
  try {
    const r = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.message || data?.error || "Error al enviar el WhatsApp (Evolution).";
      return res.status(r.status).json({ error: typeof msg === "string" ? msg : JSON.stringify(msg) });
    }
    return res.status(200).json({ success: true, id: data?.key?.id || data?.messageId || null });
  } catch (e) {
    return res.status(502).json({ error: "No se pudo conectar con Evolution API: " + e.message });
  }
}
