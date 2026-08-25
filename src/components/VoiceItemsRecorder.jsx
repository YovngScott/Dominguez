import { useState, useRef, useEffect } from "react";
import Icon from "./Icon";

export default function VoiceItemsRecorder({ onItemsExtracted, tipo = "ambos", className = "" }) {
  const [grabando, setGrabando] = useState(false);
  const [tiempoGrabacion, setTiempoGrabacion] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [reproduciendo, setReproduciendo] = useState(false);
  const [procesandoIA, setProcesandoIA] = useState(false);
  const [error, setError] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioElementRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Iniciar grabación de voz
  async function iniciarGrabacion() {
    setError("");
    setMensajeExito("");
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      let mimeType = "audio/webm";
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mimeType = "audio/ogg";
        }
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);

        // Detener micrófono
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.start(250);
      setGrabando(true);
      setTiempoGrabacion(0);

      timerRef.current = setInterval(() => {
        setTiempoGrabacion((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error accediendo al micrófono:", err);
      setError("No se pudo acceder al micrófono. Por favor permite los permisos en tu navegador.");
    }
  }

  // Detener grabación
  function detenerGrabacion() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setGrabando(false);
  }

  // Eliminar / Descartar audio
  function descartarAudio() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setAudioBlob(null);
    setGrabando(false);
    setTiempoGrabacion(0);
    setReproduciendo(false);
    setError("");
    setMensajeExito("");
  }

  // Reproducir / Pausar preview
  function toggleReproduccion() {
    if (!audioElementRef.current && audioUrl) {
      audioElementRef.current = new Audio(audioUrl);
      audioElementRef.current.onended = () => setReproduciendo(false);
    }

    if (audioElementRef.current) {
      if (reproduciendo) {
        audioElementRef.current.pause();
        setReproduciendo(false);
      } else {
        audioElementRef.current.play();
        setReproduciendo(true);
      }
    }
  }

  // Enviar audio a la IA para extracción de piezas y nomenclatura canónica
  async function procesarAudioConIA() {
    if (!audioBlob) return;
    setProcesandoIA(true);
    setError("");
    setMensajeExito("");

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const res = await fetch("/api/procesar-seguro?action=procesar_audio_piezas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: audioBlob.type || "audio/webm"
        })
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "No se pudieron procesar las piezas con IA.");
      }

      const { piezas = [], servicios = [] } = json.data || {};
      const totalPiezas = piezas.length;
      const totalServicios = servicios.length;

      if (totalPiezas === 0 && totalServicios === 0) {
        setError("La IA no detectó nombres de piezas claros en la grabación. Intenta dictar más claro.");
        return;
      }

      setMensajeExito(`✨ Se agregaron ${totalPiezas} pieza(s) y ${totalServicios} servicio(s) a la cotización.`);

      if (onItemsExtracted) {
        onItemsExtracted({ piezas, servicios, tipo });
      }

      // Limpiar audio tras éxito
      setTimeout(() => {
        descartarAudio();
      }, 3000);
    } catch (err) {
      console.error("Error al procesar dictado con IA:", err);
      setError(err.message || "Error al procesar el dictado.");
    } finally {
      setProcesandoIA(false);
    }
  }

  const formatoTiempo = (segundos) => {
    const mins = Math.floor(segundos / 60);
    const segs = segundos % 60;
    return `${String(mins).padStart(2, "0")}:${String(segs).padStart(2, "0")}`;
  };

  return (
    <div className={`inline-flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${className}`}>
      {/* 1. Botón Iniciar Dictado */}
      {!grabando && !audioBlob && (
        <button
          type="button"
          onClick={iniciarGrabacion}
          disabled={procesandoIA}
          className="btn-ghost text-xs py-1.5 px-3 bg-red-50 hover:bg-red-100 text-[var(--brand-red)] font-bold border border-red-200 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
          title="Dictar piezas o mano de obra por voz"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--brand-red)] animate-ping inline-block"></span>
          <Icon name="mic" className="w-3.5 h-3.5" />
          <span>Dictar por voz</span>
        </button>
      )}

      {/* 2. Grabando actualmente (Controles Activos) */}
      {grabando && (
        <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-xl shadow-md animate-pulse">
          <div className="flex items-center gap-1.5 font-mono font-bold text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping"></span>
            <span>Grabando {formatoTiempo(tiempoGrabacion)}</span>
          </div>

          <button
            type="button"
            onClick={detenerGrabacion}
            className="bg-white text-red-600 hover:bg-gray-100 px-2.5 py-1 rounded-lg text-xs font-extrabold shadow-sm flex items-center gap-1 ml-1"
            title="Detener grabación"
          >
            ⏹️ Detener
          </button>

          <button
            type="button"
            onClick={descartarAudio}
            className="bg-red-700 hover:bg-red-800 text-white p-1 rounded-lg text-xs"
            title="Eliminar / Cancelar"
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 3. Audio Grabado (Listo para escuchar, procesar o descartar) */}
      {!grabando && audioBlob && (
        <div className="flex flex-wrap items-center gap-1.5 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl shadow-sm">
          <span className="text-xs font-bold text-indigo-900 font-mono mr-1">
            🎙️ Audio ({formatoTiempo(tiempoGrabacion)})
          </span>

          <button
            type="button"
            onClick={toggleReproduccion}
            className="btn-ghost text-xs py-1 px-2 bg-white text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200 flex items-center gap-1 font-semibold"
            title={reproduciendo ? "Pausar" : "Escuchar"}
          >
            {reproduciendo ? "⏸️ Pausa" : "▶️ Escuchar"}
          </button>

          <button
            type="button"
            onClick={descartarAudio}
            disabled={procesandoIA}
            className="btn-ghost text-xs py-1 px-2 text-red-600 hover:bg-red-50 rounded-lg"
            title="Eliminar audio grabado"
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={procesarAudioConIA}
            disabled={procesandoIA}
            className="btn-primary text-xs py-1 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            ✨ {procesandoIA ? "Procesando…" : "Insertar Piezas con IA"}
          </button>
        </div>
      )}

      {/* Notificaciones */}
      {mensajeExito && (
        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
          {mensajeExito}
        </span>
      )}

      {error && (
        <span className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-1 rounded-lg">
          {error}
        </span>
      )}
    </div>
  );
}
