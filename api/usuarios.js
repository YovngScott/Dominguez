import { createHash, randomUUID } from "node:crypto";
// Administración de trabajadores. La service role queda solo en Vercel: el
// navegador llama este endpoint con su sesión y nunca ve claves privilegiadas.
const ROLES = ["administrativo_general", "suministros", "administracion_taller"];
const clean = (v, n) => String(v ?? "").trim().slice(0, n);

function config() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en Vercel.");
  return { url, key };
}

async function supa(url, key, path, options = {}) {
  const r = await fetch(`${url}${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, ...(options.headers || {}) },
  });
  const text = await r.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!r.ok) throw new Error(typeof data === "string" ? data.slice(0, 220) : data?.message || data?.msg || "Error de Supabase.");
  return data;
}

async function validarAdmin(req, url, key) {
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const user = await supa(url, key, "/auth/v1/user", { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!user?.id) return null;
  const perfiles = await supa(url, key, `/rest/v1/perfiles?select=user_id,rol,activo&user_id=eq.${encodeURIComponent(user.id)}&limit=1`).catch(() => []);
  // Cuenta existente sin perfil: conserva acceso para que pueda crear los
  // primeros usuarios con PIN desde la interfaz.
  const perfil = perfiles?.[0];
  if (!perfil || (perfil.rol === "administrativo_general" && perfil.activo)) return user;
  return null;
}

function validarPayload(body, { creando = false } = {}) {
  const nombre = clean(body?.nombre_completo, 120);
  const rol = clean(body?.rol, 40);
  const pin = clean(body?.pin, 8);
  if (!nombre) throw new Error("El nombre completo es obligatorio.");
  if (!ROLES.includes(rol)) throw new Error("Selecciona un rol válido.");
  if ((creando || pin) && !/^\d{4}$/.test(pin)) throw new Error("El PIN debe tener 4 dígitos.");
  return { nombre, rol, pin: pin || null, activo: body?.activo !== false };
}

async function validarPinDisponible(url, key, pin, userId = null) {
  if (!pin) return;
  const huella = createHash("sha256").update(pin).digest("hex");
  const rows = await supa(url, key, `/rest/v1/perfiles?select=user_id&pin_fingerprint=eq.${huella}&limit=2`);
  if ((rows || []).some((p) => p.user_id !== userId)) throw new Error("Ese PIN ya está asignado a otro usuario.");
}

export default async function handler(req, res) {
  let url; let key;
  try { ({ url, key } = config()); } catch (e) { return res.status(500).json({ error: e.message }); }

  const caller = await validarAdmin(req, url, key);
  if (!caller) return res.status(403).json({ error: "Solo Administración General puede gestionar usuarios." });

  try {
    if (req.method === "GET") {
      const data = await supa(url, key, "/rest/v1/perfiles?select=user_id,nombre_completo,rol,activo,created_at&order=nombre_completo.asc");
      return res.status(200).json({ usuarios: data || [] });
    }

    if (req.method === "POST") {
      const p = validarPayload(req.body, { creando: true });
      await validarPinDisponible(url, key, p.pin);
      const loginEmail = `usuario-${randomUUID()}@pin.dominguez.local`;
      const authUser = await supa(url, key, "/auth/v1/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: p.pin, email_confirm: true, user_metadata: { nombre: p.nombre } }),
      });
      const userId = authUser?.id || authUser?.user?.id;
      if (!userId) throw new Error("No se pudo crear el acceso del usuario.");
      try {
        await supa(url, key, "/rest/v1/rpc/guardar_perfil_usuario", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ p_user_id: userId, p_nombre_completo: p.nombre, p_rol: p.rol, p_activo: p.activo, p_login_email: loginEmail, p_pin: p.pin }),
        });
      } catch (e) {
        await supa(url, key, `/auth/v1/admin/users/${userId}`, { method: "DELETE" }).catch(() => {});
        throw e;
      }
      return res.status(201).json({ ok: true, userId });
    }

    if (req.method === "PATCH") {
      const userId = clean(req.body?.user_id, 80);
      if (!userId) return res.status(400).json({ error: "Falta el usuario." });
      const p = validarPayload(req.body);
      const existente = await supa(url, key, `/rest/v1/perfiles?select=login_email&user_id=eq.${encodeURIComponent(userId)}&limit=1`);
      if (!existente?.[0]?.login_email) return res.status(404).json({ error: "Usuario no encontrado." });
      await validarPinDisponible(url, key, p.pin, userId);
      if (p.pin) {
        await supa(url, key, `/auth/v1/admin/users/${userId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ password: p.pin }),
        });
      }
      await supa(url, key, "/rest/v1/rpc/guardar_perfil_usuario", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_user_id: userId, p_nombre_completo: p.nombre, p_rol: p.rol, p_activo: p.activo, p_login_email: existente[0].login_email, p_pin: p.pin }),
      });
      return res.status(200).json({ ok: true });
    }

    if (req.method === "DELETE") {
      const userId = clean(req.body?.user_id, 80);
      if (!userId) return res.status(400).json({ error: "Falta el usuario." });
      if (userId === caller.id) return res.status(400).json({ error: "No puedes eliminar tu propio acceso." });
      await supa(url, key, `/auth/v1/admin/users/${userId}`, { method: "DELETE" });
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: "Método no permitido." });
  } catch (e) {
    return res.status(400).json({ error: e.message || "No se pudo guardar el usuario." });
  }
}
