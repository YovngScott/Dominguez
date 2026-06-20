import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ESTADOS, ESTADOS_PRINCIPALES } from "../lib/estados";
import Icon from "../components/Icon";

export default function CaseList() {
  const { aseguradoraId } = useParams();
  const [aseguradora, setAseguradora] = useState(null);
  const [casos, setCasos] = useState([]);
  const [activo, setActivo] = useState("en_espera_piezas");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: aseg } = await supabase
        .from("aseguradoras")
        .select("*")
        .eq("id", aseguradoraId)
        .single();

      const { data: casosData } = await supabase
        .from("casos")
        .select(
          `id, placa, chasis, color, anio, numero_reclamo, numero_poliza, estado, fecha_ingreso,
           cliente:clientes(nombre_completo),
           marca:marcas(nombre),
           modelo:modelos(nombre)`
        )
        .eq("aseguradora_id", aseguradoraId)
        .order("created_at", { ascending: false });

      setAseguradora(aseg);
      setCasos(casosData || []);
      setLoading(false);
    }
    load();
  }, [aseguradoraId]);

  // "En espera de piezas" actúa como catch-all: incluye cualquier caso cuyo
  // estado no sea explícitamente "listo_para_trabajar" ni "entregado"
  // (así también aparecen casos creados con estados antiguos como "ingresado").
  const perteneceA = (caso, estado) => {
    if (estado === "en_espera_piezas") {
      return caso.estado !== "listo_para_trabajar" && caso.estado !== "entregado";
    }
    return caso.estado === estado;
  };

  const conteo = (estado) => casos.filter((c) => perteneceA(c, estado)).length;

  const q = busqueda.trim().toLowerCase();
  const buscando = q.length > 0;
  const coincide = (c) =>
    [
      c.placa,
      c.chasis,
      c.numero_reclamo,
      c.numero_poliza,
      c.cliente?.nombre_completo,
      c.marca?.nombre,
      c.modelo?.nombre,
    ]
      .filter(Boolean)
      .some((campo) => campo.toLowerCase().includes(q));

  // Si hay búsqueda: resultados en toda la aseguradora. Si no: la categoría activa.
  const listaMostrada = buscando
    ? casos.filter(coincide)
    : casos.filter((c) => perteneceA(c, activo));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Aseguradoras
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3 mt-2 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
          {aseguradora?.nombre || "…"}
        </h1>
        <Link to={`/casos/nuevo?aseguradora=${aseguradoraId}`} className="btn-primary">
          <span className="text-lg leading-none">+</span> Nuevo caso
        </Link>
      </div>

      {/* Buscador dentro de la aseguradora */}
      <div className="relative mb-6">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder={`Buscar en ${aseguradora?.nombre || "esta aseguradora"} (placa, chasis, reclamo, asegurado…)`}
          className="input w-full text-base"
        />
        {buscando && (
          <button
            onClick={() => setBusqueda("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dos opciones principales */}
      <div
        className={`grid sm:grid-cols-2 gap-4 mb-7 transition-opacity ${
          buscando ? "opacity-40" : ""
        }`}
      >
        {ESTADOS_PRINCIPALES.map((estado) => {
          const e = ESTADOS[estado];
          const seleccionado = activo === estado;
          return (
            <button
              key={estado}
              onClick={() => setActivo(estado)}
              className={`text-left rounded-2xl border-2 p-5 bg-gradient-to-br transition-all ${e.card} ${
                seleccionado
                  ? "ring-2 ring-offset-2 shadow-md scale-[1.01]"
                  : "opacity-80 hover:opacity-100"
              }`}
              style={seleccionado ? { borderColor: e.accent, "--tw-ring-color": e.accent } : {}}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: e.accent }}>
                  <Icon name={e.icon} className="w-8 h-8" />
                </span>
                <span
                  className="text-3xl font-extrabold"
                  style={{ color: e.accent }}
                >
                  {conteo(estado)}
                </span>
              </div>
              <p className="mt-2 text-lg font-bold text-[var(--ink)]">{e.label}</p>
              <p className="text-sm text-[var(--ink-soft)]">
                {seleccionado ? "Mostrando estos casos" : "Toca para ver"}
              </p>
            </button>
          );
        })}
      </div>

      {/* Acceso a entregados (oculto al buscar) */}
      {!buscando && (
        <button
          onClick={() => setActivo("entregado")}
          className={`mb-4 text-sm font-medium px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 ${
            activo === "entregado"
              ? "bg-slate-700 text-white"
              : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          }`}
        >
          <Icon name="check" className="w-4 h-4" /> Entregados ({conteo("entregado")})
        </button>
      )}

      {buscando && (
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          {listaMostrada.length} resultado(s) para “{busqueda}”
        </p>
      )}

      {/* Lista (categoría activa o resultados de búsqueda) */}
      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : listaMostrada.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {buscando
            ? `Sin coincidencias para “${busqueda}”.`
            : `No hay casos en "${ESTADOS[activo].label}" todavía.`}
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {listaMostrada.map((c) => {
            const est = ESTADOS[c.estado] || ESTADOS.en_espera_piezas;
            return (
            <Link
              key={c.id}
              to={`/casos/${c.id}`}
              className="flex items-center justify-between px-5 py-4 hover:bg-[var(--paper)] transition-colors"
            >
              <div>
                <p className="font-bold text-[var(--ink)]">
                  {c.marca?.nombre} {c.modelo?.nombre} {c.color ? `· ${c.color}` : ""}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  {c.cliente?.nombre_completo} · Placa {c.placa || "—"}
                  {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
                </p>
              </div>
              {buscando ? (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${est.chip}`}>
                  {est.short}
                </span>
              ) : (
                <span className="text-[var(--brand-red)] text-xl">›</span>
              )}
            </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
