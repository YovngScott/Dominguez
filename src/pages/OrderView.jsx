import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import { obtenerFirmaClienteUrl } from "../lib/firmaCliente";

function ddmmaaaa(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export default function OrderView() {
  const { ordenId } = useParams();
  const navigate = useNavigate();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("ordenes_reparacion").select("*").eq("id", ordenId).single();
      setOrden(data);
      setLoading(false);
    }
    load();
  }, [ordenId]);

  async function imprimir() {
    setGenerando(true);
    const { generarPdfOrden } = await import("../lib/ordenPdf");
    const firmaClienteUrl = await obtenerFirmaClienteUrl(orden.caso_id);
    const blob = await generarPdfOrden({
      ...orden,
      fecha: ddmmaaaa(orden.fecha),
      firma_cliente_url: firmaClienteUrl,
    });
    window.open(URL.createObjectURL(blob), "_blank");
    setGenerando(false);
  }

  async function eliminar() {
    if (!confirm("¿Eliminar este recibo? Esta acción no se puede deshacer.")) return;
    setEliminando(true);
    await supabase.from("ordenes_reparacion").delete().eq("id", ordenId);
    navigate("/ordenes");
  }

  if (loading) return <p className="p-10 text-center text-[var(--ink-soft)]">Cargando…</p>;
  if (!orden) return <p className="p-10 text-center text-[var(--ink-soft)]">Recibo no encontrado.</p>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/ordenes" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Recibos
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Recibo No. {orden.numero}</h1>
          <p className="text-[var(--ink-soft)]">{orden.cliente}</p>
        </div>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">
          {orden.caso_id && (
            <Link
              to={`/casos/${orden.caso_id}`}
              className="btn-ghost justify-center px-3"
            >
              Ver caso
            </Link>
          )}
          <Link
            to={`/ordenes/${orden.id}/editar`}
            className="btn-ghost justify-center gap-1.5 px-3"
          >
            <Icon name="pencil" className="w-4 h-4" /> Editar
          </Link>
          <button
            onClick={eliminar}
            disabled={eliminando}
            className="btn-ghost justify-center gap-1.5 px-3 !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
          >
            <Icon name="trash" className="w-4 h-4" /> {eliminando ? "Eliminando…" : "Eliminar"}
          </button>
          <button
            onClick={imprimir}
            disabled={generando}
            className="btn-primary justify-center gap-1.5 px-3 col-span-2 sm:col-span-1"
          >
            <Icon name="printer" className="w-4 h-4" />
            {generando ? "Generando…" : "Imprimir / PDF"}
          </button>
        </div>
      </div>

      <div className="card p-6 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <Dato k="Fecha" v={ddmmaaaa(orden.fecha)} />
        <Dato k="Vehículo" v={[orden.marca, orden.modelo, orden.anio].filter(Boolean).join(" ")} />
        <Dato k="Placa" v={orden.placa} />
        <Dato k="Chasis" v={orden.chasis} />
        <Dato k="Aseguradora" v={orden.cia_seguro} />
        <Dato k="Combustible" v={orden.tipo_combustible} />
        <Dato k="Costo" v={orden.costo ? `RD$ ${orden.costo}` : "—"} />
        <Dato k="Teléfono" v={orden.tel} />
      </div>
    </div>
  );
}

function Dato({ k, v }) {
  return (
    <div className="flex justify-between border-b border-[var(--line)] py-1.5">
      <span className="text-[var(--ink-soft)]">{k}</span>
      <span className="font-semibold text-[var(--ink)] text-right">{v || "—"}</span>
    </div>
  );
}
