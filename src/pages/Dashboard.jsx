import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import SearchBar from "../components/SearchBar";

export default function Dashboard() {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [conteos, setConteos] = useState({});
  const [metricas, setMetricas] = useState({ espera: 0, listos: 0, entregadosMes: 0, activos: 0 });
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
        .select("aseguradora_id, estado, fecha_entrega");

      const counts = {};
      const m = { espera: 0, listos: 0, entregadosMes: 0, activos: 0 };
      const ahora = new Date();
      (casos || []).forEach((c) => {
        counts[c.aseguradora_id] = (counts[c.aseguradora_id] || 0) + 1;
        if (c.estado === "entregado") {
          const f = c.fecha_entrega ? new Date(c.fecha_entrega) : null;
          if (f && f.getMonth() === ahora.getMonth() && f.getFullYear() === ahora.getFullYear()) {
            m.entregadosMes += 1;
          }
        } else if (c.estado === "listo_para_trabajar") {
          m.listos += 1;
          m.activos += 1;
        } else {
          m.espera += 1;
          m.activos += 1;
        }
      });

      setAseguradoras(asegs || []);
      setConteos(counts);
      setMetricas(m);
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
          <Metrica valor={metricas.entregadosMes} etiqueta="Entregados este mes" color="var(--brand-red)" />
        </div>

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
