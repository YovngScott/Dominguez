import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import { agregarPiezaCatalogo } from "../lib/catalogo";

// Formulario suelto para imprimir etiquetas de piezas: se arma una lista de
// piezas a mano y se vincula a un caso (vehículo) para que la etiqueta lleve
// los datos del asegurado, el vehículo y el seguro. Una etiqueta 4x3" con el
// checklist de piezas para marcar las cajas al recibirlas.
export default function EtiquetasPiezas() {
  const [casos, setCasos] = useState([]); // [{ id, ...datos }]
  const [piezasCatalogo, setPiezasCatalogo] = useState([]);
  const [casoId, setCasoId] = useState("");
  const [piezas, setPiezas] = useState([]); // [{ nombre, cantidad }]
  const [nuevaPieza, setNuevaPieza] = useState("");
  const [nuevaCant, setNuevaCant] = useState("1");
  const [error, setError] = useState("");
  const [imprimiendo, setImprimiendo] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    async function load() {
      const [{ data: cs }, { data: pc }] = await Promise.all([
        supabase
          .from("casos")
          .select(
            `id, placa, chasis, anio, color, numero_reclamo, numero_poliza,
             cliente:clientes(nombre_completo, telefono),
             aseguradora:aseguradoras(nombre),
             marca:marcas(nombre), modelo:modelos(nombre)`
          )
          .neq("estado", "entregado")
          .order("created_at", { ascending: false }),
        supabase.from("piezas_catalogo").select("nombre").order("nombre"),
      ]);
      setCasos(cs || []);
      setPiezasCatalogo((pc || []).map((p) => ({ id: p.nombre, label: p.nombre })));
    }
    load();
  }, []);

  const casoSel = useMemo(() => casos.find((c) => c.id === casoId) || null, [casos, casoId]);

  const itemsCasos = casos.map((c) => ({
    id: c.id,
    label: [
      [c.marca?.nombre, c.modelo?.nombre].filter(Boolean).join(" ") || "Vehículo",
      c.placa || c.chasis,
      c.cliente?.nombre_completo,
    ]
      .filter(Boolean)
      .join(" · "),
  }));

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
    if (!casoSel) return setError("Selecciona el vehículo (caso) al que pertenecen las piezas.");
    if (!piezas.length) return setError("Agrega al menos una pieza.");

    setImprimiendo(true);
    try {
      const caso = {
        marca: casoSel.marca?.nombre,
        modelo: casoSel.modelo?.nombre,
        anio: casoSel.anio,
        color: casoSel.color,
        placa: casoSel.placa,
        chasis: casoSel.chasis,
        cliente_nombre: casoSel.cliente?.nombre_completo,
        cliente_telefono: casoSel.cliente?.telefono,
        aseguradora_nombre: casoSel.aseguradora?.nombre,
        numero_reclamo: casoSel.numero_reclamo,
        numero_poliza: casoSel.numero_poliza,
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
              Arma la lista de piezas, vincúlala a un vehículo e imprime una etiqueta
              (4×3&quot;) con el checklist para marcar las cajas al recibirlas.
            </p>
          </div>
          <span className="hidden sm:block text-white/90">
            <Icon name="tag" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {/* Vehículo / caso */}
        <div className="card p-6">
          <h2 className="font-bold text-[var(--ink)] mb-1">Vehículo</h2>
          <p className="text-xs text-[var(--ink-soft)] mb-4">
            Busca por placa, chasis o nombre del asegurado.
          </p>
          <Combobox
            items={itemsCasos}
            value={casoId}
            onChange={(id) => setCasoId(id)}
            placeholder="Seleccionar vehículo…"
            emptyText="No hay casos activos"
          />

          {casoSel && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-sm border-t border-[var(--line)] pt-4">
              <Dato k="Vehículo" v={[casoSel.marca?.nombre, casoSel.modelo?.nombre, casoSel.anio].filter(Boolean).join(" ")} />
              <Dato k="Placa" v={casoSel.placa} />
              <Dato k="Asegurado" v={casoSel.cliente?.nombre_completo} />
              <Dato k="Aseguradora" v={casoSel.aseguradora?.nombre} />
            </div>
          )}
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

function Dato({ k, v }) {
  return (
    <div>
      <p className="text-[var(--ink-soft)] text-xs uppercase tracking-wide">{k}</p>
      <p className="font-semibold text-[var(--ink)]">{v || "—"}</p>
    </div>
  );
}
