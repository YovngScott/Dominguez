import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import { tramosDe, layoutTramos, formatoTramo } from "../lib/tramos";

// Vista del anaquel (tramos) por aseguradora: 3 de ancho × 4 de alto. Cada
// casilla muestra qué piezas (y de qué vehículo) están guardadas ahí.
export default function Tramos() {
  const navigate = useNavigate();
  const [aseguradoras, setAseguradoras] = useState([]);
  const [activa, setActiva] = useState("");
  const [items, setItems] = useState([]); // piezas con tramo
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: asegs }, { data: rec }] = await Promise.all([
        supabase.from("aseguradoras").select("id, nombre").eq("activo", true).order("orden"),
        supabase
          .from("piezas_recibidas")
          .select(
            `tramo, pieza_nombre, caso_id,
             caso:casos(id, placa,
               aseguradora:aseguradoras(nombre),
               marca:marcas(nombre), modelo:modelos(nombre))`
          )
          .not("tramo", "is", null),
      ]);
      setAseguradoras(asegs || []);
      setItems(rec || []);
      if (asegs?.length) setActiva((a) => a || asegs[0].nombre);
      setLoading(false);
    }
    load();
  }, []);

  // Piezas de la aseguradora activa, agrupadas por tramo.
  const porTramo = {};
  items.forEach((it) => {
    const aseg = it.caso?.aseguradora?.nombre || "General";
    if (aseg !== activa) return;
    (porTramo[it.tramo] = porTramo[it.tramo] || []).push(it);
  });

  const conteoPorAseg = items.reduce((acc, it) => {
    const a = it.caso?.aseguradora?.nombre || "General";
    acc[a] = (acc[a] || 0) + 1;
    return acc;
  }, {});

  // Anaquel según la aseguradora activa (largo × alto).
  const { cols, rows } = layoutTramos(activa);
  const slots = tramosDe(activa);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Icon name="grid" className="w-6 h-6 text-[var(--brand-red)]" />
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Tramos</h1>
      </div>
      <p className="text-sm text-[var(--ink-soft)] mb-5">
        Anaquel de piezas por aseguradora ({cols} de largo × {rows} de alto).
      </p>

      {/* Tabs de aseguradoras */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {aseguradoras.map((a) => (
          <button
            key={a.id}
            onClick={() => setActiva(a.nombre)}
            className={`text-sm px-3.5 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors inline-flex items-center gap-1.5 ${
              activa === a.nombre
                ? "bg-[var(--brand-red)] text-white"
                : "bg-white border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
            }`}
          >
            {a.nombre}
            <span
              className={`text-xs px-1.5 rounded-full ${
                activa === a.nombre ? "bg-white/25" : "bg-[var(--paper)] text-[var(--ink-soft)]"
              }`}
            >
              {conteoPorAseg[a.nombre] || 0}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {slots.map((slot) => {
            const piezas = porTramo[slot] || [];
            const ocupado = piezas.length > 0;
            return (
              <div
                key={slot}
                className={`rounded-xl border-2 p-3 min-h-[7rem] flex flex-col ${
                  ocupado ? "border-sky-300 bg-sky-50/60" : "border-dashed border-[var(--line)] bg-white"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-extrabold text-[var(--ink)]">{formatoTramo(slot)}</span>
                  {ocupado && (
                    <span className="text-xs font-semibold text-sky-700 bg-sky-100 px-1.5 rounded-full">
                      {piezas.length}
                    </span>
                  )}
                </div>
                {ocupado ? (
                  <ul className="space-y-1.5">
                    {piezas.map((it, i) => (
                      <li key={i}>
                        <button
                          onClick={() => it.caso_id && navigate(`/piezas/${it.caso_id}`)}
                          className="w-full text-left group"
                        >
                          <p className="text-sm font-semibold text-[var(--ink)] leading-tight group-hover:text-[var(--brand-red)]">
                            {it.pieza_nombre}
                          </p>
                          <p className="text-[11px] text-[var(--ink-soft)] truncate">
                            {[it.caso?.marca?.nombre, it.caso?.modelo?.nombre].filter(Boolean).join(" ")}
                            {it.caso?.placa ? ` · ${it.caso.placa}` : ""}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--ink-soft)] m-auto">Disponible</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
