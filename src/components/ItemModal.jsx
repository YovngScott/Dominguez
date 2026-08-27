import { useMemo, useState } from "react";
import Combobox from "./Combobox";
import { calcularItem, nombrePieza, normalizarNombrePieza, rd, ITBIS_DEFAULT } from "../lib/cotizacion";

const VACIO = { nombre: "", pieza: "", cantidad: 1, precio: 0, itbis_pct: ITBIS_DEFAULT, incluye_itbis: false };

/** Modal ágil para agregar/editar una pieza o un servicio desde el teléfono. */
export default function ItemModal({ tipo, initial, onConfirm, onCancel, sugerenciasPiezas = [], sugerenciasServicios = [] }) {
  const esServicio = tipo === "servicio";
  const inicial = useMemo(() => {
    const base = { ...VACIO, ...initial };
    // Compatibilidad: las piezas antiguas tenían lado/sub-lado separados.
    if (esServicio) base.pieza = nombrePieza({ nombre: base.pieza, lado: base.lado, sub_lado: base.sub_lado });
    else base.nombre = nombrePieza(base);
    delete base.lado;
    delete base.sub_lado;
    return base;
  }, [initial, esServicio]);
  const [item, setItem] = useState(inicial);

  function up(campo, valor) { setItem((it) => ({ ...it, [campo]: valor })); }
  const { total } = calcularItem(item);
  const nombreValido = item.nombre.trim();
  const sugerenciasRelacionadas = useMemo(() => {
    if (!esServicio || !item.nombre.trim()) return [];
    const tokens = item.nombre.toLowerCase().split(/[^a-záéíóúñ0-9]+/).filter((t) => t.length > 2);
    const matches = sugerenciasPiezas.filter((pieza) => tokens.some((token) => String(pieza.label || pieza.nombre || pieza).toLowerCase().includes(token)));
    return (matches.length ? matches : sugerenciasPiezas).slice(0, 8);
  }, [esServicio, item.nombre, sugerenciasPiezas]);

  function agregarPieza(pieza) {
    const label = String(pieza.label || pieza.nombre || pieza).trim();
    if (!label || item.nombre.toLowerCase().includes(label.toLowerCase())) return;
    up("nombre", `${item.nombre.trim()} · ${label}`);
  }

  function guardar() {
    const limpio = { ...item };
    if (esServicio) limpio.pieza = normalizarNombrePieza(limpio.pieza);
    else limpio.nombre = normalizarNombrePieza(limpio.nombre);
    onConfirm(limpio);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="card w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">{esServicio ? "Agregar servicio" : "Agregar pieza"}</h3>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5">Escribe una sola descripción completa.</p>
          </div>
          <button onClick={onCancel} className="text-[var(--ink-soft)] text-xl p-2 -mr-2" aria-label="Cerrar">✕</button>
        </div>

        <div className="space-y-3">
          <Campo label={esServicio ? "Servicio" : "Pieza"}>
            <Combobox
              items={esServicio ? sugerenciasServicios : sugerenciasPiezas}
              value={esServicio ? item.nombre : item.nombre}
              onChange={(val) => up("nombre", esServicio ? val : normalizarNombrePieza(val))}
              placeholder={esServicio ? "Ej. DESAB Y PINT BUMPER DELT" : "Ej. Bumper DELT RH"}
              allowCreate
              autoFocus
              maxResults={12}
            />
            {!esServicio && <p className="text-[11px] text-[var(--ink-soft)] mt-1.5">DELT delantero · TRAS trasero · RH derecha · LH izquierda · SUP superior · INF inferior</p>}
            {esServicio && sugerenciasRelacionadas.length > 0 && (
              <div className="mt-2 rounded-lg border border-[var(--line)] bg-[var(--paper)] p-2">
                <p className="text-[11px] font-semibold text-[var(--ink-soft)] mb-1.5">Piezas relacionadas (toca para añadir)</p>
                <div className="flex flex-wrap gap-1.5">
                  {sugerenciasRelacionadas.map((pieza, i) => <button type="button" key={`${pieza.id || pieza.label || pieza}-${i}`} onClick={() => agregarPieza(pieza)} className="text-xs px-2 py-1 rounded-md border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--brand-red)] hover:text-[var(--brand-red)]">{pieza.label || pieza.nombre || pieza}</button>)}
                </div>
              </div>
            )}
          </Campo>
        </div>

        <div className="grid grid-cols-[0.8fr_1.25fr_72px] gap-2.5 mt-3">
          <Campo label="Cant."><input type="number" min="1" value={item.cantidad} onChange={(e) => up("cantidad", e.target.value)} className="input" /></Campo>
          <Campo label="Precio (RD$)"><input type="number" min="0" step="0.01" value={item.precio} onChange={(e) => up("precio", e.target.value)} className="input" /></Campo>
          <Campo label="ITBIS"><input type="number" min="0" step="0.01" value={item.itbis_pct} onChange={(e) => up("itbis_pct", e.target.value)} className="input px-2 text-center" /></Campo>
        </div>

        <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
          <input type="checkbox" checked={item.incluye_itbis} onChange={(e) => up("incluye_itbis", e.target.checked)} className="w-5 h-5 accent-[var(--brand-red)]" />
          <span className="text-sm text-[var(--ink-soft)]">El precio ya incluye ITBIS</span>
        </label>

        <div className="flex items-center justify-between bg-[var(--paper)] rounded-xl px-4 py-3 mt-4">
          <span className="font-semibold text-[var(--ink)]">Total de la línea:</span>
          <span className="text-xl font-extrabold text-[var(--brand-red)]">{rd(total)}</span>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onCancel} className="btn-ghost">Cancelar</button>
          <button onClick={guardar} disabled={!nombreValido} className="btn-primary">{initial ? "Guardar" : "Agregar"}</button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return <label className="block"><span className="field-label">{label}</span>{children}</label>;
}
