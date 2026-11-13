import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { listarCitasParaReporte } from "../lib/citasReporteDatos";
import Icon from "./Icon";

export default function ReporteCitasModal({ onClose }) {
  const [modo, setModo] = useState("general");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  async function descargar(event) {
    event.preventDefault();
    setError(""); setResultado(null);
    if (modo === "fechas" && (!desde || !hasta || desde > hasta)) {
      setError("Selecciona una fecha inicial y una final en orden.");
      return;
    }
    setGenerando(true);
    try {
      const periodo = modo === "fechas" ? { desde, hasta } : {};
      const citas = await listarCitasParaReporte(supabase, periodo);
      const { generarCitasPendientesPdf } = await import("../lib/citasPendientesPdf");
      const url = URL.createObjectURL(generarCitasPendientesPdf({ citas, ...periodo }));
      const link = document.createElement("a");
      link.href = url;
      link.download = modo === "fechas" ? `Citas_pendientes_${desde}_a_${hasta}.pdf` : "Citas_pendientes_general.pdf";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setResultado(citas.length);
    } catch (err) {
      setError(err.message || "No se pudo generar el reporte. Intenta nuevamente.");
    } finally { setGenerando(false); }
  }

  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={e => {
    if (e.target === e.currentTarget && !generando) onClose();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="titulo-reporte-citas" className="card w-full max-w-lg p-5 sm:p-6 max-h-[90vh] overflow-y-auto">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="titulo-reporte-citas" className="text-xl font-extrabold">Reporte de citas pendientes</h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Citas pendientes y confirmadas que siguen por atender, ordenadas por fecha y hora.</p></div>
        <button type="button" className="btn-ghost !p-2" aria-label="Cerrar reporte" disabled={generando} onClick={onClose}><Icon name="close" /></button>
      </div>
      <form onSubmit={descargar} className="mt-5">
        <fieldset disabled={generando}>
          <legend className="field-label">Período del reporte</legend>
          <div className="grid sm:grid-cols-2 gap-3 mt-2">
            {[["general", "Todas las pendientes", "Incluye todas las fechas."], ["fechas", "Por fechas", "Elige un intervalo."]].map(([id, label, texto]) => <label key={id} className={`cursor-pointer rounded-xl border p-3 flex items-start gap-3 ${modo === id ? "border-red-500 bg-red-50 text-slate-900" : "border-[var(--line)]"}`}>
              <input type="radio" name="periodo-citas" value={id} checked={modo === id} onChange={() => { setModo(id); setResultado(null); setError(""); }} className="mt-1 accent-red-600" />
              <span><span className="block text-sm font-bold">{label}</span><span className="block text-xs mt-1">{texto}</span></span>
            </label>)}
          </div>
          {modo === "fechas" && <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <label><span className="field-label">Desde</span><input type="date" className="input" value={desde} max={hasta || undefined} required onChange={e => { setDesde(e.target.value); setResultado(null); }} /></label>
            <label><span className="field-label">Hasta</span><input type="date" className="input" value={hasta} min={desde || undefined} required onChange={e => { setHasta(e.target.value); setResultado(null); }} /></label>
          </div>}
        </fieldset>
        {error && <p className="mt-4 text-sm text-red-600" role="alert">{error}</p>}
        {resultado !== null && <p className="mt-4 text-sm text-emerald-700" role="status">Reporte generado con {resultado} {resultado === 1 ? "cita" : "citas"}.</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-ghost" disabled={generando} onClick={onClose}>Cerrar</button>
          <button type="submit" className="btn-primary" disabled={generando}><Icon name="download" className="w-4 h-4" />{generando ? "Generando reporte…" : "Descargar PDF"}</button>
        </div>
      </form>
    </section>
  </div>;
}
