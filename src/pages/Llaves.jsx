import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import { ESTADOS } from "../lib/estados";

const vehiculo = (caso) => [caso?.marca?.nombre, caso?.modelo?.nombre, caso?.anio].filter(Boolean).join(" ") || "Vehículo sin datos";

export default function Llaves() {
  const [casos, setCasos] = useState([]);
  const [filtro, setFiltro] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error: err } = await supabase
      .from("casos")
      .select("id, numero_llave, estado, placa, numero_reclamo, anio, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre)")
      .not("numero_llave", "is", null)
      .neq("estado", "entregado")
      .order("numero_llave");
    if (err) setError(err.message || "No se pudieron cargar las llaves.");
    else { setCasos(data || []); setError(""); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const porNumero = useMemo(() => new Map(casos.map((c) => [Number(c.numero_llave), c])), [casos]);
  const q = busqueda.trim().toLowerCase();
  const visibles = useMemo(() => casos.filter((c) => !q || [
    `llave ${c.numero_llave}`, c.numero_llave, c.placa, c.numero_reclamo,
    c.cliente?.nombre_completo, vehiculo(c),
  ].filter(Boolean).some((x) => String(x).toLowerCase().includes(q))), [casos, q]);

  return <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div><div className="flex items-center gap-3"><span className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center"><Icon name="key" className="w-6 h-6" /></span><div><h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Llaves del taller</h1><p className="text-sm text-[var(--ink-soft)] mt-1">Ubica al instante la llave y el vehículo al que pertenece.</p></div></div></div>
      <button onClick={cargar} className="btn-ghost text-sm py-2 px-3"><Icon name="clock" className="w-4 h-4" /> Actualizar</button>
    </div>

    <div className="grid sm:grid-cols-3 gap-3 mb-6"><Metrica valor={casos.length} texto="llave(s) en uso" color="var(--brand-red)" /><Metrica valor={64 - casos.length} texto="llave(s) disponibles" color="#059669" /><Metrica valor="64" texto="llaves físicas" color="var(--ink)" /></div>

    <section className="card p-4 sm:p-5 mb-6"><div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between"><div className="flex gap-2 overflow-x-auto pb-1">{[["todas", "Todas"], ["ocupadas", "En uso"], ["libres", "Disponibles"]].map(([id, label]) => <button key={id} onClick={() => setFiltro(id)} className={`text-sm px-3.5 py-2 rounded-lg whitespace-nowrap font-semibold ${filtro === id ? "bg-[var(--brand-red)] text-white" : "bg-[var(--surface-2)] text-[var(--ink-soft)]"}`}>{label}</button>)}</div><div className="w-full sm:w-80"><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="input" placeholder="Llave, vehículo, placa o reclamo…" /></div></div>
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 sm:gap-3 mt-5">{Array.from({ length: 64 }, (_, i) => i + 1).map((numero) => { const caso = porNumero.get(numero); const mostrar = filtro === "todas" || (filtro === "ocupadas" ? caso : !caso); if (!mostrar) return null; return caso ? <Link key={numero} to={`/casos/${caso.id}`} className="min-h-24 sm:min-h-28 rounded-xl border-2 border-[var(--brand-red)] bg-[var(--brand-red-50)] p-2 text-left hover:shadow-md transition-shadow"><span className="text-lg font-extrabold text-[var(--brand-red)]">#{numero}</span><p className="text-[11px] sm:text-xs leading-tight font-bold text-[var(--ink)] mt-1 line-clamp-2">{vehiculo(caso)}</p><p className="text-[10px] leading-tight text-[var(--ink-soft)] mt-1 truncate">{caso.placa || caso.numero_reclamo || "Ver caso"}</p></Link> : <div key={numero} className="min-h-20 sm:min-h-28 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] p-2 flex flex-col justify-between"><span className="text-base font-extrabold text-[var(--ink-soft)]">#{numero}</span><span className="text-[10px] font-semibold text-emerald-600">Libre</span></div>; })}</div>
    </section>

    <section className="card overflow-hidden"><div className="p-5 border-b border-[var(--line)]"><h2 className="font-extrabold text-[var(--ink)]">Llaves asignadas</h2><p className="text-sm text-[var(--ink-soft)] mt-1">Toca una fila para abrir directamente el caso.</p></div>
      {cargando ? <p className="p-8 text-[var(--ink-soft)]">Cargando llaves…</p> : visibles.length === 0 ? <p className="p-8 text-center text-[var(--ink-soft)]">{q ? "No hay llaves que coincidan." : "No hay llaves asignadas."}</p> : <div className="divide-y divide-[var(--line)]">{visibles.map((c) => { const estado = ESTADOS[c.estado]; return <Link key={c.id} to={`/casos/${c.id}`} className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 hover:bg-[var(--paper)]"><span className="w-12 h-12 rounded-xl bg-[var(--brand-red)] text-white flex items-center justify-center font-extrabold text-lg shrink-0">#{c.numero_llave}</span><div className="min-w-0 flex-1"><p className="font-bold text-[var(--ink)] truncate">{vehiculo(c)}</p><p className="text-sm text-[var(--ink-soft)] truncate">{c.cliente?.nombre_completo || "Sin asegurado"}{c.placa ? ` · ${c.placa}` : ""}{c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}</p></div>{estado && <span className={`hidden sm:inline-flex text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${estado.chip}`}>{estado.short}</span>}<Icon name="chevronDown" className="w-4 h-4 text-[var(--ink-soft)] -rotate-90 shrink-0" /></Link>; })}</div>}
    </section>{error && <p className="text-sm text-[var(--brand-red)] mt-4">{error}</p>}
  </div>;
}

function Metrica({ valor, texto, color }) { return <div className="card p-4"><p className="text-2xl font-extrabold" style={{ color }}>{valor}</p><p className="text-sm text-[var(--ink-soft)] mt-1">{texto}</p></div>; }
