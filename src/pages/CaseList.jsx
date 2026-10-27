import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { ESTADOS, ESTADOS_LISTA } from "../lib/estados";
import { citasPendientesDeCasos } from "../lib/citaCaso";
import Icon from "../components/Icon";
import { diasDesde } from "../lib/aging";
import { casoAdmiteEtiqueta, etiquetaDeCaso, ETIQUETAS_CASO } from "../lib/etiquetasCaso";

function fechaCorta(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("es-DO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default function CaseList() {
  const { aseguradoraId } = useParams();
  const [aseguradora, setAseguradora] = useState(null);
  const [casos, setCasos] = useState([]);
  const [citas, setCitas] = useState({}); // { casoId: cita pendiente }
  const [activo, setActivo] = useState("en_espera_piezas");
  const [busqueda, setBusqueda] = useState("");
  const [loading, setLoading] = useState(true);
  const [etiquetaError, setEtiquetaError] = useState("");
  const [guardandoEtiqueta, setGuardandoEtiqueta] = useState("");

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
          `id, placa, chasis, color, anio, numero_reclamo, numero_poliza, estado, fecha_ingreso, etiqueta_organizacion,
           cliente:clientes(nombre_completo),
           marca:marcas(nombre),
           modelo:modelos(nombre)`
        )
        .eq("aseguradora_id", aseguradoraId)
        .is("archivado_en", null)
        .order("created_at", { ascending: false });

      setAseguradora(aseg);
      setCasos(casosData || []);
      setLoading(false);

      // Citas aún sin atender, para avisar en la lista qué vehículos están
      // agendados para venir.
      citasPendientesDeCasos((casosData || []).map((c) => c.id))
        .then(setCitas)
        .catch(() => {});
    }
    load();
  }, [aseguradoraId]);

  // "En espera de piezas" actúa como catch-all: incluye cualquier caso cuyo
  // estado no sea explícitamente otro estado conocido (así también aparecen
  // casos creados con estados antiguos como "ingresado").
  const perteneceA = (caso, estado) => {
    if (estado === "en_espera_piezas") {
      return !["listo_para_trabajar", "vehiculo_en_taller", "entregado"].includes(caso.estado);
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

  async function actualizarEtiqueta(casoId, etiqueta) {
    const anterior = casos.find((caso) => caso.id === casoId)?.etiqueta_organizacion || null;
    setEtiquetaError("");
    setGuardandoEtiqueta(casoId);
    setCasos((actuales) =>
      actuales.map((caso) =>
        caso.id === casoId ? { ...caso, etiqueta_organizacion: etiqueta } : caso
      )
    );

    const { data, error } = await supabase
      .from("casos")
      .update({ etiqueta_organizacion: etiqueta })
      .eq("id", casoId)
      .select("id, etiqueta_organizacion")
      .single();

    if (error) {
      setCasos((actuales) =>
        actuales.map((caso) =>
          caso.id === casoId ? { ...caso, etiqueta_organizacion: anterior } : caso
        )
      );
      setEtiquetaError("No se pudo guardar la etiqueta. Intenta otra vez.");
    } else {
      setCasos((actuales) =>
        actuales.map((caso) =>
          caso.id === casoId ? { ...caso, etiqueta_organizacion: data.etiqueta_organizacion } : caso
        )
      );
    }
    setGuardandoEtiqueta("");
  }

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

      {/* Categorías principales */}
      <div
        className={`grid sm:grid-cols-3 gap-4 mb-7 transition-opacity ${
          buscando ? "opacity-40" : ""
        }`}
      >
        {ESTADOS_LISTA.map((estado) => {
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

      {buscando && (
        <p className="mb-3 text-sm text-[var(--ink-soft)]">
          {listaMostrada.length} resultado(s) para “{busqueda}”
        </p>
      )}

      {etiquetaError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {etiquetaError}
        </div>
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
        <div className="card divide-y divide-[var(--line)] overflow-visible">
          {listaMostrada.map((c) => {
            const est = ESTADOS[c.estado] || ESTADOS.en_espera_piezas;
            return (
            <div key={c.id} className="relative flex flex-col sm:flex-row sm:items-center hover:bg-[var(--paper)] transition-colors first:rounded-t-xl last:rounded-b-xl">
              <Link to={`/casos/${c.id}`} className="min-w-0 flex-1 px-5 pt-4 pb-2 sm:py-4">
                <p className="font-bold text-[var(--ink)]">
                  {c.marca?.nombre} {c.modelo?.nombre} {c.color ? `· ${c.color}` : ""}
                </p>
                <p className="text-sm text-[var(--ink-soft)]">
                  {c.cliente?.nombre_completo} · Placa {c.placa || "—"}
                  {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
                </p>
                <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                  Ingreso: {fechaCorta(c.fecha_ingreso) || "—"}
                  {c.numero_poliza ? ` · Póliza: ${c.numero_poliza}` : ""}
                </p>
                {citas[c.id] && (
                  <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-50 text-sky-700">
                    <Icon name="clock" className="w-3.5 h-3.5" />
                    Cita {fechaCorta(citas[c.id].fecha)}
                    {citas[c.id].hora ? ` · ${citas[c.id].hora}` : ""}
                  </p>
                )}
              </Link>
              <div className="flex items-center justify-between gap-2 px-5 pb-4 sm:py-4 sm:pl-2 sm:pr-4 shrink-0">
                <div className="flex flex-wrap items-center gap-2">
                  {buscando && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${est.chip}`}>
                      {est.short}
                    </span>
                  )}
                  {diasDesde(c.fecha_ingreso) >= 30 && c.estado !== "entregado" && (
                    <span title={`En espera desde hace ${diasDesde(c.fecha_ingreso)} días`} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">
                      <Icon name="alert" className="w-3.5 h-3.5" /> {diasDesde(c.fecha_ingreso)}d
                    </span>
                  )}
                  {casoAdmiteEtiqueta(c.estado) && (
                    <EtiquetaPicker
                      caso={c}
                      guardando={guardandoEtiqueta === c.id}
                      onSelect={(etiqueta) => actualizarEtiqueta(c.id, etiqueta)}
                    />
                  )}
                </div>
                <Link to={`/casos/${c.id}`} className="pl-2 text-[var(--brand-red)] text-xl" aria-label="Abrir caso">›</Link>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EtiquetaPicker({ caso, guardando, onSelect }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);
  const actual = etiquetaDeCaso(caso);

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (event) => {
      if (!contenedor.current?.contains(event.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  const seleccionar = (valor) => {
    setAbierto(false);
    onSelect(valor);
  };

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        disabled={guardando}
        aria-expanded={abierto}
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-bold transition-all disabled:opacity-60 ${
          actual
            ? actual.chip
            : "border-dashed border-slate-300 bg-white text-slate-500 hover:border-slate-400 hover:text-slate-700"
        }`}
      >
        <Icon name={actual?.icon || "tag"} className="w-3.5 h-3.5" />
        {guardando ? "Guardando…" : actual?.label || "Etiqueta"}
        <Icon name="chevronDown" className={`w-3.5 h-3.5 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10 sm:left-auto sm:right-0">
          <div className="px-3 pb-2 pt-1">
            <p className="text-sm font-extrabold text-[var(--ink)]">Organizar este caso</p>
            <p className="text-xs text-[var(--ink-soft)]">Elige la situación actual.</p>
          </div>
          <div className="space-y-1">
            {ETIQUETAS_CASO.map((etiqueta) => {
              const seleccionada = actual?.id === etiqueta.id;
              return (
                <button
                  type="button"
                  key={etiqueta.id}
                  onClick={() => seleccionar(etiqueta.id)}
                  className={`flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors ${etiqueta.hover}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white ${etiqueta.dot}`}>
                    <Icon name={etiqueta.icon} className="w-4.5 h-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-[var(--ink)]">{etiqueta.label}</span>
                    <span className="block text-xs text-[var(--ink-soft)]">{etiqueta.description}</span>
                  </span>
                  {seleccionada && <Icon name="check" className="h-5 w-5 shrink-0 text-emerald-600" />}
                </button>
              );
            })}
          </div>
          {actual && (
            <button
              type="button"
              onClick={() => seleccionar(null)}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border-t border-slate-100 px-3 py-2.5 text-xs font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-700"
            >
              <Icon name="close" className="h-3.5 w-3.5" /> Quitar etiqueta
            </button>
          )}
        </div>
      )}
    </div>
  );
}
