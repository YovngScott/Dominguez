import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { uuid } from "../lib/uuid";
import { DOCUMENTOS_BUCKET, subirDocumentoCaso, vistaPreviaDocumento } from "../lib/documentosCaso";
import {
  nombreTipoDocumento,
  prepararTiposDocumento,
  tiposDocumentoParaUpsert,
  tiposDocumentoRequierenSincronizacion,
} from "../lib/tiposDocumento";
import Icon from "./Icon";

const SIGNED_URL_TTL = 60 * 60; // 1 hora

export default function DocumentManager({ casoId }) {
  const [tipos, setTipos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [tipoSubida, setTipoSubida] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState("");
  const [visor, setVisor] = useState(null);
  const [abriendo, setAbriendo] = useState(null);
  const fileInputRef = useRef(null);
  const subidaEnCurso = useRef(false);

  useEffect(() => {
    async function loadTipos() {
      let { data, error: tiposError } = await supabase
        .from("tipos_documento")
        .select("*")
        .order("orden");

      if (tiposError) {
        setError(tiposError.message || "No se pudieron cargar los tipos de documento.");
        return;
      }

      const requiereSincronizacion = tiposDocumentoRequierenSincronizacion(data);

      // Mantiene el catálogo disponible aunque el despliegue web ocurra antes
      // de aplicar la migración de base de datos.
      if (requiereSincronizacion) {
        const { error: syncError } = await supabase
          .from("tipos_documento")
          .upsert(tiposDocumentoParaUpsert(), { onConflict: "nombre" });

        if (syncError) {
          setError(syncError.message || "No se pudieron actualizar los tipos de documento.");
          return;
        }

        const resultado = await supabase.from("tipos_documento").select("*").order("orden");
        if (resultado.error) {
          setError(resultado.error.message || "No se pudieron cargar los tipos de documento.");
          return;
        }
        data = resultado.data;
      }

      const tiposVisibles = prepararTiposDocumento(data);
      setTipos(tiposVisibles);
      if (tiposVisibles.length) setTipoSubida(tiposVisibles[0].id);
    }
    loadTipos();
  }, []);

  const loadDocumentos = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("documentos_caso")
      .select("id, storage_path, nombre_archivo, uploaded_at, tipo:tipos_documento(nombre)")
      .eq("caso_id", casoId)
      .order("uploaded_at", { ascending: false });

    if (loadError) {
      setError(loadError.message || "No se pudieron cargar los documentos.");
      return;
    }
    setDocumentos(data || []);
  }, [casoId]);

  useEffect(() => {
    if (casoId) loadDocumentos();
  }, [casoId, loadDocumentos]);

  async function handleFile(file) {
    if (!file || subidaEnCurso.current) return;
    if (!tipoSubida) {
      setError("Selecciona un tipo de documento.");
      return;
    }

    setError("");
    subidaEnCurso.current = true;
    setSubiendo(true);
    try {
      await subirDocumentoCaso({ client: supabase, casoId, tipoId: tipoSubida, file, id: uuid() });
      await loadDocumentos();
    } catch (err) {
      setError(err.message || "Error subiendo el documento.");
    } finally {
      subidaEnCurso.current = false;
      setSubiendo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function abrirDocumento(doc) {
    setError("");
    setAbriendo(doc.id);
    try {
      const bucket = supabase.storage.from(DOCUMENTOS_BUCKET);
      const preview = vistaPreviaDocumento(doc.nombre_archivo);
      const [descarga, vista] = await Promise.all([
        bucket.createSignedUrl(doc.storage_path, SIGNED_URL_TTL, { download: doc.nombre_archivo }),
        preview ? bucket.createSignedUrl(doc.storage_path, SIGNED_URL_TTL) : Promise.resolve(null),
      ]);
      if (descarga.error) throw descarga.error;
      if (vista?.error) throw vista.error;
      setVisor({ ...doc, preview, signedUrl: vista?.data?.signedUrl, downloadUrl: descarga.data.signedUrl });
    } catch (err) {
      setError(err.message || "No se pudo abrir el documento.");
    } finally {
      setAbriendo(null);
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
          <h2 className="text-base sm:text-lg font-semibold text-[var(--ink)]">DOCUMENTOS DEL CASO</h2>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">PDF, Word, Excel y cualquier otro archivo · Hasta 50 MB por archivo.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <TipoDocumentoPicker tipos={tipos} value={tipoSubida} onChange={setTipoSubida} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={subiendo || !tipoSubida}
          className="bg-[var(--ink)] text-white px-5 py-2.5 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <Icon name="file" className="w-4 h-4" /> {subiendo ? "SUBIENDO…" : "SUBIR ARCHIVO"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
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
              <button onClick={() => abrirDocumento(d)} disabled={abriendo !== null} className="text-left flex-1 min-w-0 flex items-start gap-3 rounded-lg -mx-1 px-1 py-1 hover:bg-[var(--paper)] disabled:opacity-60">
                <span className="w-9 h-9 rounded-lg bg-[var(--paper)] text-[var(--ink-soft)] flex items-center justify-center shrink-0">
                  <Icon name="file" className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block font-medium text-sm sm:text-base text-[var(--ink)] break-words leading-snug line-clamp-2">{d.nombre_archivo}</span>
                  <span className="block text-xs sm:text-sm font-semibold tracking-wide text-[var(--ink-soft)] mt-0.5">{nombreTipoDocumento(d.tipo?.nombre)}</span>
                  {abriendo === d.id && <span className="block text-xs mt-1">Abriendo…</span>}
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
              <a href={visor.downloadUrl} download={visor.nombre_archivo} className="p-2 text-[var(--ink-soft)] hover:text-[var(--brand-red)]" title="Descargar archivo" aria-label="Descargar archivo">
                <Icon name="download" className="w-4 h-4" />
              </a>
              <button onClick={() => setVisor(null)} className="text-[var(--ink-soft)] px-2 text-sm whitespace-nowrap">
                ✕ Cerrar
              </button>
            </div>
            {visor.preview === "pdf" ? (
              <iframe src={visor.signedUrl} title={visor.nombre_archivo} className="flex-1 w-full" />
            ) : visor.preview === "imagen" ? (
              <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
                <img src={visor.signedUrl} alt={visor.nombre_archivo} className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6 text-center">
                <Icon name="file" className="w-12 h-12 text-[var(--brand-red)]" />
                <p className="font-semibold text-[var(--ink)] break-all">{visor.nombre_archivo}</p>
                <p className="text-sm text-[var(--ink-soft)]">Descarga el archivo para abrirlo en su programa correspondiente.</p>
                <a href={visor.downloadUrl} download={visor.nombre_archivo} className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-red)] px-5 py-3 font-medium text-white">
                  <Icon name="download" className="w-4 h-4" /> Descargar archivo
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TipoDocumentoPicker({ tipos, value, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);
  const seleccionado = tipos.find((tipo) => tipo.id === value) || tipos[0];

  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = (event) => {
      if (!contenedor.current?.contains(event.target)) setAbierto(false);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [abierto]);

  return (
    <div ref={contenedor} className="relative">
      <button
        type="button"
        onClick={() => setAbierto((valor) => !valor)}
        disabled={!tipos.length}
        aria-expanded={abierto}
        className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-left transition-all hover:border-slate-400 focus:border-[var(--brand-red)] focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-60"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-red-50)] text-[var(--brand-red)]">
          <Icon name={seleccionado?.icon || "file"} className="h-4.5 w-4.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold tracking-wide text-[var(--ink)]">
            {seleccionado?.label || "CARGANDO TIPOS…"}
          </span>
        </span>
        <Icon name="chevronDown" className={`h-4 w-4 shrink-0 text-[var(--ink-soft)] transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
          <p className="px-3 pb-2 pt-1 text-xs font-bold uppercase tracking-wider text-[var(--ink-soft)]">Tipo de documento</p>
          <div className="space-y-1">
            {tipos.map((tipo) => {
              const activo = tipo.id === seleccionado?.id;
              return (
                <button
                  type="button"
                  key={tipo.id}
                  onClick={() => {
                    onChange(tipo.id);
                    setAbierto(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    activo
                      ? "border-red-100 bg-[var(--brand-red-50)]"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${activo ? "bg-[var(--brand-red)] text-white" : "bg-slate-100 text-slate-600"}`}>
                    <Icon name={tipo.icon} className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-extrabold tracking-wide text-[var(--ink)]">{tipo.label}</span>
                  </span>
                  {activo && <Icon name="check" className="h-5 w-5 shrink-0 text-[var(--brand-red)]" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
