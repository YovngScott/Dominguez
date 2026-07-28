import { useCallback, useEffect, useState } from "react";
import Icon from "../Icon";
import {
  TIPOS_MOVIMIENTO,
  listarMovimientos,
  cantidadTexto,
  fechaHora,
  rd,
} from "../../lib/suministros";

// KARDEX: historial de todo lo que entró y salió del almacén, con el saldo
// antes y después de cada movimiento (así se puede auditar cualquier
// diferencia). Se puede filtrar por insumo y por tipo de movimiento.
export default function MovimientosPanel({ suministros, filtroInicial = null }) {
  const [movimientos, setMovimientos] = useState([]);
  const [suministroId, setSuministroId] = useState(filtroInicial || "");
  const [tipo, setTipo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      setMovimientos(await listarMovimientos({ suministroId: suministroId || undefined, tipo: tipo || undefined }));
      setError("");
    } catch (err) {
      setError(
        err.message?.includes("does not exist")
          ? "Falta ejecutar la migración sql/42_suministros_movimientos.sql en Supabase."
          : err.message || "No se pudo cargar el historial."
      );
    } finally {
      setLoading(false);
    }
  }, [suministroId, tipo]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-3 mb-4">
        <select
          value={suministroId}
          onChange={(e) => setSuministroId(e.target.value)}
          className="input"
        >
          <option value="">Todos los insumos</option>
          {suministros.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input">
          <option value="">Todos los movimientos</option>
          {Object.entries(TIPOS_MOVIMIENTO).map(([k, v]) => (
            <option key={k} value={k}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-4">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : movimientos.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          <Icon name="file" className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Aún no hay movimientos registrados.
        </div>
      ) : (
        <div className="card divide-y divide-[var(--line)] overflow-hidden">
          {movimientos.map((m) => {
            const t = TIPOS_MOVIMIENTO[m.tipo] || TIPOS_MOVIMIENTO.ajuste;
            const suma = m.stock_despues >= m.stock_antes;
            return (
              <div key={m.id} className="px-4 sm:px-5 py-3.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${t.chip}`}>
                      {t.label}
                    </span>
                    <p className="font-semibold text-[var(--ink)] truncate">{m.suministro_nombre}</p>
                  </div>
                  <p className="text-xs text-[var(--ink-soft)] mt-1">
                    {fechaHora(m.created_at)}
                    {m.solicitante ? ` · ${m.solicitante}` : ""}
                    {m.suplidor ? ` · ${m.suplidor}` : ""}
                    {m.factura ? ` · Factura ${m.factura}` : ""}
                  </p>
                  {m.costo_unitario != null && (
                    <p className="text-xs text-[var(--ink-soft)]">
                      Costo unitario: {rd(m.costo_unitario)}
                    </p>
                  )}
                  {m.nota && <p className="text-sm text-[var(--ink)] mt-1">{m.nota}</p>}
                </div>

                <div className="text-right shrink-0">
                  <p
                    className={`font-extrabold ${suma ? "text-emerald-600" : "text-[var(--brand-red)]"}`}
                  >
                    {suma ? "+" : "−"}
                    {cantidadTexto(m.cantidad)}
                  </p>
                  <p className="text-xs text-[var(--ink-soft)] whitespace-nowrap">
                    {cantidadTexto(m.stock_antes)} → <strong>{cantidadTexto(m.stock_despues)}</strong>
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
