import { useState, useRef } from "react";
import Icon from "./Icon";
import { compressImage } from "../lib/imageCompress";

export default function DocumentAiUploader({ onParsed, disabled = false }) {
  const [carnet, setCarnet] = useState(null); // { file, preview, base64, mimeType }
  const [matricula, setMatricula] = useState(null); // { file, preview, base64, mimeType }
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(false);

  // Refs para inputs de archivo y cámara
  const carnetCamRef = useRef(null);
  const carnetGalRef = useRef(null);
  const matCamRef = useRef(null);
  const matGalRef = useRef(null);

  async function handleFileSelect(file, tipo) {
    if (!file) return;
    setError("");
    setExito(false);

    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawData = e.target?.result;
        if (!rawData || typeof rawData !== "string") {
          setError("No se pudo leer el archivo seleccionado.");
          return;
        }

        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 1500;
            let w = img.width || 1200;
            let h = img.height || 800;
            if (w > maxDim || h > maxDim) {
              if (w > h) {
                h = Math.round((h * maxDim) / w);
                w = maxDim;
              } else {
                w = Math.round((w * maxDim) / h);
                h = maxDim;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);

            const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
            const base64 = compressedDataUrl.split(",")[1];

            const item = {
              file,
              preview: compressedDataUrl,
              base64,
              mimeType: "image/jpeg"
            };

            if (tipo === "carnet") {
              setCarnet(item);
            } else {
              setMatricula(item);
            }
          } catch (canvasErr) {
            console.warn("Canvas resize warning:", canvasErr);
            const base64 = rawData.includes(",") ? rawData.split(",")[1] : rawData;
            const item = { file, preview: rawData, base64, mimeType: file.type || "image/jpeg" };
            if (tipo === "carnet") setCarnet(item);
            else setMatricula(item);
          }
        };

        img.onerror = () => {
          const base64 = rawData.includes(",") ? rawData.split(",")[1] : rawData;
          const item = { file, preview: rawData, base64, mimeType: file.type || "image/jpeg" };
          if (tipo === "carnet") setCarnet(item);
          else setMatricula(item);
        };

        img.src = rawData;
      };

      reader.onerror = () => {
        setError("Error al leer el archivo desde el dispositivo.");
      };

      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Error al cargar imagen:", err);
      setError("No se pudo cargar la imagen seleccionada.");
    }
  }

  async function escanearConIA() {
    const docs = [];
    if (carnet) docs.push(carnet);
    if (matricula) docs.push(matricula);

    if (docs.length === 0) {
      setError("Por favor toma una foto o sube al menos el Carnet de Seguro o la Matrícula.");
      return;
    }

    setProcesando(true);
    setError("");
    setExito(false);

    try {
      const res = await fetch("/api/procesar-seguro?action=procesar_documentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagenes: docs.map((d) => ({
            base64: d.base64,
            mimeType: d.mimeType
          }))
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudieron extraer los datos con IA.");
      }

      setExito(true);
      if (onParsed) {
        onParsed(json.data);
      }
    } catch (err) {
      console.error("Error al procesar con IA:", err);
      setError(err.message || "Error al procesar los documentos con IA.");
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="card p-4 sm:p-5 border border-indigo-200/90 bg-gradient-to-br from-indigo-50/60 via-white to-slate-50 shadow-sm mb-6 transition-all">
      {/* Encabezado */}
      <div className="flex items-center justify-between gap-3 border-b border-indigo-100/80 pb-3.5 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-lg font-black shadow-md shadow-indigo-600/20 shrink-0">
            ✨
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-[var(--ink)]">Autocompletar con IA</h3>
              <span className="text-[10px] font-extrabold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Fotos o Cámara
              </span>
            </div>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5">
              Sube el carnet del seguro y/o la matrícula para precargar cliente, vehículo y póliza.
            </p>
          </div>
        </div>

        {(carnet || matricula) && (
          <button
            type="button"
            onClick={escanearConIA}
            disabled={procesando || disabled}
            className="hidden sm:inline-flex btn-primary text-xs py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md shadow-indigo-600/25 items-center gap-2 disabled:opacity-50"
          >
            {procesando ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                <span>Analizando…</span>
              </>
            ) : (
              <>
                <span>✨ Escanear con IA</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Grid de dos apartados: 1. Carnet del Seguro, 2. Matrícula */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* ================= SECCIÓN 1: CARNET DE SEGURO ================= */}
        <div className={`p-3.5 rounded-2xl border transition-all ${carnet ? 'bg-indigo-50/50 border-indigo-300' : 'bg-white border-dashed border-gray-300 hover:border-indigo-300'}`}>
          {/* Inputs ocultos para carnet */}
          <input
            ref={carnetCamRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0], "carnet");
              e.target.value = "";
            }}
          />
          <input
            ref={carnetGalRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0], "carnet");
              e.target.value = "";
            }}
          />

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">💳</span>
              <span className="text-xs font-bold text-[var(--ink)]">Carnet del Seguro</span>
            </div>
            {carnet ? (
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                ✓ Listo
              </span>
            ) : (
              <span className="text-[10px] text-gray-500 font-medium">Opcional</span>
            )}
          </div>

          {carnet ? (
            <div className="relative group rounded-xl overflow-hidden border border-indigo-200 bg-black/5 aspect-[16/9] flex items-center justify-center">
              <img src={carnet.preview} alt="Carnet" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => carnetCamRef.current?.click()}
                  className="bg-white text-gray-900 text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-md hover:bg-gray-100"
                >
                  📸 Repetir
                </button>
                <button
                  type="button"
                  onClick={() => setCarnet(null)}
                  className="bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-md hover:bg-red-700"
                >
                  🗑️ Quitar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <button
                type="button"
                disabled={procesando || disabled}
                onClick={() => carnetCamRef.current?.click()}
                className="flex-1 btn-ghost text-xs py-2 px-2.5 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold border border-indigo-200/80 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <span>📸</span>
                <span>Tomar Foto</span>
              </button>
              <button
                type="button"
                disabled={procesando || disabled}
                onClick={() => carnetGalRef.current?.click()}
                className="flex-1 btn-ghost text-xs py-2 px-2.5 bg-white hover:bg-gray-50 text-gray-700 font-bold border border-gray-200 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <span>🖼️</span>
                <span>Galería</span>
              </button>
            </div>
          )}
        </div>

        {/* ================= SECCIÓN 2: MATRÍCULA / PLACA ================= */}
        <div className={`p-3.5 rounded-2xl border transition-all ${matricula ? 'bg-indigo-50/50 border-indigo-300' : 'bg-white border-dashed border-gray-300 hover:border-indigo-300'}`}>
          {/* Inputs ocultos para matrícula */}
          <input
            ref={matCamRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0], "matricula");
              e.target.value = "";
            }}
          />
          <input
            ref={matGalRef}
            type="file"
            accept="image/*,application/pdf"
            hidden
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileSelect(e.target.files[0], "matricula");
              e.target.value = "";
            }}
          />

          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-base">🚗</span>
              <span className="text-xs font-bold text-[var(--ink)]">Matrícula / Placa</span>
            </div>
            {matricula ? (
              <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-md">
                ✓ Listo
              </span>
            ) : (
              <span className="text-[10px] text-gray-500 font-medium">Opcional</span>
            )}
          </div>

          {matricula ? (
            <div className="relative group rounded-xl overflow-hidden border border-indigo-200 bg-black/5 aspect-[16/9] flex items-center justify-center">
              <img src={matricula.preview} alt="Matrícula" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => matCamRef.current?.click()}
                  className="bg-white text-gray-900 text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-md hover:bg-gray-100"
                >
                  📸 Repetir
                </button>
                <button
                  type="button"
                  onClick={() => setMatricula(null)}
                  className="bg-red-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-bold shadow-md hover:bg-red-700"
                >
                  🗑️ Quitar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-2 mt-1">
              <button
                type="button"
                disabled={procesando || disabled}
                onClick={() => matCamRef.current?.click()}
                className="flex-1 btn-ghost text-xs py-2 px-2.5 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold border border-indigo-200/80 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <span>📸</span>
                <span>Tomar Foto</span>
              </button>
              <button
                type="button"
                disabled={procesando || disabled}
                onClick={() => matGalRef.current?.click()}
                className="flex-1 btn-ghost text-xs py-2 px-2.5 bg-white hover:bg-gray-50 text-gray-700 font-bold border border-gray-200 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
              >
                <span>🖼️</span>
                <span>Galería</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Botón Escanear para móviles / pantallas pequeñas */}
      {(carnet || matricula) && (
        <button
          type="button"
          onClick={escanearConIA}
          disabled={procesando || disabled}
          className="mt-3.5 w-full btn-primary sm:hidden text-xs py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl shadow-md shadow-indigo-600/25 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {procesando ? (
            <>
              <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              <span>Extrayendo datos con IA…</span>
            </>
          ) : (
            <>
              <span>✨ Escanear y Rellenar con IA</span>
            </>
          )}
        </button>
      )}

      {/* Indicador de carga en progreso */}
      {procesando && (
        <div className="mt-3.5 p-3 bg-indigo-100/70 rounded-xl flex items-center gap-2.5 text-xs text-indigo-950 font-semibold animate-pulse">
          <span className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></span>
          <span>Analizando carnet y matrícula con Gemini Vision… Extrayendo datos de cliente, vehículo y póliza…</span>
        </div>
      )}

      {/* Mensaje de éxito */}
      {exito && (
        <div className="mt-3.5 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 font-semibold">
          <div className="flex items-center gap-2">
            <span>✅ ¡Datos extraídos con éxito! Formulario autocompletado.</span>
          </div>
          <button type="button" onClick={() => setExito(false)} className="text-emerald-700 hover:text-emerald-950 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Mensaje de error */}
      {error && (
        <div className="mt-3.5 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-700 font-semibold">
          <span>⚠️ {error}</span>
          <button type="button" onClick={() => setError("")} className="text-red-700 font-bold ml-2">✕</button>
        </div>
      )}
    </div>
  );
}
