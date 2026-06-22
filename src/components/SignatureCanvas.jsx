import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

/**
 * Lienzo de firma táctil, sin modal (se incrusta dentro de una página).
 * El padre obtiene la firma con ref.current.getBlob() y puede revisar
 * ref.current.vacio() antes de continuar.
 */
const SignatureCanvas = forwardRef(function SignatureCanvas(_props, ref) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const [vacio, setVacio] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
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

  useImperativeHandle(ref, () => ({
    vacio: () => vacio,
    limpiar,
    getBlob: () =>
      new Promise((resolve) => canvasRef.current.toBlob((blob) => resolve(blob), "image/png")),
  }));

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="w-full h-44 sm:h-52 border-2 border-dashed border-[var(--line)] rounded-xl bg-white touch-none"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button type="button" onClick={limpiar} className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] mt-2">
        Limpiar firma
      </button>
    </div>
  );
});

export default SignatureCanvas;
