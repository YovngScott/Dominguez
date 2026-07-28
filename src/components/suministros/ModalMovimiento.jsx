import { useState } from "react";
import Icon from "../Icon";
import Combobox from "../Combobox";
import { registrarMovimiento, cantidadTexto, num } from "../../lib/suministros";

// Registra una ENTRADA de mercancía (llegó del suplidor) o una DEVOLUCIÓN
// (sobró material de un trabajo y vuelve al almacén).
export default function ModalMovimiento({ tipo, suministros, preseleccionado, onCerrar, onListo }) {
  const esEntrada = tipo === "entrada";
  const [suministroId, setSuministroId] = useState(preseleccionado?.id || "");
  const [cantidad, setCantidad] = useState("");
  const [suplidor, setSuplidor] = useState("");
  const [factura, setFactura] = useState("");
  const [costo, setCosto] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const elegido = suministros.find((s) => s.id === suministroId);

  async function guardar() {
    if (!suministroId) return setError("Elige el insumo.");
    const cant = num(cantidad);
    if (cant <= 0) return setError("La cantidad debe ser mayor que cero.");

    setGuardando(true);
    setError("");
    try {
      await registrarMovimiento({
        suministroId,
        tipo,
        cantidad: cant,
        nota,
        suplidor: esEntrada ? suplidor : null,
        factura: esEntrada ? factura : null,
        costoUnitario: esEntrada && costo !== "" ? num(costo) : null,
      });
      onListo(
        esEntrada
          ? `Entrada registrada: ${cantidadTexto(cant)} × ${elegido?.nombre}.`
          : `Devolución registrada: ${cantidadTexto(cant)} × ${elegido?.nombre}.`
      );
    } catch (err) {
      setError(err.message || "No se pudo registrar el movimiento.");
    } finally {
      setGuardando(false);
    }
  }

  const total = esEntrada && costo !== "" && cantidad !== "" ? num(costo) * num(cantidad) : null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCerrar}>
      <div
        className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon
              name={esEntrada ? "download" : "package"}
              className={`w-5 h-5 ${esEntrada ? "text-emerald-600" : "text-violet-600"}`}
            />
            {esEntrada ? "Entrada de mercancía" : "Devolución al almacén"}
          </h2>
          <button onClick={onCerrar} className="text-[var(--ink-soft)] text-xl px-2 leading-none">
            ✕
          </button>
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          {esEntrada
            ? "Registra lo que llegó del suplidor. Suma al stock y queda en el historial."
            : "Material que sobró de un trabajo y regresa al almacén. Suma al stock."}
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Insumo *</span>
            <Combobox
              items={suministros.map((s) => ({
                id: s.id,
                label: `${s.nombre}${s.categoria ? ` · ${s.categoria}` : ""}`,
              }))}
              value={suministroId}
              onChange={setSuministroId}
              placeholder="Buscar insumo…"
            />
          </label>

          {elegido && (
            <p className="text-xs text-[var(--ink-soft)] -mt-1">
              Stock actual: <strong>{cantidadTexto(elegido.stock)} {elegido.unidad}</strong>
              {cantidad !== "" && num(cantidad) > 0 && (
                <>
                  {" → quedará "}
                  <strong className="text-emerald-600">
                    {cantidadTexto(num(elegido.stock) + num(cantidad))} {elegido.unidad}
                  </strong>
                </>
              )}
            </p>
          )}

          <label className="block">
            <span className="field-label">Cantidad que {esEntrada ? "llegó" : "regresa"} *</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="input text-lg"
              placeholder="0"
            />
          </label>

          {esEntrada && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="field-label">Suplidor</span>
                  <input
                    value={suplidor}
                    onChange={(e) => setSuplidor(e.target.value)}
                    className="input"
                    placeholder="Nombre del suplidor"
                  />
                </label>
                <label className="block">
                  <span className="field-label">No. de factura</span>
                  <input
                    value={factura}
                    onChange={(e) => setFactura(e.target.value)}
                    className="input"
                    placeholder="B0100000123"
                  />
                </label>
              </div>

              <label className="block">
                <span className="field-label">Costo por unidad (RD$)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costo}
                  onChange={(e) => setCosto(e.target.value)}
                  className="input"
                  placeholder="0.00"
                />
                {total != null && total > 0 && (
                  <span className="block text-xs text-[var(--ink-soft)] mt-1">
                    Total de la compra:{" "}
                    <strong className="text-[var(--ink)]">
                      RD$ {total.toLocaleString("es-DO", { minimumFractionDigits: 2 })}
                    </strong>
                  </span>
                )}
              </label>
            </>
          )}

          <label className="block">
            <span className="field-label">Nota</span>
            <textarea
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              rows={2}
              className="input"
              placeholder={esEntrada ? "Opcional" : "¿De qué trabajo sobró?"}
            />
          </label>
        </div>

        {error && <p className="text-sm text-[var(--brand-red)] mt-3">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button onClick={onCerrar} className="btn-ghost flex-1">
            Cancelar
          </button>
          <button onClick={guardar} disabled={guardando} className="btn-primary flex-1 disabled:opacity-50">
            {guardando ? "Guardando…" : esEntrada ? "Registrar entrada" : "Registrar devolución"}
          </button>
        </div>
      </div>
    </div>
  );
}
