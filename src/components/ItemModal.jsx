import { useState } from "react";
import Combobox from "./Combobox";
import { calcularItem, rd, LADOS, SUB_LADOS, ITBIS_DEFAULT } from "../lib/cotizacion";

const VACIO = {
  nombre: "",
  pieza: "",
  lado: "",
  sub_lado: "",
  cantidad: 1,
  precio: 0,
  itbis_pct: ITBIS_DEFAULT,
  incluye_itbis: false,
};

/**
 * Modal para agregar/editar una pieza o un servicio.
 * tipo: "pieza" | "servicio"
 */
export default function ItemModal({ tipo, initial, onConfirm, onCancel, sugerenciasPiezas = [] }) {
  const [item, setItem] = useState({ ...VACIO, ...initial });
  const esServicio = tipo === "servicio";

  function up(campo, valor) {
    setItem((it) => ({ ...it, [campo]: valor }));
  }

  const { total } = calcularItem(item);
  const nombreValido = esServicio ? item.nombre.trim() : item.nombre.trim();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--ink)]">
            {esServicio ? "Agregar servicio" : "Agregar pieza"}
          </h3>
          <button onClick={onCancel} className="text-[var(--ink-soft)] text-xl px-2">
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {esServicio && (
            <Campo label="Nombre del servicio" full>
              <input
                autoFocus
                value={item.nombre}
                onChange={(e) => up("nombre", e.target.value)}
                placeholder="ej. Pintura completa"
                className="input"
              />
            </Campo>
          )}

          <Campo label={esServicio ? "Pieza relacionada" : "Nombre de la pieza"} full={!esServicio}>
            <Combobox
              items={sugerenciasPiezas}
              value={esServicio ? item.pieza : item.nombre}
              onChange={(val) => up(esServicio ? "pieza" : "nombre", val)}
              placeholder="ej. Bumper, Puerta, Foco…"
              allowCreate
            />
          </Campo>

          <Campo label="Lado">
            <Combobox
              items={LADOS.map((l) => ({ id: l, label: l }))}
              value={item.lado}
              onChange={(val) => up("lado", val)}
              placeholder="Seleccionar…"
            />
          </Campo>

          <Campo label="Sub-lado">
            <Combobox
              items={SUB_LADOS.map((l) => ({ id: l, label: l }))}
              value={item.sub_lado}
              onChange={(val) => up("sub_lado", val)}
              placeholder="Seleccionar…"
            />
          </Campo>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-3">
          <Campo label="Cantidad">
            <input
              type="number"
              min="1"
              value={item.cantidad}
              onChange={(e) => up("cantidad", e.target.value)}
              className="input"
            />
          </Campo>
          <Campo label="Precio (RD$)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.precio}
              onChange={(e) => up("precio", e.target.value)}
              className="input"
            />
          </Campo>
          <Campo label="ITBIS (%)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.itbis_pct}
              onChange={(e) => up("itbis_pct", e.target.value)}
              className="input"
            />
          </Campo>
        </div>

        <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={item.incluye_itbis}
            onChange={(e) => up("incluye_itbis", e.target.checked)}
            className="w-5 h-5 accent-[var(--brand-red)]"
          />
          <span className="text-sm text-[var(--ink-soft)]">El precio ingresado ya incluye ITBIS</span>
        </label>

        <div className="flex items-center justify-between bg-[var(--paper)] rounded-xl px-4 py-3 mt-4">
          <span className="font-semibold text-[var(--ink)]">Total de la línea:</span>
          <span className="text-xl font-extrabold text-[var(--brand-red)]">{rd(total)}</span>
        </div>

        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onCancel} className="btn-ghost">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(item)}
            disabled={!nombreValido}
            className="btn-primary"
          >
            {initial ? "Guardar" : "Agregar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children, full }) {
  return (
    <label className={`block ${full ? "col-span-2" : ""}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
