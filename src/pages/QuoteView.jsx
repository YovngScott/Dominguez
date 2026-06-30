import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { calcularItem, nombrePieza, rd } from "../lib/cotizacion";
import Icon from "../components/Icon";
import EnviarCorreoModal from "../components/EnviarCorreoModal";

export default function QuoteView() {
  const { cotId } = useParams();
  const navigate = useNavigate();
  const [cot, setCot] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [evidencias, setEvidencias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eliminando, setEliminando] = useState(false);
  const [enviarCorreoOpen, setEnviarCorreoOpen] = useState(false);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("cotizaciones").select("*").eq("id", cotId).single();
      setCot(data);
      setLoading(false);

      if (data?.pdf_path) {
        const { data: s } = await supabase.storage.from("cotizaciones").createSignedUrl(data.pdf_path, 3600);
        setPdfUrl(s?.signedUrl || null);
      }
      const { data: evs } = await supabase
        .from("cotizacion_evidencias")
        .select("storage_path")
        .eq("cotizacion_id", cotId);
      const urls = await Promise.all(
        (evs || []).map(async (e) => {
          const { data: s } = await supabase.storage.from("cotizaciones").createSignedUrl(e.storage_path, 3600);
          return s?.signedUrl;
        })
      );
      setEvidencias(urls.filter(Boolean));
    }
    load();
  }, [cotId]);

  async function eliminar() {
    if (!confirm("¿Eliminar esta cotización? Se borrará también su PDF y evidencias. Esta acción no se puede deshacer.")) {
      return;
    }
    setEliminando(true);
    const { data: evs } = await supabase
      .from("cotizacion_evidencias")
      .select("storage_path")
      .eq("cotizacion_id", cotId);
    const paths = (evs || []).map((e) => e.storage_path);
    if (cot.pdf_path) paths.push(cot.pdf_path);
    if (paths.length) await supabase.storage.from("cotizaciones").remove(paths);

    await supabase.from("cotizacion_evidencias").delete().eq("cotizacion_id", cotId);
    await supabase.from("cotizaciones").delete().eq("id", cotId);
    navigate("/cotizaciones");
  }

  if (loading) return <p className="p-10 text-center text-[var(--ink-soft)]">Cargando…</p>;
  if (!cot) return <p className="p-10 text-center text-[var(--ink-soft)]">Cotización no encontrada.</p>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/cotizaciones" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Cotizaciones
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">{cot.numero}</h1>
          <p className="text-[var(--ink-soft)]">{cot.cliente_nombre}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/cotizaciones/${cot.id}/editar`} className="btn-ghost gap-1.5">
            <Icon name="pencil" className="w-4 h-4" /> Editar
          </Link>
          <button
            onClick={eliminar}
            disabled={eliminando}
            className="btn-ghost gap-1.5 !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
          >
            <Icon name="trash" className="w-4 h-4" /> {eliminando ? "Eliminando…" : "Eliminar"}
          </button>
          <button onClick={() => setEnviarCorreoOpen(true)} className="btn-ghost gap-1.5">
            <Icon name="receipt" className="w-4 h-4" /> Enviar por correo
          </button>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="btn-primary gap-1.5">
              <Icon name="file" className="w-4 h-4" /> Ver / Descargar PDF
            </a>
          )}
        </div>
      </div>

      {enviarCorreoOpen && (
        <EnviarCorreoModal
          cot={cot}
          pdfUrl={pdfUrl}
          evidencias={evidencias}
          onClose={() => setEnviarCorreoOpen(false)}
        />
      )}

      {cot.caso_id && (
        <div className="card p-4 mb-5 bg-[var(--brand-red-50)] border-[var(--brand-red)]">
          <p className="text-sm text-[var(--ink)] flex items-center gap-1.5">
            <Icon name="link" className="w-4 h-4 text-[var(--brand-red)]" />
            Esta cotización está enlazada a un caso por el chasis.{" "}
            <Link to={`/casos/${cot.caso_id}`} className="font-semibold text-[var(--brand-red)] underline">
              Ver caso
            </Link>
          </p>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-5">
        <Bloque titulo="Cliente" lineas={[
          cot.cliente_nombre,
          cot.tipo_identificacion && cot.identificacion ? `${cot.tipo_identificacion}: ${cot.identificacion}` : null,
          (cot.telefonos || []).join(" / "),
          cot.cliente_email,
        ]} />
        <Bloque titulo="Vehículo" lineas={[
          [cot.marca, cot.modelo, cot.anio].filter(Boolean).join(" "),
          [cot.tipo_vehiculo, cot.color].filter(Boolean).join(" · "),
          cot.placa ? `Placa: ${cot.placa}` : null,
          cot.chasis ? `Chasis: ${cot.chasis}` : null,
        ]} />
        <Bloque titulo="Seguro" lineas={[
          cot.aseguradora_nombre,
          cot.numero_reclamo ? `Reclamo: ${cot.numero_reclamo}` : null,
          cot.numero_poliza ? `Póliza: ${cot.numero_poliza}` : null,
        ]} />
      </div>

      <Tabla titulo="Valoración de piezas" items={cot.items_piezas} esPieza />
      <Tabla titulo="Valoración de mano de obra" items={cot.items_mano_obra} />

      <div className="flex justify-end mb-6">
        <div className="card p-5 w-full sm:w-72">
          <Linea label="Subtotal" valor={rd(cot.subtotal)} />
          <Linea label="ITBIS" valor={rd(cot.itbis)} />
          <div className="border-t border-[var(--line)] my-2" />
          <Linea label="TOTAL" valor={rd(cot.total)} fuerte />
        </div>
      </div>

      {evidencias.length > 0 && (
        <div className="card p-6">
          <h2 className="font-bold text-[var(--ink)] mb-3">Evidencias</h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {evidencias.map((u, i) => (
              <a key={i} href={u} target="_blank" rel="noreferrer">
                <img src={u} alt="" className="w-full aspect-square object-cover rounded-lg" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Tabla({ titulo, items, esPieza }) {
  if (!items?.length) return null;
  return (
    <div className="card p-6 mb-5">
      <h2 className="font-bold text-[var(--ink)] mb-3">{titulo}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--ink-soft)] border-b border-[var(--line)]">
              <th className="py-2 pr-2">#</th>
              <th className="py-2 pr-2">{esPieza ? "Pieza" : "Descripción"}</th>
              <th className="py-2 pr-2">Cant.</th>
              <th className="py-2 pr-2">Precio</th>
              <th className="py-2 pr-2">ITBIS</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const c = calcularItem(it);
              const desc = esPieza
                ? nombrePieza(it)
                : it.pieza
                ? `${it.nombre} · ${nombrePieza({ ...it, nombre: it.pieza })}`
                : it.nombre;
              return (
                <tr key={i} className="border-b border-[var(--line)] last:border-0">
                  <td className="py-2 pr-2">{i + 1}</td>
                  <td className="py-2 pr-2">{desc}</td>
                  <td className="py-2 pr-2">{it.cantidad}</td>
                  <td className="py-2 pr-2">{rd(it.precio)}</td>
                  <td className="py-2 pr-2">{rd(c.itbisMonto)}</td>
                  <td className="py-2">{rd(c.total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Bloque({ titulo, lineas }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-red)] mb-1">{titulo}</p>
      {lineas.filter(Boolean).map((l, i) => (
        <p key={i} className="text-sm text-[var(--ink)]">{l}</p>
      ))}
    </div>
  );
}

function Linea({ label, valor, fuerte }) {
  return (
    <div className="flex justify-between items-baseline py-1">
      <span className={fuerte ? "font-bold text-[var(--ink)]" : "text-sm text-[var(--ink-soft)]"}>{label}</span>
      <span className={fuerte ? "text-lg font-extrabold text-[var(--brand-red)]" : "text-sm font-semibold text-[var(--ink)]"}>{valor}</span>
    </div>
  );
}
