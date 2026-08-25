import { useState, useRef, useEffect } from "react";
import Icon from "./Icon";

export default function VoiceItemsRecorder({ onItemsExtracted, tipo = "ambos", className = "" }) {
  const [grabando, setGrabando] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [tiempoGrabacion, setTiempoGrabacion] = useState(0);
  
  const [fragments, setFragments] = useState([]); // Array de { blob, text, duration }
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  
  const [reproduciendo, setReproduciendo] = useState(false);
  const [procesandoIA, setProcesandoIA] = useState(false);
  const [error, setError] = useState("");
  const [mensajeExito, setMensajeExito] = useState("");

  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const audioElementRef = useRef(null);
  
  // Refs para el fragmento actual
  const currentChunksRef = useRef([]);
  const currentDurationRef = useRef(0);
  const currentTextRef = useRef("");
  const stopActionRef = useRef("pause"); // "pause" | "finish" | "discard"
  
  // Navegador nativo SpeechRecognition para velocidad instantánea
  const recognitionRef = useRef(null);
  const mimeTypeRef = useRef("audio/webm");

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = false;
      rec.lang = "es-DO"; // Español República Dominicana

      rec.onresult = (event) => {
        let text = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            text += event.results[i][0].transcript + " ";
          }
        }
        if (text) {
          currentTextRef.current += text;
        }
      };
      rec.onerror = (e) => {
        console.warn("SpeechRecognition error:", e);
      };
      recognitionRef.current = rec;
    }

    return () => {
      limpiarTimer();
      detenerMicTrack();
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  function limpiarTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function detenerMicTrack() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  // Obtener el tipo de mime soportado
  function getSupportedMimeType() {
    let mime = "audio/webm";
    if (typeof MediaRecorder !== "undefined") {
      if (!MediaRecorder.isTypeSupported("audio/webm")) {
        if (MediaRecorder.isTypeSupported("audio/mp4")) {
          mime = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          mime = "audio/ogg";
        }
      }
    }
    mimeTypeRef.current = mime;
    return mime;
  }

  // 1. Iniciar Grabación
  async function iniciarGrabacion() {
    setError("");
    setMensajeExito("");
    setFragments([]);
    setAudioBlob(null);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    setTiempoGrabacion(0);
    currentDurationRef.current = 0;
    currentTextRef.current = "";
    currentChunksRef.current = [];

    try {
      const mime = getSupportedMimeType();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          currentChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const chunkBlob = new Blob(currentChunksRef.current, { type: mime });
        const duration = currentDurationRef.current;
        const text = currentTextRef.current.trim();

        if (stopActionRef.current === "pause") {
          setFragments((prev) => [...prev, { blob: chunkBlob, text, duration }]);
        } else if (stopActionRef.current === "finish") {
          const finalFragments = [...fragments, { blob: chunkBlob, text, duration }];
          setFragments(finalFragments);
          finalizarYMezclar(finalFragments);
        }
      };

      stopActionRef.current = "pause";
      mediaRecorder.start(250);
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.warn("Recognition start failed:", e);
        }
      }

      setGrabando(true);
      setPausado(false);

      limpiarTimer();
      timerRef.current = setInterval(() => {
        setTiempoGrabacion((prev) => prev + 1);
        currentDurationRef.current += 1;
      }, 1000);
    } catch (err) {
      console.error("Error accediendo al micrófono:", err);
      setError("No se pudo acceder al micrófono. Por favor permite los permisos.");
    }
  }

  // 2. Pausar Grabación
  function pausarGrabacion() {
    if (!grabando || pausado) return;
    
    limpiarTimer();
    stopActionRef.current = "pause";

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn(e);
      }
    }
    
    setPausado(true);
  }

  // 3. Reanudar Grabación
  async function reanudarGrabacion() {
    if (!grabando || !pausado) return;
    
    currentChunksRef.current = [];
    currentDurationRef.current = 0;
    
    try {
      const mime = mimeTypeRef.current;
      // Reusar stream si sigue activo, de lo contrario pedir uno nuevo
      let stream = streamRef.current;
      if (!stream || stream.getTracks().every(t => t.readyState === "ended")) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          currentChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const chunkBlob = new Blob(currentChunksRef.current, { type: mime });
        const duration = currentDurationRef.current;
        const text = currentTextRef.current.trim();

        if (stopActionRef.current === "pause") {
          setFragments((prev) => [...prev, { blob: chunkBlob, text, duration }]);
        } else if (stopActionRef.current === "finish") {
          const finalFragments = [...fragments, { blob: chunkBlob, text, duration }];
          setFragments(finalFragments);
          finalizarYMezclar(finalFragments);
        }
      };

      stopActionRef.current = "pause";
      mediaRecorder.start(250);
      
      if (recognitionRef.current) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          console.warn(e);
        }
      }

      setPausado(false);

      limpiarTimer();
      timerRef.current = setInterval(() => {
        setTiempoGrabacion((prev) => prev + 1);
        currentDurationRef.current += 1;
      }, 1000);
    } catch (err) {
      console.error("Error al reanudar micrófono:", err);
      setError("No se pudo reanudar la grabación de voz.");
    }
  }

  // 4. Borrar última fracción grabada (Zafacón estando pausado)
  function borrarUltimaFraccion() {
    if (!pausado || fragments.length === 0) return;
    
    const copia = [...fragments];
    const ultima = copia.pop();
    
    setFragments(copia);
    if (ultima) {
      setTiempoGrabacion((prev) => Math.max(0, prev - ultima.duration));
    }
    
    // Si ya no quedan fragmentos, reseteamos todo a cero
    if (copia.length === 0) {
      descartarAudio();
    }
  }

  // 5. Terminar y guardar la grabación
  function terminarGrabacion() {
    limpiarTimer();
    
    if (pausado) {
      // Si ya estaba pausado, los fragmentos están listos en el array
      finalizarYMezclar(fragments);
    } else {
      // Si estaba activo, paramos el recorder actual y guardamos el último pedazo
      stopActionRef.current = "finish";
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {
          console.warn(e);
        }
      }
    }
  }

  // Mezclar fragmentos de audio
  function finalizarYMezclar(allFragments) {
    detenerMicTrack();
    setGrabando(false);
    setPausado(false);

    if (allFragments.length === 0) return;

    const blobs = allFragments.map((f) => f.blob);
    const mime = mimeTypeRef.current;
    const merged = new Blob(blobs, { type: mime });
    
    setAudioBlob(merged);
    const url = URL.createObjectURL(merged);
    setAudioUrl(url);
  }

  // Descartar grabación por completo
  function descartarAudio() {
    limpiarTimer();
    stopActionRef.current = "discard";
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.warn(e);
      }
    }
    
    detenerMicTrack();
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    
    setFragments([]);
    setAudioBlob(null);
    setGrabando(false);
    setPausado(false);
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

  // Enviar audio y texto a la IA (Extremadamente rápido)
  async function procesarAudioConIA() {
    if (!audioBlob && fragments.length === 0) return;
    setProcesandoIA(true);
    setError("");
    setMensajeExito("");

    try {
      // Concatenar el texto local transcrito por SpeechRecognition
      const textoTranscritoTotal = fragments
        .map((f) => f.text)
        .filter(Boolean)
        .join(" ")
        .trim();

      let base64 = "";
      if (audioBlob) {
        base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(audioBlob);
        });
      }

      const cleanMime = audioBlob ? audioBlob.type : mimeTypeRef.current;

      const res = await fetch("/api/procesar-seguro?action=procesar_audio_piezas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioBase64: base64,
          mimeType: cleanMime,
          textoTranscrito: textoTranscritoTotal // Pasa el texto pre-transcrito localmente
        })
      });

      const json = await res.json().catch(() => ({}));
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
      let userMsg = err.message || "";
      if (userMsg === "Load failed" || userMsg.includes("Failed to fetch") || userMsg.includes("NetworkError")) {
        userMsg = "Error al enviar el audio. Revisa tu conexión a internet o intenta grabar de nuevo.";
      }
      setError(userMsg || "Error al procesar el dictado.");
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
      
      {/* 1. Botón Inicial: Iniciar Dictado */}
      {!grabando && !audioBlob && (
        <button
          type="button"
          onClick={iniciarGrabacion}
          disabled={procesandoIA}
          className="btn-ghost text-xs py-1.5 px-3.5 bg-red-50 hover:bg-red-100 text-[var(--brand-red)] font-bold border border-red-200 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-95"
          title="Grabar dictado de piezas o mano de obra"
        >
          <span className="w-2 h-2 rounded-full bg-[var(--brand-red)] animate-ping inline-block"></span>
          <Icon name="mic" className="w-4 h-4" />
          <span>Dictar por voz</span>
        </button>
      )}

      {/* 2. Grabando actualmente (Controles Activos de Grabación) */}
      {grabando && (
        <div className="flex items-center gap-2 bg-red-500 text-white px-3 py-1.5 rounded-xl shadow-md">
          <div className="flex items-center gap-1.5 font-mono font-bold text-xs">
            <span className={`w-2.5 h-2.5 rounded-full bg-white ${!pausado ? "animate-ping" : ""}`}></span>
            <span>{pausado ? "Pausado" : "Grabando"} {formatoTiempo(tiempoGrabacion)}</span>
          </div>

          {/* Botón Pausar / Reanudar */}
          {!pausado ? (
            <button
              type="button"
              onClick={pausarGrabacion}
              className="bg-white/20 hover:bg-white/30 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all"
              title="Pausar la grabación actual"
            >
              ⏸️ Pausar
            </button>
          ) : (
            <button
              type="button"
              onClick={reanudarGrabacion}
              className="bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg text-xs font-extrabold flex items-center gap-1 transition-all"
              title="Reanudar grabación desde donde quedaste"
            >
              ▶️ Reanudar
            </button>
          )}

          {/* Botón Zafacón (Si está pausado borra la última fracción, si está grabando descarta todo) */}
          {pausado ? (
            <button
              type="button"
              onClick={borrarUltimaFraccion}
              className="bg-red-700 hover:bg-red-800 text-white px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-red-800/80 shadow-sm animate-bounce"
              title="Borrar la última fracción grabada"
            >
              <Icon name="trash" className="w-3.5 h-3.5" />
              <span className="text-[10px]">Borrar últ.</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={descartarAudio}
              className="bg-red-700 hover:bg-red-800 text-white p-1 rounded-lg text-xs"
              title="Descartar grabación por completo"
            >
              <Icon name="trash" className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Botón Listo (Guardar grabación) */}
          <button
            type="button"
            onClick={terminarGrabacion}
            className="bg-white text-red-600 hover:bg-gray-100 px-3 py-1 rounded-lg text-xs font-extrabold shadow-sm flex items-center gap-1 ml-1"
            title="Finalizar grabación para procesar con IA"
          >
            ✓ Listo
          </button>
        </div>
      )}

      {/* 3. Audio Grabado Completo (Listo para escuchar y aplicar) */}
      {!grabando && audioBlob && (
        <div className="flex flex-wrap items-center gap-2 bg-indigo-50 border border-indigo-200 px-3 py-1.5 rounded-xl shadow-sm">
          <span className="text-xs font-bold text-indigo-900 font-mono mr-1">
            🎙️ Audio ({formatoTiempo(tiempoGrabacion)})
          </span>

          <button
            type="button"
            onClick={toggleReproduccion}
            className="btn-ghost text-xs py-1 px-2.5 bg-white text-indigo-700 hover:bg-indigo-100 rounded-lg border border-indigo-200 flex items-center gap-1 font-semibold"
            title={reproduciendo ? "Pausar" : "Escuchar grabación completa"}
          >
            {reproduciendo ? "⏸️ Pausa" : "▶️ Escuchar"}
          </button>

          <button
            type="button"
            onClick={descartarAudio}
            disabled={procesandoIA}
            className="btn-ghost text-xs py-1 px-2 text-red-600 hover:bg-red-50 rounded-lg"
            title="Eliminar grabación"
          >
            <Icon name="trash" className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={procesarAudioConIA}
            disabled={procesandoIA}
            className="btn-primary text-xs py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            💾 {procesandoIA ? "Procesando con IA…" : "Guardar y Aplicar con IA"}
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
