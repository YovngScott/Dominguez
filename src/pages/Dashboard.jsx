import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import SearchBar from "../components/SearchBar";
import Icon from "../components/Icon";
import { ESTADOS } from "../lib/estados";
import { diasDesde } from "../lib/aging";

// Cada métrica: etiqueta, color y qué casos activos incluye.
const METRICAS = [
  {
    key: "espera",
    etiqueta: "En espera de piezas",
    color: "#d97706",
    icon: "package",
    filtro: (c) => !["vehiculo_en_taller", "listo_para_trabajar", "entregado"].includes(c.estado),
  },
  {
    key: "listos",
    etiqueta: "Listos para trabajar",
    color: "#059669",
    icon: "wrench",
    filtro: (c) => c.estado === "listo_para_trabajar",
  },
  {
    key: "enTaller",
    etiqueta: "Vehículos en el taller",
    color: "#0284c7",
    icon: "car",
    filtro: (c) => c.estado === "vehiculo_en_taller",
  },
];

// El orden evita que las aseguradoras más usadas queden mezcladas entre las
// demás, incluso si cambia el orden administrativo en la base de datos.
const PRIORIDAD_ASEGURADORAS = [
  /seguros\s+sura/i,
  /coop[-\s]?seguros/i,
  /atl[aá]ntica/i,
  /seguro\s+reservas/i,
  /colonial/i,
  /internacional/i,
];

function ordenarAseguradoras(lista) {
  const prioridad = (nombre = "") => {
    const indice = PRIORIDAD_ASEGURADORAS.findIndex((patron) => patron.test(nombre));
    return indice === -1 ? 99 : indice;
  };
  return [...lista].sort((a, b) =>
    prioridad(a.nombre) - prioridad(b.nombre) ||
    (Number(a.orden) || 9999) - (Number(b.orden) || 9999) ||
    String(a.nombre || "").localeCompare(String(b.nombre || ""), "es")
  );
}

export default function Dashboard() {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [conteos, setConteos] = useState({});
  const [metricas, setMetricas] = useState({ espera: 0, listos: 0, enTaller: 0 });
  const [casosActivos, setCasosActivos] = useState([]);
  const [casosPorMetrica, setCasosPorMetrica] = useState({});
  const [metricaSel, setMetricaSel] = useState(null);
  const [cargandoMetrica, setCargandoMetrica] = useState(null);
  const [resumenRapido, setResumenRapido] = useState(false);
  const [loading, setLoading] = useState(true);
  const [waEstado, setWaEstado] = useState(null); // "open" | "connecting" | "close" | ...
  const [waError, setWaError] = useState(""); // motivo técnico, para saber qué arreglar
  const [porReponer, setPorReponer] = useState([]); // insumos agotados o bajo el mínimo
  const [llavesAsignadas, setLlavesAsignadas] = useState([]);
  const [cantidadLlavesAsignadas, setCantidadLlavesAsignadas] = useState(0);

  // Insumos que hay que comprar (el módulo de almacén puede no estar aún
  // migrado: si falla, simplemente no se muestra la alerta).
  useEffect(() => {
    import("../lib/suministros")
      .then(({ listarSuministros, insumosBajoMinimo }) =>
        listarSuministros().then((s) => setPorReponer(insumosBajoMinimo(s)))
      )
      .catch(() => setPorReponer([]));
  }, []);

  // Estado de la conexión de WhatsApp (para avisar si se desvinculó).
  useEffect(() => {
    async function checkWa() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const r = await fetch("/api/whatsapp-estado", {
          headers: { Authorization: `Bearer ${session?.access_token || ""}` },
        });
        const d = await r.json();
        setWaEstado(d?.state || null);
        setWaError(d?.error || "");
      } catch {
        setWaEstado(null);
        setWaError("");
      }
    }
    checkWa();
  }, []);

  useEffect(() => {
    async function cargarLegado() {
      const { data: asegs } = await supabase
        .from("aseguradoras")
        .select("*")
        .eq("activo", true)
        .order("orden");

      const { data: casos } = await supabase
        .from("casos")
        .select(
          `id, aseguradora_id, estado, fecha_ingreso, created_at, numero_reclamo, numero_poliza, placa, numero_llave,
           aseguradora:aseguradoras(nombre),
           marca:marcas(nombre), modelo:modelos(nombre),
           cliente:clientes(nombre_completo)`
        )
        .is("archivado_en", null);

      const idsGenerales = new Set((asegs || []).filter((a) => a.es_personal).map((a) => a.id));
      const counts = {};
      const m = { espera: 0, listos: 0, enTaller: 0 };
      const activos = [];
      (casos || []).forEach((c) => {
        const estaCerrado = c.estado === "entregado";
        // La tarjeta debe coincidir con lo que aparece al entrar: solo casos
        // activos, nunca entregados ni archivados.
        if (!estaCerrado) {
          counts[c.aseguradora_id] = (counts[c.aseguradora_id] || 0) + 1;
        }
        const esGeneral = idsGenerales.has(c.aseguradora_id);
        if (esGeneral) return;
        if (estaCerrado) {
          // Los entregados no cuentan como casos operativos.
        } else if (c.estado === "vehiculo_en_taller") {
          m.enTaller += 1;
          activos.push(c);
        } else if (c.estado === "listo_para_trabajar") {
          m.listos += 1;
          activos.push(c);
        } else {
          m.espera += 1;
          activos.push(c);
        }
      });

      setAseguradoras(ordenarAseguradoras((asegs || []).filter((a) => !/dominguez\s*auto\s*pintura/i.test(a.nombre || ""))));
      setConteos(counts);
      setMetricas(m);
      setCasosActivos(activos);
      setLlavesAsignadas(activos.filter((c) => c.numero_llave));
      setCantidadLlavesAsignadas(activos.filter((c) => c.numero_llave).length);
      setLoading(false);
    }

    async function load() {
      const { data, error } = await supabase.rpc("resumen_tablero_operativo");
      const resumen = Array.isArray(data) ? data[0] : data;
      if (error || !resumen?.metricas) {
        cargarLegado();
        return;
      }

      const tarjetas = ordenarAseguradoras(resumen.aseguradoras || []);
      setAseguradoras(tarjetas);
      setConteos(Object.fromEntries(tarjetas.map((a) => [a.id, Number(a.conteo) || 0])));
      setMetricas({
        espera: Number(resumen.metricas.espera) || 0,
        listos: Number(resumen.metricas.listos) || 0,
        enTaller: Number(resumen.metricas.enTaller) || 0,
      });
      setLlavesAsignadas((resumen.llaves_preview || []).map((numero_llave) => ({ numero_llave })));
      setCantidadLlavesAsignadas(Number(resumen.llaves_asignadas) || 0);
      setResumenRapido(true);
      setLoading(false);
    }
    load();
  }, []);

  async function alternarMetrica(key) {
    if (metricaSel === key) {
      setMetricaSel(null);
      return;
    }
    setMetricaSel(key);
    if (!resumenRapido || casosPorMetrica[key]) return;

    setCargandoMetrica(key);
    const { data, error } = await supabase.rpc("casos_tablero_por_estado", { p_categoria: key });
    if (!error) {
      setCasosPorMetrica((actual) => ({
        ...actual,
        [key]: (data || []).map((c) => ({
          ...c,
          aseguradora: { nombre: c.aseguradora_nombre },
          marca: { nombre: c.marca_nombre },
          modelo: { nombre: c.modelo_nombre },
          cliente: { nombre_completo: c.cliente_nombre },
        })),
      }));
    }
    setCargandoMetrica(null);
  }

  return (
    <div>
      {/* Hero con buscador */}
      <section className="relative z-20 bg-[var(--ink)] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 text-center relative">
          <div className="absolute w-80 h-80 -top-44 left-1/2 -translate-x-1/2 rounded-full bg-[var(--brand-red)] opacity-15 blur-3xl pointer-events-none" />
          <div className="relative">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold tracking-[0.16em] text-white/75">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> PANEL OPERATIVO
            </span>
          <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
            ¿Qué caso buscas hoy?
          </h1>
          <p className="text-white/65 mt-2 mb-6">
            Encuentra los casos en proceso por placa, chasis, reclamo, vehículo o asegurado.
          </p>
          <SearchBar />
          <p className="mt-3 text-xs text-white/45">Los vehículos entregados no aparecen en esta búsqueda.</p>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Aviso de conexión de WhatsApp (solo si NO está conectado) */}
        {waEstado && waEstado !== "open" && (
          <div className="card p-4 mb-6 border-l-4 flex items-center gap-3" style={{ borderLeftColor: "#d97706" }}>
            <Icon name="whatsapp" className="w-5 h-5 text-amber-600 shrink-0" />
            <div className="text-sm">
              <p className="font-bold text-[var(--ink)]">
                {waEstado === "connecting"
                  ? "WhatsApp conectándose…"
                  : waEstado === "sin_servidor"
                  ? "Servidor de WhatsApp no disponible"
                  : waEstado === "sesion_muerta"
                  ? "WhatsApp se desvinculó del teléfono"
                  : "WhatsApp desconectado"}
              </p>
              <p className="text-[var(--ink-soft)]">
                {waEstado === "connecting"
                  ? "Espera unos segundos y recarga."
                  : waEstado === "sin_servidor"
                  ? "La dirección del servidor ya no responde; no sirve escanear el QR hasta volver a desplegarlo."
                  : waEstado === "sesion_muerta"
                  ? "Alguien quitó el dispositivo desde WhatsApp del taller. Vuelve a vincularlo desde Mensajes → Conectar WhatsApp."
                  : "No se enviarán las confirmaciones de citas hasta volver a vincular el teléfono."}
              </p>
              {waError && (
                <p className="text-xs text-[var(--ink-soft)] mt-1.5 opacity-80">Detalle: {waError}</p>
              )}
            </div>
          </div>
        )}

        {/* Alerta de reposición del almacén */}
        {porReponer.length > 0 && (
          <Link
            to="/suministros"
            className="card p-4 mb-6 border-l-4 flex items-start gap-3 hover:shadow-md transition-shadow"
            style={{ borderLeftColor: "#d97706" }}
          >
            <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Icon name="package" className="w-5 h-5" />
            </span>
            <div className="min-w-0 text-sm">
              <p className="font-bold text-[var(--ink)]">
                Hay que reponer {porReponer.length} insumo{porReponer.length === 1 ? "" : "s"} del almacén
              </p>
              <p className="text-[var(--ink-soft)] truncate">
                {porReponer
                  .slice(0, 4)
                  .map((s) => `${s.nombre} (${Number(s.stock) <= 0 ? "agotado" : Number(s.stock)})`)
                  .join(" · ")}
                {porReponer.length > 4 ? ` y ${porReponer.length - 4} más…` : ""}
              </p>
            </div>
          </Link>
        )}

        {/* Métricas (botones): al pulsar se despliega la lista de casos */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {METRICAS.map((mt) => (
            <Metrica
              key={mt.key}
              valor={metricas[mt.key]}
              etiqueta={mt.etiqueta}
              color={mt.color}
              icon={mt.icon}
              activa={metricaSel === mt.key}
              onClick={() => alternarMetrica(mt.key)}
            />
          ))}
        </div>

        <Link to="/llaves" className="card p-4 mb-6 border-l-4 flex items-center gap-3 hover:shadow-md transition-shadow" style={{ borderLeftColor: "#d97706" }}>
          <span className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Icon name="key" className="w-6 h-6" /></span>
          <div className="min-w-0 flex-1"><p className="font-bold text-[var(--ink)]">Llaves en uso</p><p className="text-sm text-[var(--ink-soft)] truncate">{cantidadLlavesAsignadas} de 64 asignadas{cantidadLlavesAsignadas ? ` · ${llavesAsignadas.slice(0, 6).map((c) => `#${c.numero_llave}`).join(", ")}${cantidadLlavesAsignadas > 6 ? "…" : ""}` : " · Todas disponibles"}</p></div>
          <span className="text-sm font-bold text-[var(--brand-red)]">Ver mapa</span>
        </Link>

        {/* Lista de la métrica seleccionada (deslizable) */}
        {metricaSel && (() => {
          const mt = METRICAS.find((m) => m.key === metricaSel);
          // La antigüedad se ve inmediatamente en la lista: primero los
          // ingresos más viejos, para que la prioridad sea evidente.
          const lista = resumenRapido
            ? (casosPorMetrica[mt.key] || [])
            : [...casosActivos]
                .filter(mt.filtro)
                .sort((a, b) => new Date(a.fecha_ingreso || a.created_at) - new Date(b.fecha_ingreso || b.created_at));
          const cargandoLista = resumenRapido && cargandoMetrica === mt.key;
          return (
            <div className="card p-5 mb-10">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: mt.color }} />
                <h2 className="text-lg font-bold text-[var(--ink)]">{mt.etiqueta}</h2>
                <span className="text-xs font-semibold text-[var(--ink-soft)] bg-[var(--paper)] px-2 py-0.5 rounded-full">
                  {lista.length}
                </span>
                <button
                  onClick={() => setMetricaSel(null)}
                  className="ml-auto text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
                  aria-label="Cerrar"
                >
                  <Icon name="close" className="w-5 h-5" />
                </button>
              </div>
              {cargandoLista ? (
                <p className="text-sm text-[var(--ink-soft)] py-2">Cargando casos…</p>
              ) : lista.length === 0 ? (
                <p className="text-sm text-[var(--ink-soft)] py-2">No hay casos en esta categoría.</p>
              ) : (
                <div className="divide-y divide-[var(--line)] max-h-80 overflow-y-auto">
                  {lista.map((c) => (
                    <CasoRow key={c.id} c={c} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--ink)]">Aseguradoras</h2>
            <p className="text-sm text-[var(--ink-soft)]">
              Selecciona una para ver sus casos.
            </p>
          </div>
          <Link to="/casos/nuevo" className="btn-primary">
            <span className="text-lg leading-none">+</span> Nuevo caso
          </Link>
        </div>

        {loading ? (
          <p className="text-[var(--ink-soft)]">Cargando…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
            {aseguradoras.map((a) => (
              <Link
                key={a.id}
                to={`/aseguradoras/${a.id}`}
                className="group card p-6 flex flex-col items-center gap-3 hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--brand-red)] transition-all"
              >
                <div
                  className={`w-20 h-20 rounded-2xl flex items-center justify-center overflow-hidden ${
                    a.es_personal ? "bg-[var(--brand-red-50)]" : "bg-[var(--paper)]"
                  }`}
                >
                  {a.logo_url ? (
                    <img
                      src={a.logo_url}
                      alt={a.nombre}
                      className="w-full h-full object-contain p-2"
                    />
                  ) : (
                    <span
                      className="text-3xl font-extrabold"
                      style={{
                        color: a.es_personal ? "var(--brand-red)" : "var(--ink)",
                      }}
                    >
                      {a.nombre.charAt(0)}
                    </span>
                  )}
                </div>
                <p className="font-bold text-[var(--ink)] text-center group-hover:text-[var(--brand-red)]">
                  {a.nombre}
                </p>
                <span className="text-xs font-medium text-[var(--ink-soft)] bg-[var(--paper)] px-2.5 py-1 rounded-full">
                  {conteos[a.id] || 0} caso(s)
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Metrica({ valor, etiqueta, color, icon, activa, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg ${
        activa ? "ring-2 ring-[var(--brand-red)] border-[var(--brand-red)]" : "hover:border-[var(--brand-red)]"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl font-extrabold" style={{ color }}>
            {valor}
          </p>
          <p className="text-sm font-semibold text-[var(--ink)] mt-1">{etiqueta}</p>
        </div>
        <span className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ color, backgroundColor: `${color}14` }}>
          <Icon name={icon} className="w-5 h-5" />
        </span>
      </div>
      <p className="text-xs text-[var(--ink-soft)] mt-3">Toca para ver los casos</p>
    </button>
  );
}

function CasoRow({ c }) {
  const est = ESTADOS[c.estado];
  return (
    <Link
      to={`/casos/${c.id}`}
      className="flex items-center justify-between gap-3 py-2.5 hover:bg-[var(--paper)] px-2 rounded-lg"
    >
      <div className="min-w-0">
        <p className="font-semibold text-[var(--ink)] truncate">
          {[c.marca?.nombre, c.modelo?.nombre].filter(Boolean).join(" ") || "Vehículo"}
          {c.placa ? ` · ${c.placa}` : ""}
        </p>
        <p className="text-xs text-[var(--ink-soft)] truncate">
          {c.aseguradora?.nombre}
          {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
        </p>
        <p className="text-xs text-[var(--ink-soft)] truncate">
          Ingreso: {c.fecha_ingreso ? new Date(`${c.fecha_ingreso}T00:00:00`).toLocaleDateString("es-DO") : "—"}
          {c.numero_poliza ? ` · Póliza: ${c.numero_poliza}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {diasDesde(c.fecha_ingreso) >= 30 && (
          <span title={`En espera desde hace ${diasDesde(c.fecha_ingreso)} días`} className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700"><Icon name="alert" className="w-3.5 h-3.5" /> {diasDesde(c.fecha_ingreso)}d</span>
        )}
        {est && <span className={`text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${est.chip}`}>{est.short}</span>}
      </div>
    </Link>
  );
}
