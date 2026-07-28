import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import { ESTADOS } from "../lib/estados";

function vehiculo(c) { return [c?.marca?.nombre, c?.modelo?.nombre, c?.anio].filter(Boolean).join(" ") || "Vehículo"; }
function coincide(c, q) {
  return [c.numero_llave && `llave ${c.numero_llave}`, c.placa, c.chasis, c.numero_reclamo, c.cliente?.nombre_completo, vehiculo(c)]
    .filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
}

export default function TrabajadorDetail() {
  const { trabajadorId } = useParams();
  const [trabajador, setTrabajador] = useState(null);
  const [asignaciones, setAsignaciones] = useState([]);
  const [casos, setCasos] = useState([]);
  const [modal, setModal] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function cargar() {
    const [t, a, c] = await Promise.all([
      supabase.from("trabajadores_taller").select("*").eq("id", trabajadorId).maybeSingle(),
      supabase.from("casos_trabajadores").select("id, estado, asignado_at, completado_at, caso:casos(id, numero_llave, placa, chasis, numero_reclamo, estado, anio, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre))").eq("trabajador_id", trabajadorId).order("asignado_at", { ascending: false }),
      supabase.from("casos").select("id, numero_llave, placa, chasis, numero_reclamo, estado, anio, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre)").neq("estado", "entregado").order("updated_at", { ascending: false }),
    ]);
    setTrabajador(t.data || null);
    setAsignaciones(a.data || []);
    setCasos(c.data || []);
  }

  // cargar depende solamente del identificador actual; evitar recrear la
  // suscripción de la pantalla por cambios locales del formulario.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [trabajadorId]);
  const q = busqueda.trim().toLowerCase();
  const resultados = useMemo(() => casos.filter((c) => !q || coincide(c, q)).slice(0, 15), [casos, q]);

  async function asignar(casoId) {
    setGuardando(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("casos_trabajadores").upsert({
      caso_id: casoId, trabajador_id: trabajadorId, estado: "asignado", asignado_at: new Date().toISOString(), completado_at: null, asignado_por: auth.user?.id || null,
    }, { onConflict: "caso_id,trabajador_id" });
    if (e) setError(e.message);
    else { setModal(false); setBusqueda(""); await cargar(); }
    setGuardando(false);
  }

  if (!trabajador) return <div className="max-w-5xl mx-auto px-4 py-10 text-[var(--ink-soft)]">Cargando trabajador…</div>;
  const activas = asignaciones.filter((a) => a.estado === "asignado" && a.caso?.estado !== "entregado");
  const completadas = asignaciones.filter((a) => !activas.includes(a));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">← Personal del taller</Link>
      <div className="card p-6 sm:p-7 mt-4 flex flex-wrap items-center justify-between gap-5">
        <div className="flex items-center gap-4"><span className="w-14 h-14 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name="user" className="w-7 h-7" /></span><div><h1 className="text-2xl font-extrabold text-[var(--ink)]">{trabajador.nombre_completo}</h1><p className="text-[var(--ink-soft)]">Trabajador del taller</p></div></div>
        <button onClick={() => setModal(true)} className="btn-primary"><Icon name="plus" className="w-5 h-5" /> Asignar caso</button>
      </div>

      <Seccion titulo={`En proceso (${activas.length})`} vacio="No tiene vehículos asignados en proceso." asignaciones={activas} />
      {completadas.length > 0 && <Seccion titulo={`Completados (${completadas.length})`} vacio="" asignaciones={completadas} tenue />}

      {modal && <AsignarModal busqueda={busqueda} onBusqueda={setBusqueda} resultados={resultados} onClose={() => { setModal(false); setBusqueda(""); }} onAsignar={asignar} guardando={guardando} error={error} />}
    </div>
  );
}

function Seccion({ titulo, vacio, asignaciones, tenue }) {
  return <section className="mt-7"><h2 className="text-lg font-bold text-[var(--ink)] mb-3">{titulo}</h2>{asignaciones.length === 0 ? <div className="card p-7 text-center text-sm text-[var(--ink-soft)]">{vacio}</div> : <div className={`card divide-y divide-[var(--line)] overflow-hidden ${tenue ? "opacity-75" : ""}`}>{asignaciones.map((a) => { const c = a.caso; const e = ESTADOS[c?.estado] || ESTADOS.en_espera_piezas; return <Link key={a.id} to={`/casos/${c.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-[var(--paper)]"><div className="min-w-0"><p className="font-bold text-[var(--ink)] truncate">{vehiculo(c)}{c.numero_llave ? ` · Llave #${c.numero_llave}` : ""}</p><p className="text-sm text-[var(--ink-soft)] truncate">{c.cliente?.nombre_completo || "Sin asegurado"}{c.placa ? ` · ${c.placa}` : ""}{c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}</p></div><span className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${a.estado === "completado" ? "bg-emerald-100 text-emerald-700" : e.chip}`}>{a.estado === "completado" ? "Completado" : e.short}</span></Link>; })}</div>}</section>;
}

function AsignarModal({ busqueda, onBusqueda, resultados, onClose, onAsignar, guardando, error }) {
  return <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-end sm:items-center justify-center"><div className="card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"><div className="p-5 border-b border-[var(--line)] flex items-center justify-between"><div><h2 className="font-extrabold text-lg text-[var(--ink)]">Asignar vehículo</h2><p className="text-sm text-[var(--ink-soft)]">Busca por llave, placa, reclamo, chasis, vehículo o asegurado.</p></div><button onClick={onClose} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]"><Icon name="close" /></button></div><div className="p-5"><input autoFocus value={busqueda} onChange={(e) => onBusqueda(e.target.value)} className="input w-full" placeholder="Ej. #32, ABC123, reclamo, chasis…" /></div>{error && <p className="px-5 pb-3 text-sm text-[var(--brand-red)]">{error}</p>}<div className="overflow-y-auto border-t border-[var(--line)]">{resultados.map((c) => <button key={c.id} disabled={guardando} onClick={() => onAsignar(c.id)} className="w-full p-4 text-left border-b border-[var(--line)] hover:bg-[var(--paper)] disabled:opacity-50"><p className="font-bold text-[var(--ink)]">{vehiculo(c)}{c.numero_llave ? ` · Llave #${c.numero_llave}` : ""}</p><p className="text-sm text-[var(--ink-soft)]">{c.cliente?.nombre_completo || "Sin asegurado"}{c.placa ? ` · Placa ${c.placa}` : ""}{c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}</p></button>)}{resultados.length === 0 && <p className="p-7 text-center text-sm text-[var(--ink-soft)]">No hay vehículos activos que coincidan.</p>}</div></div></div>;
}
