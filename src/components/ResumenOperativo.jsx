import { useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "./Icon";

const TIPOS = [
  ["todos", "Todos los vehículos pendientes"],
  ["listos", "Listos para trabajar"],
  ["espera", "En espera de piezas"],
  ["suplir_piezas", "Suplir piezas"],
  ["espera_piezas", "Espera de piezas"],
  ["espera_orden", "Espera de orden"],
];

export default function ResumenOperativo({ aseguradoras }) {
  const [aseg, setAseg] = useState("todas");
  const [tipo, setTipo] = useState("todos");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function descargar() {
    setCargando(true); setError("");
    try {
      let consulta = supabase.from("casos").select("id, estado, etiqueta_organizacion, aseguradora_id, anio, color, placa, chasis, numero_poliza, numero_reclamo, aseguradora:aseguradoras(nombre), cliente:clientes(nombre_completo), marca:marcas(nombre), modelo:modelos(nombre)").is("archivado_en", null).order("id");
      if (aseg !== "todas") consulta = consulta.eq("aseguradora_id", aseg);
      const todos = [];
      for (let inicio = 0; ; inicio += 1000) {
        const { data, error: err } = await consulta.range(inicio, inicio + 999);
        if (err) throw err;
        todos.push(...data);
        if (data.length < 1000) break;
      }
      const espera = (c) => !["listo_para_trabajar", "vehiculo_en_taller", "entregado", "completado"].includes(c.estado);
      const casos = todos.filter((c) => tipo === "listos" ? c.estado === "listo_para_trabajar" : tipo === "todos" ? espera(c) || c.estado === "listo_para_trabajar" : tipo === "espera" ? espera(c) : espera(c) && c.etiqueta_organizacion === tipo);
      const citas = {};
      const ids = casos.filter((c) => c.estado === "listo_para_trabajar").map((c) => c.id);
      for (let i = 0; i < ids.length; i += 100) {
        let inicio = 0;
        while (true) {
          const { data, error: err } = await supabase.from("citas").select("caso_id, fecha, hora").in("caso_id", ids.slice(i, i + 100)).in("estado", ["pendiente", "confirmada"]).order("fecha").order("hora").range(inicio, inicio + 999);
          if (err) throw err;
          data.forEach((c) => { if (!citas[c.caso_id]) citas[c.caso_id] = c; });
          if (data.length < 1000) break;
          inicio += 1000;
        }
      }
      const titulo = TIPOS.find(([id]) => id === tipo)[1];
      const nombre = aseg === "todas" ? "Todas las aseguradoras" : aseguradoras.find((a) => a.id === aseg)?.nombre || "Aseguradora";
      const { generarResumenCasosPdf } = await import("../lib/resumenCasosPdf");
      const url = URL.createObjectURL(generarResumenCasosPdf({ casos, citas, titulo, aseguradora: nombre }));
      const link = document.createElement("a"); link.href = url; link.download = `Resumen_vehiculos_${tipo}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err.message || "No se pudo generar el resumen."); }
    finally { setCargando(false); }
  }

  return <section className="card p-5 mb-7 border border-red-100">
    <div className="flex items-start gap-3 mb-4"><span className="rounded-xl bg-red-50 text-red-600 p-2.5"><Icon name="file" className="w-5 h-5" /></span><div><h2 className="font-bold text-lg text-[var(--ink)]">Resumen de vehículos pendientes</h2><p className="text-sm text-[var(--ink-soft)]">Descarga un PDF actualizado, organizado por aseguradora.</p></div></div>
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <label><span className="field-label">Aseguradora</span><select className="input" value={aseg} onChange={(e) => setAseg(e.target.value)}><option value="todas">Todas las aseguradoras</option>{aseguradoras.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></label>
      <label><span className="field-label">Situación</span><select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>{TIPOS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button type="button" className="btn-primary gap-2" disabled={cargando} onClick={descargar}><Icon name="download" className="w-4 h-4" />{cargando ? "Generando…" : "Descargar PDF"}</button>
    </div>{error && <p role="alert" className="text-sm text-red-600 mt-3">{error}</p>}
  </section>;
}
