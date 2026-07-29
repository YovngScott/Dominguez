// Helpers compartidos para hablar con Evolution API (Railway).
// Usados por las funciones serverless de /api. La clave y la URL viven en
// variables de entorno de Vercel, nunca en el navegador.

// Traduce los errores "de infraestructura" a algo accionable. El más común es
// que el servidor de Evolution (Railway) esté caído o borrado: en ese caso
// Railway responde su propio 404 con "Application not found", que por sí solo
// no le dice nada a quien usa la app.
export function mensajeAmigable(textoCrudo, status) {
  const t = String(textoCrudo || "");
  if (/application not found/i.test(t)) {
    return (
      "El servidor de WhatsApp no está disponible (la dirección ya no responde). " +
      "Hay que volver a desplegar Evolution API y actualizar EVOLUTION_API_URL en Vercel."
    );
  }
  if (/instance .*not found|does not exist|name .*not found/i.test(t)) {
    return (
      "La instancia de WhatsApp no existe en el servidor. Hay que crearla de nuevo " +
      "y volver a vincular el teléfono."
    );
  }
  if (status === 401 || status === 403 || /unauthorized|forbidden/i.test(t)) {
    return "El servidor de WhatsApp rechazó la clave (revisa EVOLUTION_API_KEY en Vercel).";
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|timeout|network/i.test(t)) {
    return "No hay conexión con el servidor de WhatsApp. Puede estar apagado o sin internet.";
  }
  return t || "No se pudo comunicar con el servidor de WhatsApp.";
}

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
      const crudo = typeof msg === "string" ? msg : JSON.stringify(msg);
      return { ok: false, status: r.status, error: mensajeAmigable(crudo, r.status) };
    }
    return { ok: true, status: 200, id: data?.key?.id || null };
  } catch (e) {
    return { ok: false, status: 502, error: mensajeAmigable(e.message, 502) };
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
    if (!r.ok) {
      const crudo = data?.message || data?.error || "";
      // El servidor no existe / no responde: es distinto a "el teléfono se
      // desvinculó", y se avisa aparte para no mandar a escanear un QR en vano.
      const sinServidor = /application not found/i.test(String(crudo)) || r.status >= 500;
      return {
        ok: false,
        state: sinServidor ? "sin_servidor" : "close",
        error: mensajeAmigable(String(crudo), r.status),
      };
    }
    const state = data?.instance?.state || data?.state || "unknown";
    return { ok: true, state };
  } catch (e) {
    return { ok: false, state: "sin_servidor", error: mensajeAmigable(e.message, 502) };
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
      const crudo = typeof msg === "string" ? msg : JSON.stringify(msg);
      return { ok: false, status: r.status, error: mensajeAmigable(crudo, r.status) };
    }
    // Evolution v2 responde { base64 (QR en imagen), code (texto del QR),
    // pairingCode }. Algunas versiones lo anidan bajo `qrcode`.
    const base64 = data?.base64 || data?.qrcode?.base64 || null;
    const code = data?.code || data?.qrcode?.code || null;
    const pairingCode = data?.pairingCode || data?.qrcode?.pairingCode || null;
    return { ok: true, base64, code, pairingCode };
  } catch (e) {
    return { ok: false, status: 502, error: mensajeAmigable(e.message, 502) };
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
// *asteriscos* para negrita. tipo: "confirmacion" | "recordatorio" | "actualizacion".
export function textoCita({ nombre, fecha, hora, vehiculo, servicio, esHoy = false }, tipo = "confirmacion") {
  const v = (x, alt = "—") => {
    const s = String(x ?? "").trim();
    return s || alt;
  };
  const horaV = v(hora, "");
  let encabezado;
  if (tipo === "actualizacion") {
    encabezado = esHoy
      ? `Los datos de su cita en *Dominguez Auto Pintura* fueron actualizados. Su cita es *para HOY*${horaV ? ` a las ${horaV}` : ""}:`
      : "Los datos de su cita en *Dominguez Auto Pintura* fueron actualizados:";
  } else if (tipo === "recordatorio") {
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
