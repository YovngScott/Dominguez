import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "./Icon";
import { cargarResumenVehiculos, esEspera, filtrarVehiculos } from "../lib/resumenVehiculosDatos";
import { compararAseguradoras } from "../lib/aseguradorasOrden";
import { ETIQUETAS_CASO } from "../lib/etiquetasCaso";

const TIPOS = [
  ["todos", "Todos los pendientes", "car"],
  ["listos", "Listos para trabajar", "wrench"],
  ["espera", "En espera", "package"],
  ["suplir_piezas", "Suplir piezas", "truck"],
  ["espera_piezas", "Espera de piezas", "package"],
  ["espera_orden", "Espera de orden", "clipboard"],
];

export default function ResumenOperativo({ aseguradoras }) {
  const [aseg, setAseg] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState("");
  const [limite, setLimite] = useState(40);

  useEffect(() => {
    let activo = true;
    cargarResumenVehiculos().then(data => { if (activo) setDatos(data); })
      .catch(err => { if (activo) setError(err.message); })
      .finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, []);

  async function actualizar() {
    setCargando(true); setError("");
    try { setDatos(await cargarResumenVehiculos(true)); }
    catch (err) { setError(err.message || "No se pudo actualizar."); }
    finally { setCargando(false); }
  }

  const casos = useMemo(() => filtrarVehiculos(datos?.casos || [], aseg, tipo)
    .sort((a, b) => compararAseguradoras({ nombre: a.aseguradora?.nombre }, { nombre: b.aseguradora?.nombre })
      || String(a.marca?.nombre || "").localeCompare(b.marca?.nombre || "", "es")
      || String(a.placa || "").localeCompare(b.placa || "")), [datos, aseg, tipo]);
  const base = filtrarVehiculos(datos?.casos || [], aseg, "todos");
  const listos = base.filter(c => c.estado === "listo_para_trabajar");
  const sinCita = listos.filter(c => !datos?.citas[c.id]).length;
  const nombre = aseg === "todas" ? "Todas las aseguradoras" : aseguradoras.find(a => a.id === aseg)?.nombre || "Aseguradora";
  const titulo = TIPOS.find(([id]) => id === tipo)[1];

  async function descargar() {
    setExportando(true); setError("");
    try {
      const { generarResumenCasosPdf } = await import("../lib/resumenCasosPdf");
      const url = URL.createObjectURL(generarResumenCasosPdf({ casos, citas: datos.citas, titulo, aseguradora: nombre, actualizado: datos.actualizado }));
      const link = document.createElement("a");
      link.href = url; link.download = `Resumen_vehiculos_${tipo}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message || "No se pudo generar el PDF."); }
    finally { setExportando(false); }
  }

  return <section>
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <label className="min-w-52 flex-1 max-w-md"><span className="field-label">Aseguradora</span>
          <select className="input" value={aseg} onChange={e => { setAseg(e.target.value); setLimite(40); }}>
            <option value="todas">Todas las aseguradoras</option>
            {aseguradoras.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={cargando} onClick={actualizar}><Icon name="refresh" className="w-4 h-4" />{cargando ? "Actualizando…" : "Actualizar"}</button>
          <button className="btn-primary" disabled={!datos || exportando || cargando} onClick={descargar}><Icon name="download" className="w-4 h-4" />{exportando ? "Generando…" : `Descargar PDF`}</button>
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[[base.length, "Vehículos pendientes", "text-[var(--ink)]"], [listos.length, "Listos para trabajar", "text-emerald-600"], [base.filter(esEspera).length, "En espera", "text-amber-600"], [sinCita, "Listos sin cita", "text-sky-600"]].map(([n, label, color]) =>
          <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3"><div className={`text-2xl font-extrabold tabular-nums ${color}`}>{datos ? n : "—"}</div><div className="text-xs text-[var(--ink-soft)] mt-1">{label}</div></div>
        )}
      </div>
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Situación del vehículo">
        {TIPOS.map(([id, label, icon]) => <button key={id} aria-pressed={tipo === id} onClick={() => { setTipo(id); setLimite(40); }}
          className={tipo === id ? "btn-primary !text-xs" : "btn-ghost !text-xs"}><Icon name={icon} className="w-4 h-4" />{label}</button>)}
      </div>
    </div>
    {error && <div role="alert" className="mt-4 rounded-xl bg-red-50 text-red-700 p-4 text-sm">{error}{datos && " Se conserva la última consulta cargada."}</div>}
    <div className="my-5 flex flex-wrap justify-between items-center gap-2">
      <h2 className="font-bold">{titulo} <span className="text-[var(--ink-soft)] font-normal">· {casos.length} vehículos</span></h2>
      {datos && <span className="text-xs text-[var(--ink-soft)]">Datos consultados a las {new Date(datos.actualizado).toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" })}</span>}
    </div>
    {cargando && !datos ? <div className="card p-10 text-center" role="status">Cargando vehículos y citas…</div> : <>
      {casos.slice(0, limite).map((c, i) => {
        const cita = datos.citas[c.id];
        const etiqueta = ETIQUETAS_CASO.find(e => e.id === c.etiqueta_organizacion);
        const listo = c.estado === "listo_para_trabajar";
        const separador = i === 0 || casos[i - 1].aseguradora_id !== c.aseguradora_id;
        return <div key={c.id}>
          {separador && <h3 className="mt-6 mb-3 text-xs font-bold tracking-wide text-[var(--ink-soft)]">{c.aseguradora?.nombre || "Sin aseguradora"}</h3>}
          <Link to={`/casos/${c.id}`} className="card mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 hover:border-[var(--brand-red)] transition-colors">
            <div className="min-w-0"><p className="font-bold">{[c.marca?.nombre, c.modelo?.nombre, c.anio].filter(Boolean).join(" ") || "Vehículo"} <span className="font-normal text-[var(--ink-soft)]">{c.color || ""}</span></p>
              <p className="text-sm text-[var(--ink-soft)]">{c.cliente?.nombre_completo || "Sin asegurado"} · Placa {c.placa || "—"}</p>
              <p className="text-xs text-[var(--ink-soft)] mt-1">Chasis {c.chasis || "—"} · Póliza {c.numero_poliza || "—"} · Reclamo {c.numero_reclamo || "—"}</p>
            </div>
            <div className="shrink-0 text-xs"><span className={`inline-block rounded-full px-3 py-1.5 border font-semibold ${listo ? "border-emerald-200 bg-emerald-50 text-emerald-700" : etiqueta?.chip || "border-amber-200 bg-amber-50 text-amber-700"}`}>{listo ? "Listo para trabajar" : etiqueta?.label || "En espera · Sin etiqueta"}</span>
              {listo && <p className="mt-2 text-[var(--ink-soft)]">{cita ? `Cita ${cita.fecha} · ${cita.hora?.slice(0, 5) || ""}` : "Sin cita programada"}</p>}
            </div>
          </Link>
        </div>;
      })}
      {datos && !casos.length && <div className="card p-10 text-center text-[var(--ink-soft)]">No hay vehículos con estos filtros.</div>}
      {casos.length > limite && <button className="btn-ghost my-4" onClick={() => setLimite(n => n + 40)}>Mostrar más vehículos ({casos.length - limite})</button>}
    </>}
  </section>;
}
