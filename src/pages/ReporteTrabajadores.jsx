import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

const vehiculo = (c) => [c?.marca?.nombre, c?.modelo?.nombre, c?.anio].filter(Boolean).join(" ") || "Vehículo";
const fecha = (v) => (v ? new Date(v).toLocaleDateString("es-DO") : "—");
const fechaHora = (v) =>
  v ? new Date(v).toLocaleString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// Rango del mes actual (yyyy-mm-dd). "hasta" es exclusivo.
function rangoMesActual() {
  const hoy = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  return {
    desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
    hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)),
  };
}

// Reporte de trabajos reparados: se puede sacar general o de un trabajador en
// particular, filtrando por rango de fechas. Cada trabajo muestra la nota de
// qué se le hizo al vehículo.
export default function ReporteTrabajadores() {
  const inicial = rangoMesActual();
  const [trabajadores, setTrabajadores] = useState([]);
  const [trabajos, setTrabajos] = useState([]);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [trabajadorId, setTrabajadorId] = useState(""); // "" = todos
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      let q = supabase
        .from("casos_trabajadores")
        .select(
          "id, trabajador_id, completado_at, nota, caso:casos(id, numero_llave, placa, numero_reclamo, anio, cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre))"
        )
        .eq("estado", "completado")
        .order("completado_at", { ascending: false });
      if (desde) q = q.gte("completado_at", desde);
      if (hasta) q = q.lt("completado_at", `${hasta}T23:59:59`);
      if (trabajadorId) q = q.eq("trabajador_id", trabajadorId);

      const [t, a] = await Promise.all([
        supabase.from("trabajadores_taller").select("id, nombre_completo, activo").order("nombre_completo"),
        q,
      ]);
      if (a.error) throw a.error;
      setTrabajadores(t.data || []);
      setTrabajos(a.data || []);
      setError("");
    } catch (e) {
      setError(
        e.message?.includes("nota")
          ? "Falta ejecutar la migración sql/47_trabajo_nota.sql en Supabase."
          : e.message || "No se pudo generar el reporte."
      );
    } finally {
      setLoading(false);
    }
  }, [desde, hasta, trabajadorId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const porTrabajador = useMemo(() => {
    const mapa = new Map(trabajadores.map((t) => [t.id, { ...t, trabajos: [] }]));
    trabajos.forEach((a) => mapa.get(a.trabajador_id)?.trabajos.push(a));
    const lista = [...mapa.values()];
    // Con filtro de trabajador se muestra solo ese; si no, los que tengan
    // trabajos en el período (o estén activos, para ver que quedaron en cero).
    return trabajadorId
      ? lista.filter((t) => t.id === trabajadorId)
      : lista.filter((t) => t.trabajos.length || t.activo);
  }, [trabajadores, trabajos, trabajadorId]);

  function imprimir() {
    window.print();
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/taller/trabajadores" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] print:hidden">
        ← Trabajadores del taller
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-4 mt-3 mb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Reporte de trabajos reparados</h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            Del {fecha(desde)} al {fecha(hasta)}
            {trabajadorId ? ` · ${porTrabajador[0]?.nombre_completo || ""}` : " · Todo el personal"}
          </p>
        </div>
        <span className="card px-5 py-3">
          <span className="text-2xl font-extrabold text-[var(--brand-red)]">{trabajos.length}</span>
          <span className="ml-2 text-sm text-[var(--ink-soft)]">reparación(es)</span>
        </span>
      </div>

      {/* Filtros */}
      <div className="card p-4 mb-6 flex flex-wrap items-end gap-3 print:hidden">
        <label className="block">
          <span className="field-label">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="field-label">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
        </label>
        <label className="block min-w-[12rem]">
          <span className="field-label">Trabajador</span>
          <select value={trabajadorId} onChange={(e) => setTrabajadorId(e.target.value)} className="input">
            <option value="">Todo el personal</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre_completo}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={() => {
            const r = rangoMesActual();
            setDesde(r.desde);
            setHasta(r.hasta);
            setTrabajadorId("");
          }}
          className="btn-ghost text-sm py-2 px-3"
        >
          Este mes
        </button>
        <button onClick={imprimir} className="btn-ghost text-sm py-2 px-3 gap-1.5 sm:ml-auto">
          <Icon name="printer" className="w-4 h-4" /> Imprimir / PDF
        </button>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-4">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando reporte…</p>
      ) : porTrabajador.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          No hay trabajos completados en este período.
        </div>
      ) : (
        <div className={`grid gap-5 ${trabajadorId ? "" : "lg:grid-cols-2"}`}>
          {porTrabajador.map((t) => (
            <section key={t.id} className="card overflow-hidden">
              <div className="p-5 flex items-center justify-between border-b border-[var(--line)]">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center">
                    <Icon name="user" className="w-5 h-5" />
                  </span>
                  <div>
                    <h2 className="font-extrabold text-[var(--ink)]">{t.nombre_completo}</h2>
                    <p className="text-sm text-[var(--ink-soft)]">Vehículos reparados</p>
                  </div>
                </div>
                <span className="text-2xl font-extrabold text-emerald-600">{t.trabajos.length}</span>
              </div>

              {t.trabajos.length ? (
                <div className="divide-y divide-[var(--line)]">
                  {t.trabajos.map((a) => (
                    <Link key={a.id} to={`/casos/${a.caso?.id}`} className="block p-4 hover:bg-[var(--paper)]">
                      <p className="font-bold text-[var(--ink)]">
                        {vehiculo(a.caso)}
                        {a.caso?.numero_llave ? ` · Llave #${a.caso.numero_llave}` : ""}
                      </p>
                      <p className="text-sm text-[var(--ink-soft)]">
                        {a.caso?.cliente?.nombre_completo || "Sin asegurado"}
                        {a.caso?.placa ? ` · ${a.caso.placa}` : ""}
                        {a.caso?.numero_reclamo ? ` · Reclamo ${a.caso.numero_reclamo}` : ""}
                      </p>
                      {a.nota && (
                        <p className="mt-1.5 text-sm text-[var(--ink)] flex items-start gap-1.5">
                          <Icon name="wrench" className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[var(--ink-soft)]" />
                          <span>{a.nota}</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-emerald-700 font-semibold">
                        Completado: {fechaHora(a.completado_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-[var(--ink-soft)]">
                  Sin trabajos completados en este período.
                </p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
