import { useState } from "react";

/**
 * Logo de Dominguez Auto Pintura.
 * Si colocas el archivo real en `public/logo.png` se usará automáticamente.
 * Mientras tanto se muestra una marca SVG con la misma identidad (rojo/negro).
 */
export default function Logo({ size = 40, showText = true, light = false }) {
  const [imgError, setImgError] = useState(false);
  const textColor = light ? "#fff" : "var(--ink)";

  return (
    <div className="flex items-center gap-3">
      {!imgError ? (
        <img
          src="/logo.png"
          alt="Dominguez Auto Pintura"
          height={size}
          style={{ height: size, width: "auto", maxWidth: size * 3 }}
          onError={() => setImgError(true)}
        />
      ) : (
        <SprayMark size={size} />
      )}

      {imgError && showText && (
        <div className="leading-none">
          <div
            className="font-extrabold tracking-tight"
            style={{ color: textColor, fontSize: size * 0.46 }}
          >
            DOMINGUEZ
          </div>
          <div
            className="font-medium tracking-wide"
            style={{ color: "var(--brand-red)", fontSize: size * 0.3 }}
          >
            Auto Pintura
          </div>
        </div>
      )}
    </div>
  );
}

function SprayMark({ size }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* depósito de la pistola */}
      <path d="M16 6 L34 10 L30 24 L14 22 Z" fill="var(--brand-red)" />
      {/* cuerpo + gatillo */}
      <path
        d="M10 26 L30 24 L33 30 L40 28 L33 33 L30 31 L18 32 L17 46 L11 46 L12 30 L10 30 Z"
        fill="var(--brand-red)"
      />
      {/* nube de pintura */}
      <circle cx="44" cy="30" r="2.2" fill="var(--brand-red)" opacity="0.9" />
      <circle cx="50" cy="27" r="1.6" fill="var(--brand-red)" opacity="0.7" />
      <circle cx="49" cy="34" r="1.4" fill="var(--brand-red)" opacity="0.6" />
      <circle cx="55" cy="31" r="1.1" fill="var(--brand-red)" opacity="0.5" />
    </svg>
  );
}
