import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import SearchBar from "../components/SearchBar";
import Icon from "../components/Icon";
import { ESTADOS } from "../lib/estados";
import { diasDesde, nivelAlerta, COLOR_NIVEL } from "../lib/aging";

export default function Dashboard() {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [conteos, setConteos] = useState({});
  const [metricas, setMetricas] = useState({ espera: 0, listos: 0, enTaller: 0, activos: 0 });
  const [estancados, setEstancados] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: asegs } = await supabase
        .from("aseguradoras")
        .select("*")
        .eq("activo", true)
        .order("orden");

      const { data: casos } = await supabase
        .from("casos")
        .select(
          `id, aseguradora_id, estado, fecha_ingreso, created_at, numero_reclamo, placa,
           aseguradora:aseguradoras(nombre),
           marca:marcas(nombre), modelo:modelos(nombre),
           cliente:clientes(nombre_completo)`
        );

      const counts = {};
      const m = { espera: 0, listos: 0, enTaller: 0, activos: 0 };
      const activos = [];
      (casos || []).forEach((c) => {
        counts[c.aseguradora_id] = (counts[c.aseguradora_id] || 0) + 1;
        if (c.estado === "entregado") {
          // los entregados no cuentan como casos activos
        } else if (c.estado === "vehiculo_en_taller") {
          m.enTaller += 1;
          m.activos += 1;
          activos.push(c);
        } else if (c.estado === "listo_para_trabajar") {
          m.listos += 1;
          m.activos += 1;
          activos.push(c);
        } else {
          m.espera += 1;
          m.activos += 1;
          activos.push(c);
        }
      });

      // Antigüedad: cuándo entró cada caso a su estado actual (último cambio en
      // el historial); si no hay, su fecha de ingreso.
      const ids = activos.map((c) => c.id);
      let desdePorCaso = {};
      if (ids.length) {
        const { data: hist } = await supabase
          .from("historial_caso")
          .select("caso_id, created_at")
          .in("caso_id", ids)
          .order("created_at", { ascending: false });
        (hist || []).forEach((h) => {
          if (!desdePorCaso[h.caso_id]) desdePorCaso[h.caso_id] = h.created_at;
        });
      }

      const conAlerta = activos
        .map((c) => {
          const desde = desdePorCaso[c.id] || c.fecha_ingreso || c.created_at;
          const dias = diasDesde(desde);
          return { ...c, dias, nivel: nivelAlerta(c.estado, dias) };
        })
        .filter((c) => c.nivel !== "ok")
        .sort((a, b) => b.dias - a.dias);

      setAseguradoras(asegs || []);
      setConteos(counts);
      setMetricas(m);
      setEstancados(conAlerta);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <div>
      {/* Hero con buscador */}
      <section className="bg-[var(--ink)] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 text-center relative">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
            ¿Qué caso buscas hoy?
          </h1>
          <p className="text-white/60 mt-2 mb-7">
            Busca por placa, chasis, número de reclamo o nombre del asegurado.
          </p>
          <SearchBar />
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
        {/* Métricas */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <Metrica valor={metricas.activos} etiqueta="Casos activos" color="var(--ink)" />
          <Metrica valor={metricas.espera} etiqueta="En espera de piezas" color="#d97706" />
          <Metrica valor={metricas.listos} etiqueta="Listos para trabajar" color="#059669" />
          <Metrica valor={metricas.enTaller} etiqueta="Vehículos en el taller" color="#0284c7" />
        </div>

        {/* Alertas de casos estancados */}
        {!loading && estancados.length > 0 && (
          <div className="card p-5 mb-10 border-l-4" style={{ borderLeftColor: "#dc2626" }}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="clock" className="w-5 h-5 text-[var(--brand-red)]" />
              <h2 className="text-lg font-bold text-[var(--ink)]">Casos que requieren atención</h2>
              <span className="text-xs font-semibold text-[var(--ink-soft)] bg-[var(--paper)] px-2 py-0.5 rounded-full">
                {estancados.length}
              </span>
            </div>
            <div className="divide-y divide-[var(--line)]">
              {estancados.map((c) => {
                const est = ESTADOS[c.estado];
                const col = COLOR_NIVEL[c.nivel];
                return (
                  <Link
                    key={c.id}
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
                        {est ? ` · ${est.label}` : ""}
                        {c.numero_reclamo ? ` · Reclamo ${c.numero_reclamo}` : ""}
                      </p>
                    </div>
                    <span
                      className="text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap inline-flex items-center gap-1.5"
                      style={{ backgroundColor: col.bg, color: col.text }}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: col.dot }} />
                      {c.dias} día{c.dias === 1 ? "" : "s"}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

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

function Metrica({ valor, etiqueta, color }) {
  return (
    <div className="card p-5">
      <p className="text-3xl font-extrabold" style={{ color }}>
        {valor}
      </p>
      <p className="text-sm text-[var(--ink-soft)] mt-1">{etiqueta}</p>
    </div>
  );
}
