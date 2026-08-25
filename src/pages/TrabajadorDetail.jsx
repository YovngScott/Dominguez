import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import { FASES_REPARACION } from "../lib/estados";

const vehiculo = (c) => [c?.marca?.nombre, c?.modelo?.nombre, c?.anio].filter(Boolean).join(" ") || "Vehículo";
const coincide = (c, q) => [c.numero_llave && `llave ${c.numero_llave}`, c.placa, c.chasis, c.numero_reclamo, c.cliente?.nombre_completo, vehiculo(c)].filter(Boolean).some((v) => String(v).toLowerCase().includes(q));
const CASO_SELECT = "id, numero_llave, placa, chasis, numero_reclamo, estado, anio, fase_reparacion, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre)";

export default function TrabajadorDetail() {
  const { trabajadorId } = useParams();
  const [trabajador, setTrabajador] = useState(null);
  const [asignaciones, setAsignaciones] = useState([]);
  const [casos, setCasos] = useState([]);
  const [modal, setModal] = useState(false);
  const [completando, setCompletando] = useState(null); // asignación a completar
  const [busqueda, setBusqueda] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function cargar() {
    const [t, a, c] = await Promise.all([
      supabase.from("trabajadores_taller").select("*").eq("id", trabajadorId).maybeSingle(),
      supabase.from("casos_trabajadores").select(`id, estado, asignado_at, completado_at, caso:casos(${CASO_SELECT})`).eq("trabajador_id", trabajadorId).order("asignado_at", { ascending: false }),
      supabase.from("casos").select(CASO_SELECT).eq("estado", "vehiculo_en_taller").order("updated_at", { ascending: false }),
    ]);
    setTrabajador(t.data || null); setAsignaciones(a.data || []); setCasos(c.data || []);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargar(); }, [trabajadorId]);
  const resultados = useMemo(() => { const q = busqueda.trim().toLowerCase(); return casos.filter((c) => !q || coincide(c, q)).slice(0, 15); }, [casos, busqueda]);

  async function asignar(casoId) {
    setGuardando(true); setError("");
    const { data: auth } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("casos_trabajadores").upsert({ caso_id: casoId, trabajador_id: trabajadorId, estado: "asignado", asignado_at: new Date().toISOString(), completado_at: null, asignado_por: auth.user?.id || null }, { onConflict: "caso_id,trabajador_id" });
    if (e) setError(e.message); else { setModal(false); setBusqueda(""); await cargar(); }
    setGuardando(false);
  }

  // Al completar se pide una nota con el trabajo realizado, para saber después
  // qué le hizo cada trabajador a cada vehículo.
  async function completar(nota) {
    if (!completando) return;
    setGuardando(true); setError("");
    const { error: e } = await supabase
      .from("casos_trabajadores")
      .update({ estado: "completado", completado_at: new Date().toISOString(), nota: nota?.trim() || null })
      .eq("id", completando.id);
    if (e) setError(e.message); else { setCompletando(null); await cargar(); }
    setGuardando(false);
  }

  async function quitar(asignacionId) {
    if (!confirm("¿Quitar esta asignación? Esta acción se usa solo si se agregó por error.")) return;
    setGuardando(true); setError("");
    const { error: e } = await supabase.from("casos_trabajadores").delete().eq("id", asignacionId);
    if (e) setError(e.message); else await cargar();
    setGuardando(false);
  }

  async function actualizarFase(casoId, fase) {
    setGuardando(true); setError("");
    const { error: e } = await supabase
      .from("casos")
      .update({ fase_reparacion: fase })
      .eq("id", casoId);
    if (e) setError(e.message); else await cargar();
    setGuardando(false);
  }

  if (!trabajador) return <div className="max-w-5xl mx-auto px-4 py-10 text-[var(--ink-soft)]">Cargando trabajador…</div>;
  const enTaller = asignaciones.filter((a) => a.caso?.estado === "vehiculo_en_taller");
  const activas = enTaller.filter((a) => a.estado === "asignado");
  const completadas = enTaller.filter((a) => a.estado === "completado");

  return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <Link to="/taller/trabajadores" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">← Personal del taller</Link>
    <div className="card p-6 sm:p-7 mt-4 flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><span className="w-14 h-14 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name="user" className="w-7 h-7" /></span><div><h1 className="text-2xl font-extrabold text-[var(--ink)]">{trabajador.nombre_completo}</h1><p className="text-[var(--ink-soft)]">Trabajador del taller</p></div></div><button onClick={() => setModal(true)} className="btn-primary"><Icon name="plus" className="w-5 h-5" /> Asignar vehículo</button></div>
    {error && <p className="mt-4 text-sm text-[var(--brand-red)]">{error}</p>}
    <Seccion titulo={`En proceso (${activas.length})`} vacio="No tiene vehículos del taller asignados." asignaciones={activas} onCompletar={setCompletando} onQuitar={quitar} bloqueado={guardando} onActualizarFase={actualizarFase} />
    {completadas.length > 0 && <Seccion titulo={`Completados (${completadas.length})`} asignaciones={completadas} tenue />}
    {modal && <AsignarModal busqueda={busqueda} onBusqueda={setBusqueda} resultados={resultados} onClose={() => { setModal(false); setBusqueda(""); }} onAsignar={asignar} guardando={guardando} />}
    {completando && <CompletarModal asignacion={completando} onClose={() => setCompletando(null)} onConfirmar={completar} guardando={guardando} />}
  </div>;
}

function Seccion({ titulo, vacio, asignaciones, tenue, onCompletar, onQuitar, bloqueado, onActualizarFase }) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-bold text-[var(--ink)] mb-3">{titulo}</h2>
      {asignaciones.length === 0 ? (
        <div className="card p-7 text-center text-sm text-[var(--ink-soft)]">{vacio}</div>
      ) : (
        <div className={`card divide-y divide-[var(--line)] overflow-hidden ${tenue ? "opacity-75" : ""}`}>
          {asignaciones.map((a) => {
            const c = a.caso;
            return (
              <div key={a.id} className="flex flex-col gap-3 p-4 hover:bg-[var(--paper)]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[var(--ink)]">
                      {vehiculo(c)}
                      {c.numero_llave ? ` · Llave #${c.numero_llave}` : ""}
                    </p>
                    <p className="text-sm text-[var(--ink-soft)] truncate">
                      {c.cliente?.nombre_completo || "Sin asegurado"}
                      {c.placa ? ` · ${c.placa}` : ""}
                      {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
                    </p>
                    {a.nota && (
                      <p className="text-sm text-[var(--ink)] mt-1 flex items-start gap-1.5">
                        <Icon name="wrench" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--ink-soft)]" />
                        <span>{a.nota}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onCompletar && (
                      <button
                        type="button"
                        disabled={bloqueado}
                        onClick={() => onCompletar(a)}
                        className="btn-ghost text-xs py-2 px-3 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        <Icon name="check" className="w-4 h-4" /> Completar
                      </button>
                    )}
                    {onQuitar && (
                      <button
                        type="button"
                        disabled={bloqueado}
                        onClick={() => onQuitar(a.id)}
                        className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)] hover:bg-[var(--brand-red-50)] rounded-lg disabled:opacity-50"
                        aria-label="Quitar asignación"
                      >
                        <Icon name="close" className="w-4 h-4" />
                      </button>
                    )}
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
                        a.estado === "completado" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {a.estado === "completado" ? "Completado" : "En el taller"}
                    </span>
                  </div>
                </div>

                {onActualizarFase && onCompletar && (
                  <div className="mt-2 pt-2 border-t border-[var(--line)] flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-[var(--ink-soft)] uppercase tracking-wider inline-flex items-center gap-1 mr-2">
                      <Icon name="wrench" className="w-3.5 h-3.5" /> Fase:
                    </span>
                    {Object.entries(FASES_REPARACION).map(([key, fase]) => {
                      const activa = c.fase_reparacion === key || (!c.fase_reparacion && key === "desabolladura");
                      return (
                        <button
                          key={key}
                          type="button"
                          disabled={bloqueado}
                          onClick={() => onActualizarFase(c.id, key)}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1 transition-all ${
                            activa
                              ? "bg-sky-500 border-sky-500 text-white shadow-sm font-bold"
                              : "bg-white border-[var(--line)] text-[var(--ink-soft)] hover:border-sky-300"
                          }`}
                        >
                          <Icon name={fase.icon} className="w-3 h-3" />
                          {fase.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// Pide qué trabajo se le hizo al vehículo antes de darlo por completado.
function CompletarModal({ asignacion, onClose, onConfirmar, guardando }) {
  const [nota, setNota] = useState("");
  const c = asignacion.caso;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center" onClick={onClose}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <span className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Icon name="check" className="w-6 h-6" />
          </span>
          <div className="min-w-0">
            <h2 className="font-extrabold text-lg text-[var(--ink)]">Completar trabajo</h2>
            <p className="text-sm text-[var(--ink-soft)] truncate">
              {vehiculo(c)}{c?.numero_llave ? ` · Llave #${c.numero_llave}` : ""}
            </p>
          </div>
        </div>

        <label className="block">
          <span className="field-label">¿Qué trabajo se le hizo?</span>
          <textarea
            autoFocus
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            className="input"
            placeholder="Ej. Pintura de puerta trasera derecha y pulido"
          />
          <span className="block text-xs text-[var(--ink-soft)] mt-1">
            Queda en el reporte del trabajador. Puedes dejarlo vacío si no aplica.
          </span>
        </label>

        <p className="text-xs text-[var(--ink-soft)] mt-3">
          El vehículo seguirá en el taller hasta que se entregue.
        </p>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={() => onConfirmar(nota)}
            disabled={guardando}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Marcar completado"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AsignarModal({ busqueda, onBusqueda, resultados, onClose, onAsignar, guardando }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 flex items-end sm:items-center justify-center">
      <div className="card w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="p-5 border-b border-[var(--line)] flex items-center justify-between">
          <div>
            <h2 className="font-extrabold text-lg text-[var(--ink)]">Asignar vehículo</h2>
            <p className="text-sm text-[var(--ink-soft)]">Solo aparecen vehículos que están en el taller.</p>
          </div>
          <button onClick={onClose} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
            <Icon name="close" />
          </button>
        </div>
        <div className="p-5">
          <input
            autoFocus
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            className="input w-full"
            placeholder="Llave, placa, reclamo, chasis o asegurado…"
          />
        </div>
        <div className="overflow-y-auto border-t border-[var(--line)]">
          {resultados.map((c) => (
            <button
              key={c.id}
              disabled={guardando}
              onClick={() => onAsignar(c.id)}
              className="w-full p-4 text-left border-b border-[var(--line)] hover:bg-[var(--paper)] disabled:opacity-50"
            >
              <p className="font-bold text-[var(--ink)]">
                {vehiculo(c)}
                {c.numero_llave ? ` · Llave #${c.numero_llave}` : ""}
              </p>
              <p className="text-sm text-[var(--ink-soft)]">
                {c.cliente?.nombre_completo || "Sin asegurado"}
                {c.placa ? ` · Placa ${c.placa}` : ""}
                {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
              </p>
            </button>
          ))}
          {resultados.length === 0 && (
            <p className="p-7 text-center text-sm text-[var(--ink-soft)]">No hay vehículos que coincidan.</p>
          )}
        </div>
      </div>
    </div>
  );
}
