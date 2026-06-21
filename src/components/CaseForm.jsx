import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "./Combobox";
import Icon from "./Icon";
import { ESTADOS, ESTADOS_PRINCIPALES } from "../lib/estados";
import { useFormDraft, clearFormDraft } from "../hooks/useFormDraft";

const ANIO_ACTUAL = new Date().getFullYear();
const ANIOS = Array.from({ length: ANIO_ACTUAL + 1 - 1980 + 1 }, (_, i) => {
  const y = String(ANIO_ACTUAL + 1 - i);
  return { id: y, label: y };
});

const FORM_VACIO = {
  nombre_completo: "",
  telefonos: [""],
  email: "",
  aseguradora_id: "",
  estado: "en_espera_piezas",
  marca: "",
  modelo: "",
  anio: "",
  color: "",
  chasis: "",
  placa: "",
  numero_reclamo: "",
  numero_poliza: "",
  suplidor: "",
  notas: "",
};

/**
 * Formulario compartido para crear y editar un caso.
 * - initial: valores iniciales (marca/modelo son texto libre).
 * - onSubmit(form): persiste; debe lanzar error si falla.
 */
export default function CaseForm({ initial, onSubmit, submitLabel = "Guardar caso", cancelTo = "/", draftKey }) {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ ...FORM_VACIO, ...initial });

  // Autoguardado silencioso del borrador (solo en alta de caso nuevo)
  useFormDraft({ key: draftKey, form, setForm, enabled: !!draftKey, initial });

  useEffect(() => {
    async function load() {
      const [{ data: asegs }, { data: marcasData }] = await Promise.all([
        supabase.from("aseguradoras").select("*").eq("activo", true).order("orden"),
        supabase.from("marcas").select("id, nombre").order("nombre"),
      ]);
      setAseguradoras(asegs || []);
      setMarcas((marcasData || []).map((m) => ({ id: m.nombre, label: m.nombre, _id: m.id })));
    }
    load();
  }, []);

  // Sugerencias de modelo cuando la marca escrita coincide con una del catálogo
  useEffect(() => {
    async function loadModelos() {
      const match = marcas.find((m) => m.label.toLowerCase() === (form.marca || "").trim().toLowerCase());
      if (!match) {
        setModelos([]);
        return;
      }
      const { data } = await supabase
        .from("modelos")
        .select("nombre")
        .eq("marca_id", match._id)
        .order("nombre");
      setModelos((data || []).map((m) => ({ id: m.nombre, label: m.nombre })));
    }
    loadModelos();
  }, [form.marca, marcas]);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setTelefono(i, val) {
    setForm((f) => {
      const t = [...f.telefonos];
      t[i] = val;
      return { ...f, telefonos: t };
    });
  }
  function addTelefono() {
    setForm((f) => ({ ...f, telefonos: [...f.telefonos, ""] }));
  }
  function quitarTelefono(i) {
    setForm((f) => ({ ...f, telefonos: f.telefonos.filter((_, idx) => idx !== i) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onSubmit(form);
      if (draftKey) clearFormDraft(draftKey);
    } catch (err) {
      setError(err.message || "Ocurrió un error al guardar el caso.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Categoría */}
      <Section title="¿Dónde entra el caso?" num="1">
        <div className="grid sm:grid-cols-2 gap-4">
          {ESTADOS_PRINCIPALES.map((estado) => {
            const e = ESTADOS[estado];
            const sel = form.estado === estado;
            return (
              <button
                key={estado}
                type="button"
                onClick={() => update("estado", estado)}
                className={`text-left rounded-2xl border-2 p-5 bg-gradient-to-br transition-all ${e.card} ${
                  sel ? "ring-2 ring-offset-2 shadow-md" : "opacity-70 hover:opacity-100"
                }`}
                style={sel ? { borderColor: e.accent, "--tw-ring-color": e.accent } : {}}
              >
                <span style={{ color: e.accent }}>
                  <Icon name={e.icon} className="w-7 h-7" />
                </span>
                <p className="mt-2 text-lg font-bold text-[var(--ink)]">{e.label}</p>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Asegurado */}
      <Section title="Datos del asegurado" num="2">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nombre completo" required>
            <input
              required
              value={form.nombre_completo}
              onChange={(e) => update("nombre_completo", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Correo">
            <input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="input" />
          </Field>
        </div>
        <div className="mt-4">
          <span className="field-label">Teléfono(s)</span>
          <div className="space-y-2">
            {form.telefonos.map((tel, i) => (
              <div key={i} className="flex gap-2">
                <input
                  value={tel}
                  onChange={(e) => setTelefono(i, e.target.value)}
                  className="input"
                  placeholder="(809) 555-5555"
                />
                {form.telefonos.length > 1 && (
                  <button type="button" onClick={() => quitarTelefono(i)} className="btn-ghost px-3">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={addTelefono} className="text-sm text-[var(--brand-red)] font-semibold mt-2">
            + Agregar teléfono
          </button>
        </div>
      </Section>

      {/* Seguro */}
      <Section title="Datos del seguro" num="3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Aseguradora" required>
            <Combobox
              items={aseguradoras.map((a) => ({ id: a.id, label: a.nombre }))}
              value={form.aseguradora_id}
              onChange={(v) => update("aseguradora_id", v)}
              placeholder="Seleccionar…"
            />
          </Field>
          <Field label="Número de reclamo">
            <input value={form.numero_reclamo} onChange={(e) => update("numero_reclamo", e.target.value)} className="input" />
          </Field>
          <Field label="Número de póliza">
            <input value={form.numero_poliza} onChange={(e) => update("numero_poliza", e.target.value)} className="input" />
          </Field>
        </div>
      </Section>

      {/* Vehículo */}
      <Section title="Datos del vehículo" num="4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Marca">
            <Combobox
              items={marcas}
              value={form.marca}
              onChange={(v) => setForm((f) => ({ ...f, marca: v, modelo: "" }))}
              placeholder="Escribe la marca…"
              allowCreate
            />
          </Field>
          <Field label="Modelo">
            <Combobox
              items={modelos}
              value={form.modelo}
              onChange={(v) => update("modelo", v)}
              placeholder="Escribe el modelo…"
              allowCreate
            />
          </Field>
          <Field label="Año">
            <Combobox items={ANIOS} value={form.anio} onChange={(v) => update("anio", v)} placeholder="Escribe el año…" allowCreate />
          </Field>
          <Field label="Color">
            <input value={form.color} onChange={(e) => update("color", e.target.value)} className="input" />
          </Field>
          <Field label="Placa">
            <input value={form.placa} onChange={(e) => update("placa", e.target.value)} className="input" />
          </Field>
          <Field label="Chasis">
            <input value={form.chasis} onChange={(e) => update("chasis", e.target.value)} className="input" />
          </Field>
          <Field label="Suplidor (de las piezas)">
            <input value={form.suplidor} onChange={(e) => update("suplidor", e.target.value)} className="input" />
          </Field>
        </div>
        <div className="mt-4">
          <Field label="Notas">
            <textarea value={form.notas} onChange={(e) => update("notas", e.target.value)} rows={3} className="input" />
          </Field>
        </div>
      </Section>

      {error && <p className="text-sm text-[var(--brand-red)]">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? "Guardando…" : submitLabel}
        </button>
        <Link to={cancelTo} className="btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}

function Section({ title, num, children }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="w-7 h-7 rounded-full bg-[var(--brand-red)] text-white text-sm font-bold flex items-center justify-center">
          {num}
        </span>
        <h2 className="font-bold text-[var(--ink)]">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="field-label">
        {label} {required && <span className="text-[var(--brand-red)]">*</span>}
      </span>
      {children}
    </label>
  );
}
