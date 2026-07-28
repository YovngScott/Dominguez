import { useCallback, useEffect, useMemo, useState } from "react";
import Icon from "../Icon";
import {
  reporteConsumo,
  listarMovimientos,
  cantidadTexto,
  num,
  rd,
} from "../../lib/suministros";

// Primer y último día del mes actual, en formato yyyy-mm-dd.
function rangoMesActual() {
  const hoy = new Date();
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const siguiente = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { desde: iso(primero), hasta: iso(siguiente) };
}

// REPORTE DE CONSUMO: qué se gastó en un período, cuánto costó y quién lo
// consumió. Sirve para negociar con el suplidor y detectar desvíos.
export default function ReportesPanel() {
  const inicial = rangoMesActual();
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [filas, setFilas] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [rep, movs] = await Promise.all([
        reporteConsumo({ desde, hasta }),
        listarMovimientos({ desde, hasta, limite: 1000 }),
      ]);
      setFilas(rep);
      setMovimientos(movs);
      setError("");
    } catch (err) {
      setError(
        err.message?.includes("does not exist")
          ? "Falta ejecutar la migración sql/42_suministros_movimientos.sql en Supabase."
          : err.message || "No se pudo generar el reporte."
      );
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const totales = useMemo(
    () => ({
      consumo: filas.reduce((a, f) => a + num(f.consumo_neto), 0),
      costo: filas.reduce((a, f) => a + num(f.costo_estimado), 0),
      compras: movimientos
        .filter((m) => m.tipo === "entrada")
        .reduce((a, m) => a + num(m.cantidad) * num(m.costo_unitario), 0),
    }),
    [filas, movimientos]
  );

  // Quién consume más (solo salidas, agrupadas por persona).
  const porPersona = useMemo(() => {
    const m = new Map();
    movimientos
      .filter((x) => x.tipo === "salida" && x.solicitante)
      .forEach((x) => m.set(x.solicitante, (m.get(x.solicitante) || 0) + num(x.cantidad)));
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [movimientos]);

  return (
    <>
      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="field-label">Desde</span>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="field-label">Hasta (no incluido)</span>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="input" />
        </label>
        <button
          onClick={() => {
            const r = rangoMesActual();
            setDesde(r.desde);
            setHasta(r.hasta);
          }}
          className="btn-ghost text-sm py-2 px-3"
        >
          Este mes
        </button>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-4">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Generando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
            <Resumen valor={cantidadTexto(totales.consumo)} etiqueta="Unidades consumidas" color="#0284c7" />
            <Resumen valor={rd(totales.costo)} etiqueta="Costo del consumo" color="var(--brand-red)" />
            <Resumen valor={rd(totales.compras)} etiqueta="Comprado en el período" color="#059669" />
          </div>

          {filas.length === 0 ? (
            <div className="card p-10 text-center text-[var(--ink-soft)]">
              <Icon name="file" className="w-10 h-10 mx-auto mb-2 opacity-40" />
              No hubo movimientos en este período.
            </div>
          ) : (
            <div className="card p-4 sm:p-5 mb-5">
              <h3 className="font-bold text-[var(--ink)] mb-3">Consumo por insumo</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--ink-soft)] border-b border-[var(--line)]">
                      <th className="py-2 pr-3">Insumo</th>
                      <th className="py-2 px-2 text-right">Entró</th>
                      <th className="py-2 px-2 text-right">Salió</th>
                      <th className="py-2 px-2 text-right">Devuelto</th>
                      <th className="py-2 px-2 text-right">Consumo</th>
                      <th className="py-2 pl-2 text-right">Costo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <tr key={f.suministro_id} className="border-b border-[var(--line)] last:border-0">
                        <td className="py-2 pr-3 font-medium text-[var(--ink)]">{f.nombre}</td>
                        <td className="py-2 px-2 text-right text-emerald-600">
                          {cantidadTexto(f.entradas) !== "0" ? `+${cantidadTexto(f.entradas)}` : "—"}
                        </td>
                        <td className="py-2 px-2 text-right">{cantidadTexto(f.salidas)}</td>
                        <td className="py-2 px-2 text-right">
                          {cantidadTexto(f.devoluciones) !== "0" ? cantidadTexto(f.devoluciones) : "—"}
                        </td>
                        <td className="py-2 px-2 text-right font-bold text-[var(--ink)]">
                          {cantidadTexto(f.consumo_neto)} {f.unidad}
                        </td>
                        <td className="py-2 pl-2 text-right">{rd(f.costo_estimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-[var(--ink-soft)] mt-3">
                El costo se estima con el último precio de compra registrado de cada insumo.
              </p>
            </div>
          )}

          {porPersona.length > 0 && (
            <div className="card p-4 sm:p-5">
              <h3 className="font-bold text-[var(--ink)] mb-3">Quién consume más</h3>
              <ul className="space-y-2">
                {porPersona.map(([nombre, total]) => {
                  const max = porPersona[0][1] || 1;
                  return (
                    <li key={nombre}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="font-medium text-[var(--ink)] truncate">{nombre}</span>
                        <span className="text-[var(--ink-soft)] shrink-0 ml-2">
                          {cantidadTexto(total)} unidad(es)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--paper)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--brand-red)]"
                          style={{ width: `${Math.max(4, (total / max) * 100)}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </>
  );
}

function Resumen({ valor, etiqueta, color }) {
  return (
    <div className="card p-4">
      <p className="text-xl font-extrabold" style={{ color }}>
        {valor}
      </p>
      <p className="text-xs text-[var(--ink-soft)] mt-0.5">{etiqueta}</p>
    </div>
  );
}
