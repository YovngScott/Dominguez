import { normalizarTelefono, enviarTextoWhatsapp, evolutionConfig } from "../whatsapp/evolution.js";

const TZ = "America/Santo_Domingo";
function zonedParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
}
function weekRange(now = new Date()) {
  const p = zonedParts(now); const base = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const day = base.getUTCDay() || 7; base.setUTCDate(base.getUTCDate() - day + 1);
  const start = base.toISOString().slice(0, 10); base.setUTCDate(base.getUTCDate() + 5);
  return { start, end: base.toISOString().slice(0, 10), hour: Number(p.hour), minute: Number(p.minute), day: day };
}
function label(date) { return new Date(`${date}T12:00:00Z`).toLocaleDateString("es-DO", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" }); }

export default async function handler(req, res) {
  const webhookSecret = process.env.SUPABASE_DATABASE_WEBHOOK_SECRET;
  const isWebhook = Boolean(webhookSecret && String(req.headers["x-supabase-webhook-secret"] || "") === webhookSecret && req.body?.record?.id);
  const supabaseCronSecret = process.env.SUPABASE_CRON_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authorizedCron = req.headers.authorization === `Bearer ${cronSecret}` || (supabaseCronSecret && String(req.headers["x-supabase-cron-secret"] || "") === supabaseCronSecret);
  if ((cronSecret || supabaseCronSecret) && !isWebhook && !authorizedCron) return res.status(401).json({ error: "No autorizado." });
  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !key) return res.status(500).json({ error: "Falta configuración de Supabase." });
  const range = weekRange();
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const select = "id,nombre,telefono,fecha,hora,motivo,caso:casos(placa,marca:marcas(nombre),modelo:modelos(nombre))";
  if (isWebhook) {
    if (req.body?.type !== "INSERT" || req.body?.table !== "citas") return res.status(200).json({ sent: false, reason: "evento_no_aplicable" });
    const citaId = req.body.record.id;
    const existing = await fetch(`${sbUrl}/rest/v1/citas_avisos_enviados?cita_id=eq.${citaId}&tipo=eq.nueva_semana&select=cita_id`, { headers });
    if ((await existing.json())?.length) return res.status(200).json({ sent: false, duplicate: true });
    const citaRes = await fetch(`${sbUrl}/rest/v1/citas?id=eq.${citaId}&select=${encodeURIComponent(select)}`, { headers });
    const cita = (await citaRes.json())?.[0];
    if (!cita || cita.estado === "cancelada") return res.status(200).json({ sent: false, reason: "cita_no_notificable" });
    const phoneRes = await fetch(`${sbUrl}/rest/v1/telefonos_notificacion?select=telefono&activo=eq.true&resumen_semanal=eq.true&limit=1`, { headers });
    const phoneRows = await phoneRes.json(); const number = normalizarTelefono(phoneRows?.[0]?.telefono, process.env.WHATSAPP_DEFAULT_COUNTRY || "1");
    if (!number || !evolutionConfig().ok) return res.status(503).json({ error: "No hay número de resumen o WhatsApp conectado." });
    const vehicle = [cita.caso?.marca?.nombre, cita.caso?.modelo?.nombre, cita.caso?.placa].filter(Boolean).join(" ");
    const envio = await enviarTextoWhatsapp({ number, text: `➕ Nueva cita agregada esta semana\n\n• ${label(cita.fecha)}${cita.hora ? ` ${cita.hora}` : ""} — ${cita.nombre}${cita.telefono ? ` (${cita.telefono})` : ""}${vehicle ? `\nVehículo: ${vehicle}` : ""}${cita.motivo ? `\nMotivo: ${cita.motivo}` : ""}` });
    if (!envio.ok) return res.status(502).json({ error: envio.error || "No se pudo enviar el aviso." });
    await fetch(`${sbUrl}/rest/v1/citas_avisos_enviados`, { method: "POST", headers: { ...headers, "content-type": "application/json", Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ cita_id: citaId, tipo: "nueva_semana" }) });
    return res.status(200).json({ sent: true, webhook: true });
  }
  const r = await fetch(`${sbUrl}/rest/v1/citas?select=${encodeURIComponent(select)}&fecha=gte.${range.start}&fecha=lte.${range.end}&estado=neq.cancelada&order=fecha.asc,hora.asc`, { headers });
  const citas = await r.json(); if (!Array.isArray(citas)) return res.status(502).json({ error: "No se pudieron leer las citas." });
  const markerRes = await fetch(`${sbUrl}/rest/v1/citas_resumen_semanal?semana_inicio=eq.${range.start}&select=semana_inicio,citas_ids,enviado_at`, { headers });
  const markerRows = await markerRes.json(); const marker = markerRows?.[0] || null;
  const ids = citas.map((c) => c.id); const previous = new Set(Array.isArray(marker?.citas_ids) ? marker.citas_ids : []);
  const added = citas.filter((c) => !previous.has(c.id));
  const mondayWindow = range.day === 1 && (range.hour > 7 || (range.hour === 7 && range.minute >= 30)) && (range.hour < 8);
  if (!mondayWindow && !marker) return res.status(200).json({ sent: false, reason: "fuera_de_horario", total: citas.length });
  if (!mondayWindow && marker && !added.length) return res.status(200).json({ sent: false, reason: "sin_novedades", total: citas.length });
  const phoneRes = await fetch(`${sbUrl}/rest/v1/telefonos_notificacion?select=telefono&activo=eq.true&resumen_semanal=eq.true&order=created_at.asc&limit=1`, { headers });
  const phoneRows = await phoneRes.json(); const number = normalizarTelefono(phoneRows?.[0]?.telefono, process.env.WHATSAPP_DEFAULT_COUNTRY || "1");
  if (!number || !evolutionConfig().ok) return res.status(503).json({ error: "No hay número de notificación o WhatsApp conectado." });
  const list = (mondayWindow ? citas : added).map((c) => `• ${label(c.fecha)}${c.hora ? ` ${c.hora}` : ""} — ${c.nombre}${c.telefono ? ` (${c.telefono})` : ""}${c.motivo ? ` · ${c.motivo}` : ""}`).join("\n");
  const title = mondayWindow ? `📅 Citas de la semana (${label(range.start)} al ${label(range.end)})` : "➕ Nueva cita agregada esta semana";
  const envio = await enviarTextoWhatsapp({ number, text: `${title}\n\n${list || "No hay citas programadas."}` });
  if (!envio.ok) return res.status(502).json({ error: envio.error || "No se pudo enviar el resumen." });
  await fetch(`${sbUrl}/rest/v1/citas_resumen_semanal?semana_inicio=eq.${range.start}`, { method: marker ? "PATCH" : "POST", headers: { ...headers, "content-type": "application/json", Prefer: "resolution=merge-duplicates" }, body: JSON.stringify({ semana_inicio: range.start, citas_ids: ids, enviado_at: new Date().toISOString() }) });
  return res.status(200).json({ sent: true, weekly: mondayWindow, added: added.length, total: citas.length });
}
