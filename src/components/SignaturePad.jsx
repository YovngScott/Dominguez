import { useEffect, useRef, useState } from "react";

/**
 * Panel de firma para tablet/escritorio. Devuelve la firma como Blob PNG.
 * Soporta táctil (Pointer Events) para usarse con el dedo en la tablet.
 */
export default function SignaturePad({ onConfirm, onCancel, submitting }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [vacio, setVacio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    // Ajusta la resolución real al tamaño en pantalla (nitidez en pantallas retina)
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0b0b0c";
  }, []);

  function pos(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    drawing.current = true;
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e) {
    if (!drawing.current) return;
    e.preventDefault();
    const { x, y } = pos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    setVacio(false);
  }

  function end() {
    drawing.current = false;
  }

  function limpiar() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setVacio(true);
  }

  function confirmar() {
    canvasRef.current.toBlob((blob) => onConfirm(blob), "image/png");
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg p-6">
        <h3 className="text-lg font-bold text-[var(--ink)]">Firma de entrega</h3>
        <p className="text-sm text-[var(--ink-soft)] mb-3">
          El cliente firma aquí para confirmar que recibió el vehículo.
        </p>

        <canvas
          ref={canvasRef}
          className="w-full h-56 border-2 border-dashed border-[var(--line)] rounded-xl bg-white touch-none"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />

        <div className="flex flex-wrap gap-3 mt-4 justify-between">
          <button onClick={limpiar} type="button" className="btn-ghost">
            Limpiar
          </button>
          <div className="flex gap-3">
            <button onClick={onCancel} type="button" className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={confirmar}
              type="button"
              disabled={vacio || submitting}
              className="btn-primary"
            >
              {submitting ? "Guardando…" : "Confirmar entrega"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
