import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { enlaceWhatsapp, mensajeCotizarPiezas, piezasDeCotizacion } from "../lib/mensajeSuplidor";
import Icon from "./Icon";

// Modal "Cotizar": se eligen uno o varios suplidores y a cada uno se le abre
// WhatsApp con el saludo y la lista de piezas de la cotización ya escrita.
// Se marca cuál ya se abrió para no perderse cuando son varios.
export default function CotizarSuplidoresModal({ cot, onClose }) {
  const [suplidores, setSuplidores] = useState([]);
  const [seleccion, setSeleccion] = useState(new Set());
  const [enviados, setEnviados] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const piezas = useMemo(() => piezasDeCotizacion(cot), [cot]);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("suplidores")
        .select("id, nombre, telefono, descripcion")
        .eq("activo", true)
        .order("nombre");
      setSuplidores(data || []);
      setLoading(false);
    }
    load();
  }, []);

  function toggle(id) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const elegidos = suplidores.filter((s) => seleccion.has(s.id));

  function abrirWhatsapp(s) {
    if (!piezas.length) return setError("Esta cotización no tiene piezas que pedir.");
    setError("");
    window.open(enlaceWhatsapp(s.telefono, mensajeCotizarPiezas(cot, s.nombre)), "_blank", "noopener");
    setEnviados((prev) => new Set(prev).add(s.id));
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[var(--ink)]">Cotizar piezas con suplidores</h3>
          <button onClick={onClose} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl leading-none">
            ✕
          </button>
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Se les manda el saludo y la lista de piezas por WhatsApp (sin precios).{" "}
          <Link to="/contactos?tab=suplidores" className="text-[var(--brand-red)] font-semibold hover:underline">
            Administrar suplidores
          </Link>
        </p>

        {/* Vista previa de las piezas que se van a pedir */}
        <div className="border border-[var(--line)] rounded-xl p-3 mb-4 bg-[var(--paper)]">
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--brand-red)] mb-1.5">
            {piezas.length} pieza(s) a cotizar
          </p>
          {piezas.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)]">Esta cotización no tiene piezas.</p>
          ) : (
            <ol className="text-sm text-[var(--ink)] list-decimal pl-5 space-y-0.5 max-h-32 overflow-y-auto">
              {piezas.map((p, i) => (
                <li key={i} className="truncate">
                  {p.nombre}
                  {p.cantidad > 1 && <span className="text-[var(--ink-soft)]"> ({p.cantidad})</span>}
                </li>
              ))}
            </ol>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--ink-soft)]">Cargando suplidores…</p>
        ) : suplidores.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)] mb-3">
            Aún no hay suplidores guardados.{" "}
            <Link to="/contactos?tab=suplidores" className="text-[var(--brand-red)] font-semibold hover:underline">
              Agrega el primero
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] mb-4 border border-[var(--line)] rounded-xl">
            {suplidores.map((s) => (
              <li key={s.id}>
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seleccion.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="w-4 h-4"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-[var(--ink)] truncate">{s.nombre}</span>
                    <span className="block text-xs text-[var(--ink-soft)] truncate">
                      {s.telefono}
                      {s.descripcion ? ` · ${s.descripcion}` : ""}
                    </span>
                  </span>
                  {enviados.has(s.id) && (
                    <span className="text-xs font-semibold text-emerald-600 shrink-0">✓ abierto</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

        {/* Un botón por suplidor: WhatsApp solo permite abrir una conversación
            a la vez, así que se van mandando de uno en uno. */}
        {elegidos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {elegidos.map((s) => (
              <button
                key={s.id}
                onClick={() => abrirWhatsapp(s)}
                disabled={!piezas.length}
                className={`gap-1.5 justify-center px-3 disabled:opacity-50 ${
                  enviados.has(s.id) ? "btn-ghost" : "btn-primary"
                }`}
              >
                <Icon name="whatsapp" className="w-4 h-4 shrink-0" />
                <span className="truncate">{s.nombre}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button onClick={onClose} className="btn-ghost">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
