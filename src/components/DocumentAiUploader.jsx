import { useState, useRef } from "react";
import Icon from "./Icon";
import { compressImage } from "../lib/imageCompress";

export default function DocumentAiUploader({ onParsed, disabled = false }) {
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [archivosCargados, setArchivosCargados] = useState([]);
  const [exito, setExito] = useState(false);
  const inputRef = useRef(null);

  async function procesarArchivos(fileList) {
    if (!fileList || fileList.length === 0) return;
    setError("");
    setExito(false);
    setProcesando(true);

    try {
      const imagenesBase64 = [];
      const nombres = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (!file.type.startsWith("image/") && file.type !== "application/pdf") continue;

        nombres.push(file.name);
        // Si es imagen, comprimir para carga ultrarrápida
        let blobToSend = file;
        if (file.type.startsWith("image/")) {
          try {
            blobToSend = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.85 });
          } catch {
            blobToSend = file;
          }
        }

        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blobToSend);
        });

        imagenesBase64.push({
          base64,
          mimeType: blobToSend.type || "image/jpeg"
        });
      }

      if (imagenesBase64.length === 0) {
        throw new Error("Por favor selecciona una imagen válida (JPG, PNG) del carnet o matrícula.");
      }

      setArchivosCargados(nombres);

      const res = await fetch("/api/procesar-seguro?action=procesar_documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imagenes: imagenesBase64 })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudieron extraer los datos de los documentos.");
      }

      setExito(true);
      if (onParsed) {
        onParsed(json.data);
      }
    } catch (err) {
      console.error("Error al procesar documento con IA:", err);
      setError(err.message || "Error al procesar el documento.");
    } finally {
      setProcesando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="card p-4 border border-indigo-200 bg-gradient-to-r from-indigo-50/40 via-white to-blue-50/40 shadow-sm mb-6 transition-all">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shrink-0 shadow-sm">
            ✨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--ink)]">Autocompletar con IA</h3>
              <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Carnet / Matrícula
              </span>
            </div>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5">
              Sube fotos del carnet de seguro o la matrícula para autocompletar cliente, vehículo y póliza al instante.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            hidden
            onChange={(e) => procesarArchivos(e.target.files)}
          />

          <button
            type="button"
            disabled={procesando || disabled}
            onClick={() => inputRef.current?.click()}
            className="btn-primary text-xs py-2 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white flex items-center justify-center gap-2 w-full sm:w-auto font-bold shadow-sm disabled:opacity-50"
          >
            <Icon name="image" className="w-4 h-4" />
            {procesando ? "Analizando con IA…" : "📸 Subir Carnet / Matrícula"}
          </button>
        </div>
      </div>

      {/* Estados y Mensajes */}
      {procesando && (
        <div className="mt-3 p-3 bg-indigo-100/60 rounded-xl flex items-center gap-2.5 text-xs text-indigo-900 font-semibold animate-pulse">
          <span className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
          <span>Leyendo carnet y matrícula con Gemini Vision… Extrayendo datos del vehículo y cliente…</span>
        </div>
      )}

      {exito && (
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-semibold">
          <div className="flex items-center gap-2">
            <span>✅ ¡Datos extraídos y formulario autocompletado con éxito!</span>
            {archivosCargados.length > 0 && (
              <span className="text-[11px] text-emerald-600 font-normal">({archivosCargados.join(", ")})</span>
            )}
          </div>
          <button type="button" onClick={() => setExito(false)} className="text-emerald-700 hover:text-emerald-950 font-bold ml-2">✕</button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700 font-semibold">
          <span>❌ {error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-700 font-bold ml-2">✕</button>
        </div>
      )}
    </div>
  );
}
