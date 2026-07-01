import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import {
  agregarPiezaCatalogo,
  findOrCreateMarca,
  findOrCreateModelo,
  findOrCreateAseguradora,
  getAseguradoraGeneralId,
} from "../lib/catalogo";
import {
  imprimirEtiquetas,
  servidorDisponible,
  listarImpresoras,
  impresoraGuardada,
  guardarImpresora,
  elegirImpresoraEtiquetas,
} from "../lib/printServer";

const PUBLIC_URL = "https://dominguez.vercel.app";

// Formulario para imprimir etiquetas de piezas POR CAJA. Los datos del
// vehículo/seguro se escriben una vez (arriba) y se comparten; abajo se
// agregan las cajas, cada una con sus piezas. Al imprimir, cada caja sale en
// su propia hoja (4x2"). Todo se guarda como una sola etiqueta en el historial.
export default function EtiquetasPiezas() {
  const { etiquetaId } = useParams();
  const editando = !!etiquetaId;

  const [aseguradoras, setAseguradoras] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [piezasCatalogo, setPiezasCatalogo] = useState([]);

  const [form, setForm] = useState({
    cliente: "",
    telefono: "",
    marca: "",
    modelo: "",
    anio: "",
    aseguradora: "",
    reclamo: "",
  });

  // Cada caja es un arreglo de piezas [{ nombre, cantidad }].
  const [cajas, setCajas] = useState([[]]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [imprimiendo, setImprimiendo] = useState(false);
  const [guardadoId, setGuardadoId] = useState(null);
  const [casoVinculado, setCasoVinculado] = useState(null); // caso del vehículo
  const [impresoras, setImpresoras] = useState([]); // [{name,...}] si hay print server
  const [impresoraSel, setImpresoraSel] = useState("");

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

  // Detecta el print server (impresión directa) y carga las impresoras
  useEffect(() => {
    async function detectar() {
      if (!(await servidorDisponible())) return;
      const ps = await listarImpresoras().catch(() => []);
      if (!ps.length) return;
      setImpresoras(ps);
      const guardada = impresoraGuardada() || elegirImpresoraEtiquetas(ps);
      setImpresoraSel(guardada);
      guardarImpresora(guardada);
    }
    detectar();
  }, []);

  // Modo edición: carga la etiqueta guardada
  useEffect(() => {
    if (!etiquetaId) return;
    async function load() {
      const { data } = await supabase.from("etiquetas_piezas").select("*").eq("id", etiquetaId).single();
      if (data) {
        setForm({
          cliente: data.cliente_nombre || "",
          telefono: data.telefono || "",
          marca: data.marca || "",
          modelo: data.modelo || "",
          anio: data.anio || "",
          aseguradora: data.aseguradora_nombre || "",
          reclamo: data.numero_reclamo || "",
        });
        setCasoVinculado(data.caso_id || null);
        const cs = (data.cajas || []).map((c) => c.piezas || []);
        // Compatibilidad con etiquetas viejas (una sola lista de piezas)
        setCajas(cs.length ? cs : [data.piezas || []]);
      }
    }
    load();
  }, [etiquetaId]);

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

  function agregarPiezaACaja(cajaIdx, nombre, cantidad) {
    const limpio = (nombre || "").trim();
    if (!limpio) return;
    setCajas((prev) => prev.map((c, i) => (i === cajaIdx ? [...c, { nombre: limpio, cantidad }] : c)));

    // Guarda la pieza en el catálogo si es nueva (para autocompletar luego)
    if (!piezasCatalogo.some((p) => p.label.toLowerCase() === limpio.toLowerCase())) {
      agregarPiezaCatalogo(limpio);
      setPiezasCatalogo((prev) => [...prev, { id: limpio, label: limpio }]);
    }
  }

  function quitarPiezaDeCaja(cajaIdx, piezaIdx) {
    setCajas((prev) => prev.map((c, i) => (i === cajaIdx ? c.filter((_, j) => j !== piezaIdx) : c)));
  }

  function agregarCaja() {
    setCajas((prev) => [...prev, []]);
  }

  function quitarCaja(cajaIdx) {
    setCajas((prev) => prev.filter((_, i) => i !== cajaIdx));
  }

  // Cajas con al menos una pieza (las vacías no se imprimen ni se guardan).
  function cajasConPiezas() {
    return cajas.filter((c) => c.length > 0);
  }

  // Busca o crea el caso del vehículo. Las piezas quedan vinculadas al caso a
  // través de la propia etiqueta (etiquetas_piezas.caso_id + piezas), sin crear
  // una cotización. Devuelve el caso_id.
  async function vincularCaso() {
    if (casoVinculado) return casoVinculado; // ya vinculado (edición / 2º clic)

    const { data: userData } = await supabase.auth.getUser();
    const anioNum = /^\d+$/.test((form.anio || "").trim()) ? Number(form.anio) : null;

    // 1) Reusar caso por reclamo
    let casoId = null;
    if (form.reclamo.trim()) {
      const { data: m } = await supabase
        .from("casos")
        .select("id")
        .ilike("numero_reclamo", form.reclamo.trim())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      casoId = m?.id || null;
    }

    const asegNombre = form.aseguradora.trim();
    let aseguradoraId = asegNombre ? await findOrCreateAseguradora(asegNombre) : null;
    if (!aseguradoraId) aseguradoraId = await getAseguradoraGeneralId();

    // 2) Crear el caso si no existe (cliente puede ir vacío → "Sin nombre")
    if (!casoId) {
      const { data: cliente } = await supabase
        .from("clientes")
        .insert({
          nombre_completo: form.cliente.trim() || "Sin nombre",
          telefono: form.telefono.trim() || null,
        })
        .select()
        .single();
      const marcaId = await findOrCreateMarca(form.marca);
      const modeloId = await findOrCreateModelo(marcaId, form.modelo);
      const { data: nuevo } = await supabase
        .from("casos")
        .insert({
          cliente_id: cliente.id,
          aseguradora_id: aseguradoraId,
          estado: "en_espera_piezas",
          marca_id: marcaId,
          modelo_id: modeloId,
          anio: anioNum,
          numero_reclamo: form.reclamo || null,
          created_by: userData?.user?.id,
        })
        .select("id")
        .single();
      casoId = nuevo?.id || null;
    }

    setCasoVinculado(casoId);
    return casoId;
  }

  async function guardarEtiqueta(cajasValidas, casoId) {
    const payload = {
      cliente_nombre: form.cliente || null,
      telefono: form.telefono || null,
      marca: form.marca || null,
      modelo: form.modelo || null,
      anio: form.anio || null,
      aseguradora_nombre: form.aseguradora || null,
      numero_reclamo: form.reclamo || null,
      caso_id: casoId || null,
      cajas: cajasValidas.map((piezas) => ({ piezas })),
      piezas: cajasValidas.flat(), // lista plana (compatibilidad / búsqueda)
    };
    const id = etiquetaId || guardadoId;
    if (id) {
      await supabase.from("etiquetas_piezas").update(payload).eq("id", id);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("etiquetas_piezas")
      .insert({ ...payload, created_by: userData?.user?.id })
      .select("id")
      .single();
    if (data?.id) setGuardadoId(data.id);
  }

  async function imprimir() {
    setError("");
    setOk("");
    const validas = cajasConPiezas();
    if (!validas.length) return setError("Agrega al menos una pieza en alguna caja.");

    setImprimiendo(true);
    try {
      // Crea/encuentra el caso del vehículo y mete las piezas como cotización.
      let casoId = null;
      try {
        casoId = await vincularCaso();
      } catch {
        /* si falla el vínculo, igual se imprime (sin QR al caso) */
      }
      try {
        await guardarEtiqueta(validas, casoId);
      } catch {
        /* si falla el guardado igual se imprime */
      }

      const payload = {
        caso: {
          marca: form.marca,
          modelo: form.modelo,
          anio: form.anio,
          aseguradora_nombre: form.aseguradora,
          numero_reclamo: form.reclamo,
        },
        cajas: validas.map((piezas) => ({ piezas })),
        qrUrl: casoId ? `${PUBLIC_URL}/piezas/${casoId}` : null,
      };

      // Imprime directo en la térmica si hay print server; si no, abre el PDF.
      const res = await imprimirEtiquetas(payload);
      if (res.modo === "directo") {
        const n = validas.length;
        setOk(`Enviado a la impresora (${n} etiqueta${n === 1 ? "" : "s"}).`);
      } else {
        window.open(URL.createObjectURL(res.blob), "_blank");
      }
    } catch (err) {
      setError(err.message || "No se pudo imprimir las etiquetas.");
    } finally {
      setImprimiendo(false);
    }
  }

  const totalPiezas = cajas.reduce((acc, c) => acc + c.length, 0);

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <Link
        to={editando ? "/piezas/etiquetas/historial" : "/piezas"}
        className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]"
      >
        ← {editando ? "Etiquetas generadas" : "Piezas"}
      </Link>

      <div className="relative overflow-hidden rounded-2xl bg-[var(--ink)] text-white p-6 sm:p-8 mt-3 mb-6">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-[var(--brand-red)] opacity-25 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide bg-white/10 px-2.5 py-1 rounded-full">
              {editando ? "Editar etiqueta" : "Etiquetas por caja"}
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold mt-2">
              {editando ? "Editar etiqueta" : "Imprimir etiquetas"}
            </h1>
            <p className="text-white/60 mt-1 text-sm max-w-md">
              Escribe los datos del vehículo una vez y agrega una caja por cada paquete.
              Cada caja se imprime en su propia hoja (4×2&quot;).
            </p>
          </div>
          <span className="hidden sm:block text-white/90">
            <Icon name="tag" className="w-16 h-16" strokeWidth={1.4} />
          </span>
        </div>
      </div>

      {/* Acciones (reposicionadas arriba) */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          onClick={imprimir}
          disabled={imprimiendo}
          className="btn-primary gap-1.5 disabled:opacity-50"
        >
          <Icon name="printer" className="w-4 h-4" />
          {imprimiendo ? "Imprimiendo…" : editando ? "Guardar e imprimir" : "Imprimir etiquetas"}
        </button>
        <Link to={editando ? "/piezas/etiquetas/historial" : "/piezas"} className="btn-ghost">
          Cancelar
        </Link>

        {/* Selector de impresora (solo si el print server está activo) */}
        {impresoras.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-[var(--ink-soft)] sm:ml-auto">
            <Icon name="printer" className="w-4 h-4" />
            <select
              value={impresoraSel}
              onChange={(e) => {
                setImpresoraSel(e.target.value);
                guardarImpresora(e.target.value);
              }}
              className="input py-1.5 text-sm max-w-[12rem]"
            >
              {impresoras.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {ok && <p className="text-sm text-emerald-600 mb-4 font-medium">✓ {ok}</p>}
      {error && <p className="text-sm text-[var(--brand-red)] mb-4">{error}</p>}

      <div className="space-y-5">
        {/* Vehículo y seguro */}
        <div className="card p-6">
          <h2 className="font-bold text-[var(--ink)] mb-1">Vehículo y seguro</h2>
          <p className="text-xs text-[var(--ink-soft)] mb-4">
            Puedes dejar los datos del dueño vacíos y completarlos luego desde el caso.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Campo label="Asegurado / dueño">
              <input value={form.cliente} onChange={(e) => up("cliente", e.target.value)} className="input" placeholder="(opcional)" />
            </Campo>
            <Campo label="Teléfono">
              <input value={form.telefono} onChange={(e) => up("telefono", e.target.value)} className="input" placeholder="(opcional)" />
            </Campo>
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

        {/* Cajas */}
        {cajas.map((piezas, i) => (
          <CajaCard
            key={i}
            indice={i}
            total={cajas.length}
            piezas={piezas}
            piezasCatalogo={piezasCatalogo}
            onAgregar={(nombre, cant) => agregarPiezaACaja(i, nombre, cant)}
            onQuitar={(j) => quitarPiezaDeCaja(i, j)}
            onEliminarCaja={() => quitarCaja(i)}
          />
        ))}

        <button onClick={agregarCaja} className="btn-ghost w-full gap-1.5 border-dashed">
          <Icon name="plus" className="w-4 h-4" /> Agregar caja
        </button>

        <p className="text-xs text-[var(--ink-soft)] text-center">
          {cajas.length} caja(s) · {totalPiezas} pieza(s) en total
        </p>
      </div>
    </div>
  );
}

// Tarjeta de una caja: su propio campo para agregar piezas y su lista.
function CajaCard({ indice, total, piezas, piezasCatalogo, onAgregar, onQuitar, onEliminarCaja }) {
  const [nuevaPieza, setNuevaPieza] = useState("");
  const [nuevaCant, setNuevaCant] = useState("1");

  function agregar() {
    if (!nuevaPieza.trim()) return;
    onAgregar(nuevaPieza, Math.max(1, parseInt(nuevaCant, 10) || 1));
    setNuevaPieza("");
    setNuevaCant("1");
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-[var(--ink)]">
          Caja {indice + 1} <span className="text-[var(--ink-soft)] font-normal">({piezas.length} pieza{piezas.length === 1 ? "" : "s"})</span>
        </h2>
        {total > 1 && (
          <button
            onClick={onEliminarCaja}
            className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] inline-flex items-center gap-1"
            title="Eliminar caja"
          >
            <Icon name="trash" className="w-4 h-4" /> Quitar caja
          </button>
        )}
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
        <button onClick={agregar} className="btn-primary whitespace-nowrap gap-1.5">
          <Icon name="plus" className="w-4 h-4" /> Agregar
        </button>
      </div>

      {/* Lista */}
      {piezas.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)] mt-5 text-center py-6 border border-dashed border-[var(--line)] rounded-xl">
          Aún no hay piezas en esta caja.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)] mt-4">
          {piezas.map((p, j) => (
            <li key={j} className="flex items-center gap-3 py-2.5">
              <span className="w-6 h-6 rounded-md border-2 border-[var(--ink-soft)] shrink-0" />
              <span className="flex-1 font-medium text-[var(--ink)]">{p.nombre}</span>
              {p.cantidad > 1 && (
                <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
              )}
              <button
                onClick={() => onQuitar(j)}
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
