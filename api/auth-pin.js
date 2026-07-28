/* global process */
// Inicio de sesión por PIN. El PIN se valida contra su hash en Supabase y
// solamente se devuelve el correo interno de Auth cuando la coincidencia es
// válida. El navegador luego abre una sesión normal de Supabase con ese PIN.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido." });

  const pin = String(req.body?.pin || "").trim();
  if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: "Escribe un PIN de 4 dígitos." });

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel." });

  try {
    const r = await fetch(`${url}/rest/v1/rpc/validar_pin_usuario`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ p_pin: pin }),
    });
    if (!r.ok) throw new Error((await r.text()).slice(0, 180));
    const usuarios = await r.json();
    const usuario = usuarios?.[0];
    if (!usuario?.login_email) return res.status(401).json({ error: "PIN incorrecto o usuario inactivo." });

    return res.status(200).json({
      loginEmail: usuario.login_email,
      usuario: {
        id: usuario.user_id,
        nombre: usuario.nombre_completo,
        rol: usuario.rol,
        especialidad: usuario.especialidad,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: "No se pudo validar el PIN.", detalle: e.message });
  }
}
