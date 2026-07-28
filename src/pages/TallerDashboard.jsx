import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import SearchBar from "../components/SearchBar";
import Icon from "../components/Icon";

const rolLabel = (rol) => ({ administrativo_general: "Administrativo General", administracion_taller: "Administración de Taller" }[rol] || "Trabajador");

export default function TallerDashboard() {
  const [trabajadores, setTrabajadores] = useState([]);
  const [conteos, setConteos] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function cargar() {
    setError("");
    const [personal, asignaciones] = await Promise.all([
      supabase.from("trabajadores_taller").select("*").order("nombre_completo"),
      supabase.from("casos_trabajadores").select("trabajador_id, estado, caso:casos(estado)"),
    ]);
    if (personal.error || asignaciones.error) {
      setError("Falta activar la migración de usuarios y taller en Supabase.");
      setLoading(false);
      return;
    }
    const activos = {};
    (asignaciones.data || []).forEach((a) => {
      if (a.estado === "asignado" && a.caso?.estado !== "entregado") activos[a.trabajador_id] = (activos[a.trabajador_id] || 0) + 1;
    });
    setTrabajadores(personal.data || []);
    setConteos(activos);
    setLoading(false);
  }

  useEffect(() => {
    cargar();
    const canal = supabase.channel("taller-asignaciones")
      .on("postgres_changes", { event: "*", schema: "public", table: "casos_trabajadores" }, cargar)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "casos" }, cargar)
      .subscribe();
    return () => supabase.removeChannel(canal);
  }, []);

  return (
    <div>
      <section className="bg-[var(--ink)] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 text-center">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-white/70"><Icon name="wrench" className="w-4 h-4" /> Administración de taller</span>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mt-2">Control del personal y vehículos</h1>
          <p className="text-white/60 mt-2 mb-6">Busca cualquier vehículo o entra al operario para asignarle sus trabajos.</p>
          <SearchBar />
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-9">
        <div className="flex items-end justify-between gap-3 mb-6">
          <div>
            <h2 className="text-xl font-bold text-[var(--ink)]">Personal del taller</h2>
            <p className="text-sm text-[var(--ink-soft)]">Selecciona un trabajador para ver y asignar sus casos.</p>
          </div>
          <span className="text-sm font-semibold px-3 py-1.5 rounded-full bg-[var(--surface-2)] text-[var(--ink-soft)]">{trabajadores.length} trabajador(es)</span>
        </div>

        {error ? (
          <div className="card p-6 text-center text-[var(--brand-red)]">{error}</div>
        ) : loading ? (
          <p className="text-[var(--ink-soft)]">Cargando personal…</p>
        ) : trabajadores.length === 0 ? (
          <div className="card p-10 text-center">
            <Icon name="user" className="w-9 h-9 mx-auto text-[var(--ink-soft)]" />
            <p className="mt-3 font-bold text-[var(--ink)]">Aún no hay trabajadores registrados</p>
            <p className="text-sm text-[var(--ink-soft)] mt-1">El administrador puede crearlos desde el menú Usuarios.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trabajadores.map((t) => {
              const n = conteos[t.user_id] || 0;
              return (
                <Link key={t.user_id} to={`/taller/trabajadores/${t.user_id}`} className="group card p-6 hover:-translate-y-0.5 hover:shadow-lg hover:border-[var(--brand-red)] transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <span className="w-12 h-12 rounded-2xl bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center"><Icon name="user" className="w-6 h-6" /></span>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${n ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>{n} activo{n === 1 ? "" : "s"}</span>
                  </div>
                  <p className="mt-5 font-extrabold text-lg text-[var(--ink)] group-hover:text-[var(--brand-red)]">{t.nombre_completo}</p>
                  <p className="text-sm text-[var(--ink-soft)] mt-1">{rolLabel(t.rol)}</p>
                  <div className="mt-5 pt-4 border-t border-[var(--line)] flex items-center justify-between text-sm font-semibold text-[var(--ink-soft)]"><span>Ver trabajos</span><span className="text-[var(--brand-red)] text-lg">›</span></div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
