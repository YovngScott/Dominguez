import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

export default function TrabajadoresList() {
  const [trabajadores, setTrabajadores] = useState([]);
  const [nombre, setNombre] = useState("");
  const [modal, setModal] = useState(false);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data, error: e } = await supabase.from("trabajadores_taller").select("*").order("nombre_completo");
    if (e) setError("Falta activar la migración de trabajadores del taller en Supabase.");
    else { setTrabajadores(data || []); setError(""); }
  }
  useEffect(() => { cargar(); }, []);

  async function crear(e) {
    e.preventDefault();
    const limpio = nombre.trim();
    if (!limpio) return;
    setGuardando(true); setError("");
    const { error: eInsert } = await supabase.from("trabajadores_taller").insert({ nombre_completo: limpio });
    if (eInsert) setError(eInsert.message);
    else { setNombre(""); setModal(false); await cargar(); }
    setGuardando(false);
  }

  async function cambiarActivo(t) {
    const { error: e } = await supabase.from("trabajadores_taller").update({ activo: !t.activo }).eq("id", t.id);
    if (e) setError(e.message); else cargar();
  }

  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
    <Link to="/usuarios" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">← Usuarios y accesos</Link>
    <div className="flex flex-wrap items-end justify-between gap-4 mt-3 mb-7"><div><h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Trabajadores del taller</h1><p className="text-sm text-[var(--ink-soft)] mt-1">No necesitan PIN. Aquí se crean y se les asignan vehículos.</p></div><div className="flex flex-wrap gap-2"><Link className="btn-ghost" to="/taller/reporte"><Icon name="file" className="w-5 h-5" /> Reporte reparados</Link><button className="btn-primary" onClick={() => setModal(true)}><Icon name="plus" className="w-5 h-5" /> Nuevo trabajador</button></div></div>
    {error && <div className="card p-4 mb-5 text-sm text-[var(--brand-red)]">{error}</div>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{trabajadores.map((t) => <article key={t.id} className={`card p-6 ${t.activo ? "" : "opacity-60"}`}><div className="flex items-start justify-between gap-3"><span className="w-12 h-12 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name="user" className="w-6 h-6" /></span><button onClick={() => cambiarActivo(t)} className={`text-xs font-bold px-2.5 py-1 rounded-full ${t.activo ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>{t.activo ? "Activo" : "Inactivo"}</button></div><p className="mt-5 text-lg font-extrabold text-[var(--ink)]">{t.nombre_completo}</p><p className="text-sm text-[var(--ink-soft)] mt-1">Trabajador del taller</p><Link to={`/taller/trabajadores/${t.id}`} className="btn-ghost mt-5 w-full justify-center"><Icon name="wrench" className="w-4 h-4" /> Ver y asignar casos</Link></article>)}{trabajadores.length === 0 && <div className="card p-10 text-center text-[var(--ink-soft)] sm:col-span-2 lg:col-span-3">Aún no hay trabajadores. Crea el primero para asignarle vehículos.</div>}</div>
    {modal && <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-end sm:items-center justify-center"><form onSubmit={crear} className="card w-full max-w-md p-6"><div className="flex items-center justify-between"><h2 className="text-xl font-extrabold text-[var(--ink)]">Nuevo trabajador</h2><button type="button" onClick={() => setModal(false)} className="text-[var(--ink-soft)] hover:text-[var(--brand-red)]"><Icon name="close" /></button></div><p className="text-sm text-[var(--ink-soft)] mt-1">No crea una cuenta ni requiere PIN.</p><label className="block mt-5"><span className="field-label">Nombre completo</span><input autoFocus required className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label><div className="flex gap-3 mt-6"><button type="button" className="btn-ghost flex-1" onClick={() => setModal(false)}>Cancelar</button><button disabled={guardando} className="btn-primary flex-1">{guardando ? "Guardando…" : "Crear trabajador"}</button></div></form></div>}
  </div>;
}
