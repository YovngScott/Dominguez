import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

// ---- Fechas (en hora local, sin desfases de zona horaria) ----
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function lunesDeEstaSemana() {
  const d = new Date();
  const off = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - off);
  return ymd(d);
}
function domingoDeEstaSemana() {
  const d = new Date(lunesDeEstaSemana() + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return ymd(d);
}
function ddmmaaaa(s) {
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString("es-DO");
}

// Aplana un caso devuelto por Supabase (con joins) a un objeto simple.
function aplanar(c) {
  return {
    placa: c.placa,
    chasis: c.chasis,
    numero_reclamo: c.numero_reclamo,
    fecha_entrega: c.fecha_entrega,
    fecha_ingreso: c.fecha_ingreso,
    aseguradora_id: c.aseguradora_id,
    aseguradora_nombre: c.aseguradora?.nombre || "Sin aseguradora",
    cliente_nombre: c.cliente?.nombre_completo,
    marca: c.marca?.nombre,
    modelo: c.modelo?.nombre,
  };
}

const SELECT_CASO = `placa, chasis, numero_reclamo, fecha_entrega, fecha_ingreso, aseguradora_id,
  aseguradora:aseguradoras(nombre), cliente:clientes(nombre_completo),
  marca:marcas(nombre), modelo:modelos(nombre)`;

export default function Reportes() {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [aseg, setAseg] = useState("todas");
  const [desde, setDesde] = useState(lunesDeEstaSemana());
  const [hasta, setHasta] = useState(domingoDeEstaSemana());
  const [entregados, setEntregados] = useState([]);
  const [ingresados, setIngresados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("aseguradoras")
        .select("id, nombre")
        .eq("activo", true)
        .order("orden");
      setAseguradoras(data || []);
    }
    load();
  }, []);

  async function cargar() {
    setError("");
    if (!desde || !hasta) return setError("Selecciona el rango de fechas.");
    if (desde > hasta) return setError("La fecha inicial no puede ser mayor que la final.");
    setLoading(true);

    let qE = supabase
      .from("casos")
      .select(SELECT_CASO)
      .eq("estado", "entregado")
      .gte("fecha_entrega", desde)
      .lte("fecha_entrega", hasta + "T23:59:59");
    let qI = supabase
      .from("casos")
      .select(SELECT_CASO)
      .gte("fecha_ingreso", desde)
      .lte("fecha_ingreso", hasta);

    if (aseg !== "todas") {
      qE = qE.eq("aseguradora_id", aseg);
      qI = qI.eq("aseguradora_id", aseg);
    }

    const [{ data: ent, error: eE }, { data: ing, error: eI }] = await Promise.all([qE, qI]);
    setLoading(false);
    if (eE || eI) {
      setError("No se pudieron cargar los datos del reporte.");
      return;
    }
    setEntregados((ent || []).map(aplanar));
    setIngresados((ing || []).map(aplanar));
  }

  // Carga inicial y cada vez que cambian los filtros
  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aseg, desde, hasta]);

  // Agrupa por aseguradora para construir las secciones del Excel.
  const secciones = useMemo(() => {
    const mapa = new Map();
    const asegurar = (nombre) => {
      if (!mapa.has(nombre)) mapa.set(nombre, { nombre, entregados: [], ingresados: [] });
      return mapa.get(nombre);
    };
    entregados.forEach((c) => asegurar(c.aseguradora_nombre).entregados.push(c));
    ingresados.forEach((c) => asegurar(c.aseguradora_nombre).ingresados.push(c));
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [entregados, ingresados]);

  const hayDatos = entregados.length > 0 || ingresados.length > 0;
  const nombreAseg =
    aseg === "todas" ? "Todas las aseguradoras" : aseguradoras.find((a) => a.id === aseg)?.nombre || "—";

  async function descargar() {
    setDescargando(true);
    setError("");
    try {
      // En modo "todas" siempre hacemos una hoja por aseguradora + resumen.
      // Con una sola aseguradora, una hoja con su detalle.
      let secs = secciones;
      if (aseg !== "todas") {
        secs = [{ nombre: nombreAseg, entregados, ingresados }];
      }
      if (!secs.length) secs = [{ nombre: nombreAseg, entregados: [], ingresados: [] }];

      const { generarReporteExcel } = await import("../lib/reporteExcel");
      const blob = await generarReporteExcel({ desde, hasta, secciones: secs });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const slug = nombreAseg.replace(/\s+/g, "_");
      a.download = `Reporte_${slug}_${desde}_a_${hasta}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("No se pudo generar el Excel.");
    } finally {
      setDescargando(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Reportes</h1>
          <p className="text-sm text-[var(--ink-soft)]">
            Carros entregados y recibidos por aseguradora, listo para enviar en Excel.
          </p>
        </div>
        <button
          onClick={descargar}
          disabled={descargando || loading}
          className="btn-primary gap-1.5 disabled:opacity-50"
        >
          <Icon name="file" className="w-4 h-4" /> {descargando ? "Generando…" : "Descargar Excel"}
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-5 mb-5 grid sm:grid-cols-[1fr_auto_auto] gap-4 items-end">
        <label className="block">
          <span className="field-label">Aseguradora</span>
          <select value={aseg} onChange={(e) => setAseg(e.target.value)} className="input">
            <option value="todas">Todas las aseguradoras</option>
            {aseguradoras.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="field-label">Hasta</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
        </label>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="card p-5">
          <p className="text-3xl font-extrabold text-emerald-600">{entregados.length}</p>
          <p className="text-sm text-[var(--ink-soft)] mt-1">Entregados (que sacamos)</p>
        </div>
        <div className="card p-5">
          <p className="text-3xl font-extrabold" style={{ color: "var(--brand-red)" }}>
            {ingresados.length}
          </p>
          <p className="text-sm text-[var(--ink-soft)] mt-1">Recibidos (que nos llegan)</p>
        </div>
      </div>

      <p className="text-xs text-[var(--ink-soft)] mb-4">
        Previsualización de <strong>{nombreAseg}</strong> · {ddmmaaaa(desde)} al {ddmmaaaa(hasta)}
      </p>

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : !hayDatos ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          No hay carros entregados ni recibidos en este período.
        </div>
      ) : aseg === "todas" ? (
        // Vista por aseguradora (resumen)
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-soft)] bg-[var(--paper)] text-xs uppercase tracking-wide">
                <th className="py-2.5 px-5 font-semibold">Aseguradora</th>
                <th className="py-2.5 px-3 font-semibold text-right">Entregados</th>
                <th className="py-2.5 px-5 font-semibold text-right">Recibidos</th>
              </tr>
            </thead>
            <tbody>
              {secciones.map((s) => (
                <tr key={s.nombre} className="border-t border-[var(--line)]">
                  <td className="py-3 px-5 font-medium text-[var(--ink)]">{s.nombre}</td>
                  <td className="py-3 px-3 text-right">{s.entregados.length}</td>
                  <td className="py-3 px-5 text-right">{s.ingresados.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        // Vista detallada (una sola aseguradora)
        <div className="space-y-5">
          <TablaDetalle titulo="Entregados (que sacamos)" casos={entregados} fechaKey="fecha_entrega" />
          <TablaDetalle titulo="Recibidos (que nos llegan)" casos={ingresados} fechaKey="fecha_ingreso" />
        </div>
      )}
    </div>
  );
}

function TablaDetalle({ titulo, casos, fechaKey }) {
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--line)] flex items-center justify-between">
        <h2 className="font-bold text-[var(--ink)]">{titulo}</h2>
        <span className="text-xs font-semibold text-[var(--ink-soft)] bg-[var(--paper)] px-2.5 py-1 rounded-full">
          {casos.length}
        </span>
      </div>
      {casos.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)] px-5 py-6">Sin registros en este período.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[var(--ink-soft)] bg-[var(--paper)] text-xs uppercase tracking-wide">
                <th className="py-2.5 px-5 font-semibold">Fecha</th>
                <th className="py-2.5 px-3 font-semibold">Placa</th>
                <th className="py-2.5 px-3 font-semibold">Vehículo</th>
                <th className="py-2.5 px-3 font-semibold">Cliente</th>
                <th className="py-2.5 px-5 font-semibold">Reclamo</th>
              </tr>
            </thead>
            <tbody>
              {casos.map((c, i) => (
                <tr key={i} className="border-t border-[var(--line)]">
                  <td className="py-2.5 px-5 whitespace-nowrap">{ddmmaaaa(c[fechaKey])}</td>
                  <td className="py-2.5 px-3">{c.placa || "—"}</td>
                  <td className="py-2.5 px-3">{[c.marca, c.modelo].filter(Boolean).join(" ") || "—"}</td>
                  <td className="py-2.5 px-3">{c.cliente_nombre || "—"}</td>
                  <td className="py-2.5 px-5">{c.numero_reclamo || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
