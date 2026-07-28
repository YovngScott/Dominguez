import { useMemo, useState } from "react";
import Icon from "../Icon";
import { registrarMovimiento, cantidadTexto, num } from "../../lib/suministros";

// CONTEO FÍSICO: se recorre el estante, se anota lo que hay de verdad y el
// sistema calcula la diferencia contra el saldo teórico. Al aplicar, cada
// diferencia queda como un movimiento de "ajuste" en el kardex.
export default function ConteoPanel({ suministros, onAplicado }) {
  const [contados, setContados] = useState({}); // { suministroId: "12" }
  const [q, setQ] = useState("");
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState("");

  const term = q.trim().toLowerCase();
  const lista = suministros.filter((s) => {
    if (!s.activo) return false;
    if (!term) return true;
    return [s.nombre, s.categoria].filter(Boolean).some((x) => x.toLowerCase().includes(term));
  });

  // Solo cuentan los que tienen un valor escrito y distinto al saldo actual.
  const diferencias = useMemo(
    () =>
      suministros
        .filter((s) => contados[s.id] !== undefined && contados[s.id] !== "")
        .map((s) => ({
          suministro: s,
          contado: num(contados[s.id]),
          diferencia: num(contados[s.id]) - num(s.stock),
        }))
        .filter((d) => d.diferencia !== 0),
    [contados, suministros]
  );

  async function aplicar() {
    setAplicando(true);
    setError("");
    try {
      for (const d of diferencias) {
        await registrarMovimiento({
          suministroId: d.suministro.id,
          tipo: "ajuste",
          cantidad: d.contado, // en un ajuste se manda el saldo REAL contado
          nota: `Conteo físico: había ${cantidadTexto(d.suministro.stock)}, se contó ${cantidadTexto(
            d.contado
          )}`,
        });
      }
      setContados({});
      onAplicado(
        `Conteo aplicado: ${diferencias.length} ajuste${diferencias.length === 1 ? "" : "s"} al inventario.`
      );
    } catch (err) {
      setError(err.message || "No se pudo aplicar el conteo.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <>
      <div className="card p-4 mb-4 flex items-start gap-3">
        <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
          <Icon name="clipboard" className="w-5 h-5" />
        </span>
        <div className="text-sm">
          <p className="font-bold text-[var(--ink)]">Conteo físico del almacén</p>
          <p className="text-[var(--ink-soft)]">
            Escribe cuánto hay <strong>realmente</strong> en el estante. Solo se ajustan los que
            tengan diferencia; los que dejes vacíos no se tocan.
          </p>
        </div>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar insumo…"
        className="input w-full mb-4"
      />

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      <div className="card divide-y divide-[var(--line)] overflow-hidden mb-4">
        {lista.map((s) => {
          const valor = contados[s.id] ?? "";
          const dif = valor === "" ? null : num(valor) - num(s.stock);
          return (
            <div key={s.id} className="px-4 py-3 flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[var(--ink)] truncate">{s.nombre}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  Sistema: {cantidadTexto(s.stock)} {s.unidad}
                </p>
              </div>

              {dif != null && dif !== 0 && (
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-full whitespace-nowrap ${
                    dif > 0 ? "bg-emerald-50 text-emerald-600" : "bg-[var(--brand-red-50)] text-[var(--brand-red)]"
                  }`}
                >
                  {dif > 0 ? "+" : ""}
                  {cantidadTexto(dif)}
                </span>
              )}

              <input
                type="number"
                min="0"
                step="0.01"
                value={valor}
                onChange={(e) => setContados((p) => ({ ...p, [s.id]: e.target.value }))}
                placeholder="Contado"
                className="input w-28 text-center font-bold shrink-0"
              />
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-4">
        <button
          onClick={aplicar}
          disabled={aplicando || diferencias.length === 0}
          className="btn-primary w-full py-3 disabled:opacity-50 shadow-lg"
        >
          {aplicando
            ? "Aplicando…"
            : diferencias.length === 0
            ? "Sin diferencias que ajustar"
            : `Aplicar ${diferencias.length} ajuste(s) al inventario`}
        </button>
      </div>
    </>
  );
}
