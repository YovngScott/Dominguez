// Helpers compartidos para hablar con Evolution API (Railway).
// Usados por las funciones serverless de /api. La clave y la URL viven en
// variables de entorno de Vercel, nunca en el navegador.

export function evolutionConfig() {
  const apiUrl = (process.env.EVOLUTION_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instancia = process.env.EVOLUTION_INSTANCE;
  return { apiUrl, apiKey, instancia, ok: !!(apiUrl && apiKey && instancia) };
}

// Normaliza el teléfono a solo dígitos con código de país (lo que espera
// Evolution). RD: 10 dígitos locales → antepone el país. "809-555-1234" → "18095551234".
export function normalizarTelefono(raw, paisPorDefecto = "1") {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length === 10) d = paisPorDefecto + d;
  return d;
}

// Envía un texto por WhatsApp. Devuelve { ok, status, id?, error? }.
export async function enviarTextoWhatsapp({ number, text }) {
  const { apiUrl, apiKey, instancia, ok } = evolutionConfig();
  if (!ok) {
    return { ok: false, status: 500, error: "Evolution no configurado (EVOLUTION_API_URL/KEY/INSTANCE)." };
  }
  try {
    const r = await fetch(`${apiUrl}/message/sendText/${encodeURIComponent(instancia)}`, {
      method: "POST",
      headers: { apikey: apiKey, "content-type": "application/json" },
      body: JSON.stringify({ number, text }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.message || data?.error || "Error al enviar el WhatsApp (Evolution).";
      return { ok: false, status: r.status, error: typeof msg === "string" ? msg : JSON.stringify(msg) };
    }
    return { ok: true, status: 200, id: data?.key?.id || null };
  } catch (e) {
    return { ok: false, status: 502, error: "No se pudo conectar con Evolution API: " + e.message };
  }
}

// Consulta el estado de la conexión de WhatsApp: "open" (conectado),
// "connecting", "close" (desconectado), "no_config" o "error".
export async function estadoWhatsapp() {
  const { apiUrl, apiKey, instancia, ok } = evolutionConfig();
  if (!ok) return { ok: false, state: "no_config" };
  try {
    const r = await fetch(`${apiUrl}/instance/connectionState/${encodeURIComponent(instancia)}`, {
      headers: { apikey: apiKey },
    });
    const data = await r.json().catch(() => ({}));
    const state = data?.instance?.state || data?.state || "unknown";
    return { ok: r.ok, state };
  } catch (e) {
    return { ok: false, state: "error", error: e.message };
  }
}

// Pide a Evolution el QR (imagen) para vincular el WhatsApp. Si se pasa
// `number` (teléfono con código de país), Evolution devuelve además un código
// de emparejamiento de 8 caracteres como alternativa a escanear el QR.
// Devuelve { ok, base64, code, pairingCode }.
export async function conectarWhatsapp({ number } = {}) {
  const { apiUrl, apiKey, instancia, ok } = evolutionConfig();
  if (!ok) return { ok: false, error: "Evolution no configurado (EVOLUTION_API_URL/KEY/INSTANCE)." };
  try {
    const qs = number ? `?number=${encodeURIComponent(number)}` : "";
    const r = await fetch(`${apiUrl}/instance/connect/${encodeURIComponent(instancia)}${qs}`, {
      headers: { apikey: apiKey },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.message || data?.error || "No se pudo generar el código de conexión.";
      return { ok: false, status: r.status, error: typeof msg === "string" ? msg : JSON.stringify(msg) };
    }
    // Evolution v2 responde { base64 (QR en imagen), code (texto del QR),
    // pairingCode }. Algunas versiones lo anidan bajo `qrcode`.
    const base64 = data?.base64 || data?.qrcode?.base64 || null;
    const code = data?.code || data?.qrcode?.code || null;
    const pairingCode = data?.pairingCode || data?.qrcode?.pairingCode || null;
    return { ok: true, base64, code, pairingCode };
  } catch (e) {
    return { ok: false, status: 502, error: "No se pudo conectar con Evolution API: " + e.message };
  }
}

// Valida que la petición traiga una sesión válida de Supabase (usuario logueado).
export async function validarSesionSupabase(req) {
  const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const sbAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!token || !sbUrl || !sbAnon) return false;
  try {
    const u = await fetch(`${sbUrl}/auth/v1/user`, {
      headers: { apikey: sbAnon, Authorization: `Bearer ${token}` },
    });
    return u.ok;
  } catch {
    return false;
  }
}

// Texto de confirmación / recordatorio de cita (trato formal). WhatsApp usa
// *asteriscos* para negrita. tipo: "confirmacion" | "recordatorio".
export function textoCita({ nombre, fecha, hora, vehiculo, servicio, esHoy = false }, tipo = "confirmacion") {
  const v = (x, alt = "—") => {
    const s = String(x ?? "").trim();
    return s || alt;
  };
  const horaV = v(hora, "");
  let encabezado;
  if (tipo === "recordatorio") {
    encabezado = "Le recordamos su cita de mañana en *Dominguez Auto Pintura*:";
  } else if (esHoy) {
    encabezado = horaV
      ? `Su cita en *Dominguez Auto Pintura* es *para HOY* a las ${horaV}:`
      : "Su cita en *Dominguez Auto Pintura* es *para HOY*:";
  } else {
    encabezado = "Su cita en *Dominguez Auto Pintura* quedó registrada:";
  }
  const lineas = [
    `Hola ${v(nombre, "")} 👋`.trim(),
    "",
    encabezado,
    "",
    `📅 Fecha: ${v(fecha)}`,
    `🕒 Hora: ${v(hora, "por confirmar")}`,
  ];
  if (v(vehiculo, "") !== "") lineas.push(`🚗 Vehículo: ${vehiculo}`);
  if (v(servicio, "") !== "") lineas.push(`🔧 Motivo: ${servicio}`);
  lineas.push("", "Si necesita reprogramar, respóndanos por aquí. ¡Le esperamos!");
  return lineas.join("\n");
}
