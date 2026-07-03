import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

function ddmmaaaa(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Todos los casos cerrados (estado "entregado"), de todas las aseguradoras.
export default function Entregados() {
  const [casos, setCasos] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("casos")
        .select(
          `id, placa, chasis, color, anio, numero_reclamo, numero_poliza, fecha_ingreso, updated_at, created_at,
           cliente:clientes(nombre_completo),
           aseguradora:aseguradoras(nombre),
           marca:marcas(nombre),
           modelo:modelos(nombre)`
        )
        .eq("estado", "entregado")
        .order("updated_at", { ascending: false });
      setCasos(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const term = q.trim().toLowerCase();
  const lista = term
    ? casos.filter((c) =>
        [
          c.placa,
          c.chasis,
          c.numero_reclamo,
          c.numero_poliza,
          c.cliente?.nombre_completo,
          c.aseguradora?.nombre,
          c.marca?.nombre,
          c.modelo?.nombre,
        ]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(term))
      )
    : casos;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Inicio
      </Link>

      {/* Encabezado */}
      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-emerald-500 opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              Casos cerrados
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">Vehículos entregados</h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              {loading
                ? "Cargando…"
                : `${casos.length} vehículo(s) entregado(s) en total.`}
            </p>
          </div>
          <span className="hidden sm:block text-emerald-300">
            <Icon name="check" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por placa, chasis, reclamo, asegurado o aseguradora…"
        className="input w-full mb-5"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {term ? `Sin coincidencias para “${q}”.` : "Aún no hay vehículos entregados."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((c) => (
            <Link
              key={c.id}
              to={`/casos/${c.id}`}
              className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-[var(--paper)] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-emerald-50 text-emerald-600">
                  <Icon name="check" className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[var(--ink)] truncate">
                    {[c.marca?.nombre, c.modelo?.nombre].filter(Boolean).join(" ") || "Vehículo"}
                    {c.color ? ` · ${c.color}` : ""}
                  </p>
                  <p className="text-sm text-[var(--ink-soft)] truncate">
                    {c.cliente?.nombre_completo || "Sin nombre"}
                    {c.placa ? ` · Placa ${c.placa}` : ""}
                    {c.aseguradora?.nombre ? ` · ${c.aseguradora.nombre}` : ""}
                    {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap bg-emerald-50 text-emerald-600 shrink-0">
                {ddmmaaaa(c.updated_at) || "Entregado"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
