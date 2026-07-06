import { useRef, useState } from "react";
import Icon from "./Icon";

const MIN = 1;
const MAX = 5;
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));

// Visor de foto a pantalla completa con zoom (rueda del mouse, doble clic,
// pellizco en móvil) y arrastre para desplazar cuando está ampliada.
export default function Lightbox({ src, alt = "", filename = "foto.jpg", onClose }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const drag = useRef(null); // { startX, startY, ox, oy }
  const pinch = useRef(null); // { dist, scale }

  function reset() {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }

  // Descarga la foto que se está viendo (fetch → blob, para forzar la descarga
  // aunque la URL sea de otro origen).
  async function descargar() {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, "_blank");
    }
  }

  function zoom(factor) {
    setScale((s) => {
      const ns = clamp(s * factor, MIN, MAX);
      if (ns === 1) setPos({ x: 0, y: 0 });
      return ns;
    });
  }

  function onWheel(e) {
    e.preventDefault();
    zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15);
  }

  function onDoubleClick() {
    if (scale > 1) reset();
    else setScale(2.5);
  }

  // ── Arrastre (mouse/1 dedo) ──
  function onPointerDown(e) {
    if (scale <= 1) return;
    setArrastrando(true);
    drag.current = { startX: e.clientX, startY: e.clientY, ox: pos.x, oy: pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onPointerMove(e) {
    if (!drag.current) return;
    setPos({
      x: drag.current.ox + (e.clientX - drag.current.startX),
      y: drag.current.oy + (e.clientY - drag.current.startY),
    });
  }
  function onPointerUp() {
    setArrastrando(false);
    drag.current = null;
  }

  // ── Pellizco (2 dedos) ──
  function dist(t) {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  }
  function onTouchStart(e) {
    if (e.touches.length === 2) pinch.current = { dist: dist(e.touches), scale };
  }
  function onTouchMove(e) {
    if (e.touches.length === 2 && pinch.current) {
      e.preventDefault();
      const factor = dist(e.touches) / pinch.current.dist;
      setScale(clamp(pinch.current.scale * factor, MIN, MAX));
    }
  }
  function onTouchEnd(e) {
    if (e.touches.length < 2) pinch.current = null;
    if (scale <= 1) setPos({ x: 0, y: 0 });
  }

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center overflow-hidden touch-none select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onWheel={onWheel}
    >
      {/* Barra de acciones */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
        <BotonZoom onClick={() => zoom(1 / 1.3)} label="Alejar">−</BotonZoom>
        <span className="text-white/80 text-sm font-semibold w-12 text-center tabular-nums">
          {Math.round(scale * 100)}%
        </span>
        <BotonZoom onClick={() => zoom(1.3)} label="Acercar">+</BotonZoom>
        <BotonZoom onClick={reset} label="Restablecer">
          <span className="text-base leading-none">⟲</span>
        </BotonZoom>
        <BotonZoom onClick={descargar} label="Descargar">
          <Icon name="download" className="w-5 h-5" />
        </BotonZoom>
        <BotonZoom onClick={onClose} label="Cerrar">
          <Icon name="close" className="w-5 h-5" strokeWidth={2} />
        </BotonZoom>
      </div>

      <img
        src={src}
        alt={alt}
        draggable={false}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] max-w-[96vw] rounded-lg"
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
          transition: arrastrando ? "none" : "transform 0.12s ease-out",
          cursor: scale > 1 ? "grab" : "zoom-in",
        }}
      />

      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/50 text-xs text-center">
        Rueda o pellizco para zoom · doble clic para acercar · arrastra para mover
      </p>
    </div>
  );
}

function BotonZoom({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className="w-9 h-9 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center text-xl font-bold"
    >
      {children}
    </button>
  );
}
