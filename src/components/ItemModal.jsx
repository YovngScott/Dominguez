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
  const [pasoServicio, setPasoServicio] = useState(esServicio && inicial.pieza ? "pieza" : "servicio");

  function up(campo, valor) { setItem((it) => ({ ...it, [campo]: valor })); }
  const { total } = calcularItem(item);
  const nombreValido = item.nombre.trim();
  const piezaValida = !esServicio || item.pieza.trim();

  function cambiarServicio(valor) {
    up("nombre", valor);
    const coincideCatalogo = sugerenciasServicios.some(
      (servicio) => String(servicio.id).toLowerCase() === String(valor).trim().toLowerCase()
    );
    if (coincideCatalogo) setPasoServicio("pieza");
  }

  function cambiarPieza(valor) {
    up("pieza", normalizarNombrePieza(valor));
  }

  function continuarAPieza() {
    if (nombreValido) setPasoServicio("pieza");
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
            <h3 className="text-lg font-bold text-[var(--ink)]">{esServicio ? "Agregar mano de obra" : "Agregar pieza"}</h3>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5">
              {esServicio ? "Primero el trabajo; después, la pieza correspondiente." : "Escribe o selecciona la pieza."}
            </p>
          </div>
          <button onClick={onCancel} className="text-[var(--ink-soft)] text-xl p-2 -mr-2" aria-label="Cerrar">✕</button>
        </div>

        <div className="space-y-3">
          {esServicio ? (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-3 sm:p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--brand-red)]">
                  Paso {pasoServicio === "servicio" ? "1" : "2"} de 2
                </span>
                {pasoServicio === "pieza" && (
                  <button
                    type="button"
                    onClick={() => setPasoServicio("servicio")}
                    className="text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
                  >
                    Cambiar mano de obra
                  </button>
                )}
              </div>

              {pasoServicio === "pieza" && (
                <div className="mb-3 flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm text-[var(--ink)] shadow-sm">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">✓</span>
                  <span className="truncate font-semibold">{item.nombre}</span>
                </div>
              )}

              <Campo label={pasoServicio === "servicio" ? "Mano de obra" : "Pieza donde se realizará"}>
                <Combobox
                  key={pasoServicio}
                  items={pasoServicio === "servicio" ? sugerenciasServicios : sugerenciasPiezas}
                  value={pasoServicio === "servicio" ? item.nombre : item.pieza}
                  onChange={(val) => (pasoServicio === "servicio" ? cambiarServicio(val) : cambiarPieza(val))}
                  placeholder={pasoServicio === "servicio" ? "Ej. DESAB Y PINT" : "Ej. GUARDALODO DELT LH"}
                  allowCreate
                  autoFocus
                  maxResults={12}
                />
              </Campo>

              {pasoServicio === "servicio" ? (
                <button
                  type="button"
                  onClick={continuarAPieza}
                  disabled={!nombreValido}
                  className="btn-primary mt-3 w-full"
                >
                  Continuar a pieza
                </button>
              ) : (
                <p className="mt-2 text-[11px] text-[var(--ink-soft)]">
                  DELT delantero · TRAS trasero · RH derecha · LH izquierda · SUP superior · INF inferior
                </p>
              )}
            </div>
          ) : (
            <Campo label="Pieza">
              <Combobox
                items={sugerenciasPiezas}
                value={item.nombre}
                onChange={(val) => up("nombre", normalizarNombrePieza(val))}
                placeholder="Ej. Bumper DELT RH"
                allowCreate
                autoFocus
                maxResults={12}
              />
              <p className="text-[11px] text-[var(--ink-soft)] mt-1.5">DELT delantero · TRAS trasero · RH derecha · LH izquierda · SUP superior · INF inferior</p>
            </Campo>
          )}
        </div>

        {(!esServicio || pasoServicio === "pieza") && (
          <>
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
              <button
                onClick={guardar}
                disabled={!nombreValido || !piezaValida}
                className="btn-primary"
              >
                {initial ? "Guardar" : "Agregar"}
              </button>
            </div>
          </>
        )}

        {esServicio && pasoServicio === "servicio" && (
          <button onClick={onCancel} className="btn-ghost mt-4 w-full">Cancelar</button>
        )}
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return <label className="block"><span className="field-label">{label}</span>{children}</label>;
}
