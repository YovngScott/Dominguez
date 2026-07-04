// Función serverless (Vercel) que envía un mensaje de WhatsApp usando la
// WhatsApp Cloud API oficial de Meta. El token y el phone-number-id viven solo
// aquí (variables de entorno en Vercel), nunca en el navegador. Verifica que
// quien la llama tenga sesión de Supabase, igual que /api/enviar-correo.
//
// Envía una plantilla (template) pre-aprobada en Meta. Por defecto:
//   nombre: confirmacion_cita   idioma: es
//   cuerpo con 5 variables → {{1}} nombre  {{2}} fecha  {{3}} hora
//                            {{4}} vehículo  {{5}} servicio
//
// Variables de entorno necesarias (Vercel):
//   WHATSAPP_TOKEN            → token de acceso (System User, permanente)
//   WHATSAPP_PHONE_NUMBER_ID  → ID del número de teléfono de WhatsApp
//   WHATSAPP_TEMPLATE         → (opcional) nombre de la plantilla. Def: confirmacion_cita
//   WHATSAPP_LANG             → (opcional) código de idioma. Def: es
//   WHATSAPP_DEFAULT_COUNTRY  → (opcional) código de país sin "+". Def: 1 (Rep. Dom.)
//   GRAPH_API_VERSION         → (opcional) versión de la Graph API. Def: v21.0

// Normaliza un teléfono a formato internacional que espera WhatsApp:
// solo dígitos, con código de país y sin el "+". Ej. "809-555-1234" → "18095551234".
function normalizarTelefono(raw, paisPorDefecto) {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  // Rep. Dom. y afines: 10 dígitos locales → anteponer país.
  if (d.length === 10) d = paisPorDefecto + d;
  // 11 dígitos que ya empiezan por el país quedan igual.
  return d;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return res.status(500).json({
      error: "Falta configurar WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en Vercel.",
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
  const destino = normalizarTelefono(to, paisPorDefecto);
  if (!destino) return res.status(400).json({ error: "Falta un teléfono válido del destinatario." });

  const template = process.env.WHATSAPP_TEMPLATE || "confirmacion_cita";
  const lang = process.env.WHATSAPP_LANG || "es";
  const version = process.env.GRAPH_API_VERSION || "v21.0";

  // Los parámetros van en el mismo orden que las variables {{1}}..{{5}} de la
  // plantilla. WhatsApp no permite parámetros vacíos: se rellenan con "—".
  const val = (x) => {
    const s = String(x ?? "").trim();
    return s || "—";
  };
  const parametros = [nombre, fecha, hora, vehiculo, servicio].map((x) => ({
    type: "text",
    text: val(x),
  }));

  const body = {
    messaging_product: "whatsapp",
    to: destino,
    type: "template",
    template: {
      name: template,
      language: { code: lang },
      components: [{ type: "body", parameters: parametros }],
    },
  };

  try {
    const r = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = data?.error?.message || "Error al enviar el mensaje de WhatsApp.";
      return res.status(r.status).json({ error: msg, code: data?.error?.code });
    }
    return res.status(200).json({ success: true, messageId: data?.messages?.[0]?.id });
  } catch (e) {
    return res.status(502).json({ error: "No se pudo conectar con WhatsApp Cloud API: " + e.message });
  }
}
