import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "./Icon";

const LLAVES = Array.from({ length: 64 }, (_, i) => i + 1);

export default function SelectorLlave({ casoId, numeroLlave, estado, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupadas, setOcupadas] = useState(new Set());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function cargarOcupadas() {
    const { data, error: e } = await supabase
      .from("casos")
      .select("id, numero_llave")
      .not("numero_llave", "is", null)
      .neq("estado", "entregado")
      .neq("id", casoId);
    if (!e) setOcupadas(new Set((data || []).map((c) => c.numero_llave)));
  }

  useEffect(() => {
    if (abierto) cargarOcupadas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, casoId]);

  async function asignar(valor) {
    if (guardando || (valor && ocupadas.has(valor))) return;
    setGuardando(true);
    setError("");
    const { error: e } = await supabase.from("casos").update({ numero_llave: valor || null }).eq("id", casoId);
    setGuardando(false);
    if (e) {
      setError(e.code === "23505" ? "Esa llave acaba de ser asignada a otro vehículo." : e.message);
      cargarOcupadas();
      return;
    }
    onChange(valor || null);
    setAbierto(false);
  }

  if (estado === "entregado") {
    return <p className="text-xs text-[var(--ink-soft)]">Llave liberada al entregar el vehículo.</p>;
  }

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title={numeroLlave ? `Cambiar llave #${numeroLlave}` : "Asignar llave"}
        className={`btn-ghost text-sm py-2 px-3 gap-1.5 ${
          numeroLlave ? "!border-amber-400 !text-amber-700" : "border-dashed"
        }`}
      >
        <Icon name="key" className="w-4 h-4" />
        <span className="font-bold">{numeroLlave ? `Llave #${numeroLlave}` : "Asignar llave"}</span>
        {/*
        <span className="text-[10px] uppercase tracking-wide opacity-70">Llave asignada</span>
        <span className="flex items-center gap-1.5 font-extrabold text-lg leading-5">
          <span aria-hidden="true">🔑</span> {numeroLlave ? `#${numeroLlave}` : "Asignar"}
        </span>
        */}
      </button>

      {abierto && (
        <div className="fixed inset-0 z-50 bg-black/55 p-4 flex items-center justify-center" onClick={() => setAbierto(false)}>
          <div className="card w-full max-w-lg p-5 max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-xl font-extrabold text-[var(--ink)]">Asignar número de llave</h2>
                <p className="text-sm text-[var(--ink-soft)]">Elija una llave disponible. Las oscuras ya están ocupadas.</p>
              </div>
              <button onClick={() => setAbierto(false)} className="btn-ghost p-2" aria-label="Cerrar"><Icon name="close" className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-8 gap-2">
              {LLAVES.map((n) => {
                const ocupada = ocupadas.has(n);
                const actual = numeroLlave === n;
                return (
                  <button key={n} disabled={ocupada || guardando} onClick={() => asignar(n)} title={ocupada ? "Ocupada" : `Asignar llave ${n}`}
                    className={`aspect-square rounded-lg text-sm font-bold transition-all ${
                      actual ? "bg-[var(--brand-red)] text-white ring-2 ring-[var(--brand-red)]/30" : ocupada ? "bg-slate-200 text-slate-400 cursor-not-allowed line-through" : "bg-[var(--surface-2)] text-[var(--ink)] hover:bg-amber-100 hover:text-amber-800"
                    }`}>{n}</button>
                );
              })}
            </div>
            {numeroLlave && <button disabled={guardando} onClick={() => asignar(null)} className="mt-5 text-sm font-semibold text-[var(--brand-red)] hover:underline">Liberar llave #{numeroLlave}</button>}
            {error && <p className="text-sm text-[var(--brand-red)] mt-3">{error}</p>}
          </div>
        </div>
      )}
    </>
  );
}
