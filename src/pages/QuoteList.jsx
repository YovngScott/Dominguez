import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { rd } from "../lib/cotizacion";

export default function QuoteList() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("cotizaciones")
        .select("id, numero, cliente_nombre, marca, modelo, placa, chasis, total, estado, created_at")
        .order("created_at", { ascending: false });
      setCotizaciones(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const q = busqueda.trim().toLowerCase();
  const lista = q
    ? cotizaciones.filter((c) =>
        [c.numero, c.cliente_nombre, c.placa, c.chasis, c.marca, c.modelo]
          .filter(Boolean)
          .some((x) => x.toLowerCase().includes(q))
      )
    : cotizaciones;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Cotizaciones</h1>
        <Link to="/cotizaciones/nueva" className="btn-primary">
          <span className="text-lg leading-none">+</span> Nueva cotización
        </Link>
      </div>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por número, cliente, placa o chasis…"
        className="input w-full mb-5"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {q ? "Sin coincidencias." : "Aún no hay cotizaciones. Crea la primera."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((c) => (
            <Link
              key={c.id}
              to={`/cotizaciones/${c.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-[var(--paper)]"
            >
              <div>
                <p className="font-bold text-[var(--ink)]">
                  {c.numero} · {c.cliente_nombre}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  {[c.marca, c.modelo].filter(Boolean).join(" ")}
                  {c.placa ? ` · ${c.placa}` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="font-bold text-[var(--ink)]">{rd(c.total)}</p>
                <p className="text-xs text-[var(--ink-soft)] capitalize">{c.estado}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
