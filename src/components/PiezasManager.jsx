import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { nombrePieza } from "../lib/cotizacion";
import { clavePieza as clave } from "../lib/piezas";
import { formatoTramo } from "../lib/tramos";
import TramoPicker from "./TramoPicker";
import Combobox from "./Combobox";
import ConfirmDialog from "./ConfirmDialog";
import Icon from "./Icon";
import Lightbox from "./Lightbox";
import { compressImage } from "../lib/imageCompress";
import { uuid } from "../lib/uuid";

/**
 * Traduce el error de Supabase al guardar un ajuste de piezas.
 *
 * Antes esto decía siempre "ejecuta la migración", que solo es cierto si la
 * tabla no existe. Cuando el motivo era otro (permisos, un dato inválido) el
 * mensaje mandaba a corregir lo que ya estaba bien.
 */
function mensajeGuardado(e) {
  const texto = [e?.message, e?.details, e?.hint].filter(Boolean).join(" · ");
  // 42P01 = la tabla no existe; PGRST205 = PostgREST no la tiene en su caché.
  if (e?.code === "42P01" || e?.code === "PGRST205" || /does not exist|schema cache/i.test(texto)) {
    return (
      "Supabase no encuentra la tabla piezas_caso_manuales. Si ya ejecutaste la migración, corre " +
      "NOTIFY pgrst, 'reload schema'; para que la reconozca. Detalle: " + texto
    );
  }
  if (e?.code === "42501" || /row-level security|permission denied/i.test(texto)) {
    return (
      "La base de datos rechazó el cambio por permisos. Falta la parte final de " +
      "sql/50_piezas_caso_manuales.sql (enable row level security + create policy). Detalle: " + texto
    );
  }
  if (e?.code === "42703" || /column .* does not exist/i.test(texto)) {
    return "A la tabla piezas_caso_manuales le falta una columna. Vuelve a ejecutar sql/50_piezas_caso_manuales.sql completo. Detalle: " + texto;
  }
  return "No se pudo guardar: " + (texto || "error desconocido.");
}

/**
 * Checklist de piezas de un caso. Las piezas se leen de las cotizaciones
 * del caso (items_piezas); el estado "recibida" se guarda aparte en la
 * tabla piezas_recibidas, así la cotización y su PDF nunca se modifican.
 */
export default function PiezasManager({ casoId, caso }) {
  const [piezas, setPiezas] = useState([]); // [{ clave, nombre, cantidad, cotizacion, manual }]
  const [recibidas, setRecibidas] = useState(new Set()); // claves recibidas
  const [entregadas, setEntregadas] = useState(new Set()); // claves entregadas a un reparador
  const [tramos, setTramos] = useState({}); // clave -> tramo (ej. "B2")
  const [casosRel, setCasosRel] = useState([casoId]); // casos del mismo reclamo
  const [asegNombre, setAsegNombre] = useState(""); // aseguradora del caso (para los tramos)
  const [tramoPieza, setTramoPieza] = useState(null); // pieza cuyo selector de tramo está abierto
  const [infoCaso, setInfoCaso] = useState(caso || null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportando, setExportando] = useState(false);
  const [mostrarEtiquetas, setMostrarEtiquetas] = useState(false);
  const [seleccion, setSeleccion] = useState(new Set());
  const [imprimiendo, setImprimiendo] = useState(false);
  const [fotoActiva, setFotoActiva] = useState(null);
  const [fotosRecibidas, setFotosRecibidas] = useState(new Map());
  const [subiendoFotoRecibida, setSubiendoFotoRecibida] = useState(null);
  const [eliminandoFoto, setEliminandoFoto] = useState(false);
  const [editorPieza, setEditorPieza] = useState(null); // null | "nueva" | pieza en edición
  const [piezaAEliminar, setPiezaAEliminar] = useState(null);
  const [catalogo, setCatalogo] = useState([]);

  async function load() {
    setLoading(true);
    setError("");

    const etqSelect =
      "id, caso_id, cliente_nombre, marca, modelo, anio, numero_reclamo, aseguradora_nombre, piezas, created_at";
    const [{ data: casoRow }, { data: cots }, { data: etqCaso }] = await Promise.all([
      supabase
        .from("casos")
        .select("numero_reclamo, aseguradora:aseguradoras(nombre)")
        .eq("id", casoId)
        .maybeSingle(),
      supabase
        .from("cotizaciones")
        .select(
          "numero, cliente_nombre, marca, modelo, anio, color, placa, chasis, numero_reclamo, aseguradora_nombre, items_piezas, created_at"
        )
        .eq("caso_id", casoId)
        .order("created_at", { ascending: true }),
      supabase
        .from("etiquetas_piezas")
        .select(etqSelect)
        .eq("caso_id", casoId)
        .order("created_at", { ascending: true }),
    ]);

    // Además de las etiquetas ya vinculadas a este caso, se traen TODAS las
    // etiquetas cuyo número de reclamo coincide con el del caso. Así, si las
    // piezas llegaron y se etiquetaron antes de registrar el vehículo (en otro
    // caso), igual aparecen aquí vinculadas por reclamo.
    const reclamo = (caso?.numero_reclamo || casoRow?.numero_reclamo || "").trim();
    setAsegNombre(
      caso?.aseguradora_nombre || casoRow?.aseguradora?.nombre || caso?.aseguradora?.nombre || ""
    );
    let etqs = [...(etqCaso || [])];
    if (reclamo) {
      const { data: etqRec } = await supabase
        .from("etiquetas_piezas")
        .select(etqSelect)
        .ilike("numero_reclamo", reclamo)
        .order("created_at", { ascending: true });
      const vistos = new Set(etqs.map((e) => e.id));
      (etqRec || []).forEach((e) => {
        if (!vistos.has(e.id)) {
          etqs.push(e);
          vistos.add(e.id);
        }
      });
    }

    // Lista única de piezas: primero desde las cotizaciones y luego desde las
    // etiquetas de piezas (las etiquetas vinculan las piezas al caso sin crear
    // una cotización).
    const map = new Map();
    const fotoPorPieza = new Map();
    (cots || []).forEach((c) => {
      (c.items_piezas || []).forEach((it) => {
        const nombre = nombrePieza(it);
        const k = clave(nombre);
        if (!k) return;
        if (!map.has(k)) {
          map.set(k, { clave: k, nombre, cantidad: Number(it.cantidad) || 1, cotizacion: c.numero, foto_path: null });
        }
      });
    });
    (etqs || []).forEach((e) => {
      (e.piezas || []).forEach((it) => {
        const nombre = it.nombre || nombrePieza(it);
        const k = clave(nombre);
        if (!k) return;
        if (it.foto_path && !fotoPorPieza.has(k)) fotoPorPieza.set(k, it.foto_path);
        if (!map.has(k)) {
          map.set(k, { clave: k, nombre, cantidad: Number(it.cantidad) || 1, cotizacion: null, foto_path: it.foto_path || null });
        }
      });
    });
    if (!caso) {
      if (cots?.length) setInfoCaso(cots[cots.length - 1]);
      else if (etqs?.length) setInfoCaso(etqs[etqs.length - 1]);
    }

    // Casos relacionados por reclamo (incluye este). El estado recibida/tramo
    // se comparte entre ellos, así lo marcado al etiquetar en un caso se ve en
    // el caso del vehículo aunque sean distintos.
    const casoIds = [...new Set([casoId, ...etqs.map((e) => e.caso_id).filter(Boolean)])];
    setCasosRel(casoIds);

    // Ajustes hechos a mano sobre la lista: piezas quitadas (entraron por error)
    // y piezas agregadas que no están en ninguna cotización ni etiqueta.
    // Si la migración 50 aún no se corrió, se sigue sin ajustes.
    const { data: manuales } = await supabase
      .from("piezas_caso_manuales")
      .select("pieza_clave, pieza_nombre, cantidad, oculta")
      .in("caso_id", casoIds);
    (manuales || []).forEach((m) => {
      if (m.oculta) map.delete(m.pieza_clave);
      else map.set(m.pieza_clave, {
        clave: m.pieza_clave,
        nombre: m.pieza_nombre,
        cantidad: Number(m.cantidad) || 1,
        cotizacion: null,
        foto_path: null,
        manual: true,
      });
    });

    const paths = [...fotoPorPieza.values()].filter(Boolean);
    const { data: signed } = paths.length
      ? await supabase.storage.from("fotos-casos").createSignedUrls(paths, 60 * 60)
      : { data: [] };
    const urls = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    setPiezas([...map.values()].map((p) => {
      const foto_path = fotoPorPieza.get(p.clave) || p.foto_path;
      return { ...p, foto_path, foto_url: foto_path ? urls.get(foto_path) || "" : "" };
    }));

    // Se intenta leer con "entregada_at"; si la columna aún no existe (migración
    // 38 sin correr), se reintenta sin ella para no romper la lista.
    let recRes = await supabase
      .from("piezas_recibidas")
      .select("pieza_clave, tramo, entregada_at, foto_recibida_path")
      .in("caso_id", casoIds);
    if (recRes.error) {
      recRes = await supabase
        .from("piezas_recibidas")
        .select("pieza_clave, tramo")
        .in("caso_id", casoIds);
    }
    const rec = recRes.data;
    const fotosPath = (rec || []).filter((r) => r.foto_recibida_path).map((r) => r.foto_recibida_path);
    const { data: fotosFirmadas } = fotosPath.length
      ? await supabase.storage.from("fotos-casos").createSignedUrls(fotosPath, 60 * 60)
      : { data: [] };
    const urlPorPath = new Map((fotosFirmadas || []).map((f) => [f.path, f.signedUrl]));
    setFotosRecibidas(new Map((rec || []).filter((r) => r.foto_recibida_path).map((r) => [
      r.pieza_clave,
      { path: r.foto_recibida_path, url: urlPorPath.get(r.foto_recibida_path) || "" },
    ])));
    setRecibidas(new Set((rec || []).map((r) => r.pieza_clave)));
    setEntregadas(new Set((rec || []).filter((r) => r.entregada_at).map((r) => r.pieza_clave)));
    const tmap = {};
    (rec || []).forEach((r) => {
      if (r.tramo) tmap[r.pieza_clave] = r.tramo;
    });
    setTramos(tmap);
    setLoading(false);
  }

  // Catálogo de piezas, para autocompletar al agregar o corregir una.
  useEffect(() => {
    supabase
      .from("piezas_catalogo")
      .select("nombre")
      .order("nombre")
      .then(({ data }) => setCatalogo((data || []).map((p) => ({ id: p.nombre, label: p.nombre }))));
  }, []);

  /**
   * Agrega una pieza al checklist o corrige una existente.
   *
   * Las piezas del caso salen de las cotizaciones y las etiquetas, no de una
   * tabla propia, así que "agregar" y "corregir" se guardan aparte en
   * piezas_caso_manuales. La cotización nunca se toca: lo que se le mandó al
   * seguro tiene que seguir coincidiendo con lo que el seguro tiene.
   */
  async function guardarPieza({ nombre, cantidad }, original) {
    const limpio = (nombre || "").trim();
    if (!limpio) return;
    const nuevaClave = clave(limpio);
    setError("");

    const { data: userData } = await supabase.auth.getUser();
    const filas = [
      {
        caso_id: casoId,
        pieza_clave: nuevaClave,
        pieza_nombre: limpio,
        cantidad: Math.max(1, Number(cantidad) || 1),
        oculta: false,
        created_by: userData?.user?.id,
      },
    ];

    // Al corregir el nombre cambia la clave: la línea vieja se oculta para que
    // no queden las dos. Si la vieja era manual, se borra en vez de ocultarse.
    if (original && original.clave !== nuevaClave) {
      if (original.manual) {
        await supabase.from("piezas_caso_manuales").delete().in("caso_id", casosRel).eq("pieza_clave", original.clave);
      } else {
        filas.push({
          caso_id: casoId,
          pieza_clave: original.clave,
          pieza_nombre: original.nombre,
          cantidad: original.cantidad || 1,
          oculta: true,
          created_by: userData?.user?.id,
        });
      }
      // El estado (recibida, tramo, foto) viaja con el nombre nuevo.
      await supabase
        .from("piezas_recibidas")
        .update({ pieza_clave: nuevaClave, pieza_nombre: limpio })
        .in("caso_id", casosRel)
        .eq("pieza_clave", original.clave);
    }

    const { error: e } = await supabase
      .from("piezas_caso_manuales")
      .upsert(filas, { onConflict: "caso_id,pieza_clave" });
    if (e) {
      setError(mensajeGuardado(e));
      return;
    }
    setEditorPieza(null);
    load();
  }

  /** Quita una pieza del checklist del caso (no de la cotización). */
  async function eliminarPieza(p) {
    setError("");
    const { data: userData } = await supabase.auth.getUser();

    if (p.manual) {
      // Era una línea agregada a mano: se borra y desaparece.
      await supabase.from("piezas_caso_manuales").delete().in("caso_id", casosRel).eq("pieza_clave", p.clave);
    } else {
      // Viene de una cotización o etiqueta: se marca oculta para que no vuelva
      // a aparecer la próxima vez que se arme la lista.
      const { error: e } = await supabase.from("piezas_caso_manuales").upsert(
        {
          caso_id: casoId,
          pieza_clave: p.clave,
          pieza_nombre: p.nombre,
          cantidad: p.cantidad || 1,
          oculta: true,
          created_by: userData?.user?.id,
        },
        { onConflict: "caso_id,pieza_clave" }
      );
      if (e) {
        setError(mensajeGuardado(e));
        return;
      }
    }
    // Si ya no está en el caso, tampoco puede estar recibida ni ocupar anaquel.
    await supabase.from("piezas_recibidas").delete().in("caso_id", casosRel).eq("pieza_clave", p.clave);
    setPiezaAEliminar(null);
    load();
  }

  useEffect(() => {
    if (casoId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);

  async function toggle(p) {
    const yaRecibida = recibidas.has(p.clave);
    // Actualización optimista
    setRecibidas((prev) => {
      const n = new Set(prev);
      if (yaRecibida) n.delete(p.clave);
      else n.add(p.clave);
      return n;
    });
    setError("");

    if (yaRecibida) {
      await supabase.from("piezas_recibidas").delete().in("caso_id", casosRel).eq("pieza_clave", p.clave);
    } else {
      const { data: userData } = await supabase.auth.getUser();
      // upsert: si la fila ya existía (índice único caso_id+pieza_clave), no falla.
      const { error: e } = await supabase.from("piezas_recibidas").upsert(
        {
          caso_id: casoId,
          pieza_clave: p.clave,
          pieza_nombre: p.nombre,
          recibida_by: userData?.user?.id,
        },
        { onConflict: "caso_id,pieza_clave", ignoreDuplicates: true }
      );
      if (e) {
        // revierte el cambio optimista
        setRecibidas((prev) => {
          const n = new Set(prev);
          n.delete(p.clave);
          return n;
        });
        setError("No se pudo guardar. Ejecuta la migración sql/15_piezas_recibidas.sql en Supabase.");
      }
    }
  }

  // Marca/desmarca una pieza como ENTREGADA a un reparador. Al entregarla deja
  // de ocupar espacio en el anaquel (Tramos), pero sigue tachada en la lista.
  async function toggleEntregada(p) {
    const ya = entregadas.has(p.clave);
    setEntregadas((prev) => {
      const n = new Set(prev);
      if (ya) n.delete(p.clave);
      else n.add(p.clave);
      return n;
    });
    await supabase
      .from("piezas_recibidas")
      .update({ entregada_at: ya ? null : new Date().toISOString() })
      .in("caso_id", casosRel)
      .eq("pieza_clave", p.clave);
  }

  async function subirFotoRecibida(p, file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecciona una imagen válida.");
      return;
    }
    setSubiendoFotoRecibida(p.clave);
    setError("");
    let path = "";
    try {
      const comprimida = await compressImage(file, { maxWidth: 1400, quality: 0.8 });
      const extension = comprimida.type === "image/webp" ? "webp" : "jpg";
      path = `piezas-recibidas/${casoId}/${uuid()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("fotos-casos")
        .upload(path, comprimida, { contentType: comprimida.type, upsert: false });
      if (uploadError) throw uploadError;

      const { error: updateError } = await supabase
        .from("piezas_recibidas")
        .update({ foto_recibida_path: path })
        .in("caso_id", casosRel)
        .eq("pieza_clave", p.clave);
      if (updateError) throw updateError;

      const { data: firmado, error: signedError } = await supabase.storage
        .from("fotos-casos")
        .createSignedUrl(path, 60 * 60);
      if (signedError) throw signedError;
      setFotosRecibidas((prev) => new Map(prev).set(p.clave, { path, url: firmado?.signedUrl || "" }));
    } catch (err) {
      if (path) await supabase.storage.from("fotos-casos").remove([path]);
      setError(err.message || "No se pudo guardar la foto de recepción.");
    } finally {
      setSubiendoFotoRecibida(null);
    }
  }

  function controlFotoRecibida(p) {
    const foto = fotosRecibidas.get(p.clave);
    const subiendo = subiendoFotoRecibida === p.clave;
    return (
      <div className="flex items-center gap-1 shrink-0">
        {foto?.url && (
          <button
            type="button"
            onClick={() => setFotoActiva({ src: foto.url, nombre: `Recepción de ${p.nombre}`, clave: p.clave })}
            className="rounded-lg overflow-hidden border border-[var(--line)]"
            title="Ver foto de recepción"
          >
            <img src={foto.url} alt="Foto de recepción" className="w-9 h-9 object-cover" />
          </button>
        )}
        <label
          className={`p-2 rounded-lg cursor-pointer text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)] ${subiendo ? "opacity-50" : ""}`}
          title={foto?.url ? "Cambiar foto de recepción" : "Subir foto de recepción"}
        >
          <Icon name="camera" className="w-4 h-4" />
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={subiendo}
            onChange={(e) => {
              subirFotoRecibida(p, e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  async function eliminarFotoRecibida() {
    if (!fotoActiva?.clave) return;
    if (!confirm("¿Eliminar la foto de recepción de esta pieza?")) return;
    const foto = fotosRecibidas.get(fotoActiva.clave);
    setEliminandoFoto(true);
    try {
      if (foto?.path) await supabase.storage.from("fotos-casos").remove([foto.path]);
      const { error: updateError } = await supabase
        .from("piezas_recibidas")
        .update({ foto_recibida_path: null })
        .in("caso_id", casosRel)
        .eq("pieza_clave", fotoActiva.clave);
      if (updateError) throw updateError;
      setFotosRecibidas((prev) => {
        const next = new Map(prev);
        next.delete(fotoActiva.clave);
        return next;
      });
      setFotoActiva(null);
    } catch (err) {
      setError(err.message || "No se pudo eliminar la foto.");
    } finally {
      setEliminandoFoto(false);
    }
  }

  async function setTramo(p, valor) {
    setTramos((prev) => {
      const n = { ...prev };
      if (valor) n[p.clave] = valor;
      else delete n[p.clave];
      return n;
    });
    await supabase
      .from("piezas_recibidas")
      .update({ tramo: valor || null })
      .in("caso_id", casosRel)
      .eq("pieza_clave", p.clave);
  }

  async function exportar() {
    setExportando(true);
    try {
      const { generarPdfPiezas } = await import("../lib/piezasPdf");
      const blob = await generarPdfPiezas({ caso: infoCaso || {}, piezas });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      setError("No se pudo generar el PDF.");
    } finally {
      setExportando(false);
    }
  }

  function abrirEtiquetas() {
    // Por defecto selecciona las piezas pendientes (las que normalmente
    // acaban de llegar y hay que marcar en la caja).
    const pendientesClaves = piezas.filter((p) => !recibidas.has(p.clave)).map((p) => p.clave);
    setSeleccion(new Set(pendientesClaves.length ? pendientesClaves : piezas.map((p) => p.clave)));
    setMostrarEtiquetas(true);
  }

  function toggleSeleccion(clave) {
    setSeleccion((prev) => {
      const n = new Set(prev);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });
  }

  async function imprimirEtiquetas() {
    setImprimiendo(true);
    try {
      const seleccionadas = piezas.filter((p) => seleccion.has(p.clave));
      // Imprime directo en la térmica si hay print server; si no, abre el PDF.
      // QR → abre el caso para ver dónde está guardada cada pieza (su tramo).
      const { imprimirEtiquetas: enviar } = await import("../lib/printServer");
      const res = await enviar({
        caso: infoCaso || {},
        piezas: seleccionadas,
        qrUrl: `https://dominguez.vercel.app/piezas/${casoId}`,
      });
      if (res.modo === "pdf") window.open(URL.createObjectURL(res.blob), "_blank");
      setMostrarEtiquetas(false);
    } catch (err) {
      setError(err.message || "No se pudo imprimir las etiquetas.");
    } finally {
      setImprimiendo(false);
    }
  }

  const recibidasCount = piezas.filter((p) => recibidas.has(p.clave)).length;
  const pendientes = piezas.length - recibidasCount;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="font-bold text-[var(--ink)]">Piezas del caso</h2>
          <p className="text-xs text-[var(--ink-soft)]">
            {recibidasCount} de {piezas.length} recibidas · {pendientes} pendiente(s)
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setEditorPieza("nueva")} className="btn-ghost text-sm py-2 px-3 gap-1.5">
            <Icon name="plus" className="w-4 h-4" /> Agregar pieza
          </button>
          <button
            onClick={abrirEtiquetas}
            disabled={!piezas.length}
            className="btn-primary text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
          >
            <Icon name="tag" className="w-4 h-4" /> Imprimir etiquetas
          </button>
          <button
            onClick={exportar}
            disabled={exportando || !piezas.length}
            className="btn-ghost text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
          >
            <Icon name="printer" className="w-4 h-4" /> {exportando ? "Generando…" : "Exportar PDF"}
          </button>
          <Link to="/tramos" className="btn-ghost text-sm py-2 px-3 gap-1.5">
            <Icon name="grid" className="w-4 h-4" /> Ver anaquel
          </Link>
        </div>
      </div>

      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

      {loading ? (
        <p className="text-sm text-[var(--ink-soft)]">Cargando…</p>
      ) : piezas.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">
          No hay piezas. Salen solas de las cotizaciones y las etiquetas de este vehículo, o puedes
          agregarlas a mano con “Agregar pieza”.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--line)]">
          {piezas.map((p) => {
            const recibida = recibidas.has(p.clave);
            const entregada = entregadas.has(p.clave);
            return (
              <li key={p.clave} className="flex items-center gap-2 py-1.5 px-2 hover:bg-[var(--paper)] rounded-lg">
                <button onClick={() => toggle(p)} className="flex-1 flex items-center gap-3 py-1.5 text-left min-w-0">
                  <span
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                      recibida ? "bg-emerald-500 border-emerald-500 text-white" : "border-[var(--ink-soft)]"
                    }`}
                  >
                    {recibida && <Icon name="check" className="w-4 h-4" strokeWidth={3} />}
                  </span>
                  <span
                    className={`flex-1 font-medium truncate ${
                      recibida ? "text-[var(--ink-soft)] line-through" : "text-[var(--ink)]"
                    }`}
                  >
                    {p.foto_url && (
                      <img
                        src={p.foto_url}
                        alt={`Foto de ${p.nombre}`}
                        className="w-12 h-12 rounded-lg object-cover border border-[var(--line)] shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFotoActiva({ src: p.foto_url, nombre: p.nombre });
                        }}
                      />
                    )}
                    {p.nombre}
                  </span>
                  {p.cantidad > 1 && (
                    <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
                  )}
                </button>

                {!recibida ? (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap bg-amber-50 text-amber-600 shrink-0">
                    Pendiente
                  </span>
                ) : entregada ? (
                  // Entregada a un reparador: fuera del anaquel. Click para deshacer.
                  <div className="flex items-center gap-1.5 shrink-0">
                    {controlFotoRecibida(p)}
                    <button
                      onClick={() => toggleEntregada(p)}
                      title="Entregada a un reparador (toca para deshacer)"
                      className="text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap inline-flex items-center gap-1.5 bg-slate-100 text-slate-500"
                    >
                      <Icon name="truck" className="w-3.5 h-3.5" /> Entregada
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {controlFotoRecibida(p)}
                    {/* Espacio del anaquel (se elige en una grilla) */}
                    <button
                      onClick={() => setTramoPieza(p)}
                      title="Elegir tramo en el anaquel"
                      className={`text-sm font-extrabold rounded-lg border px-3 py-1.5 min-w-[3.5rem] ${
                        tramos[p.clave]
                          ? "border-sky-300 bg-sky-50 text-sky-700"
                          : "border-dashed border-[var(--line)] text-[var(--ink-soft)] font-semibold"
                      }`}
                    >
                      {tramos[p.clave] ? formatoTramo(tramos[p.clave]) : "Tramo…"}
                    </button>
                    {/* Entregar a un reparador (la saca del anaquel) */}
                    <button
                      onClick={() => toggleEntregada(p)}
                      title="Marcar como entregada a un reparador"
                      className="p-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)]"
                    >
                      <Icon name="truck" className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Corregir el nombre o quitar la pieza del caso */}
                <div className="flex items-center shrink-0">
                  <button
                    onClick={() => setEditorPieza(p)}
                    title="Corregir el nombre o la cantidad"
                    className="p-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)]"
                  >
                    <Icon name="pencil" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPiezaAEliminar(p)}
                    title="Quitar esta pieza del caso"
                    className="p-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)]"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {tramoPieza && (
        <TramoPicker
          aseguradora={asegNombre}
          valor={tramos[tramoPieza.clave] || ""}
          onSelect={(code) => {
            setTramo(tramoPieza, code);
            setTramoPieza(null);
          }}
          onClear={() => {
            setTramo(tramoPieza, "");
            setTramoPieza(null);
          }}
          onClose={() => setTramoPieza(null)}
        />
      )}

      {mostrarEtiquetas && (
        <EtiquetasModal
          piezas={piezas}
          seleccion={seleccion}
          onToggle={toggleSeleccion}
          onSeleccionarTodas={() => setSeleccion(new Set(piezas.map((p) => p.clave)))}
          onLimpiar={() => setSeleccion(new Set())}
          onImprimir={imprimirEtiquetas}
          onCancelar={() => setMostrarEtiquetas(false)}
          imprimiendo={imprimiendo}
        />
      )}
      {fotoActiva && (
        <Lightbox
          src={fotoActiva.src}
          alt={`Foto de ${fotoActiva.nombre}`}
          onClose={() => setFotoActiva(null)}
          onDelete={eliminarFotoRecibida}
          deleting={eliminandoFoto}
        />
      )}

      {editorPieza && (
        <PiezaModal
          pieza={editorPieza === "nueva" ? null : editorPieza}
          catalogo={catalogo}
          onCancel={() => setEditorPieza(null)}
          onSave={guardarPieza}
        />
      )}

      {piezaAEliminar && (
        <ConfirmDialog
          titulo="Quitar la pieza del caso"
          mensaje={
            piezaAEliminar.manual
              ? `“${piezaAEliminar.nombre}” se agregó a mano y desaparecerá de la lista.`
              : `“${piezaAEliminar.nombre}” dejará de aparecer en este caso. La cotización NO se toca: sigue igual que como se le envió al seguro.`
          }
          confirmLabel="Quitar"
          onConfirm={() => eliminarPieza(piezaAEliminar)}
          onCancel={() => setPiezaAEliminar(null)}
        />
      )}
    </div>
  );
}

// Alta y corrección de una pieza del checklist. El nombre autocompleta con el
// catálogo, pero admite escribir cualquier cosa: los nombres de piezas varían
// mucho entre aseguradoras.
function PiezaModal({ pieza, catalogo, onCancel, onSave }) {
  const [nombre, setNombre] = useState(pieza?.nombre || "");
  const [cantidad, setCantidad] = useState(String(pieza?.cantidad || 1));
  const [guardando, setGuardando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  const hayCambios =
    nombre.trim() !== (pieza?.nombre || "") || cantidad !== String(pieza?.cantidad || 1);

  async function guardar() {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    await onSave({ nombre, cantidad }, pieza);
    setGuardando(false);
  }

  // Un clic fuera de la tarjeta cerraba y se perdía lo escrito sin avisar.
  // Ahora solo cierra directo si no se escribió nada.
  function intentarCerrar() {
    if (hayCambios) setConfirmarSalida(true);
    else onCancel();
  }

  if (confirmarSalida) {
    return (
      <ConfirmDialog
        titulo="Vas a perder lo escrito"
        mensaje={`Todavía no se guardó “${nombre.trim() || "la pieza"}”. Si sales ahora se pierde.`}
        icon="pencil"
        confirmLabel="Salir sin guardar"
        cancelLabel="Seguir editando"
        onConfirm={onCancel}
        onCancel={() => setConfirmarSalida(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={intentarCerrar}>
      <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-[var(--ink)] mb-1">{pieza ? "Corregir pieza" : "Agregar pieza"}</h3>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          {pieza && !pieza.manual
            ? "Esta pieza vino de una cotización. El cambio es solo para este caso: la cotización y su PDF quedan igual."
            : "Se agrega solo al checklist de este caso, sin tocar ninguna cotización."}
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Nombre de la pieza *</span>
            <Combobox
              items={catalogo}
              value={nombre}
              onChange={(v) => setNombre(v)}
              placeholder="Ej. Bumper delantero"
              allowCreate
            />
          </label>
          <label className="block">
            <span className="field-label">Cantidad</span>
            <input
              type="number"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="input w-28"
            />
          </label>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={guardar} disabled={!nombre.trim() || guardando} className="btn-primary disabled:opacity-50">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button onClick={onCancel} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function EtiquetasModal({
  piezas,
  seleccion,
  onToggle,
  onSeleccionarTodas,
  onLimpiar,
  onImprimir,
  onCancelar,
  imprimiendo,
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="p-5 border-b border-[var(--line)]">
          <h3 className="font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="tag" className="w-5 h-5 text-[var(--brand-red)]" /> Imprimir etiquetas
          </h3>
          <p className="text-xs text-[var(--ink-soft)] mt-1">
            Selecciona qué piezas llevarán etiqueta. Cada una sale en una hoja de 4×6&quot;
            con los datos del asegurado, vehículo y seguro, lista para pegar en la caja.
          </p>
        </div>

        <div className="px-5 py-2 flex gap-3 text-xs">
          <button onClick={onSeleccionarTodas} className="text-[var(--brand-red)] font-semibold">
            Seleccionar todas
          </button>
          <button onClick={onLimpiar} className="text-[var(--ink-soft)] font-semibold">
            Quitar selección
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          <ul className="divide-y divide-[var(--line)]">
            {piezas.map((p) => {
              const sel = seleccion.has(p.clave);
              return (
                <li key={p.clave}>
                  <button
                    onClick={() => onToggle(p.clave)}
                    className="w-full flex items-center gap-3 py-2.5 text-left"
                  >
                    <span
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                        sel ? "bg-[var(--brand-red)] border-[var(--brand-red)] text-white" : "border-[var(--ink-soft)]"
                      }`}
                    >
                      {sel && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                    <span className="flex-1 text-sm font-medium text-[var(--ink)]">{p.nombre}</span>
                    {p.cantidad > 1 && (
                      <span className="text-xs text-[var(--ink-soft)] whitespace-nowrap">x{p.cantidad}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="p-5 border-t border-[var(--line)] flex gap-3">
          <button
            onClick={onImprimir}
            disabled={imprimiendo || seleccion.size === 0}
            className="btn-primary flex-1 disabled:opacity-50"
          >
            {imprimiendo ? "Generando…" : `Imprimir ${seleccion.size} etiqueta(s)`}
          </button>
          <button onClick={onCancelar} className="btn-ghost">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
