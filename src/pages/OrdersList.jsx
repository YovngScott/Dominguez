import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function ddmmaaaa(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function OrdersList() {
  const [ordenes, setOrdenes] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("ordenes_reparacion")
        .select("id, numero, cliente, marca, modelo, placa, chasis, fecha")
        .order("created_at", { ascending: false });
      setOrdenes(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const term = q.trim().toLowerCase();
  const lista = term
    ? ordenes.filter((o) =>
        [o.numero, o.cliente, o.placa, o.chasis, o.marca, o.modelo]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(term))
      )
    : ordenes;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Recibos</h1>
        <Link to="/ordenes/nueva" className="btn-primary">
          <span className="text-lg leading-none">+</span> Nuevo recibo
        </Link>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por número, cliente, placa o chasis…"
        className="input w-full mb-5"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {term ? "Sin coincidencias." : "Aún no hay recibos."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((o) => (
            <Link key={o.id} to={`/ordenes/${o.id}`} className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-[var(--paper)]">
              <div className="min-w-0">
                <p className="font-bold text-[var(--ink)] truncate">Recibo No. {o.numero} · {o.cliente}</p>
                <p className="text-sm text-[var(--ink-soft)] truncate">
                  {[o.marca, o.modelo].filter(Boolean).join(" ")}{o.placa ? ` · ${o.placa}` : ""}
                </p>
              </div>
              <span className="text-sm text-[var(--ink-soft)] shrink-0">{ddmmaaaa(o.fecha)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
