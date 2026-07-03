import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

// Agenda de contactos de las aseguradoras: los correos de las personas de los
// seguros a las que se les envían las cotizaciones. Se pueden filtrar por
// aseguradora y buscar por nombre o correo. Es la misma tabla
// (aseguradora_contactos) que usa el modal "Enviar por correo" de la cotización.
export default function ContactosList() {
  const [contactos, setContactos] = useState([]);
  const [aseguradoras, setAseguradoras] = useState([]);
  const [q, setQ] = useState("");
  const [filtroAseg, setFiltroAseg] = useState(""); // "" = todas
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | "nuevo" | contacto en edición
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [{ data: cts }, { data: asegs }] = await Promise.all([
      supabase
        .from("aseguradora_contactos")
        .select("id, aseguradora_id, nombre, email, cargo, created_at")
        .order("nombre", { nullsFirst: false }),
      supabase.from("aseguradoras").select("id, nombre, logo_url").eq("activo", true).order("orden"),
    ]);
    setContactos(cts || []);
    setAseguradoras(asegs || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const asegPorId = useMemo(() => {
    const m = {};
    aseguradoras.forEach((a) => (m[a.id] = a));
    return m;
  }, [aseguradoras]);

  // contactos por aseguradora (para los contadores del filtro)
  const conteos = useMemo(() => {
    const m = {};
    contactos.forEach((c) => (m[c.aseguradora_id] = (m[c.aseguradora_id] || 0) + 1));
    return m;
  }, [contactos]);

  const term = q.trim().toLowerCase();
  const lista = contactos.filter((c) => {
    if (filtroAseg && c.aseguradora_id !== filtroAseg) return false;
    if (!term) return true;
    return [c.nombre, c.email, c.cargo, asegPorId[c.aseguradora_id]?.nombre]
      .filter(Boolean)
      .some((x) => String(x).toLowerCase().includes(term));
  });

  async function guardar(form) {
    setError("");
    const payload = {
      aseguradora_id: form.aseguradora_id,
      nombre: form.nombre?.trim() || null,
      email: form.email.trim().toLowerCase(),
      cargo: form.cargo?.trim() || null,
    };
    const { error: e } = form.id
      ? await supabase.from("aseguradora_contactos").update(payload).eq("id", form.id)
      : await supabase.from("aseguradora_contactos").insert(payload);
    if (e) {
      setError("No se pudo guardar el contacto.");
      return;
    }
    setModal(null);
    load();
  }

  async function eliminar(c) {
    setError("");
    if (!confirm(`¿Eliminar el contacto "${c.nombre || c.email}"? Esta acción no se puede deshacer.`)) return;
    const { error: e } = await supabase.from("aseguradora_contactos").delete().eq("id", c.id);
    if (e) {
      setError("No se pudo eliminar el contacto.");
      return;
    }
    load();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Contactos</h1>
          <p className="text-sm text-[var(--ink-soft)]">
            Agenda de correos de las aseguradoras · {contactos.length} contacto(s).
          </p>
        </div>
        <button onClick={() => setModal("nuevo")} className="btn-primary gap-1.5">
          <Icon name="plus" className="w-4 h-4" /> Contacto
        </button>
      </div>

      {/* Buscador + filtro por seguro */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Icon
            name="search"
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] pointer-events-none"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nombre o correo…"
            className="input w-full !pl-10"
          />
        </div>
        <FiltroAseguradoras
          aseguradoras={aseguradoras}
          conteos={conteos}
          total={contactos.length}
          value={filtroAseg}
          onChange={setFiltroAseg}
        />
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          <Icon name="mail" className="w-10 h-10 mx-auto mb-3 opacity-40" />
          {term || filtroAseg ? "Sin coincidencias con la búsqueda o el filtro." : "Aún no hay contactos. Agrega el primero con el botón “+ Contacto”."}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {lista.map((c) => {
            const aseg = asegPorId[c.aseguradora_id];
            return (
              <div key={c.id} className="card p-4 flex items-start gap-3">
                <span className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center font-bold text-[var(--brand-red)] bg-[var(--brand-red-50)] uppercase">
                  {iniciales(c.nombre || c.email)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[var(--ink)] truncate">{c.nombre || "Sin nombre"}</p>
                  {c.cargo && <p className="text-xs text-[var(--ink-soft)] truncate">{c.cargo}</p>}
                  <a
                    href={`mailto:${c.email}`}
                    className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] truncate flex items-center gap-1.5 mt-0.5"
                  >
                    <Icon name="mail" className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </a>
                  <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-[var(--ink)] bg-[var(--paper)] border border-[var(--line)] px-2.5 py-1 rounded-full max-w-full">
                    {aseg?.logo_url ? (
                      <img src={aseg.logo_url} alt="" className="w-4 h-4 rounded-full object-contain shrink-0" />
                    ) : (
                      <Icon name="shield" className="w-3.5 h-3.5 text-[var(--brand-red)] shrink-0" />
                    )}
                    <span className="truncate">{aseg?.nombre || "Seguro desconocido"}</span>
                  </span>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button onClick={() => setModal(c)} className="btn-ghost text-sm py-1.5 px-2.5" title="Editar">
                    <Icon name="pencil" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => eliminar(c)}
                    className="btn-ghost text-sm py-1.5 px-2.5 !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
                    title="Eliminar"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <ContactoModal
          contacto={modal === "nuevo" ? null : modal}
          aseguradoras={aseguradoras}
          onCancel={() => setModal(null)}
          onSave={guardar}
        />
      )}
    </div>
  );
}

function iniciales(texto) {
  const partes = String(texto).trim().split(/\s+/);
  return ((partes[0]?.[0] || "") + (partes[1]?.[0] || "")).toUpperCase() || "?";
}

// Droplist de aseguradoras: botón con la selección actual y panel con logos y
// número de contactos por seguro. Se cierra al elegir o al tocar fuera.
function FiltroAseguradoras({ aseguradoras, conteos, total, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function fuera(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", fuera);
    return () => document.removeEventListener("mousedown", fuera);
  }, []);

  const actual = aseguradoras.find((a) => a.id === value);

  return (
    <div ref={ref} className="relative sm:w-72">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="input w-full flex items-center gap-2 text-left"
      >
        {actual?.logo_url ? (
          <img src={actual.logo_url} alt="" className="w-5 h-5 rounded-full object-contain shrink-0" />
        ) : (
          <Icon name="shield" className="w-4 h-4 text-[var(--brand-red)] shrink-0" />
        )}
        <span className="flex-1 truncate font-medium">{actual ? actual.nombre : "Todos los seguros"}</span>
        <Icon
          name="chevronDown"
          className={`w-4 h-4 text-[var(--ink-soft)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white rounded-2xl shadow-xl border border-[var(--line)] p-1.5 max-h-72 overflow-y-auto">
          <OpcionAseg
            activo={!value}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
            icono={<Icon name="shield" className="w-4 h-4" />}
            nombre="Todos los seguros"
            cantidad={total}
          />
          {aseguradoras.map((a) => (
            <OpcionAseg
              key={a.id}
              activo={value === a.id}
              onClick={() => {
                onChange(a.id);
                setOpen(false);
              }}
              icono={
                a.logo_url ? (
                  <img src={a.logo_url} alt="" className="w-5 h-5 rounded-full object-contain" />
                ) : (
                  <Icon name="shield" className="w-4 h-4" />
                )
              }
              nombre={a.nombre}
              cantidad={conteos[a.id] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OpcionAseg({ activo, onClick, icono, nombre, cantidad }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
        activo ? "bg-[var(--brand-red)] text-white" : "text-[var(--ink)] hover:bg-[var(--paper)]"
      }`}
    >
      <span
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          activo ? "bg-white/20 text-white" : "bg-[var(--brand-red-50)] text-[var(--brand-red)]"
        }`}
      >
        {icono}
      </span>
      <span className="flex-1 text-left truncate">{nombre}</span>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${
          activo ? "bg-white/20 text-white" : "bg-[var(--paper)] text-[var(--ink-soft)]"
        }`}
      >
        {cantidad}
      </span>
    </button>
  );
}

function ContactoModal({ contacto, aseguradoras, onCancel, onSave }) {
  const [form, setForm] = useState(
    contacto || { nombre: "", email: "", cargo: "", aseguradora_id: aseguradoras[0]?.id || "" }
  );
  const up = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const emailValido = /\S+@\S+\.\S+/.test(form.email || "");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-[var(--ink)] mb-4">
          {contacto ? "Editar contacto" : "Nuevo contacto"}
        </h2>
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Nombre</span>
            <input
              value={form.nombre || ""}
              onChange={(e) => up("nombre", e.target.value)}
              className="input"
              placeholder="Ej: María Rodríguez"
            />
          </label>
          <label className="block">
            <span className="field-label">Correo electrónico *</span>
            <input
              type="email"
              value={form.email || ""}
              onChange={(e) => up("email", e.target.value)}
              className="input"
              placeholder="correo@aseguradora.com"
            />
          </label>
          <label className="block">
            <span className="field-label">Seguro *</span>
            <select
              value={form.aseguradora_id || ""}
              onChange={(e) => up("aseguradora_id", e.target.value)}
              className="input"
            >
              <option value="" disabled>
                Selecciona la aseguradora…
              </option>
              {aseguradoras.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">Cargo (opcional)</span>
            <input
              value={form.cargo || ""}
              onChange={(e) => up("cargo", e.target.value)}
              className="input"
              placeholder="Ej: Analista de reclamaciones"
            />
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => onSave(form)}
            disabled={!emailValido || !form.aseguradora_id}
            className="btn-primary disabled:opacity-50"
          >
            Guardar
          </button>
          <button onClick={onCancel} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
