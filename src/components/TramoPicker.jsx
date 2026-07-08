import { tramosDe, layoutTramos, formatoTramo } from "../lib/tramos";

// Selector visual de tramo (como el anaquel): grilla de casillas clickeables.
// Al pulsar una casilla se elige ese tramo. La casilla actual queda resaltada.
export default function TramoPicker({ aseguradora, valor, onSelect, onClear, onClose }) {
  const { cols } = layoutTramos(aseguradora);
  const slots = tramosDe(aseguradora);

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md p-6 animate-[pop_.12s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[var(--ink)]">Elegir tramo</h3>
          <button onClick={onClose} className="text-[var(--ink-soft)] text-xl px-2 leading-none">
            ✕
          </button>
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Toca la casilla del anaquel donde quedó guardada la pieza.
        </p>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {slots.map((code) => {
            const activo = valor === code;
            return (
              <button
                key={code}
                onClick={() => onSelect(code)}
                className={`aspect-square rounded-xl border-2 font-extrabold text-base transition-colors ${
                  activo
                    ? "border-[var(--brand-red)] bg-[var(--brand-red)] text-white shadow-sm"
                    : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--brand-red)] hover:text-[var(--brand-red)]"
                }`}
              >
                {formatoTramo(code)}
              </button>
            );
          })}
        </div>

        {valor && (
          <button onClick={onClear} className="btn-ghost w-full mt-4 !text-[var(--brand-red)]">
            Quitar tramo
          </button>
        )}
      </div>
    </div>
  );
}
