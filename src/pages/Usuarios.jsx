import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

const ROLES = [
  ["administrativo_general", "Administrativo General"],
  ["suministros", "Suministros"],
  ["administracion_taller", "Administración de Taller"],
];
const empty = { nombre_completo: "", rol: "administracion_taller", pin: "", activo: true };
const etiqueta = (rol) => ROLES.find(([v]) => v === rol)?.[1] || rol;

async function api(path = "", options = {}) {
  const { data } = await supabase.auth.getSession();
  const r = await fetch(`/api/usuarios${path}`, { ...options, headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}`, ...(options.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "No se pudo procesar la solicitud.");
  return d;
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  async function cargar() { try { setLoading(true); setUsuarios((await api()).usuarios || []); setError(""); } catch (e) { setError(e.message); } finally { setLoading(false); } }
  useEffect(() => { cargar(); }, []);
  async function eliminar(u) { if (!confirm(`¿Eliminar a ${u.nombre_completo}? Esta acción borrará su acceso por PIN.`)) return; try { await api("", { method: "DELETE", body: JSON.stringify({ user_id: u.user_id }) }); await cargar(); } catch (e) { setError(e.message); } }
  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8"><div className="flex flex-wrap items-end justify-between gap-4 mb-7"><div><h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Usuarios y accesos</h1><p className="text-sm text-[var(--ink-soft)] mt-1">Crea trabajadores, roles y PINs sin entrar a Supabase.</p></div><button className="btn-primary" onClick={() => setModal({ ...empty })}><Icon name="plus" className="w-5 h-5" /> Nuevo usuario</button></div>{error && <div className="card p-4 mb-5 text-sm text-[var(--brand-red)]">{error}</div>}{loading ? <p className="text-[var(--ink-soft)]">Cargando usuarios…</p> : <div className="grid md:grid-cols-2 gap-4">{usuarios.map((u) => <article key={u.user_id} className="card p-5 flex items-center gap-4"><span className="w-11 h-11 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center shrink-0"><Icon name="user" className="w-5 h-5" /></span><div className="min-w-0 flex-1"><p className="font-bold text-[var(--ink)] truncate">{u.nombre_completo}</p><p className="text-sm text-[var(--ink-soft)] truncate">{etiqueta(u.rol)}</p><span className={`inline-block mt-2 text-xs font-bold px-2 py-0.5 rounded-full ${u.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{u.activo ? "Activo" : "Inactivo"}</span></div><div className="flex gap-1"><button onClick={() => setModal({ ...u, pin: "" })} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]" aria-label="Editar"><Icon name="pencil" /></button><button onClick={() => eliminar(u)} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]" aria-label="Eliminar"><Icon name="trash" /></button></div></article>)}{usuarios.length === 0 && <div className="card p-10 text-center text-[var(--ink-soft)] md:col-span-2">No hay usuarios creados con PIN todavía.</div>}</div>}{modal && <UsuarioModal usuario={modal} onClose={() => setModal(null)} onSaved={async () => { setModal(null); await cargar(); }} />}</div>;
}

function UsuarioModal({ usuario, onClose, onSaved }) {
  const editando = Boolean(usuario.user_id); const [f, setF] = useState(usuario); const [error, setError] = useState(""); const [saving, setSaving] = useState(false); const up = (k, v) => setF((x) => ({ ...x, [k]: v }));
  async function guardar(e) { e.preventDefault(); setSaving(true); setError(""); try { await api("", { method: editando ? "PATCH" : "POST", body: JSON.stringify(f) }); await onSaved(); } catch (x) { setError(x.message); } finally { setSaving(false); } }
  return <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-end sm:items-center justify-center"><form onSubmit={guardar} className="card w-full max-w-lg p-6 space-y-4"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-[var(--ink)]">{editando ? "Editar usuario" : "Nuevo usuario"}</h2><button type="button" onClick={onClose} className="text-[var(--ink-soft)] hover:text-[var(--brand-red)]"><Icon name="close" /></button></div><label className="block"><span className="field-label">Nombre completo</span><input required className="input" value={f.nombre_completo} onChange={(e) => up("nombre_completo", e.target.value)} /></label><label className="block"><span className="field-label">Rol</span><select className="input" value={f.rol} onChange={(e) => up("rol", e.target.value)}>{ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="block"><span className="field-label">{editando ? "Nuevo PIN (déjalo vacío para conservarlo)" : "PIN de 4 dígitos"}</span><input className="input text-center tracking-[0.45em] text-lg font-bold" inputMode="numeric" pattern="[0-9]{4}" maxLength="4" required={!editando} value={f.pin || ""} onChange={(e) => up("pin", e.target.value.replace(/\D/g, ""))} /></label><label className="flex items-center gap-3 text-sm font-semibold text-[var(--ink)]"><input type="checkbox" checked={f.activo !== false} onChange={(e) => up("activo", e.target.checked)} /> Usuario activo</label>{error && <p className="text-sm text-[var(--brand-red)]">{error}</p>}<div className="flex gap-3 pt-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancelar</button><button disabled={saving} className="btn-primary flex-1">{saving ? "Guardando…" : "Guardar usuario"}</button></div></form></div>;
}
