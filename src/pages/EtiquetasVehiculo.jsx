import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import { imprimirVehiculo } from "../lib/printServer";

// Crea ETIQUETAS DE VEHÍCULO: marca/modelo + trabajos en grande. Se pueden
// hacer varias etiquetas (una por puerta/zona): cada una se imprime aparte.
export default function EtiquetasVehiculo() {
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [form, setForm] = useState({ marca: "", modelo: "", anio: "" });
  // Cada unidad es una etiqueta = arreglo de trabajos (strings).
  const [unidades, setUnidades] = useState([[]]);
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

  function agregarTrabajo(uIdx, texto) {
    const t = (texto || "").trim();
    if (!t) return;
    setUnidades((prev) => prev.map((u, i) => (i === uIdx ? [...u, t] : u)));
  }
  function quitarTrabajo(uIdx, tIdx) {
    setUnidades((prev) => prev.map((u, i) => (i === uIdx ? u.filter((_, j) => j !== tIdx) : u)));
  }
  function agregarUnidad() {
    setUnidades((prev) => [...prev, []]);
  }
  function quitarUnidad(uIdx) {
    setUnidades((prev) => prev.filter((_, i) => i !== uIdx));
  }

  async function imprimir() {
    setError("");
    setOk("");
    const validas = unidades.filter((u) => u.length > 0);
    if (!validas.length) return setError("Agrega al menos un trabajo en alguna etiqueta.");
    setImprimiendo(true);
    try {
      const res = await imprimirVehiculo({
        marca: form.marca,
        modelo: form.modelo,
        anio: form.anio,
        unidades: validas,
      });
      if (res.modo === "directo") {
        const n = validas.length;
        setOk(`Enviado a la impresora (${n} etiqueta${n === 1 ? "" : "s"}).`);
      } else {
        window.open(URL.createObjectURL(res.blob), "_blank");
      }
    } catch (err) {
      setError(err.message || "No se pudo imprimir la etiqueta.");
    } finally {
      setImprimiendo(false);
    }
  }

  const totalTrabajos = unidades.reduce((a, u) => a + u.length, 0);

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
              Una etiqueta por puerta/zona: cada una sale aparte, con sus trabajos en grande.
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
          {imprimiendo ? "Imprimiendo…" : "Imprimir etiquetas"}
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

        {unidades.map((trabajos, i) => (
          <UnidadCard
            key={i}
            indice={i}
            total={unidades.length}
            trabajos={trabajos}
            onAgregar={(t) => agregarTrabajo(i, t)}
            onQuitar={(j) => quitarTrabajo(i, j)}
            onEliminar={() => quitarUnidad(i)}
          />
        ))}

        <button onClick={agregarUnidad} className="btn-ghost w-full gap-1.5 border-dashed">
          <Icon name="plus" className="w-4 h-4" /> Agregar etiqueta
        </button>

        <p className="text-xs text-[var(--ink-soft)] text-center">
          {unidades.length} etiqueta(s) · {totalTrabajos} trabajo(s) en total
        </p>
      </div>
    </div>
  );
}

// Una etiqueta = un grupo de trabajos (se imprime aparte).
function UnidadCard({ indice, total, trabajos, onAgregar, onQuitar, onEliminar }) {
  const [nuevo, setNuevo] = useState("");

  function agregar() {
    if (!nuevo.trim()) return;
    onAgregar(nuevo);
    setNuevo("");
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-[var(--ink)]">
          Etiqueta {indice + 1}{" "}
          <span className="text-[var(--ink-soft)] font-normal">
            ({trabajos.length} trabajo{trabajos.length === 1 ? "" : "s"})
          </span>
        </h2>
        {total > 1 && (
          <button onClick={onEliminar} className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] inline-flex items-center gap-1" title="Eliminar etiqueta">
            <Icon name="trash" className="w-4 h-4" /> Quitar
          </button>
        )}
      </div>

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
          Aún no hay trabajos en esta etiqueta.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)] mt-4">
          {trabajos.map((t, j) => (
            <li key={j} className="flex items-center gap-3 py-2.5">
              <span className="text-[var(--ink-soft)] text-sm w-5">{j + 1}</span>
              <span className="flex-1 font-medium text-[var(--ink)]">{t}</span>
              <button onClick={() => onQuitar(j)} className="text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-1" title="Quitar">
                <Icon name="trash" className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
