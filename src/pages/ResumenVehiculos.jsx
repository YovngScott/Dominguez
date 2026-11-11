import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import ResumenOperativo from "../components/ResumenOperativo";

export default function ResumenVehiculos() {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let activo = true;
    async function cargar() {
      const { data, error: err } = await supabase.from("aseguradoras")
        .select("id, nombre").eq("activo", true).order("orden");
      if (!activo) return;
      if (err) { setError("No se pudieron cargar las aseguradoras. Actualiza la página para reintentar."); return; }
      setAseguradoras((data || []).filter((a) => !/dominguez\s*auto\s*pintura/i.test(a.nombre || "")));
    }
    cargar();
    return () => { activo = false; };
  }, []);

  return <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
    <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)] mb-2">Resumen de vehículos pendientes</h1>
    <p className="text-sm text-[var(--ink-soft)] mb-6">Consulta los vehículos listos o en espera y descarga el resumen por aseguradora en PDF.</p>
    {error ? <p role="alert" className="text-red-600">{error}</p> : <ResumenOperativo aseguradoras={aseguradoras} />}
  </div>;
}
