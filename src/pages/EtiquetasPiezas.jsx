import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import { agregarPiezaCatalogo } from "../lib/catalogo";

// Formulario suelto para imprimir etiquetas de piezas. Los datos del vehículo
// se escriben a mano (pensado para vehículos viejos que aún no tienen caso en
// el sistema). Genera una etiqueta 4x3" con el vehículo + checklist de piezas
// para marcar las cajas al recibirlas (sin código de barras).
export default function EtiquetasPiezas() {
  const [aseguradoras, setAseguradoras] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [piezasCatalogo, setPiezasCatalogo] = useState([]);

  const [form, setForm] = useState({
    marca: "",
    modelo: "",
    anio: "",
    aseguradora: "",
    reclamo: "",
  });

  const [piezas, setPiezas] = useState([]); // [{ nombre, cantidad }]
  const [nuevaPieza, setNuevaPieza] = useState("");
  const [nuevaCant, setNuevaCant] = useState("1");
  const [error, setError] = useState("");
  const [imprimiendo, setImprimiendo] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    async function load() {
      const [{ data: asegs }, { data: ms }, { data: pc }] = await Promise.all([
        supabase.from("aseguradoras").select("nombre").eq("activo", true).order("orden"),
        supabase.from("marcas").select("id, nombre").order("nombre"),
        supabase.from("piezas_catalogo").select("nombre").order("nombre"),
      ]);
      setAseguradoras((asegs || []).map((a) => ({ id: a.nombre, label: a.nombre })));
      setMarcas((ms || []).map((m) => ({ id: m.nombre, label: m.nombre, _id: m.id })));
      setPiezasCatalogo((pc || []).map((p) => ({ id: p.nombre, label: p.nombre })));
    }
    load();
  }, []);

  // Modelos sugeridos cuando la marca escrita coincide con una del catálogo
  useEffect(() => {
    async function loadModelos() {
      const match = marcas.find(
        (m) => m.label.toLowerCase() === (form.marca || "").trim().toLowerCase()
      );
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

  function up(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function agregarPieza() {
    const nombre = nuevaPieza.trim();
    if (!nombre) return;
    const cantidad = Math.max(1, parseInt(nuevaCant, 10) || 1);
    setPiezas((prev) => [...prev, { nombre, cantidad }]);

    // Guarda la pieza en el catálogo si es nueva (para autocompletar luego)
    if (!piezasCatalogo.some((p) => p.label.toLowerCase() === nombre.toLowerCase())) {
      agregarPiezaCatalogo(nombre);
      setPiezasCatalogo((prev) => [...prev, { id: nombre, label: nombre }]);
    }

    setNuevaPieza("");
    setNuevaCant("1");
    inputRef.current?.focus?.();
  }

  function quitarPieza(i) {
    setPiezas((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function imprimir() {
    setError("");
    if (!piezas.length) return setError("Agrega al menos una pieza.");

    setImprimiendo(true);
    try {
      const caso = {
        marca: form.marca,
        modelo: form.modelo,
        anio: form.anio,
        aseguradora_nombre: form.aseguradora,
        numero_reclamo: form.reclamo,
      };
      const { generarPdfEtiquetas } = await import("../lib/piezasLabelPdf");
      const blob = await generarPdfEtiquetas({ caso, piezas });
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      setError("No se pudo generar las etiquetas.");
    } finally {
      setImprimiendo(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/piezas" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Piezas
      </Link>

      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[var(--brand-red)] opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              Etiquetas para caja
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">Imprimir etiquetas</h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              Escribe los datos del vehículo, arma la lista de piezas e imprime una
              etiqueta (4×3&quot;) con el checklist para marcar las cajas al recibirlas.
            </p>
          </div>
          <span className="hidden sm:block text-white/90">
            <Icon name="tag" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {/* Vehículo y seguro */}
        <div className="card p-6">
          <h2 className="font-bold text-[var(--ink)] mb-4">Vehículo y seguro</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Aseguradora">
              <Combobox
                items={aseguradoras}
                value={form.aseguradora}
                onChange={(v) => up("aseguradora", v)}
                placeholder="Seleccionar…"
                allowCreate
              />
            </Campo>
            <Campo label="Marca">
              <Combobox
                items={marcas}
                value={form.marca}
                onChange={(v) => setForm((f) => ({ ...f, marca: v, modelo: "" }))}
                placeholder="Toyota, Honda…"
                allowCreate
              />
            </Campo>
            <Campo label="Modelo">
              <Combobox
                items={modelos}
                value={form.modelo}
                onChange={(v) => up("modelo", v)}
                placeholder="Corolla, Civic…"
                allowCreate
              />
            </Campo>
            <Campo label="Año">
              <input value={form.anio} onChange={(e) => up("anio", e.target.value)} className="input" placeholder="2020" />
            </Campo>
            <Campo label="No. de reclamo">
              <input value={form.reclamo} onChange={(e) => up("reclamo", e.target.value)} className="input" />
            </Campo>
          </div>
        </div>

        {/* Piezas */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-[var(--ink)]">Piezas ({piezas.length})</h2>
          </div>

          {/* Agregar pieza */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Combobox
                items={piezasCatalogo}
                value={nuevaPieza}
                onChange={(v) => setNuevaPieza(v)}
                placeholder="Nombre de la pieza (ej. Bumper delantero)…"
                allowCreate
              />
            </div>
            <input
              type="number"
              min="1"
              value={nuevaCant}
              onChange={(e) => setNuevaCant(e.target.value)}
              className="input w-full sm:w-24"
              placeholder="Cant."
              aria-label="Cantidad"
            />
            <button onClick={agregarPieza} className="btn-primary whitespace-nowrap gap-1.5">
              <Icon name="plus" className="w-4 h-4" /> Agregar
            </button>
          </div>

          {/* Lista */}
          {piezas.length === 0 ? (
            <p className="text-sm text-[var(--ink-soft)] mt-5 text-center py-6 border border-dashed border-[var(--line)] rounded-xl">
              Aún no hay piezas. Agrega las que vayas necesitando.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)] mt-4">
              {piezas.map((p, i) => (
                <li key={i} className="flex items-center gap-3 py-2.5">
                  <span className="w-6 h-6 rounded-md border-2 border-[var(--ink-soft)] shrink-0" />
                  <span className="flex-1 font-medium text-[var(--ink)]">{p.nombre}</span>
                  {p.cantidad > 1 && (
                    <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
                  )}
                  <button
                    onClick={() => quitarPieza(i)}
                    className="text-[var(--ink-soft)] hover:text-[var(--brand-red)] px-1"
                    title="Quitar"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-[var(--brand-red)]">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={imprimir}
            disabled={imprimiendo}
            className="btn-primary gap-1.5 disabled:opacity-50"
          >
            <Icon name="printer" className="w-4 h-4" />
            {imprimiendo ? "Generando…" : "Imprimir etiquetas"}
          </button>
          <Link to="/piezas" className="btn-ghost">
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  );
}

function Campo({ label, children }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
