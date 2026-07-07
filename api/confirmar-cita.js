// Avisa al cliente que su cita fue CONFIRMADA. WhatsApp en todos los casos
// (cita interna o web); correo solo si la cita vino de la web (origen "web") y
// hay email. Requiere sesión de Supabase (lo llama el módulo interno de Citas).
import {
  normalizarTelefono,
  enviarTextoWhatsapp,
  evolutionConfig,
  validarSesionSupabase,
} from "../whatsapp/evolution.js";
import { enviarEmailBrevo, escHtml } from "../email/brevo.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });
  if (!(await validarSesionSupabase(req))) return res.status(401).json({ error: "No autenticado." });

  const { nombre, telefono, email, fecha, hora, vehiculo, origen } = req.body || {};
  const v = (x, alt = "—") => {
    const s = String(x ?? "").trim();
    return s || alt;
  };

  // WhatsApp al cliente (siempre que haya teléfono y Evolution esté activo).
  if (evolutionConfig().ok && telefono) {
    const num = normalizarTelefono(telefono, process.env.WHATSAPP_DEFAULT_COUNTRY || "1");
    if (num) {
      await enviarTextoWhatsapp({
        number: num,
        text:
          `Hola ${v(nombre, "")} 👋\n\n`.trimStart() +
          `✅ Su cita en *Dominguez Auto Pintura* fue *CONFIRMADA*${vehiculo ? ` para su *${vehiculo}*` : ""}.\n\n` +
          `📅 Fecha: ${v(fecha)}\n🕒 Hora: ${v(hora, "por confirmar")}\n\n` +
          `¡Le esperamos! Av. Hatuey #16, Santiago.`,
      }).catch(() => {});
    }
  }

  // Correo solo para solicitudes web con correo.
  if (origen === "web" && email && String(email).includes("@")) {
    await enviarEmailBrevo({
      to: [{ email, name: nombre }],
      subject: "Su cita fue confirmada — Dominguez Auto Pintura",
      htmlContent: `<p>Hola ${escHtml(nombre)},</p>
        <p>Le confirmamos que su cita en <b>Dominguez Auto Pintura</b>${
          vehiculo ? ` para su <b>${escHtml(vehiculo)}</b>` : ""
        } fue <b>confirmada</b>.</p>
        <table style="border-collapse:collapse;margin-top:8px">
          <tr><td style="padding:4px 10px;color:#64748b">Fecha</td><td style="padding:4px 10px;font-weight:600">${escHtml(v(fecha))}</td></tr>
          <tr><td style="padding:4px 10px;color:#64748b">Hora</td><td style="padding:4px 10px;font-weight:600">${escHtml(v(hora, "por confirmar"))}</td></tr>
        </table>
        <p style="margin-top:12px">¡Le esperamos!<br><b>Dominguez Auto Pintura</b><br>Av. Hatuey #16, Santiago · 809-575-7986</p>`,
    });
  }

  return res.status(200).json({ success: true });
}
