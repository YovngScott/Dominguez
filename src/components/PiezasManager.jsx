import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { nombrePieza } from "../lib/cotizacion";
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
  const [infoCaso, setInfoCaso] = useState(caso || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);

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
      .select("pieza_clave")
      .eq("caso_id", casoId);
    setRecibidas(new Set((rec || []).map((r) => r.pieza_clave)));
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
        <button
          onClick={exportar}
          disabled={exportando || !piezas.length}
          className="btn-ghost text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
        >
          <Icon name="printer" className="w-4 h-4" /> {exportando ? "Generando…" : "Exportar PDF"}
        </button>
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
              <li key={p.clave}>
                <button
                  onClick={() => toggle(p)}
                  className="w-full flex items-center gap-3 py-3 text-left hover:bg-[var(--paper)] px-2 rounded-lg"
                >
                  <span
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      recibida ? "bg-emerald-500 border-emerald-500 text-white" : "border-[var(--ink-soft)]"
                    }`}
                  >
                    {recibida && <Icon name="check" className="w-4 h-4" strokeWidth={3} />}
                  </span>
                  <span
                    className={`flex-1 font-medium ${
                      recibida ? "text-[var(--ink-soft)] line-through" : "text-[var(--ink)]"
                    }`}
                  >
                    {p.nombre}
                  </span>
                  {p.cantidad > 1 && (
                    <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
                  )}
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      recibida ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                    }`}
                  >
                    {recibida ? "Recibida" : "Pendiente"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
