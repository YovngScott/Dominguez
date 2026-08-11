import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { nombrePieza, rd } from "../lib/cotizacion";
import { clavePieza } from "../lib/piezas";
import Combobox from "./Combobox";
import Icon from "./Icon";

// Modal de la ficha de taller (la hoja que se pone en el carro con lo que hay
// que hacerle). Antes salía directo del PDF con TODAS las cotizaciones juntas,
// y no servía si el vehículo aún no tenía cotización. Ahora se elige qué
// cotizaciones incluir y se puede escribir el trabajo a mano. Cómo quedó
// armada se guarda en el caso (casos.ficha_taller) para no volver a escribirla
// al reimprimir.
export default function FichaTallerModal({ casoId, caso, onClose }) {
  const [tab, setTab] = useState("cotizaciones");
  const [cots, setCots] = useState([]);
  // Se guardan las cotizaciones DESMARCADAS y no las marcadas: así una
  // cotización nueva entra sola en la ficha sin tener que ir a marcarla.
  const [desmarcadas, setDesmarcadas] = useState(new Set());
  const [trabajosOrden, setTrabajosOrden] = useState([]); // trabajos escritos en el recibo
  const [quitadas, setQuitadas] = useState(new Set()); // líneas borradas a mano
  const [manualesPiezas, setManualesPiezas] = useState([]);
  const [manualesMano, setManualesMano] = useState([]);
  const [piezasCatalogo, setPiezasCatalogo] = useState([]);
  const [serviciosCatalogo, setServiciosCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [guardado, setGuardado] = useState(false);
  const [error, setError] = useState("");
  const cargado = useRef(false); // evita guardar durante la carga inicial

  useEffect(() => {
    async function load() {
      // Las cotizaciones se buscan por caso y también por chasis: a veces la
      // cotización se hizo antes de registrar el vehículo y quedó suelta.
      const filtros = [`caso_id.eq.${casoId}`];
      if (caso?.chasis?.trim()) filtros.push(`chasis.ilike.${caso.chasis.trim()}`);

      const [{ data: cs }, { data: ordenes }, { data: pc }, { data: sc }, { data: casoRow }] =
        await Promise.all([
          supabase
            .from("cotizaciones")
            .select("id, numero, total, items_piezas, items_mano_obra, created_at")
            .or(filtros.join(","))
            .order("created_at", { ascending: false }),
          supabase
            .from("ordenes_reparacion")
            .select("trabajos")
            .eq("caso_id", casoId)
            .order("created_at", { ascending: false })
            .limit(1),
          supabase.from("piezas_catalogo").select("nombre").order("nombre"),
          supabase.from("servicios_catalogo").select("nombre").order("nombre"),
          supabase.from("casos").select("ficha_taller").eq("id", casoId).maybeSingle(),
        ]);

      setCots(cs || []);
      setTrabajosOrden(
        (ordenes?.[0]?.trabajos || "")
          .split(/\r?\n|,|;/)
          .map((t) => t.trim())
          .filter(Boolean)
      );
      setPiezasCatalogo((pc || []).map((p) => ({ id: p.nombre, label: p.nombre })));
      setServiciosCatalogo((sc || []).map((s) => ({ id: s.nombre, label: s.nombre })));

      // Cómo quedó la ficha la última vez (si la migración 49 aún no se corrió,
      // ficha_taller no existe y simplemente se empieza en blanco).
      const g = casoRow?.ficha_taller || {};
      setDesmarcadas(new Set(g.desmarcadas || []));
      setQuitadas(new Set(g.quitadas || []));
      setManualesPiezas(g.piezas || []);
      setManualesMano(g.mano || []);

      // Sin cotizaciones no hay nada que elegir: se abre directo en la pestaña
      // de escribir a mano, que es lo único que se puede hacer.
      if (!cs?.length) setTab("manual");
      setLoading(false);
      cargado.current = true;
    }
    load();
  }, [casoId, caso?.chasis]);

  // Autoguardado: cada cambio se guarda solo en el caso poco después, para que
  // no dependa de que el usuario recuerde pulsar nada antes de cerrar.
  useEffect(() => {
    if (!cargado.current) return;
    setGuardado(false);
    const t = setTimeout(async () => {
      const { error: e } = await supabase
        .from("casos")
        .update({
          ficha_taller: {
            desmarcadas: [...desmarcadas],
            quitadas: [...quitadas],
            piezas: manualesPiezas,
            mano: manualesMano,
          },
        })
        .eq("id", casoId);
      if (e) setError("No se pudo guardar la ficha. Ejecuta la migración sql/49_caso_ficha_taller.sql.");
      else setGuardado(true);
    }, 700);
    return () => clearTimeout(t);
  }, [casoId, desmarcadas, quitadas, manualesPiezas, manualesMano]);

  // Piezas y mano de obra que salen de las cotizaciones marcadas (sin repetir),
  // más lo agregado a mano. Las quitadas con la papelera no entran.
  const piezas = useMemo(() => {
    const map = new Map();
    cots
      .filter((c) => !desmarcadas.has(c.id))
      .forEach((c) => {
        (c.items_piezas || []).forEach((it) => {
          const nombre = nombrePieza(it);
          const k = clavePieza(nombre);
          if (!k || quitadas.has("p:" + k) || map.has(k)) return;
          map.set(k, { nombre, cantidad: Number(it.cantidad) || 1 });
        });
      });
    manualesPiezas.forEach((p) => {
      const k = clavePieza(p.nombre);
      if (k && !map.has(k)) map.set(k, p);
    });
    return [...map.values()];
  }, [cots, desmarcadas, quitadas, manualesPiezas]);

  const manoObra = useMemo(() => {
    const map = new Map();
    cots
      .filter((c) => !desmarcadas.has(c.id))
      .forEach((c) => {
        (c.items_mano_obra || []).forEach((it) => {
          const desc = it.pieza ? `${it.nombre} · ${nombrePieza({ ...it, nombre: it.pieza })}` : it.nombre;
          const k = clavePieza(desc);
          if (!k || quitadas.has("m:" + k) || map.has(k)) return;
          map.set(k, { descripcion: desc, cantidad: Number(it.cantidad) || 1 });
        });
      });
    // Los trabajos escritos a mano en el recibo también van a la ficha.
    trabajosOrden.forEach((desc) => {
      const k = clavePieza(desc);
      if (!k || quitadas.has("m:" + k) || map.has(k)) return;
      map.set(k, { descripcion: desc, cantidad: 1 });
    });
    manualesMano.forEach((m) => {
      const k = clavePieza(m.descripcion);
      if (k && !map.has(k)) map.set(k, m);
    });
    return [...map.values()];
  }, [cots, desmarcadas, quitadas, trabajosOrden, manualesMano]);

  function toggleCot(id) {
    setDesmarcadas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function quitarLinea(prefijo, texto) {
    const k = clavePieza(texto);
    setQuitadas((prev) => new Set(prev).add(prefijo + ":" + k));
    // Si era una línea escrita a mano, además se saca de su lista.
    if (prefijo === "p") setManualesPiezas((prev) => prev.filter((p) => clavePieza(p.nombre) !== k));
    else setManualesMano((prev) => prev.filter((m) => clavePieza(m.descripcion) !== k));
  }

  function agregarPieza(nombre, cantidad) {
    const limpio = (nombre || "").trim();
    if (!limpio) return;
    const k = clavePieza(limpio);
    setQuitadas((prev) => {
      const n = new Set(prev);
      n.delete("p:" + k);
      return n;
    });
    setManualesPiezas((prev) => [...prev, { nombre: limpio, cantidad }]);
  }

  function agregarTrabajo(desc, cantidad) {
    const limpio = (desc || "").trim();
    if (!limpio) return;
    const k = clavePieza(limpio);
    setQuitadas((prev) => {
      const n = new Set(prev);
      n.delete("m:" + k);
      return n;
    });
    setManualesMano((prev) => [...prev, { descripcion: limpio, cantidad }]);
  }

  async function imprimir() {
    setError("");
    if (!piezas.length && !manoObra.length) {
      return setError("Agrega al menos una pieza o un trabajo antes de imprimir.");
    }
    setImprimiendo(true);
    try {
      const { generarFichaTaller } = await import("../lib/fichaTallerPdf");
      const blob = generarFichaTaller({ caso: caso || {}, piezas, manoObra });
      window.open(URL.createObjectURL(blob), "_blank");
      onClose();
    } catch (err) {
      setError(err.message || "No se pudo generar la ficha.");
    } finally {
      setImprimiendo(false);
    }
  }

  const vehiculo = [caso?.marca, caso?.modelo, caso?.anio].filter(Boolean).join(" ");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="card w-full max-w-5xl h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Encabezado */}
        <div className="p-5 sm:p-6 border-b border-[var(--line)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
                <Icon name="key" className="w-5 h-5 text-[var(--brand-red)] shrink-0" />
                Ficha de taller
              </h3>
              <p className="text-sm text-[var(--ink-soft)] truncate">
                {vehiculo || "Vehículo"}
                {caso?.numero_llave ? ` · Llave #${caso.numero_llave}` : ""}
              </p>
            </div>
            <button onClick={onClose} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl leading-none shrink-0">
              ✕
            </button>
          </div>

          <div className="flex gap-1.5 mt-4 p-1 rounded-2xl bg-[var(--paper)] border border-[var(--line)]">
            <TabBtn activo={tab === "cotizaciones"} onClick={() => setTab("cotizaciones")} icono="receipt">
              Cotizaciones{cots.length ? ` (${cots.length})` : ""}
            </TabBtn>
            <TabBtn activo={tab === "manual"} onClick={() => setTab("manual")} icono="wrench">
              Piezas y trabajos
            </TabBtn>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
          ) : tab === "cotizaciones" ? (
            cots.length === 0 ? (
              <div className="text-center py-10">
                <Icon name="receipt" className="w-10 h-10 mx-auto mb-3 opacity-40 text-[var(--ink-soft)]" />
                <p className="text-sm text-[var(--ink-soft)] mb-4">
                  Este vehículo no tiene cotizaciones. Puedes escribir a mano lo que se le va a hacer.
                </p>
                <button onClick={() => setTab("manual")} className="btn-primary gap-1.5">
                  <Icon name="wrench" className="w-4 h-4" /> Escribir el trabajo
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-sm text-[var(--ink-soft)]">Marca cuáles entran en la ficha.</p>
                  <div className="flex gap-3 text-xs shrink-0">
                    <button onClick={() => setDesmarcadas(new Set())} className="text-[var(--brand-red)] font-semibold">
                      Todas
                    </button>
                    <button
                      onClick={() => setDesmarcadas(new Set(cots.map((c) => c.id)))}
                      className="text-[var(--ink-soft)] font-semibold"
                    >
                      Ninguna
                    </button>
                  </div>
                </div>
                <ul className="space-y-2">
                  {cots.map((c) => {
                    const sel = !desmarcadas.has(c.id);
                    const nPiezas = (c.items_piezas || []).length;
                    const nMano = (c.items_mano_obra || []).length;
                    return (
                      <li key={c.id}>
                        <label
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                            sel ? "border-[var(--brand-red)] bg-[var(--brand-red-50)]" : "border-[var(--line)] hover:border-[var(--ink-soft)]"
                          }`}
                        >
                          <input type="checkbox" checked={sel} onChange={() => toggleCot(c.id)} className="w-4 h-4 shrink-0" />
                          <span className="flex-1 min-w-0">
                            <span className="block font-bold text-[var(--ink)] truncate">{c.numero || "Sin número"}</span>
                            <span className="block text-xs text-[var(--ink-soft)]">
                              {new Date(c.created_at).toLocaleDateString("es-DO", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}{" "}
                              · {nPiezas} pieza(s) · {nMano} trabajo(s)
                            </span>
                          </span>
                          <span className="text-sm font-semibold text-[var(--ink-soft)] shrink-0 hidden sm:block">
                            {rd(c.total)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <p className="text-xs text-[var(--ink-soft)] mt-4">
                  En la pestaña <strong>Piezas y trabajos</strong> puedes revisar la lista final, quitar lo que no
                  aplique y agregar lo que falte.
                </p>
              </>
            )
          ) : (
            <div className="grid sm:grid-cols-2 gap-6 h-full">
              <ListaEditable
                titulo="Piezas a reemplazar"
                items={piezas.map((p) => ({ texto: p.nombre, cantidad: p.cantidad }))}
                catalogo={piezasCatalogo}
                placeholder="Ej. Bumper delantero"
                vacio="Sin piezas."
                onAgregar={agregarPieza}
                onQuitar={(texto) => quitarLinea("p", texto)}
              />
              <ListaEditable
                titulo="Mano de obra"
                items={manoObra.map((m) => ({ texto: m.descripcion, cantidad: m.cantidad }))}
                catalogo={serviciosCatalogo}
                placeholder="Ej. Pintura de puerta"
                vacio="Sin trabajos."
                onAgregar={agregarTrabajo}
                onQuitar={(texto) => quitarLinea("m", texto)}
              />
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="p-5 sm:p-6 border-t border-[var(--line)]">
          {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[var(--ink-soft)] flex-1 min-w-0">
              {piezas.length} pieza(s) · {manoObra.length} trabajo(s) en la ficha
              {guardado && <span className="text-emerald-600 font-medium"> · Guardado</span>}
            </p>
            <button onClick={onClose} className="btn-ghost">
              Cancelar
            </button>
            <button
              onClick={imprimir}
              disabled={imprimiendo || loading}
              className="btn-primary gap-1.5 disabled:opacity-50"
            >
              <Icon name="printer" className="w-4 h-4" />
              {imprimiendo ? "Generando…" : "Imprimir ficha"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TabBtn({ activo, onClick, icono, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
        activo ? "bg-[var(--brand-red)] text-white" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
      }`}
    >
      <Icon name={icono} className="w-4 h-4 shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}

// Columna de la ficha (piezas o mano de obra): lista con papelera por línea y
// un campo abajo para agregar. El campo SUGIERE lo que ya está en el catálogo,
// pero lo que se escriba aquí no se guarda en él: la ficha es de este vehículo
// y no tiene por qué ensuciar el catálogo de todo el taller.
function ListaEditable({ titulo, items, catalogo, placeholder, vacio, onAgregar, onQuitar }) {
  const [nuevo, setNuevo] = useState("");
  const [cant, setCant] = useState("1");

  function agregar() {
    if (!nuevo.trim()) return;
    onAgregar(nuevo, Math.max(1, parseInt(cant, 10) || 1));
    setNuevo("");
    setCant("1");
  }

  return (
    // La lista crece con el alto de la tarjeta y el campo de agregar queda
    // siempre abajo a la vista, aunque haya muchas líneas.
    <div className="min-w-0 flex flex-col min-h-0">
      <h4 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-red)] mb-3 shrink-0">
        {titulo} <span className="text-[var(--ink-soft)]">({items.length})</span>
      </h4>

      <div className="flex-1 min-h-0 overflow-y-auto mb-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--ink-soft)] py-8 text-center border border-dashed border-[var(--line)] rounded-xl">
            {vacio}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {items.map((it, i) => (
              <li key={i} className="flex items-center gap-2.5 py-2.5">
                <span className="text-xs font-bold text-[var(--ink-soft)] w-5 shrink-0">{i + 1}</span>
                <span className="flex-1 text-[15px] text-[var(--ink)] min-w-0 break-words">{it.texto}</span>
                {it.cantidad > 1 && (
                  <span className="text-xs font-semibold text-[var(--ink-soft)] shrink-0">x{it.cantidad}</span>
                )}
                <button
                  onClick={() => onQuitar(it.texto)}
                  className="text-[var(--ink-soft)] hover:text-[var(--brand-red)] shrink-0 p-1.5"
                  title="Quitar de la ficha"
                >
                  <Icon name="trash" className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2 shrink-0">
        <div className="flex-1 min-w-0">
          <Combobox items={catalogo} value={nuevo} onChange={(v) => setNuevo(v)} placeholder={placeholder} allowCreate />
        </div>
        <input
          type="number"
          min="1"
          value={cant}
          onChange={(e) => setCant(e.target.value)}
          className="input w-16 shrink-0"
          aria-label="Cantidad"
        />
        <button onClick={agregar} className="btn-primary px-3 shrink-0" title="Agregar a la ficha">
          <Icon name="plus" className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
