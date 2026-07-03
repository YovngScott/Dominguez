import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const CASO_SELECT = `
  id, placa, chasis, numero_reclamo, anio, color,
  cliente:clientes(nombre_completo),
  marca:marcas(nombre),
  modelo:modelos(nombre),
  aseguradora:aseguradoras(nombre)
`;

export default function SearchBar({ autoFocus = false }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  async function runSearch(q) {
    if (q.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);

    const byVehiculo = supabase
      .from("casos")
      .select(CASO_SELECT)
      .or(`placa.ilike.%${q}%,chasis.ilike.%${q}%,numero_reclamo.ilike.%${q}%`)
      .limit(15);

    // Coincidencias en tablas relacionadas (cliente, marca, modelo): primero se
    // buscan sus ids y luego los casos que los usan.
    const [clientesMatch, marcasMatch, modelosMatch] = await Promise.all([
      supabase.from("clientes").select("id").ilike("nombre_completo", `%${q}%`).limit(15),
      supabase.from("marcas").select("id").ilike("nombre", `%${q}%`).limit(15),
      supabase.from("modelos").select("id").ilike("nombre", `%${q}%`).limit(15),
    ]);

    const clienteIds = (clientesMatch.data || []).map((c) => c.id);
    const marcaIds = (marcasMatch.data || []).map((m) => m.id);
    const modeloIds = (modelosMatch.data || []).map((m) => m.id);

    const byClientePromise = clienteIds.length
      ? supabase.from("casos").select(CASO_SELECT).in("cliente_id", clienteIds).limit(15)
      : Promise.resolve({ data: [] });
    const byMarcaPromise = marcaIds.length
      ? supabase.from("casos").select(CASO_SELECT).in("marca_id", marcaIds).limit(15)
      : Promise.resolve({ data: [] });
    const byModeloPromise = modeloIds.length
      ? supabase.from("casos").select(CASO_SELECT).in("modelo_id", modeloIds).limit(15)
      : Promise.resolve({ data: [] });

    const [vehiculoRes, clienteRes, marcaRes, modeloRes] = await Promise.all([
      byVehiculo,
      byClientePromise,
      byMarcaPromise,
      byModeloPromise,
    ]);

    const merged = [
      ...(vehiculoRes.data || []),
      ...(clienteRes.data || []),
      ...(marcaRes.data || []),
      ...(modeloRes.data || []),
    ];
    const dedup = Array.from(new Map(merged.map((c) => [c.id, c])).values());

    setResults(dedup);
    setOpen(true);
    setLoading(false);
  }

  const debounceTimer = useRef(null);
  function handleChange(e) {
    const value = e.target.value;
    setQuery(value);
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => runSearch(value), 300);
  }

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={handleChange}
        placeholder="Placa, chasis, reclamo, vehículo o asegurado…"
        className="w-full text-lg text-[var(--ink)] bg-white border border-transparent rounded-full px-6 py-3.5 shadow-lg focus:outline-none focus:ring-4 focus:ring-[var(--brand-red)]/30"
      />

      {open && (
        <div className="absolute z-30 mt-2 w-full bg-white rounded-xl shadow-xl border border-slate-200 max-h-96 overflow-y-auto">
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
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
