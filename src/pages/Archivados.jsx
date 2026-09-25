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

function coincide(caso, termino) {
  return [
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
    .some((valor) => String(valor).toLowerCase().includes(termino));
}

// Los archivados no son eliminados: solo salen de la operación diaria y se
// conservan aquí para consultar sus documentos o devolverlos al flujo activo.
export default function Archivados() {
  const [casos, setCasos] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("casos")
        .select(
          `id, placa, chasis, color, anio, numero_reclamo, numero_poliza, estado, archivado_en,
           cliente:clientes(nombre_completo),
           aseguradora:aseguradoras(nombre),
           marca:marcas(nombre),
           modelo:modelos(nombre)`
        )
        .not("archivado_en", "is", null)
        .order("archivado_en", { ascending: false });
      setCasos(data || []);
      setLoading(false);
    }
    cargar();
  }, []);

  const termino = busqueda.trim().toLowerCase();
  const lista = termino ? casos.filter((caso) => coincide(caso, termino)) : casos;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Inicio
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mt-3 mb-6">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
            <Icon name="archive" className="w-3.5 h-3.5" /> Fuera de operación
          </div>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Archivados</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {loading ? "Cargando…" : `${casos.length} caso(s) guardado(s) fuera de la vista diaria.`}
          </p>
        </div>
      </div>

      <div className="card mb-5 flex items-start gap-3 border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <Icon name="archive" className="mt-0.5 w-5 h-5 shrink-0" />
        <p>Archivar no elimina datos. Abre un caso para restaurarlo cuando vuelva a requerir trabajo.</p>
      </div>

      <input
        value={busqueda}
        onChange={(event) => setBusqueda(event.target.value)}
        placeholder="Buscar por placa, chasis, reclamo, asegurado o aseguradora…"
        className="input mb-5 w-full"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {termino ? `Sin coincidencias para “${busqueda}”.` : "Aún no hay casos archivados."}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {lista.map((caso) => (
            <Link
              key={caso.id}
              to={`/casos/${caso.id}`}
              className="flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-[var(--paper)] sm:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                  <Icon name="archive" className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold text-[var(--ink)]">
                    {[caso.marca?.nombre, caso.modelo?.nombre].filter(Boolean).join(" ") || "Vehículo"}
                    {caso.color ? ` · ${caso.color}` : ""}
                  </p>
                  <p className="truncate text-sm text-[var(--ink-soft)]">
                    {caso.cliente?.nombre_completo || "Sin nombre"}
                    {caso.placa ? ` · Placa ${caso.placa}` : ""}
                    {caso.aseguradora?.nombre ? ` · ${caso.aseguradora.nombre}` : ""}
                    {caso.numero_reclamo ? ` · Reclamo ${caso.numero_reclamo}` : ""}
                  </p>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                {fechaCorta(caso.archivado_en) || "Archivado"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
