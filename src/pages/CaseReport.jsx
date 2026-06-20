import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Logo from "../components/Logo";
import Icon from "../components/Icon";
import { ESTADOS } from "../lib/estados";

function fecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-DO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function CaseReport() {
  const { casoId } = useParams();
  const [caso, setCaso] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [firmaUrl, setFirmaUrl] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("casos")
        .select(
          `*, cliente:clientes(*), aseguradora:aseguradoras(*),
           marca:marcas(nombre), modelo:modelos(nombre)`
        )
        .eq("id", casoId)
        .single();
      setCaso(data);

      const { data: fotosData } = await supabase
        .from("fotos_caso")
        .select("id, storage_path, categoria:categorias_foto(nombre)")
        .eq("caso_id", casoId)
        .order("uploaded_at");

      const conUrls = await Promise.all(
        (fotosData || []).map(async (f) => {
          const { data: s } = await supabase.storage
            .from("fotos-casos")
            .createSignedUrl(f.storage_path, 3600);
          return { ...f, url: s?.signedUrl };
        })
      );
      setFotos(conUrls);

      if (data?.firma_entrega_url) {
        const { data: s } = await supabase.storage
          .from("fotos-casos")
          .createSignedUrl(data.firma_entrega_url, 3600);
        setFirmaUrl(s?.signedUrl || null);
      }
      setLoading(false);
    }
    load();
  }, [casoId]);

  // Imprime automáticamente cuando todo está cargado (las imágenes alcanzan a renderizar)
  useEffect(() => {
    if (!loading && caso) {
      const t = setTimeout(() => window.print(), 800);
      return () => clearTimeout(t);
    }
  }, [loading, caso]);

  if (loading) return <p className="p-10 text-center text-[var(--ink-soft)]">Preparando reporte…</p>;
  if (!caso) return <p className="p-10 text-center text-[var(--ink-soft)]">Caso no encontrado.</p>;

  const est = ESTADOS[caso.estado];

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white text-[var(--ink)]">
      {/* Barra de acciones (no se imprime) */}
      <div className="flex justify-between items-center mb-6 print:hidden">
        <Link to={`/casos/${casoId}`} className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
          ← Volver al caso
        </Link>
        <button onClick={() => window.print()} className="btn-primary gap-1.5">
          <Icon name="printer" className="w-4 h-4" /> Imprimir / Guardar PDF
        </button>
      </div>

      {/* Encabezado */}
      <div className="flex items-center justify-between border-b-2 border-[var(--brand-red)] pb-4">
        <Logo size={48} />
        <div className="text-right">
          <p className="font-bold text-lg">Reporte de caso</p>
          <p className="text-sm text-[var(--ink-soft)]">Generado el {fecha(new Date().toISOString())}</p>
        </div>
      </div>

      {/* Datos */}
      <h1 className="text-2xl font-extrabold mt-6">
        {caso.marca?.nombre} {caso.modelo?.nombre} {caso.anio ? `(${caso.anio})` : ""}
      </h1>
      <p className="text-[var(--ink-soft)]">
        Estado: {est?.label || caso.estado}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5 text-sm">
        <Dato label="Asegurado" value={caso.cliente?.nombre_completo} />
        <Dato label="Documento" value={caso.cliente?.documento_identidad} />
        <Dato label="Teléfono" value={caso.cliente?.telefono} />
        <Dato label="Aseguradora" value={caso.aseguradora?.nombre} />
        <Dato label="N° Reclamo" value={caso.numero_reclamo} />
        <Dato label="N° Póliza" value={caso.numero_poliza} />
        <Dato label="Placa" value={caso.placa} />
        <Dato label="Chasis" value={caso.chasis} />
        <Dato label="Color" value={caso.color} />
        <Dato label="Fecha de ingreso" value={fecha(caso.fecha_ingreso)} />
      </div>

      {caso.notas && (
        <div className="mt-4 text-sm">
          <p className="font-semibold">Notas</p>
          <p className="text-[var(--ink-soft)]">{caso.notas}</p>
        </div>
      )}

      {/* Fotos */}
      {fotos.length > 0 && (
        <div className="mt-8">
          <h2 className="font-bold border-b border-[var(--line)] pb-1 mb-3">
            Evidencia fotográfica ({fotos.length})
          </h2>
          <div className="grid grid-cols-3 gap-2">
            {fotos.map((f) => (
              <div key={f.id} className="break-inside-avoid">
                <img src={f.url} alt="" className="w-full aspect-square object-cover rounded-md" />
                <p className="text-[10px] text-[var(--ink-soft)] mt-0.5">{f.categoria?.nombre}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Firma */}
      {caso.estado === "entregado" && (
        <div className="mt-8 break-inside-avoid">
          <h2 className="font-bold border-b border-[var(--line)] pb-1 mb-3">Confirmación de entrega</h2>
          <p className="text-sm text-[var(--ink-soft)]">Entregado el {fecha(caso.fecha_entrega)}</p>
          {firmaUrl && (
            <div className="mt-2">
              <img src={firmaUrl} alt="Firma" className="h-24 border border-[var(--line)] rounded" />
              <p className="text-xs text-[var(--ink-soft)] mt-1">Firma del cliente</p>
            </div>
          )}
        </div>
      )}

      <p className="text-center text-xs text-[var(--ink-soft)] mt-10 print:fixed print:bottom-4 print:left-0 print:right-0">
        Dominguez Auto Pintura · Documento interno
      </p>
    </div>
  );
}

function Dato({ label, value }) {
  return (
    <div>
      <p className="text-[var(--ink-soft)] text-xs uppercase tracking-wide">{label}</p>
      <p className="font-semibold">{value || "—"}</p>
    </div>
  );
}
