import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uuid } from "../lib/uuid";
import Combobox from "./Combobox";
import Icon from "./Icon";

const SIGNED_URL_TTL = 60 * 60; // 1 hora

export default function DocumentManager({ casoId }) {
  const [tipos, setTipos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [tipoSubida, setTipoSubida] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [visor, setVisor] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function loadTipos() {
      const { data } = await supabase.from("tipos_documento").select("*").order("orden");
      setTipos(data || []);
      if (data?.length) setTipoSubida(data[0].id);
    }
    loadTipos();
  }, []);

  async function loadDocumentos() {
    const { data } = await supabase
      .from("documentos_caso")
      .select("id, storage_path, nombre_archivo, uploaded_at, tipo:tipos_documento(nombre)")
      .eq("caso_id", casoId)
      .order("uploaded_at", { ascending: false });

    const conUrls = await Promise.all(
      (data || []).map(async (d) => {
        const { data: signed } = await supabase.storage
          .from("documentos-casos")
          .createSignedUrl(d.storage_path, SIGNED_URL_TTL);
        return { ...d, signedUrl: signed?.signedUrl };
      })
    );
    setDocumentos(conUrls);
  }

  useEffect(() => {
    if (casoId) loadDocumentos();
  }, [casoId]);

  async function handleFile(file) {
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Solo se permiten archivos PDF.");
      return;
    }
    if (!tipoSubida) {
      setError("Selecciona un tipo de documento.");
      return;
    }

    setError("");
    setSubiendo(true);
    try {
      const path = `${casoId}/${uuid()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("documentos-casos")
        .upload(path, file, { contentType: "application/pdf" });
      if (uploadErr) throw uploadErr;

      const { data: signed } = await supabase.storage
        .from("documentos-casos")
        .createSignedUrl(path, SIGNED_URL_TTL);

      const { data: userData } = await supabase.auth.getUser();

      await supabase.from("documentos_caso").insert({
        caso_id: casoId,
        tipo_id: tipoSubida,
        nombre_archivo: file.name,
        storage_path: path,
        url: signed?.signedUrl || "",
        uploaded_by: userData?.user?.id,
      });

      loadDocumentos();
    } catch (err) {
      setError(err.message || "Error subiendo el documento.");
    } finally {
      setSubiendo(false);
    }
  }

  async function eliminarDocumento(doc) {
    if (!confirm("¿Eliminar este documento?")) return;
    await supabase.storage.from("documentos-casos").remove([doc.storage_path]);
    await supabase.from("documentos_caso").delete().eq("id", doc.id);
    setDocumentos((prev) => prev.filter((d) => d.id !== doc.id));
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="mt-0.5 w-9 h-9 rounded-lg bg-[var(--brand-red-50)] text-[var(--brand-red)] flex items-center justify-center shrink-0">
          <Icon name="file" className="w-5 h-5" />
        </span>
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-[var(--ink)]">Cotizaciones y documentos</h2>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">PDF del taller, seguro y documentos del caso.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <Combobox
          items={tipos.map((t) => ({ id: t.id, label: t.nombre }))}
          value={tipoSubida}
          onChange={(v) => setTipoSubida(v)}
          placeholder="Tipo…"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={subiendo}
          className="bg-[var(--ink)] text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <Icon name="file" className="w-4 h-4" /> {subiendo ? "Subiendo…" : "Subir PDF"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {documentos.length === 0 ? (
        <p className="text-[var(--ink-soft)] text-sm">No hay documentos cargados todavía.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-start gap-2 py-3 sm:items-center">
              <button onClick={() => setVisor(d)} className="text-left flex-1 min-w-0 flex items-start gap-3 rounded-lg -mx-1 px-1 py-1 hover:bg-[var(--paper)]">
                <span className="w-9 h-9 rounded-lg bg-[var(--paper)] text-[var(--ink-soft)] flex items-center justify-center shrink-0">
                  <Icon name="file" className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm sm:text-base text-[var(--ink)] break-words leading-snug line-clamp-2">{d.nombre_archivo}</span>
                  <span className="block text-xs sm:text-sm text-[var(--ink-soft)] mt-0.5">{d.tipo?.nombre || "Documento PDF"}</span>
                </span>
              </button>
              <button
                onClick={() => eliminarDocumento(d)}
                title="Eliminar documento"
                className="text-[var(--brand-red)] p-2.5 sm:px-3 sm:py-1.5 hover:bg-[var(--brand-red-50)] rounded-lg shrink-0 inline-flex items-center gap-1"
              >
                <Icon name="trash" className="w-4 h-4" /> <span className="hidden sm:inline text-sm">Eliminar</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {visor && (
        <div className="fixed inset-0 bg-black/70 z-50 flex flex-col" onClick={() => setVisor(null)}>
          <div
            className="bg-[var(--surface)] m-2 sm:m-4 rounded-xl flex-1 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-[var(--line)]">
              <p className="font-medium text-sm text-[var(--ink)] truncate flex-1">{visor.nombre_archivo}</p>
              <a href={visor.signedUrl} download={visor.nombre_archivo} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]" title="Descargar PDF">
                <Icon name="download" className="w-4 h-4" />
              </a>
              <button onClick={() => setVisor(null)} className="text-[var(--ink-soft)] px-2 text-sm whitespace-nowrap">
                ✕ Cerrar
              </button>
            </div>
            <iframe src={visor.signedUrl} title={visor.nombre_archivo} className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
}
