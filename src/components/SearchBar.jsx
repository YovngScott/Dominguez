import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "./Icon";

const CASO_SELECT = `
  id, placa, chasis, numero_reclamo, numero_poliza, fecha_ingreso, estado, anio, color,
  cliente:clientes(nombre_completo),
  marca:marcas(nombre),
  modelo:modelos(nombre),
  aseguradora:aseguradoras(nombre)
`;

// Los entregados y archivados se conservan en su historial, pero no distraen
// la búsqueda operativa del encabezado.
const buscarCasos = () => supabase.from("casos").select(CASO_SELECT).neq("estado", "entregado").is("archivado_en", null);

function normalizarCasoRpc(caso) {
  return {
    ...caso,
    cliente: { nombre_completo: caso.cliente_nombre },
    marca: { nombre: caso.marca_nombre },
    modelo: { nombre: caso.modelo_nombre },
    aseguradora: { nombre: caso.aseguradora_nombre },
  };
}

// Respaldo para que una actualización de la web siga funcionando mientras se
// aplica la migración de rendimiento en Supabase.
async function buscarLegacy(termino) {
  const byVehiculo = buscarCasos()
    .or(`placa.ilike.%${termino}%,chasis.ilike.%${termino}%,numero_reclamo.ilike.%${termino}%,numero_poliza.ilike.%${termino}%`)
    .limit(15);

  const [clientesMatch, marcasMatch, modelosMatch] = await Promise.all([
    supabase.from("clientes").select("id").ilike("nombre_completo", `%${termino}%`).limit(15),
    supabase.from("marcas").select("id").ilike("nombre", `%${termino}%`).limit(15),
    supabase.from("modelos").select("id").ilike("nombre", `%${termino}%`).limit(15),
  ]);

  const clienteIds = (clientesMatch.data || []).map((c) => c.id);
  const marcaIds = (marcasMatch.data || []).map((m) => m.id);
  const modeloIds = (modelosMatch.data || []).map((m) => m.id);
  const [vehiculoRes, clienteRes, marcaRes, modeloRes] = await Promise.all([
    byVehiculo,
    clienteIds.length ? buscarCasos().in("cliente_id", clienteIds).limit(15) : Promise.resolve({ data: [] }),
    marcaIds.length ? buscarCasos().in("marca_id", marcaIds).limit(15) : Promise.resolve({ data: [] }),
    modeloIds.length ? buscarCasos().in("modelo_id", modeloIds).limit(15) : Promise.resolve({ data: [] }),
  ]);
  const todos = [
    ...(vehiculoRes.data || []),
    ...(clienteRes.data || []),
    ...(marcaRes.data || []),
    ...(modeloRes.data || []),
  ];
  return Array.from(new Map(todos.map((c) => [c.id, c])).values()).slice(0, 15);
}

export default function SearchBar({ autoFocus = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const requestActual = useRef(0);
  const navigate = useNavigate();

  async function runSearch(q) {
    const solicitud = ++requestActual.current;
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const termino = q.trim().replace(/[(),]/g, "");
    try {
      const { data, error } = await supabase.rpc("buscar_casos_operativos", {
        p_termino: termino,
        p_limite: 15,
      });
      const resultados = error ? await buscarLegacy(termino) : (data || []).map(normalizarCasoRpc);
      if (solicitud !== requestActual.current) return;
      setResults(resultados);
      setOpen(true);
    } catch {
      if (solicitud !== requestActual.current) return;
      setResults([]);
      setOpen(true);
    } finally {
      if (solicitud === requestActual.current) setLoading(false);
    }
  }

  const debounceTimer = useRef(null);
  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(value), 300);
  }
  useEffect(() => () => clearTimeout(debounceTimer.current), []);

  return (
    <div className="relative z-30 w-full max-w-2xl mx-auto">
      <Icon name="search" className="absolute left-5 top-1/2 -translate-y-1/2 z-10 w-5 h-5 text-slate-400 pointer-events-none" />
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={handleChange}
        placeholder="Placa, chasis, reclamo, vehículo o asegurado…"
        className="w-full text-lg text-[var(--ink)] bg-white border border-white/30 rounded-2xl pl-13 pr-6 py-4 shadow-xl focus:outline-none focus:ring-4 focus:ring-[var(--brand-red)]/30"
      />

      {open && (
        <div className="absolute z-50 mt-3 w-full bg-white rounded-2xl shadow-2xl border border-slate-200 max-h-96 overflow-y-auto overflow-hidden">
          {loading && <p className="p-4 text-sm text-slate-500">Buscando…</p>}
          {!loading && results.length === 0 && (
            <p className="p-4 text-sm text-slate-500">Sin resultados para "{query}".</p>
          )}
          {!loading &&
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setOpen(false);
                  navigate(`/casos/${c.id}`);
                }}
                className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-0"
              >
                <p className="font-medium text-slate-800">
                  {c.marca?.nombre} {c.modelo?.nombre} {c.color ? `· ${c.color}` : ""}{" "}
                  <span className="text-slate-400">({c.placa || "sin placa"})</span>
                </p>
                <p className="text-sm text-slate-500">
                  {c.cliente?.nombre_completo} · {c.aseguradora?.nombre}
                  {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
                </p>
                <p className="text-xs text-slate-400">Ingreso: {c.fecha_ingreso || "—"}{c.numero_poliza ? ` · Póliza: ${c.numero_poliza}` : ""}{c.estado === "entregado" ? " · Entregado" : ""}</p>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
