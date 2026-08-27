// Trabajo programado (Vercel Cron): avisa por WhatsApp qué insumos del almacén
// están agotados o por debajo de su mínimo, para reponerlos antes de quedarse
// sin material. Se ejecuta una vez al día (ver "crons" en vercel.json).
//
// Variables de entorno (ya usadas por el resto del sistema):
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY, SHOP_WHATSAPP
//   + las de Evolution (EVOLUTION_API_URL / KEY / INSTANCE)
import { normalizarTelefono, enviarTextoWhatsapp, evolutionConfig } from "../whatsapp/evolution.js";

const num = (v) => Number(v ?? 0) || 0;
const cant = (v) => (Number.isInteger(num(v)) ? String(num(v)) : num(v).toFixed(2));

export default async function handler(req, res) {
  // Solo el cron de Vercel (o quien tenga el secreto) puede dispararlo.
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || "";
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "No autorizado." });
  }

  const sbUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !serviceKey) {
    return res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY o la URL de Supabase." });
  }

  // Insumos activos cuyo stock quedó en/por debajo del mínimo.
  let insumos;
  try {
    const r = await fetch(
      `${sbUrl}/rest/v1/suministros?select=nombre,stock,stock_minimo,unidad&activo=eq.true&order=stock.asc`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    const data = await r.json();
    if (!Array.isArray(data)) throw new Error(JSON.stringify(data).slice(0, 200));
    insumos = data.filter((s) => num(s.stock) <= num(s.stock_minimo));
  } catch (e) {
    return res.status(502).json({ error: "No se pudo leer el almacén: " + e.message });
  }

  if (!insumos.length) {
    return res.status(200).json({ ok: true, porReponer: 0, aviso: "sin faltantes" });
  }

  if (!evolutionConfig().ok) {
    return res.status(200).json({ ok: true, porReponer: insumos.length, aviso: "WhatsApp no configurado" });
  }

  const agotados = insumos.filter((s) => num(s.stock) <= 0);
  const bajos = insumos.filter((s) => num(s.stock) > 0);

  const lineas = [`📦 *Almacén: hay que reponer*`, ""];
  if (agotados.length) {
    lineas.push(`❌ *Agotados (${agotados.length}):*`);
    agotados.slice(0, 20).forEach((s) => lineas.push(`• ${s.nombre}`));
    lineas.push("");
  }
  if (bajos.length) {
    lineas.push(`⚠️ *Quedan pocos (${bajos.length}):*`);
    bajos.slice(0, 20).forEach((s) => lineas.push(`• ${s.nombre}: ${cant(s.stock)} ${s.unidad || ""}`.trim()));
  }

  const numTaller = normalizarTelefono(
    process.env.SHOP_WHATSAPP || "8095757986",
    process.env.WHATSAPP_DEFAULT_COUNTRY || "1"
  );
  const envio = await enviarTextoWhatsapp({ number: numTaller, text: lineas.join("\n") });

  return res.status(200).json({
    ok: true,
    porReponer: insumos.length,
    agotados: agotados.length,
    avisoEnviado: envio.ok,
    error: envio.ok ? undefined : envio.error,
  });
}
