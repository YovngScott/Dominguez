import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { enviarWhatsappSuplidores } from "../lib/enviarWhatsapp";
import { enlaceWhatsapp, mensajeCotizarPiezas, piezasDeCotizacion } from "../lib/mensajeSuplidor";
import Icon from "./Icon";

// Modal "Cotizar": se eligen uno o varios suplidores y el sistema les manda
// solo el saludo y la lista de piezas por WhatsApp, igual que las citas.
// Si algún envío falla queda el enlace manual como respaldo.
export default function CotizarSuplidoresModal({ cot, onClose }) {
  const [suplidores, setSuplidores] = useState([]);
  const [seleccion, setSeleccion] = useState(new Set());
  const [resultados, setResultados] = useState({}); // id → { ok, error }
  const [enviando, setEnviando] = useState(false);
  const [ok, setOk] = useState("");
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
  const fallidos = elegidos.filter((s) => resultados[s.id] && !resultados[s.id].ok);

  async function enviar() {
    if (!piezas.length) return setError("Esta cotización no tiene piezas que pedir.");
    if (!elegidos.length) return setError("Selecciona al menos un suplidor.");
    setError("");
    setOk("");
    setEnviando(true);
    try {
      const { resultados: res, enviados } = await enviarWhatsappSuplidores(
        elegidos.map((s) => ({ id: s.id, telefono: s.telefono, texto: mensajeCotizarPiezas(cot, s.nombre) }))
      );
      const mapa = {};
      (res || []).forEach((r) => (mapa[r.id] = { ok: r.ok, error: r.error }));
      setResultados((prev) => ({ ...prev, ...mapa }));
      if (enviados > 0) setOk(`Mensaje enviado a ${enviados} suplidor(es).`);
      if (enviados < elegidos.length) {
        setError("A algunos no se les pudo enviar. Usa el enlace manual de abajo para esos.");
      }
    } catch (e) {
      setError(e.message || "No se pudo enviar el WhatsApp.");
    } finally {
      setEnviando(false);
    }
  }

  // Respaldo cuando el servidor de WhatsApp falla: abre la conversación con el
  // mensaje ya escrito para mandarlo a mano.
  function abrirWhatsappManual(s) {
    window.open(enlaceWhatsapp(s.telefono, mensajeCotizarPiezas(cot, s.nombre)), "_blank", "noopener");
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
          Se les manda automáticamente por WhatsApp el saludo y la lista de piezas (sin precios).{" "}
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
                  {resultados[s.id]?.ok && (
                    <span className="text-xs font-semibold text-emerald-600 shrink-0">✓ enviado</span>
                  )}
                  {resultados[s.id] && !resultados[s.id].ok && (
                    <span className="text-xs font-semibold text-[var(--brand-red)] shrink-0">✕ falló</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}
        {ok && <p className="text-sm text-emerald-600 mb-3 font-medium">✓ {ok}</p>}

        {/* Respaldo manual solo para los que fallaron: abre la conversación con
            el mensaje escrito para mandarlo a mano. */}
        {fallidos.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {fallidos.map((s) => (
              <button
                key={s.id}
                onClick={() => abrirWhatsappManual(s)}
                className="btn-ghost gap-1.5 justify-center px-3"
                title={resultados[s.id]?.error || ""}
              >
                <Icon name="whatsapp" className="w-4 h-4 shrink-0" />
                <span className="truncate">Enviar a mano a {s.nombre}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-ghost">
            Cerrar
          </button>
          <button
            onClick={enviar}
            disabled={enviando || !elegidos.length || !piezas.length}
            className="btn-primary gap-1.5 disabled:opacity-50"
          >
            <Icon name="whatsapp" className="w-4 h-4" />
            {enviando ? "Enviando…" : `Enviar por WhatsApp${elegidos.length ? ` (${elegidos.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
