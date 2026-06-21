import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PiezasManager from "../components/PiezasManager";
import Icon from "../components/Icon";

export default function PiezasCaso() {
  const { casoId } = useParams();
  const [caso, setCaso] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("casos")
        .select(
          `placa, chasis, anio, color, numero_reclamo,
           cliente:clientes(nombre_completo),
           aseguradora:aseguradoras(nombre),
           marca:marcas(nombre), modelo:modelos(nombre)`
        )
        .eq("id", casoId)
        .single();
      if (data) {
        setCaso({
          cliente_nombre: data.cliente?.nombre_completo,
          aseguradora_nombre: data.aseguradora?.nombre,
          marca: data.marca?.nombre,
          modelo: data.modelo?.nombre,
          anio: data.anio,
          placa: data.placa,
          numero_reclamo: data.numero_reclamo,
        });
      }
      setLoading(false);
    }
    load();
  }, [casoId]);

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/piezas" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Piezas pendientes
      </Link>

      <div className="card p-6 mt-3 mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--ink)]">
            {loading
              ? "Cargando…"
              : `${caso?.marca || ""} ${caso?.modelo || ""} ${caso?.anio ? `(${caso.anio})` : ""}`.trim() ||
                "Vehículo"}
          </h1>
          {caso && (
            <p className="text-[var(--ink-soft)] mt-0.5">
              {caso.cliente_nombre}
              {caso.placa ? ` · ${caso.placa}` : ""}
              {caso.numero_reclamo ? ` · Reclamo ${caso.numero_reclamo}` : ""}
            </p>
          )}
        </div>
        <Link to={`/casos/${casoId}`} className="btn-ghost text-sm py-2 px-3 gap-1.5">
          <Icon name="file" className="w-4 h-4" /> Ver caso
        </Link>
      </div>

      <PiezasManager casoId={casoId} caso={caso} />
    </div>
  );
}
