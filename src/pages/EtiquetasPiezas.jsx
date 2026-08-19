import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { compressImage } from "../lib/imageCompress";
import { uuid } from "../lib/uuid";
import Combobox from "../components/Combobox";
import Icon from "../components/Icon";
import { marcarPiezasRecibidas } from "../lib/piezas";
import { normalizarNombrePieza } from "../lib/cotizacion";
import {
  agregarPiezaCatalogo,
  findOrCreateMarca,
  findOrCreateModelo,
  findOrCreateAseguradora,
  getAseguradoraGeneralId,
  opcionesPiezasCanonicas,
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
  const [guardando, setGuardando] = useState(false);
  const [guardadoId, setGuardadoId] = useState(null);
  const [casoVinculado, setCasoVinculado] = useState(null); // caso del vehículo
  const [casoNecesitaReclamo, setCasoNecesitaReclamo] = useState(false); // se creó sin reclamo aún
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
      setPiezasCatalogo(opcionesPiezasCanonicas(pc));
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
        const cajasCargadas = cs.length ? cs : [data.piezas || []];
        const paths = cajasCargadas.flat().map((p) => p.foto_path).filter(Boolean);
        const { data: signed } = paths.length
          ? await supabase.storage.from("fotos-casos").createSignedUrls(paths, 60 * 60)
          : { data: [] };
        const urls = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
        setCajas(cajasCargadas.map((c) => c.map((p) => ({
          ...p,
          foto_url: p.foto_path ? urls.get(p.foto_path) || "" : "",
        }))));
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

  /* function agregarPiezaACaja(cajaIdx, nombre, cantidad) {
    const limpio = (nombre || "").trim();
    if (!limpio) return;
    setCajas((prev) => prev.map((c, i) => (i === cajaIdx ? [...c, { nombre: limpio, cantidad }] : c)));

    // Guarda la pieza en el catálogo si es nueva (para autocompletar luego)
    if (!piezasCatalogo.some((p) => p.label.toLowerCase() === limpio.toLowerCase())) {
      agregarPiezaCatalogo(limpio);
      setPiezasCatalogo((prev) => [...prev, { id: limpio, label: limpio }]);
    }
  } */

  async function subirFotoPieza(file) {
    if (!file?.type?.startsWith("image/")) throw new Error("Selecciona una imagen válida.");
    const comprimida = await compressImage(file, { maxWidth: 1200, quality: 0.78 });
    const extension = comprimida.type === "image/webp" ? "webp" : "jpg";
    const path = `piezas/${uuid()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("fotos-casos")
      .upload(path, comprimida, { contentType: comprimida.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed, error: signedError } = await supabase.storage
      .from("fotos-casos")
      .createSignedUrl(path, 60 * 60);
    if (signedError) throw signedError;
    return { foto_path: path, foto_url: signed?.signedUrl || "" };
  }

  async function eliminarFotoPieza(path) {
    if (path) await supabase.storage.from("fotos-casos").remove([path]);
  }

  // Guarda de una vez la etiqueta (vinculando/creando el caso por reclamo).
  // Se llama automáticamente cada vez que se agrega/quita una pieza, así la
  // pieza y su foto quedan en el sistema (y visibles en "Piezas" del caso) sin
  // depender de que el usuario recuerde pulsar "Guardar" o "Imprimir" al final.
  async function persistirCajas(cajasActuales) {
    const validas = (cajasActuales || []).filter((c) => c.length > 0);
    if (!validas.length) return null;
    try {
      const casoId = await vincularCaso();
      await guardarEtiqueta(validas, casoId);
      // Si se le está haciendo etiqueta a una pieza es porque ya llegó al
      // taller, así que queda marcada como recibida en el checklist del caso
      // sin tener que volver a marcarla a mano allá.
      await marcarPiezasRecibidas(casoId, validas.flat());
      return casoId;
    } catch (err) {
      setError("No se pudo guardar automáticamente: " + (err.message || "intenta de nuevo."));
      return null;
    }
  }

  async function agregarPiezaConFoto(cajaIdx, nombre, cantidad, file) {
    const limpio = normalizarNombrePieza(nombre);
    if (!limpio) return;
    let foto = {};
    if (file) foto = await subirFotoPieza(file);
    let nuevasCajas;
    setCajas((prev) => {
      nuevasCajas = prev.map((c, i) => (i === cajaIdx ? [...c, { nombre: limpio, cantidad, ...foto }] : c));
      return nuevasCajas;
    });

    if (!piezasCatalogo.some((p) => p.label.toLowerCase() === limpio.toLowerCase())) {
      agregarPiezaCatalogo(limpio);
      setPiezasCatalogo((prev) => [...prev, { id: limpio, label: limpio }]);
    }

    await persistirCajas(nuevasCajas);
  }

  async function quitarPiezaDeCaja(cajaIdx, piezaIdx) {
    const pieza = cajas[cajaIdx]?.[piezaIdx];
    let nuevasCajas;
    setCajas((prev) => {
      nuevasCajas = prev.map((c, i) => (i === cajaIdx ? c.filter((_, j) => j !== piezaIdx) : c));
      return nuevasCajas;
    });
    await eliminarFotoPieza(pieza?.foto_path);
    await persistirCajas(nuevasCajas);
  }

  function agregarCaja() {
    setCajas((prev) => [...prev, []]);
  }

  function quitarCaja(cajaIdx) {
    const eliminadas = cajas[cajaIdx] || [];
    let nuevasCajas;
    setCajas((prev) => {
      nuevasCajas = prev.filter((_, i) => i !== cajaIdx);
      return nuevasCajas;
    });
    Promise.all(eliminadas.map((p) => eliminarFotoPieza(p.foto_path)));
    persistirCajas(nuevasCajas);
  }

  // Cajas con al menos una pieza (las vacías no se imprimen ni se guardan).
  function cajasConPiezas() {
    return cajas.filter((c) => c.length > 0);
  }

  // Busca o crea el caso del vehículo. Las piezas quedan vinculadas al caso a
  // través de la propia etiqueta (etiquetas_piezas.caso_id + piezas), sin crear
  // una cotización. Devuelve el caso_id.
  async function vincularCaso() {
    if (casoVinculado) {
      // Como ahora se auto-guarda con cada pieza, es posible que el caso se
      // haya creado ANTES de que el usuario terminara de escribir el reclamo.
      // Si fue así, se sincroniza en cuanto el reclamo tenga texto (solo para
      // el caso que creamos nosotros mismos sin reclamo; nunca se toca un
      // caso ya existente que se haya reusado).
      const reclamoActual = form.reclamo.trim();
      if (casoNecesitaReclamo && reclamoActual) {
        await supabase.from("casos").update({ numero_reclamo: reclamoActual }).eq("id", casoVinculado);
        setCasoNecesitaReclamo(false);
      }
      return casoVinculado; // ya vinculado (edición / 2º clic)
    }

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
      // Si se creó el caso sin reclamo (aún no lo habían escrito), se marca
      // para sincronizarlo en cuanto el usuario lo complete.
      if (casoId && !form.reclamo.trim()) setCasoNecesitaReclamo(true);
    }

    setCasoVinculado(casoId);
    return casoId;
  }

  async function guardarEtiqueta(cajasValidas, casoId) {
    const limpiarPieza = ({ nombre, cantidad, foto_path }) => ({ nombre, cantidad, ...(foto_path ? { foto_path } : {}) });
    const cajasLimpias = cajasValidas.map((piezas) => piezas.map(limpiarPieza));
    const payload = {
      cliente_nombre: form.cliente || null,
      telefono: form.telefono || null,
      marca: form.marca || null,
      modelo: form.modelo || null,
      anio: form.anio || null,
      aseguradora_nombre: form.aseguradora || null,
      numero_reclamo: form.reclamo || null,
      caso_id: casoId || null,
      cajas: cajasLimpias.map((piezas) => ({ piezas })),
      piezas: cajasLimpias.flat(), // lista plana (compatibilidad / búsqueda)
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

  async function guardar() {
    setError("");
    setOk("");
    const validas = cajasConPiezas();
    if (!validas.length) return setError("Agrega al menos una pieza en alguna caja.");

    setGuardando(true);
    const casoId = await persistirCajas(cajas);
    setGuardando(false);
    if (casoId) setOk("Etiqueta guardada. Puedes imprimirla cuando estés listo.");
  }

  async function imprimir() {
    setError("");
    setOk("");
    const validas = cajasConPiezas();
    if (!validas.length) return setError("Agrega al menos una pieza en alguna caja.");

    setImprimiendo(true);
    try {
      // Crea/encuentra el caso del vehículo y guarda la etiqueta. Si falla,
      // persistirCajas ya deja el aviso en pantalla, pero igual se imprime
      // (no se bloquea la impresión física por un error de guardado).
      const casoId = await persistirCajas(cajas);

      const payload = {
        caso: {
          marca: form.marca,
          modelo: form.modelo,
          anio: form.anio,
          aseguradora_nombre: form.aseguradora,
          numero_reclamo: form.reclamo,
        },
        cajas: validas.map((piezas) => ({ piezas: piezas.map(({ nombre, cantidad }) => ({ nombre, cantidad })) })),
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
          disabled={imprimiendo || guardando}
          className="btn-primary gap-1.5 disabled:opacity-50"
        >
          <Icon name="printer" className="w-4 h-4" />
          {imprimiendo ? "Imprimiendo…" : "Imprimir etiquetas"}
        </button>
        <button
          onClick={guardar}
          disabled={guardando || imprimiendo}
          className="btn-ghost gap-1.5 disabled:opacity-50"
        >
          <Icon name="check" className="w-4 h-4" />
          {guardando ? "Guardando…" : "Guardar"}
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
              {/* Al terminar de escribir el reclamo se vuelve a guardar: así el
                  caso queda enlazado y las piezas aparecen recibidas en él sin
                  esperar a que se agregue otra pieza o se imprima. */}
              <input
                value={form.reclamo}
                onChange={(e) => up("reclamo", e.target.value)}
                onBlur={() => persistirCajas(cajas)}
                className="input"
              />
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
            onAgregar={(nombre, cant, file) => agregarPiezaConFoto(i, nombre, cant, file)}
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
  const [foto, setFoto] = useState(null);
  const [fotoPreview, setFotoPreview] = useState("");
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  async function agregar() {
    if (!nuevaPieza.trim()) return;
    setSubiendoFoto(true);
    try {
      await onAgregar(nuevaPieza, Math.max(1, parseInt(nuevaCant, 10) || 1), foto);
      setNuevaPieza("");
      setNuevaCant("1");
      setFoto(null);
      setFotoPreview("");
    } catch (err) {
      alert(err.message || "No se pudo subir la foto de la pieza.");
    } finally {
      setSubiendoFoto(false);
    }
  }

  function elegirFoto(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Selecciona una imagen válida.");
    setFoto(file);
    setFotoPreview(URL.createObjectURL(file));
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
            placeholder="Ej. Bumper DELT RH"
            allowCreate
            maxResults={12}
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
        <button onClick={agregar} disabled={subiendoFoto} className="btn-primary whitespace-nowrap gap-1.5 disabled:opacity-50">
          <Icon name="plus" className="w-4 h-4" /> Agregar
        </button>
      </div>

      <div
        className={`mt-3 rounded-xl border border-dashed p-3 transition-colors ${fotoPreview ? "border-[var(--brand-red)] bg-[var(--brand-red-50)]" : "border-[var(--line)] hover:border-[var(--brand-red)]"}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          elegirFoto(e.dataTransfer.files?.[0]);
        }}
      >
        <label className="flex items-center gap-3 cursor-pointer">
          {fotoPreview ? (
            <img src={fotoPreview} alt="Vista previa de la pieza" className="w-14 h-14 object-cover rounded-lg border border-[var(--line)]" />
          ) : (
            <span className="w-14 h-14 rounded-lg bg-[var(--paper)] flex items-center justify-center text-[var(--ink-soft)]">
              <Icon name="camera" className="w-6 h-6" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[var(--ink)]">Foto de la pieza <span className="font-normal text-[var(--ink-soft)]">(opcional)</span></span>
            <span className="block text-xs text-[var(--ink-soft)]">Toca para elegir o arrastra una imagen aquí</span>
          </span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => elegirFoto(e.target.files?.[0])} />
        </label>
        {fotoPreview && (
          <button type="button" onClick={() => { setFoto(null); setFotoPreview(""); }} className="text-xs text-[var(--brand-red)] mt-2 ml-[4.25rem]">
            Quitar foto
          </button>
        )}
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
              {p.foto_url ? <img src={p.foto_url} alt="" className="w-9 h-9 object-cover rounded-md border border-[var(--line)]" /> : null}
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
