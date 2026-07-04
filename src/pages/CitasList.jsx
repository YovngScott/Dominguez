import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import { enviarWhatsappCita } from "../lib/enviarWhatsapp";

const ESTADOS = ["pendiente", "confirmada", "atendida", "cancelada"];
const ESTADO_COLOR = {
  pendiente: "bg-amber-50 text-amber-600",
  confirmada: "bg-sky-50 text-sky-600",
  atendida: "bg-emerald-50 text-emerald-600",
  cancelada: "bg-slate-100 text-slate-500",
};

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function fechaLarga(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString("es-DO", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function CitasList() {
  const [citas, setCitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nuevo, setNuevo] = useState(false);
  const [error, setError] = useState("");

  // Filtros
  const [q, setQ] = useState("");
  const [fecha, setFecha] = useState("");
  const [proximas, setProximas] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("citas")
      .select(
        `*,
         cliente:clientes(nombre_completo),
         caso:casos(placa, marca:marcas(nombre), modelo:modelos(nombre))`
      )
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });
    setCitas(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function cambiarEstado(cita, estado) {
    setError("");
    const { error: e } = await supabase.from("citas").update({ estado }).eq("id", cita.id);
    if (e) return setError("No se pudo actualizar el estado de la cita.");
    setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, estado } : c)));
  }

  async function eliminar(cita) {
    if (!confirm(`¿Eliminar la cita de "${cita.nombre}"?`)) return;
    setError("");
    const { error: e } = await supabase.from("citas").delete().eq("id", cita.id);
    if (e) return setError("No se pudo eliminar la cita.");
    setCitas((prev) => prev.filter((c) => c.id !== cita.id));
  }

  const term = q.trim().toLowerCase();
  const lista = citas.filter((c) => {
    if (term && !String(c.nombre).toLowerCase().includes(term)) return false;
    if (fecha && c.fecha !== fecha) return false;
    if (proximas && c.fecha < hoy()) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Citas</h1>
        <button onClick={() => setNuevo(true)} className="btn-primary">
          <span className="text-lg leading-none">+</span> Nueva cita
        </button>
      </div>

      {/* Filtros */}
      <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3 mb-5">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre…"
          className="input w-full"
        />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" />
        <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)] px-2 cursor-pointer whitespace-nowrap">
          <input type="checkbox" checked={proximas} onChange={(e) => setProximas(e.target.checked)} />
          Solo próximas
        </label>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {citas.length === 0 ? "Aún no hay citas. Agrega la primera." : "Sin coincidencias."}
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => (
            <div key={c.id} className="card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-[var(--ink)]">{c.nombre}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLOR[c.estado]}`}>
                    {c.estado}
                  </span>
                </div>
                <p className="text-sm text-[var(--ink-soft)] mt-0.5">
                  <Icon name="clock" className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
                  {fechaLarga(c.fecha)}
                  {c.hora ? ` · ${c.hora}` : ""}
                  {c.telefono ? ` · ${c.telefono}` : ""}
                </p>
                {c.motivo && <p className="text-sm text-[var(--ink)] mt-1">{c.motivo}</p>}
                {c.nota && <p className="text-xs text-[var(--ink-soft)] mt-0.5">{c.nota}</p>}
                {c.caso_id && (
                  <Link
                    to={`/casos/${c.caso_id}`}
                    className="text-xs text-[var(--brand-red)] font-semibold mt-1 inline-block"
                  >
                    {[c.caso?.marca?.nombre, c.caso?.modelo?.nombre, c.caso?.placa]
                      .filter(Boolean)
                      .join(" ") || "Ver caso enlazado"}
                  </Link>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                <select
                  value={c.estado}
                  onChange={(e) => cambiarEstado(c, e.target.value)}
                  className="input text-sm py-1.5 px-2"
                >
                  {ESTADOS.map((e) => (
                    <option key={e} value={e}>
                      {e}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => eliminar(c)}
                  className="btn-ghost text-sm py-1.5 px-2.5 !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
                  title="Eliminar"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {nuevo && (
        <NuevaCitaModal
          onCancel={() => setNuevo(false)}
          onSaved={() => {
            setNuevo(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function NuevaCitaModal({ onCancel, onSaved }) {
  const [clientes, setClientes] = useState([]);
  const [casos, setCasos] = useState([]);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState({
    fecha: hoy(),
    hora: "",
    cliente_id: "",
    caso_id: "",
    nombre: "",
    telefono: "",
    motivo: "",
    nota: "",
  });
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("clientes")
        .select("id, nombre_completo, telefono")
        .order("nombre_completo");
      setClientes(data || []);
    }
    load();
  }, []);

  // Al elegir cliente: prefijar nombre/teléfono y cargar sus casos.
  async function elegirCliente(id) {
    const cli = clientes.find((c) => c.id === id);
    setForm((f) => ({
      ...f,
      cliente_id: id,
      caso_id: "",
      nombre: cli?.nombre_completo || f.nombre,
      telefono: cli?.telefono || f.telefono,
    }));
    if (!id) {
      setCasos([]);
      return;
    }
    const { data } = await supabase
      .from("casos")
      .select("id, placa, marca:marcas(nombre), modelo:modelos(nombre)")
      .eq("cliente_id", id)
      .order("created_at", { ascending: false });
    setCasos(data || []);
  }

  async function guardar() {
    setError("");
    if (!form.nombre.trim()) return setError("El nombre es obligatorio.");
    if (!form.fecha) return setError("La fecha es obligatoria.");
    setGuardando(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error: e } = await supabase.from("citas").insert({
      fecha: form.fecha,
      hora: form.hora || null,
      nombre: form.nombre,
      telefono: form.telefono || null,
      motivo: form.motivo || null,
      nota: form.nota || null,
      cliente_id: form.cliente_id || null,
      caso_id: form.caso_id || null,
      created_by: userData?.user?.id,
    });
    if (e) {
      setGuardando(false);
      setError(e.message || "No se pudo guardar la cita. ¿Ejecutaste la migración sql/16_citas.sql?");
      return;
    }

    // Envío AUTOMÁTICO del WhatsApp de confirmación (Cloud API de Meta). No
    // bloquea el cierre: si falla, la cita ya quedó guardada y queda el botón
    // manual de WhatsApp en la tarjeta como respaldo.
    if (form.telefono?.trim()) {
      const casoSel = casos.find((c) => c.id === form.caso_id);
      const vehiculo = casoSel
        ? [casoSel.marca?.nombre, casoSel.modelo?.nombre, casoSel.placa].filter(Boolean).join(" ")
        : "";
      try {
        await enviarWhatsappCita({
          to: form.telefono,
          nombre: form.nombre,
          fecha: fechaLarga(form.fecha),
          hora: form.hora || "por confirmar",
          vehiculo,
          servicio: form.motivo || "Cita",
        });
      } catch (err) {
        console.warn("No se pudo enviar el WhatsApp automático:", err.message);
      }
    }

    setGuardando(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div
        className="bg-white rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-[var(--ink)] mb-4">Nueva cita</h2>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Fecha *</span>
              <input type="date" value={form.fecha} onChange={(e) => up("fecha", e.target.value)} className="input" />
            </label>
            <label className="block">
              <span className="field-label">Hora</span>
              <input type="time" value={form.hora} onChange={(e) => up("hora", e.target.value)} className="input" />
            </label>
          </div>

          <label className="block">
            <span className="field-label">Cliente existente (opcional)</span>
            <Combobox
              items={clientes.map((c) => ({ id: c.id, label: c.nombre_completo }))}
              value={form.cliente_id}
              onChange={(id) => elegirCliente(id)}
              placeholder="Buscar cliente…"
            />
          </label>

          {form.cliente_id && casos.length > 0 && (
            <label className="block">
              <span className="field-label">Caso enlazado (opcional)</span>
              <Combobox
                items={casos.map((c) => ({
                  id: c.id,
                  label: [c.marca?.nombre, c.modelo?.nombre, c.placa].filter(Boolean).join(" ") || "Caso",
                }))}
                value={form.caso_id}
                onChange={(id) => up("caso_id", id)}
                placeholder="Seleccionar caso…"
              />
            </label>
          )}

          <label className="block">
            <span className="field-label">Nombre *</span>
            <input value={form.nombre} onChange={(e) => up("nombre", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="field-label">Teléfono</span>
            <input value={form.telefono} onChange={(e) => up("telefono", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="field-label">Motivo</span>
            <input
              value={form.motivo}
              onChange={(e) => up("motivo", e.target.value)}
              className="input"
              placeholder="Cotización, entrega, revisión…"
            />
          </label>
          <label className="block">
            <span className="field-label">Nota</span>
            <textarea value={form.nota} onChange={(e) => up("nota", e.target.value)} rows={2} className="input" />
          </label>
        </div>

        {error && <p className="text-sm text-[var(--brand-red)] mt-3">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button onClick={guardar} disabled={guardando} className="btn-primary disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar cita"}
          </button>
          <button onClick={onCancel} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
