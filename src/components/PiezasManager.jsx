import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { nombrePieza } from "../lib/cotizacion";
import { TRAMOS } from "../lib/tramos";
import Icon from "./Icon";

// Clave estable para identificar una pieza entre cotizaciones del mismo caso.
const clave = (s) => (s || "").trim().toLowerCase();

/**
 * Checklist de piezas de un caso. Las piezas se leen de las cotizaciones
 * del caso (items_piezas); el estado "recibida" se guarda aparte en la
 * tabla piezas_recibidas, así la cotización y su PDF nunca se modifican.
 */
export default function PiezasManager({ casoId, caso }) {
  const [piezas, setPiezas] = useState([]); // [{ clave, nombre, cantidad, cotizacion }]
  const [recibidas, setRecibidas] = useState(new Set()); // claves recibidas
  const [tramos, setTramos] = useState({}); // clave -> tramo (ej. "B2")
  const [infoCaso, setInfoCaso] = useState(caso || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);
  const [seleccion, setSeleccion] = useState(new Set());
  const [imprimiendo, setImprimiendo] = useState(false);

  async function load() {
    setLoading(true);
    setError("");

    const { data: cots } = await supabase
      .from("cotizaciones")
      .select(
        "numero, cliente_nombre, marca, modelo, anio, color, placa, chasis, numero_reclamo, aseguradora_nombre, items_piezas, created_at"
      )
      .eq("caso_id", casoId)
      .order("created_at", { ascending: true });

    // Lista única de piezas a partir de todas las cotizaciones del caso.
    const map = new Map();
    (cots || []).forEach((c) => {
      (c.items_piezas || []).forEach((it) => {
        const nombre = nombrePieza(it);
        const k = clave(nombre);
        if (!k) return;
        if (!map.has(k)) {
          map.set(k, { clave: k, nombre, cantidad: Number(it.cantidad) || 1, cotizacion: c.numero });
        }
      });
    });
    setPiezas([...map.values()]);
    if (!caso && cots?.length) setInfoCaso(cots[cots.length - 1]);

    const { data: rec } = await supabase
      .from("piezas_recibidas")
      .select("pieza_clave, tramo")
      .eq("caso_id", casoId);
    setRecibidas(new Set((rec || []).map((r) => r.pieza_clave)));
    const tmap = {};
    (rec || []).forEach((r) => {
      if (r.tramo) tmap[r.pieza_clave] = r.tramo;
    });
    setTramos(tmap);
    setLoading(false);
  }

  useEffect(() => {
    if (casoId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);

  async function toggle(p) {
    const yaRecibida = recibidas.has(p.clave);
    // Actualización optimista
    setRecibidas((prev) => {
      const n = new Set(prev);
      if (yaRecibida) n.delete(p.clave);
      else n.add(p.clave);
      return n;
    });
    setError("");

    if (yaRecibida) {
      await supabase.from("piezas_recibidas").delete().eq("caso_id", casoId).eq("pieza_clave", p.clave);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      const { error: e } = await supabase.from("piezas_recibidas").insert({
        caso_id: casoId,
        pieza_clave: p.clave,
        pieza_nombre: p.nombre,
        recibida_by: userData?.user?.id,
      });
      if (e) {
        // revierte el cambio optimista
        setRecibidas((prev) => {
          const n = new Set(prev);
          n.delete(p.clave);
          return n;
        });
        setError("No se pudo guardar. Ejecuta la migración sql/15_piezas_recibidas.sql en Supabase.");
      }
    }
  }

  async function setTramo(p, valor) {
    setTramos((prev) => {
      const n = { ...prev };
      if (valor) n[p.clave] = valor;
      else delete n[p.clave];
      return n;
    });
    await supabase
      .from("piezas_recibidas")
      .update({ tramo: valor || null })
      .eq("caso_id", casoId)
      .eq("pieza_clave", p.clave);
  }

  async function exportar() {
    setExportando(true);
    try {
      const { generarPdfPiezas } = await import("../lib/piezasPdf");
      const blob = await generarPdfPiezas({ caso: infoCaso || {}, piezas });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      setError("No se pudo generar el PDF.");
    } finally {
      setExportando(false);
    }
  }

  function abrirEtiquetas() {
    // Por defecto selecciona las piezas pendientes (las que normalmente
    // acaban de llegar y hay que marcar en la caja).
    const pendientesClaves = piezas.filter((p) => !recibidas.has(p.clave)).map((p) => p.clave);
    setSeleccion(new Set(pendientesClaves.length ? pendientesClaves : piezas.map((p) => p.clave)));
    setMostrarEtiquetas(true);
  }

  function toggleSeleccion(clave) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }

  async function imprimirEtiquetas() {
    setImprimiendo(true);
    try {
      const seleccionadas = piezas.filter((p) => seleccion.has(p.clave));
      // Imprime directo en la térmica si hay print server; si no, abre el PDF.
      // QR → abre el caso para ver dónde está guardada cada pieza (su tramo).
      const { imprimirEtiquetas: enviar } = await import("../lib/printServer");
      const res = await enviar({
        caso: infoCaso || {},
        piezas: seleccionadas,
        qrUrl: `https://dominguez.vercel.app/piezas/${casoId}`,
      });
      if (res.modo === "pdf") window.open(URL.createObjectURL(res.blob), "_blank");
      setMostrarEtiquetas(false);
    } catch (err) {
      setError(err.message || "No se pudo imprimir las etiquetas.");
    } finally {
      setImprimiendo(false);
    }
  }

  const recibidasCount = piezas.filter((p) => recibidas.has(p.clave)).length;
  const pendientes = piezas.length - recibidasCount;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-[var(--ink)]">Piezas del caso</h2>
          <p className="text-xs text-[var(--ink-soft)]">
            {recibidasCount} de {piezas.length} recibidas · {pendientes} pendiente(s)
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={abrirEtiquetas}
            disabled={!piezas.length}
            className="btn-primary text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
          >
            <Icon name="tag" className="w-4 h-4" /> Imprimir etiquetas
          </button>
          <button
            onClick={exportar}
            disabled={exportando || !piezas.length}
            className="btn-ghost text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
          >
            <Icon name="printer" className="w-4 h-4" /> {exportando ? "Generando…" : "Exportar PDF"}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
      ) : piezas.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">
          No hay piezas. Agrega piezas en una cotización de este vehículo y aparecerán aquí.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {piezas.map((p) => {
            const recibida = recibidas.has(p.clave);
            return (
              <li key={p.clave} className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--paper)] rounded-lg">
                <button onClick={() => toggle(p)} className="flex-1 flex items-center gap-3 py-1.5 text-left min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      recibida ? "bg-emerald-500 border-emerald-500 text-white" : "border-[var(--ink-soft)]"
                    }`}
                  >
                    {recibida && <Icon name="check" className="w-4 h-4" strokeWidth={3} />}
                  </span>
                  <span
                    className={`flex-1 font-medium truncate ${
                      recibida ? "text-[var(--ink-soft)] line-through" : "text-[var(--ink)]"
                    }`}
                  >
                    {p.nombre}
                  </span>
                  {p.cantidad > 1 && (
                    <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
                  )}
                </button>

                {recibida ? (
                  // Espacio del anaquel donde quedó guardada (editable)
                  <select
                    value={tramos[p.clave] || ""}
                    onChange={(e) => setTramo(p, e.target.value)}
                    title="Tramo (lugar en el anaquel)"
                    className={`text-xs font-semibold rounded-lg border px-2 py-1.5 shrink-0 ${
                      tramos[p.clave]
                        ? "border-sky-300 bg-sky-50 text-sky-700"
                        : "border-[var(--line)] text-[var(--ink-soft)]"
                    }`}
                  >
                    <option value="">Tramo…</option>
                    {TRAMOS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-50 text-amber-600 shrink-0">
                    Pendiente
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {mostrarEtiquetas && (
        <EtiquetasModal
          piezas={piezas}
          seleccion={seleccion}
          onToggle={toggleSeleccion}
          onSeleccionarTodas={() => setSeleccion(new Set(piezas.map((p) => p.clave)))}
          onLimpiar={() => setSeleccion(new Set())}
          onImprimir={imprimirEtiquetas}
          onCancelar={() => setMostrarEtiquetas(false)}
          imprimiendo={imprimiendo}
        />
      )}
    </div>
  );
}

function EtiquetasModal({
  piezas,
  seleccion,
  onToggle,
  onSeleccionarTodas,
  onLimpiar,
  onImprimir,
  onCancelar,
  imprimiendo,
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-[var(--line)]">
          <h3 className="font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="tag" className="w-5 h-5 text-[var(--brand-red)]" /> Imprimir etiquetas
          </h3>
          <p className="text-xs text-[var(--ink-soft)] mt-1">
            Selecciona qué piezas llevarán etiqueta. Cada una sale en una hoja de 4×6&quot;
            con los datos del asegurado, vehículo y seguro, lista para pegar en la caja.
          </p>
        </div>

        <div className="px-5 py-2 flex gap-3 text-xs">
          <button onClick={onSeleccionarTodas} className="text-[var(--brand-red)] font-semibold">
            Seleccionar todas
          </button>
          <button onClick={onLimpiar} className="text-[var(--ink-soft)] font-semibold">
            Quitar selección
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          <ul className="divide-y divide-[var(--line)]">
            {piezas.map((p) => {
              const sel = seleccion.has(p.clave);
              return (
                <li key={p.clave}>
                  <button
                    onClick={() => onToggle(p.clave)}
                    className="w-full flex items-center gap-3 py-2.5 text-left"
                  >
                    <span
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        sel ? "bg-[var(--brand-red)] border-[var(--brand-red)] text-white" : "border-[var(--ink-soft)]"
                      }`}
                    >
                      {sel && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 text-sm font-medium text-[var(--ink)]">{p.nombre}</span>
                    {p.cantidad > 1 && (
                      <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="p-5 border-t border-[var(--line)] flex gap-3">
          <button
            onClick={onImprimir}
            disabled={imprimiendo || seleccion.size === 0}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {imprimiendo ? "Generando…" : `Imprimir ${seleccion.size} etiqueta(s)`}
          </button>
          <button onClick={onCancelar} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
