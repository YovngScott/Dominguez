import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import { imprimirVehiculo } from "../lib/printServer";

// Crea la ETIQUETA DE VEHÍCULO: marca/modelo + trabajos a realizar (en grande).
export default function EtiquetasVehiculo() {
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [form, setForm] = useState({ marca: "", modelo: "", anio: "" });
  const [trabajos, setTrabajos] = useState([]);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [imprimiendo, setImprimiendo] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: ms } = await supabase.from("marcas").select("id, nombre").order("nombre");
      setMarcas((ms || []).map((m) => ({ id: m.nombre, label: m.nombre, _id: m.id })));
    }
    load();
  }, []);

  useEffect(() => {
    async function loadModelos() {
      const match = marcas.find((m) => m.label.toLowerCase() === (form.marca || "").trim().toLowerCase());
      if (!match) return setModelos([]);
      const { data } = await supabase.from("modelos").select("nombre").eq("marca_id", match._id).order("nombre");
      setModelos((data || []).map((m) => ({ id: m.nombre, label: m.nombre })));
    }
    loadModelos();
  }, [form.marca, marcas]);

  function agregar() {
    const t = nuevo.trim();
    if (!t) return;
    setTrabajos((prev) => [...prev, t]);
    setNuevo("");
  }
  function quitar(i) {
    setTrabajos((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function imprimir() {
    setError("");
    setOk("");
    if (!trabajos.length) return setError("Agrega al menos un trabajo a realizar.");
    setImprimiendo(true);
    try {
      const res = await imprimirVehiculo({ marca: form.marca, modelo: form.modelo, anio: form.anio, trabajos });
      if (res.modo === "directo") setOk("Enviado a la impresora.");
      else window.open(URL.createObjectURL(res.blob), "_blank");
    } catch (err) {
      setError(err.message || "No se pudo imprimir la etiqueta.");
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/etiquetas" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Etiquetas
      </Link>

      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[var(--brand-red)] opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              Etiqueta de vehículo
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">Trabajos a realizar</h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              Para pegar en el carro: marca/modelo y los trabajos en grande, legibles de lejos.
            </p>
          </div>
          <span className="hidden sm:block text-white/90">
            <Icon name="car" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button onClick={imprimir} disabled={imprimiendo} className="btn-primary gap-1.5 disabled:opacity-50">
          <Icon name="printer" className="w-4 h-4" />
          {imprimiendo ? "Imprimiendo…" : "Imprimir etiqueta"}
        </button>
        <Link to="/etiquetas" className="btn-ghost">Cancelar</Link>
      </div>
      {ok && <p className="text-sm text-emerald-600 mb-4 font-medium">✓ {ok}</p>}
      {error && <p className="text-sm text-[var(--brand-red)] mb-4">{error}</p>}

      <div className="space-y-5">
        <div className="card p-6">
          <h2 className="font-bold text-[var(--ink)] mb-4">Vehículo</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <label className="block">
              <span className="field-label">Marca</span>
              <Combobox items={marcas} value={form.marca} onChange={(v) => setForm((f) => ({ ...f, marca: v, modelo: "" }))} placeholder="Toyota, Honda…" allowCreate />
            </label>
            <label className="block">
              <span className="field-label">Modelo</span>
              <Combobox items={modelos} value={form.modelo} onChange={(v) => setForm((f) => ({ ...f, modelo: v }))} placeholder="Corolla, Civic…" allowCreate />
            </label>
            <label className="block">
              <span className="field-label">Año</span>
              <input value={form.anio} onChange={(e) => setForm((f) => ({ ...f, anio: e.target.value }))} className="input" placeholder="2020" />
            </label>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-bold text-[var(--ink)] mb-4">Trabajos a realizar ({trabajos.length})</h2>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregar())}
              className="input flex-1"
              placeholder="Ej. Cambio y Pintura de flear derecho"
            />
            <button onClick={agregar} className="btn-primary whitespace-nowrap gap-1.5">
              <Icon name="plus" className="w-4 h-4" /> Agregar
            </button>
          </div>

          {trabajos.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)] mt-5 text-center py-6 border border-dashed border-[var(--line)] rounded-xl">
              Aún no hay trabajos. Agrega los que se le harán al vehículo.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)] mt-4">
              {trabajos.map((t, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <span className="text-[var(--ink-soft)] text-sm w-5">{i + 1}</span>
                  <span className="flex-1 font-medium text-[var(--ink)]">{t}</span>
                  <button onClick={() => quitar(i)} className="text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-1" title="Quitar">
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
