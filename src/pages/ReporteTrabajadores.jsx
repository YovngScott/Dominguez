import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

const vehiculo = (c) => [c?.marca?.nombre, c?.modelo?.nombre, c?.anio].filter(Boolean).join(" ") || "Vehículo";
const fecha = (v) => v ? new Date(v).toLocaleDateString("es-DO") : "—";

export default function ReporteTrabajadores() {
  const [trabajadores, setTrabajadores] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const [t, a] = await Promise.all([
        supabase.from("trabajadores_taller").select("id, nombre_completo, activo").order("nombre_completo"),
        supabase.from("casos_trabajadores").select("id, trabajador_id, completado_at, caso:casos(id, numero_llave, placa, numero_reclamo, anio, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre))").eq("estado", "completado").order("completado_at", { ascending: false }),
      ]);
      setTrabajadores(t.data || []); setTrabajos(a.data || []); setLoading(false);
    }
    cargar();
  }, []);

  const porTrabajador = useMemo(() => {
    const mapa = new Map(trabajadores.map((t) => [t.id, { ...t, trabajos: [] }]));
    trabajos.forEach((a) => mapa.get(a.trabajador_id)?.trabajos.push(a));
    return [...mapa.values()].filter((t) => t.trabajos.length || t.activo);
  }, [trabajadores, trabajos]);
  const total = trabajos.length;

  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8"><Link to="/taller/trabajadores" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">← Trabajadores del taller</Link><div className="flex flex-wrap items-end justify-between gap-4 mt-3 mb-7"><div><h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Reporte de trabajos reparados</h1><p className="text-sm text-[var(--ink-soft)] mt-1">Trabajos marcados como completados por cada empleado.</p></div><span className="card px-5 py-3"><span className="text-2xl font-extrabold text-[var(--brand-red)]">{total}</span><span className="ml-2 text-sm text-[var(--ink-soft)]">reparación(es)</span></span></div>{loading ? <p className="text-[var(--ink-soft)]">Cargando reporte…</p> : <div className="grid lg:grid-cols-2 gap-5">{porTrabajador.map((t) => <section key={t.id} className="card overflow-hidden"><div className="p-5 flex items-center justify-between border-b border-[var(--line)]"><div className="flex items-center gap-3"><span className="w-10 h-10 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name="user" className="w-5 h-5" /></span><div><h2 className="font-extrabold text-[var(--ink)]">{t.nombre_completo}</h2><p className="text-sm text-[var(--ink-soft)]">Vehículos reparados</p></div></div><span className="text-2xl font-extrabold text-emerald-600">{t.trabajos.length}</span></div>{t.trabajos.length ? <div className="divide-y divide-[var(--line)]">{t.trabajos.map((a) => <Link key={a.id} to={`/casos/${a.caso?.id}`} className="block p-4 hover:bg-[var(--paper)]"><p className="font-bold text-[var(--ink)]">{vehiculo(a.caso)}{a.caso?.numero_llave ? ` · Llave #${a.caso.numero_llave}` : ""}</p><p className="text-sm text-[var(--ink-soft)]">{a.caso?.cliente?.nombre_completo || "Sin asegurado"}{a.caso?.placa ? ` · ${a.caso.placa}` : ""}{a.caso?.numero_reclamo ? ` · Reclamo ${a.caso.numero_reclamo}` : ""}</p><p className="mt-1 text-xs text-emerald-700 font-semibold">Completado: {fecha(a.completado_at)}</p></Link>)}</div> : <p className="p-6 text-center text-sm text-[var(--ink-soft)]">Todavía no registra trabajos completados.</p>}</section>)}</div>}</div>;
}
