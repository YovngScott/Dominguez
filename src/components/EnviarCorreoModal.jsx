import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { enviarCorreo } from "../lib/enviarCorreo";
import { urlAJpegBlob, blobABase64 } from "../lib/toJpeg";
import Icon from "./Icon";

const SEGUNDOS_PARA_DESHACER = 8;

// Modal para enviar la cotización por correo a los contactos de la aseguradora.
// Adjunta el PDF de la cotización y (opcional) las fotos de los daños.
export default function EnviarCorreoModal({ cot, pdfUrl, evidencias = [], onClose }) {
  const [contactos, setContactos] = useState([]);
  const [seleccion, setSeleccion] = useState(new Set());
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoEmail, setNuevoEmail] = useState("");
  const [adjuntarFotos, setAdjuntarFotos] = useState(evidencias.length > 0);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  // Ventana para deshacer el envío: al pulsar "Enviar" se arma una cuenta
  // regresiva y el correo solo sale de verdad si no se cancela a tiempo.
  const [cuentaAtras, setCuentaAtras] = useState(null);
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);

  useEffect(() => {
    return () => {
      clearTimeout(timeoutRef.current);
      clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    async function load() {
      if (!cot.aseguradora_id) return;
      const { data } = await supabase
        .from("aseguradora_contactos")
        .select("*")
        .eq("aseguradora_id", cot.aseguradora_id)
        .order("created_at");
      setContactos(data || []);
      setSeleccion(new Set((data || []).map((c) => c.id))); // por defecto todos
    }
    load();
  }, [cot.aseguradora_id]);

  function toggle(id) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function agregarContacto() {
    const email = nuevoEmail.trim();
    if (!email || !email.includes("@")) return setError("Escribe un correo válido.");
    setError("");
    const { data, error: e } = await supabase
      .from("aseguradora_contactos")
      .insert({ aseguradora_id: cot.aseguradora_id, nombre: nuevoNombre.trim() || null, email })
      .select()
      .single();
    if (e) return setError("No se pudo guardar el contacto.");
    setContactos((prev) => [...prev, data]);
    setSeleccion((prev) => new Set(prev).add(data.id));
    setNuevoNombre("");
    setNuevoEmail("");
  }

  function asunto() {
    const veh = [cot.marca, cot.modelo, cot.anio].filter(Boolean).join(" ");
    const extra = [
      cot.placa ? `Placa ${cot.placa}` : null,
      cot.color ? `Color ${cot.color}` : null,
      cot.chasis ? `Chasis ${cot.chasis}` : null,
      cot.numero_reclamo ? `Reclamo ${cot.numero_reclamo}` : null,
    ].filter(Boolean).join(" · ");
    return `Cotización ${veh || "vehículo"}${extra ? " — " + extra : ""}`;
  }

  function cuerpo() {
    const veh = [cot.marca, cot.modelo, cot.anio].filter(Boolean).join(" ");
    const detalle = [
      cot.placa ? `placa ${cot.placa}` : null,
      cot.color ? `color ${cot.color}` : null,
      cot.chasis ? `chasis ${cot.chasis}` : null,
      cot.numero_reclamo ? `reclamo ${cot.numero_reclamo}` : null,
    ].filter(Boolean).join(", ");
    return `<p>Buenos días,</p>
<p>Adjuntamos la cotización del vehículo <b>${veh || "—"}</b>${detalle ? ` (${detalle})` : ""}.</p>
<p>Quedamos atentos a su aprobación. Cualquier consulta, con gusto.</p>
<p>Saludos cordiales,<br><b>Dominguez Auto Pintura</b></p>`;
  }

  function iniciarEnvio() {
    setError("");
    setOk("");
    const to = contactos.filter((c) => seleccion.has(c.id)).map((c) => ({ email: c.email, name: c.nombre || c.email }));
    if (!to.length) return setError("Selecciona al menos un contacto.");
    if (!pdfUrl) return setError("Esta cotización no tiene PDF para adjuntar.");

    setCuentaAtras(SEGUNDOS_PARA_DESHACER);
    intervalRef.current = setInterval(() => {
      setCuentaAtras((s) => (s > 1 ? s - 1 : s));
    }, 1000);
    timeoutRef.current = setTimeout(() => enviarAhora(to), SEGUNDOS_PARA_DESHACER * 1000);
  }

  function cancelarEnvio() {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
    setCuentaAtras(null);
  }

  async function enviarAhora(to) {
    clearInterval(intervalRef.current);
    setCuentaAtras(null);

    const attachment = [{ url: pdfUrl, name: `Cotizacion-${cot.numero || ""}.pdf` }];

    setEnviando(true);
    try {
      if (adjuntarFotos && evidencias.length) {
        // Las fotos se guardan en WebP en Storage; Brevo las adjuntaría tal
        // cual si se les pasa la URL, así que se convierten a JPG aquí y se
        // mandan como contenido base64 (más compatible en cualquier correo).
        const fotos = await Promise.all(
          evidencias.map(async (u, i) => {
            const jpg = await urlAJpegBlob(u);
            const content = await blobABase64(jpg);
            return { content, name: `dano-${i + 1}.jpg` };
          })
        );
        attachment.push(...fotos);
      }

      // UN solo correo con todos los destinatarios en el "Para" (no uno por uno).
      await enviarCorreo({ to, subject: asunto(), htmlContent: cuerpo(), attachment });
      setOk(`Correo enviado a ${to.length} destinatario(s).`);
      // Deja constancia en la cotización para mostrar "Enviada" en la lista.
      await supabase
        .from("cotizaciones")
        .update({ enviada_at: new Date().toISOString(), enviada_a: to.length })
        .eq("id", cot.id);
    } catch (err) {
      setError(err.message || "No se pudo enviar el correo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-lg font-bold text-[var(--ink)]">Enviar cotización por correo</h3>
          <button onClick={onClose} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl leading-none">✕</button>
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          A los contactos de <strong>{cot.aseguradora_nombre || "la aseguradora"}</strong>.{" "}
          <Link to="/contactos" className="text-[var(--brand-red)] font-semibold hover:underline">
            Administrar agenda
          </Link>
        </p>

        {/* Contactos */}
        {contactos.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)] mb-3">
            No hay contactos guardados para esta aseguradora. Agrega uno abajo.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] mb-3 border border-[var(--line)] rounded-xl">
            {contactos.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer">
                  <input type="checkbox" checked={seleccion.has(c.id)} onChange={() => toggle(c.id)} className="w-4 h-4" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-[var(--ink)] truncate">{c.nombre || c.email}</span>
                    {c.nombre && <span className="block text-xs text-[var(--ink-soft)] truncate">{c.email}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {/* Agregar contacto */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <input value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} className="input sm:w-40" placeholder="Nombre (opcional)" />
          <input value={nuevoEmail} onChange={(e) => setNuevoEmail(e.target.value)} className="input flex-1" placeholder="correo@aseguradora.com" />
          <button onClick={agregarContacto} className="btn-ghost whitespace-nowrap gap-1.5">
            <Icon name="plus" className="w-4 h-4" /> Agregar
          </button>
        </div>

        {evidencias.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)] mb-4 cursor-pointer">
            <input type="checkbox" checked={adjuntarFotos} onChange={(e) => setAdjuntarFotos(e.target.checked)} className="w-4 h-4" />
            Adjuntar fotos de los daños ({evidencias.length})
          </label>
        )}

        {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}
        {ok && <p className="text-sm text-emerald-600 mb-3 font-medium">✓ {ok}</p>}

        {cuentaAtras != null ? (
          <div className="flex items-center gap-3 justify-end">
            <span className="text-sm text-[var(--ink-soft)]">Enviando en {cuentaAtras}s…</span>
            <button onClick={cancelarEnvio} className="btn-primary gap-1.5">
              Cancelar
            </button>
          </div>
        ) : (
          <div className="flex gap-3 justify-end">
            <button onClick={onClose} className="btn-ghost">Cerrar</button>
            <button onClick={iniciarEnvio} disabled={enviando} className="btn-primary gap-1.5 disabled:opacity-50">
              <Icon name="receipt" className="w-4 h-4" />
              {enviando ? "Enviando…" : "Enviar correo"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
