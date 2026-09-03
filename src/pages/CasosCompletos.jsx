import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

function fechaCorta(iso) {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  return fecha.toLocaleDateString("es-DO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Casos cerrados administrativamente mientras estaban en espera de piezas.
// No se mezclan con "Vehículos entregados", que requiere firma de entrega.
export default function CasosCompletos() {
  const [casos, setCasos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("casos")
        .select(
          `id, placa, chasis, color, anio, numero_reclamo, numero_poliza, updated_at,
           cliente:clientes(nombre_completo),
           aseguradora:aseguradoras(nombre),
           marca:marcas(nombre),
           modelo:modelos(nombre)`
        )
        .eq("estado", "completado")
        .order("updated_at", { ascending: false });
      setCasos(data || []);
      setLoading(false);
    }
    cargar();
  }, []);

  const termino = busqueda.trim().toLowerCase();
  const lista = termino
    ? casos.filter((caso) =>
        [
          caso.placa,
          caso.chasis,
          caso.numero_reclamo,
          caso.numero_poliza,
          caso.cliente?.nombre_completo,
          caso.aseguradora?.nombre,
          caso.marca?.nombre,
          caso.modelo?.nombre,
        ]
          .filter(Boolean)
          .some((valor) => String(valor).toLowerCase().includes(termino))
      )
    : casos;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Inicio
      </Link>

      <div className="relative overflow-hidden rounded-2xl bg-violet-700 text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-fuchsia-300 opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              Casos cerrados
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">Casos completos</h1>
            <p className="text-white/70 mt-1 text-sm max-w-md">
              {loading ? "Cargando…" : `${casos.length} caso(s) completado(s) en total.`}
            </p>
          </div>
          <span className="hidden sm:block text-violet-100">
            <Icon name="check" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <input
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
        placeholder="Buscar por placa, chasis, reclamo, asegurado o aseguradora…"
        className="input w-full mb-5"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {termino ? `Sin coincidencias para “${busqueda}”.` : "Aún no hay casos completos."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((caso) => (
            <Link
              key={caso.id}
              to={`/casos/${caso.id}`}
              className="flex items-center justify-between gap-3 px-4 sm:px-5 py-4 hover:bg-[var(--paper)] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-violet-50 text-violet-700">
                  <Icon name="check" className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[var(--ink)] truncate">
                    {[caso.marca?.nombre, caso.modelo?.nombre].filter(Boolean).join(" ") || "Vehículo"}
                    {caso.color ? ` · ${caso.color}` : ""}
                  </p>
                  <p className="text-sm text-[var(--ink-soft)] truncate">
                    {caso.cliente?.nombre_completo || "Sin nombre"}
                    {caso.placa ? ` · Placa ${caso.placa}` : ""}
                    {caso.aseguradora?.nombre ? ` · ${caso.aseguradora.nombre}` : ""}
                    {caso.numero_reclamo ? ` · Reclamo ${caso.numero_reclamo}` : ""}
                  </p>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap bg-violet-50 text-violet-700 shrink-0">
                {fechaCorta(caso.updated_at) || "Completo"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
