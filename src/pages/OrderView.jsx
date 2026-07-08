import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import SignaturePad from "../components/SignaturePad";
import { obtenerFirmaClienteUrl } from "../lib/firmaCliente";

function ddmmaaaa(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function blobADataUrl(blob) {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onloadend = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

export default function OrderView() {
  const { ordenId } = useParams();
  const navigate = useNavigate();
  const [orden, setOrden] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generando, setGenerando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [firmando, setFirmando] = useState(false);
  const [guardandoFirma, setGuardandoFirma] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("ordenes_reparacion").select("*").eq("id", ordenId).single();
      setOrden(data);
      setLoading(false);
    }
    load();
  }, [ordenId]);

  // Genera el PDF (con la firma dada, o la del recibo/caso) y lo abre.
  async function generarEImprimir(firmaUrl) {
    setGenerando(true);
    try {
      const { generarPdfOrden } = await import("../lib/ordenPdf");
      const firma = firmaUrl || orden.firma_cliente_url || (await obtenerFirmaClienteUrl(orden.caso_id));
      const blob = await generarPdfOrden({
        ...orden,
        fecha: ddmmaaaa(orden.fecha),
        firma_cliente_url: firma,
      });
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setGenerando(false);
    }
  }

  // Botón "Imprimir": si aún no hay firma, pide firmar primero.
  function imprimir() {
    if (orden.firma_cliente_url) generarEImprimir();
    else setFirmando(true);
  }

  // El cliente firmó: guarda la firma en el recibo y luego imprime.
  async function onFirmaConfirm(blob) {
    setGuardandoFirma(true);
    try {
      const dataUrl = await blobADataUrl(blob);
      await supabase.from("ordenes_reparacion").update({ firma_cliente_url: dataUrl }).eq("id", ordenId);
      setOrden((o) => ({ ...o, firma_cliente_url: dataUrl }));
      setFirmando(false);
      await generarEImprimir(dataUrl);
    } finally {
      setGuardandoFirma(false);
    }
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
            {generando ? "Generando…" : orden.firma_cliente_url ? "Imprimir / PDF" : "Firmar e imprimir"}
          </button>
        </div>
      </div>

      {orden.firma_cliente_url && (
        <div className="flex items-center gap-2 -mt-3 mb-5 text-sm text-emerald-600">
          <Icon name="check" className="w-4 h-4" /> Recibo firmado por el cliente.
          <button onClick={() => setFirmando(true)} className="text-[var(--ink-soft)] underline hover:text-[var(--brand-red)]">
            Volver a firmar
          </button>
        </div>
      )}

      {firmando && (
        <SignaturePad
          titulo="Firma del cliente"
          descripcion="El cliente firma aquí para el recibo. Luego se genera el PDF con la firma."
          confirmLabel="Firmar e imprimir"
          submitting={guardandoFirma}
          onConfirm={onFirmaConfirm}
          onCancel={() => setFirmando(false)}
        />
      )}

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
