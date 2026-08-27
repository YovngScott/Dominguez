import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PhotoManager from "../components/PhotoManager";
import PiezasManager from "../components/PiezasManager";
import DocumentManager from "../components/DocumentManager";
import SignaturePad from "../components/SignaturePad";
import SelectorLlave from "../components/SelectorLlave";
import FichaTallerModal from "../components/FichaTallerModal";
import Icon from "../components/Icon";
import { ESTADOS, FASES_REPARACION } from "../lib/estados";
import { rd } from "../lib/cotizacion";
import { marcarCitasAtendidas } from "../lib/citaCaso";

const ESTADO_ORDEN = ["en_espera_piezas", "listo_para_trabajar", "entregado"];

function fechaLarga(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-DO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CaseDetail() {
  const { casoId } = useParams();
  const navigate = useNavigate();
  const [caso, setCaso] = useState(null);
  const [tab, setTab] = useState("fotos");
  const [loading, setLoading] = useState(true);
  const [estadoError, setEstadoError] = useState("");
  const [historial, setHistorial] = useState([]);
  const [cotizaciones, setCotizaciones] = useState([]);
  const [citas, setCitas] = useState([]);
  const [firmaUrl, setFirmaUrl] = useState(null);
  const [showFirma, setShowFirma] = useState(false);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const [imprimiendoMateriales, setImprimiendoMateriales] = useState(false);

  async function loadCaso() {
    const { data } = await supabase
      .from("casos")
      .select(
        `*,
         cliente:clientes(*),
         aseguradora:aseguradoras(*),
         marca:marcas(nombre),
         modelo:modelos(nombre)`
      )
      .eq("id", casoId)
      .single();
    setCaso(data);
    setLoading(false);

    if (data?.firma_entrega_url) {
      const { data: signed } = await supabase.storage
        .from("fotos-casos")
        .createSignedUrl(data.firma_entrega_url, 3600);
      setFirmaUrl(signed?.signedUrl || null);
    } else {
      setFirmaUrl(null);
    }
  }

  async function loadHistorial() {
    const { data } = await supabase
      .from("historial_caso")
      .select("*")
      .eq("caso_id", casoId)
      .order("created_at", { ascending: false });
    setHistorial(data || []);
  }

  async function loadCotizaciones(chasis) {
    const filtros = [`caso_id.eq.${casoId}`];
    if (chasis && chasis.trim()) filtros.push(`chasis.ilike.${chasis.trim()}`);
    const { data } = await supabase
      .from("cotizaciones")
      .select("id, numero, total, estado, created_at")
      .or(filtros.join(","))
      .order("created_at", { ascending: false });
    setCotizaciones(data || []);
  }

  async function loadCitas() {
    const { data } = await supabase
      .from("citas")
      .select("id, fecha, hora, nombre, telefono, motivo, nota, estado, caso_id")
      .eq("caso_id", casoId)
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true });
    setCitas(data || []);
  }

  useEffect(() => {
    loadCaso();
    loadHistorial();
    loadCitas();
  }, [casoId]);

  // Carga las cotizaciones enlazadas una vez que conocemos el chasis del caso
  useEffect(() => {
    if (caso) loadCotizaciones(caso.chasis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caso?.id, caso?.chasis]);

  async function actualizarEstado(estado) {
    setEstadoError("");
    if (estado === "entregado") {
      setShowFirma(true);
      return;
    }
    const { error } = await supabase
      .from("casos")
      .update({ estado, fecha_entrega: null, firma_entrega_url: null })
      .eq("id", casoId);
    if (error) {
      setEstadoError(
        "No se pudo cambiar el estado. Ejecuta la migración sql/05_migracion_estados.sql en Supabase."
      );
      return;
    }
    setCaso((c) => ({ ...c, estado, fecha_entrega: null, firma_entrega_url: null }));
    setFirmaUrl(null);
    loadHistorial();

    // Al recibir el vehículo, la cita que lo esperaba queda atendida sola.
    if (estado === "vehiculo_en_taller") {
      marcarCitasAtendidas(casoId).catch(() => {});
    }
  }

  async function actualizarFase(fase) {
    const { error } = await supabase
      .from("casos")
      .update({ fase_reparacion: fase })
      .eq("id", casoId);
    if (!error) {
      setCaso((c) => ({ ...c, fase_reparacion: fase }));
      loadHistorial();
    }
  }

  async function confirmarEntrega(blob) {
    setGuardandoFirma(true);
    try {
      const path = `${casoId}/firma/firma.png`;
      const { error: upErr } = await supabase.storage
        .from("fotos-casos")
        .upload(path, blob, { contentType: "image/png", upsert: true });
      if (upErr) throw upErr;

      const { error } = await supabase
        .from("casos")
        .update({
          estado: "entregado",
          fecha_entrega: new Date().toISOString(),
          firma_entrega_url: path,
        })
        .eq("id", casoId);
      if (error) throw error;

      setShowFirma(false);
      await loadCaso();
      loadHistorial();
    } catch (err) {
      setEstadoError(err.message || "No se pudo guardar la firma.");
      setShowFirma(false);
    } finally {
      setGuardandoFirma(false);
    }
  }

  // Datos del vehículo que van en el encabezado de los PDF del caso.
  function datosCasoPdf() {
    return {
      aseguradora_nombre: caso.aseguradora?.nombre,
      cliente_nombre: caso.cliente?.nombre_completo,
      cliente_telefono: caso.cliente?.telefono,
      marca: caso.marca?.nombre,
      modelo: caso.modelo?.nombre,
      anio: caso.anio,
      placa: caso.placa,
      chasis: caso.chasis,
      color: caso.color,
      fecha_ingreso: caso.fecha_ingreso,
      fecha_entrega: caso.fecha_entrega,
      numero_llave: caso.numero_llave,
      numero_reclamo: caso.numero_reclamo,
    };
  }

  async function imprimirMateriales() {
    setImprimiendoMateriales(true);
    try {
      const { data: ordenes } = await supabase
        .from("ordenes_reparacion")
        .select("*")
        .eq("caso_id", casoId)
        .order("created_at", { ascending: false })
        .limit(1);
      const { generarReporteMateriales } = await import("../lib/materialesPdf");
      const blob = generarReporteMateriales({
        caso: datosCasoPdf(),
        orden: ordenes?.[0] || {},
      });
      /*
      // Si el recibo/orden trae trabajos escritos a mano, también se incluyen
      // en la ficha, además de la mano de obra de las cotizaciones.
      (ordenes?.[0]?.trabajos || "").split(/\r?\n|,|;/).map((t) => t.trim()).filter(Boolean).forEach((desc) => {
        const k = desc.toLowerCase();
        if (!manoVistas.has(k)) { manoVistas.add(k); mano.push({ descripcion: desc, cantidad: 1 }); }
      });
      */
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setImprimiendoMateriales(false);
    }
  }

  async function eliminarCaso() {
    if (!confirm("¿Eliminar este caso? Se borrarán también sus fotos y documentos. Esta acción no se puede deshacer.")) {
      return;
    }
    // Limpia archivos del Storage antes de borrar el caso
    const [{ data: fotos }, { data: docs }] = await Promise.all([
      supabase.from("fotos_caso").select("storage_path").eq("caso_id", casoId),
      supabase.from("documentos_caso").select("storage_path").eq("caso_id", casoId),
    ]);
    const fotoPaths = (fotos || []).map((f) => f.storage_path);
    if (caso?.firma_entrega_url) fotoPaths.push(caso.firma_entrega_url);
    if (fotoPaths.length) await supabase.storage.from("fotos-casos").remove(fotoPaths);
    const docPaths = (docs || []).map((d) => d.storage_path);
    if (docPaths.length) await supabase.storage.from("documentos-casos").remove(docPaths);

    await supabase.from("casos").delete().eq("id", casoId);
    navigate(`/aseguradoras/${caso.aseguradora_id}`);
  }

  if (loading) return <p className="p-10 text-center text-[var(--ink-soft)]">Cargando…</p>;
  if (!caso) return <p className="p-10 text-center text-[var(--ink-soft)]">Caso no encontrado.</p>;

  const estadoActivo =
    caso.estado === "vehiculo_en_taller"
      ? "listo_para_trabajar"
      : caso.estado !== "listo_para_trabajar" && caso.estado !== "entregado"
        ? "en_espera_piezas"
        : caso.estado;
  const enTaller = caso.estado === "vehiculo_en_taller";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <div className="space-y-3">
        <Link
          to={`/aseguradoras/${caso.aseguradora_id}`}
          className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] truncate max-w-full"
        >
          ← {caso.aseguradora?.nombre}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
          {
            <button
              onClick={() => setFichaOpen(true)}
              className="ficha-print-button btn-primary text-sm py-2 px-3 gap-1.5"
            >
              <span aria-hidden="true">🔑</span>
              <Icon name="key" className="w-4 h-4" />
              <span>Imprimir ficha de taller</span>
            </button>
          }
          <button
            onClick={imprimirMateriales}
            disabled={imprimiendoMateriales}
            className="btn-ghost text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
          >
            <Icon name="clipboard" className="w-4 h-4" />
            {imprimiendoMateriales ? "Generando..." : "Materiales / suministros"}
          </button>
          </div>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
          <Link to={`/ordenes/nueva?caso=${casoId}`} className="btn-ghost text-sm py-2 px-3 gap-1.5">
            <Icon name="clipboard" className="w-4 h-4" /> Recibo
          </Link>
          <Link to={`/casos/${casoId}/reporte`} className="btn-ghost text-sm py-2 px-3 gap-1.5">
            <Icon name="printer" className="w-4 h-4" /> Reporte
          </Link>
          <Link to={`/casos/${casoId}/editar`} className="btn-ghost text-sm py-2 px-3 gap-1.5">
            <Icon name="pencil" className="w-4 h-4" /> Editar
          </Link>
          <button
            onClick={eliminarCaso}
            className="btn-ghost text-sm py-2 px-3 gap-1.5 !text-[var(--brand-red)] hover:!border-[var(--brand-red)]"
          >
            <Icon name="trash" className="w-4 h-4" /> Eliminar
          </button>
          </div>
        </div>
      </div>

      <div className="card p-6 mt-3 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
              {caso.marca?.nombre} {caso.modelo?.nombre} {caso.anio ? `(${caso.anio})` : ""}
            </h1>
            <p className="text-[var(--ink-soft)] mt-0.5">{caso.cliente?.nombre_completo}</p>
          </div>
          <SelectorLlave
            casoId={caso.id}
            numeroLlave={caso.numero_llave}
            estado={caso.estado}
            onChange={(numero_llave) => setCaso((c) => ({ ...c, numero_llave }))}
          />
        </div>

        {/* Estado */}
        <div className="mt-5">
          <p className="field-label">Estado del caso</p>
          <div className="flex flex-wrap gap-1 bg-[var(--paper)] p-1 rounded-xl">
            {ESTADO_ORDEN.map((estado) => {
              const e = ESTADOS[estado];
              const activo = estadoActivo === estado;
              return (
                <button
                  key={estado}
                  onClick={() => actualizarEstado(estado)}
                  className={`flex-1 min-w-[8.5rem] px-3 py-2 rounded-lg text-sm font-semibold transition-all inline-flex items-center justify-center gap-1.5 ${
                    activo ? "bg-white shadow-sm" : "text-[var(--ink-soft)] hover:bg-white/60"
                  }`}
                  style={activo ? { color: e.accent } : {}}
                >
                  <Icon name={e.icon} className="w-4 h-4 shrink-0" /> {e.label}
                </button>
              );
            })}
          </div>
          {estadoError && <p className="text-sm text-[var(--brand-red)] mt-2">{estadoError}</p>}

          {estadoActivo === "listo_para_trabajar" && (
            <label
              className={`mt-3 inline-flex items-center gap-2.5 pl-3 pr-4 py-2 rounded-xl border-2 cursor-pointer transition-all select-none ${
                enTaller
                  ? "border-sky-300 bg-sky-50 text-sky-700"
                  : "border-[var(--line)] text-[var(--ink-soft)] hover:border-sky-300"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
                  enTaller ? "bg-sky-500 border-sky-500 text-white" : "border-[var(--ink-soft)]"
                }`}
              >
                {enTaller && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                checked={enTaller}
                onChange={(e) => actualizarEstado(e.target.checked ? "vehiculo_en_taller" : "listo_para_trabajar")}
                className="sr-only"
              />
              <Icon name="car" className="w-4 h-4" />
              <span className="font-semibold text-sm">Vehículo en el taller</span>
            </label>
          )}

          {enTaller && (
            <div className="mt-4 p-4 border border-sky-100 bg-sky-50/30 rounded-xl space-y-3">
              <p className="text-sky-800 font-bold inline-flex items-center gap-1.5 text-xs uppercase tracking-wider">
                <Icon name="wrench" className="w-3.5 h-3.5" />
                Fase de Reparación
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(FASES_REPARACION).map(([key, fase]) => {
                  const activa = caso.fase_reparacion === key || (!caso.fase_reparacion && key === "desabolladura");
                  return (
                    <button
                      key={key}
                      onClick={() => actualizarFase(key)}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                        activa
                          ? "bg-sky-500 border-sky-500 text-white shadow-sm"
                          : "bg-white border-[var(--line)] text-[var(--ink-soft)] hover:border-sky-300"
                      }`}
                    >
                      <Icon name={fase.icon} className="w-3.5 h-3.5" />
                      {fase.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Datos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm border-t border-[var(--line)] pt-5">
          <Info label="Placa" value={caso.placa} />
          <Info label="Chasis" value={caso.chasis} />
          <Info label="Color" value={caso.color} />
          <Info label="Aseguradora" value={caso.aseguradora?.nombre} />
          <Info label="Reclamo" value={caso.numero_reclamo} />
          <Info label="Póliza" value={caso.numero_poliza} />
          <Info label="Teléfono" value={caso.cliente?.telefono} />
          <Info label="Suplidor" value={caso.suplidor} />
        </div>

        {caso.notas && (
          <p className="text-sm text-[var(--ink-soft)] mt-4 border-t border-[var(--line)] pt-4">
            {caso.notas}
          </p>
        )}

        {/* Entrega */}
        {caso.estado === "entregado" && (
          <div className="mt-4 border-t border-[var(--line)] pt-4">
            <p className="field-label">Entrega confirmada</p>
            <p className="text-sm text-[var(--ink-soft)]">{fechaLarga(caso.fecha_entrega)}</p>
            {firmaUrl && (
              <img
                src={firmaUrl}
                alt="Firma de entrega"
                className="mt-2 h-24 border border-[var(--line)] rounded-lg bg-white"
              />
            )}
          </div>
        )}
      </div>

      {/* Tabs fotos / documentos */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <TabButton active={tab === "fotos"} onClick={() => setTab("fotos")}>
          <Icon name="camera" className="w-4 h-4" /> Fotos
        </TabButton>
        <TabButton active={tab === "documentos"} onClick={() => setTab("documentos")}>
          <Icon name="file" className="w-4 h-4" /> Documentos / PDF
        </TabButton>
        <TabButton active={tab === "cotizaciones"} onClick={() => setTab("cotizaciones")}>
          <Icon name="receipt" className="w-4 h-4" /> Cotizaciones {cotizaciones.length > 0 && `(${cotizaciones.length})`}
        </TabButton>
        <TabButton active={tab === "piezas"} onClick={() => setTab("piezas")}>
          <Icon name="layers" className="w-4 h-4" /> Piezas
        </TabButton>
        <TabButton active={tab === "historial"} onClick={() => setTab("historial")}>
          <Icon name="clock" className="w-4 h-4" /> Historial
        </TabButton>
        <TabButton active={tab === "citas"} onClick={() => setTab("citas")}>
          <Icon name="calendar" className="w-4 h-4" /> Citas {citas.length > 0 && `(${citas.length})`}
        </TabButton>
      </div>

      {tab === "fotos" && <PhotoManager casoId={caso.id} />}
      {tab === "documentos" && <DocumentManager casoId={caso.id} />}
      {tab === "cotizaciones" && <Cotizaciones lista={cotizaciones} casoId={casoId} />}
      {tab === "piezas" && (
        <PiezasManager
          casoId={caso.id}
          caso={{
            cliente_nombre: caso.cliente?.nombre_completo,
            aseguradora_nombre: caso.aseguradora?.nombre,
            marca: caso.marca?.nombre,
            modelo: caso.modelo?.nombre,
            anio: caso.anio,
            placa: caso.placa,
            numero_reclamo: caso.numero_reclamo,
          }}
        />
      )}
      {tab === "historial" && <Historial eventos={historial} />}
      {tab === "citas" && <CitasCaso lista={citas} casoId={casoId} caso={caso} onRefresh={loadCitas} />}

      {showFirma && (
        <SignaturePad
          onConfirm={confirmarEntrega}
          onCancel={() => setShowFirma(false)}
          submitting={guardandoFirma}
        />
      )}

      {fichaOpen && (
        <FichaTallerModal casoId={casoId} caso={datosCasoPdf()} onClose={() => setFichaOpen(false)} />
      )}
    </div>
  );
}

function Historial({ eventos }) {
  if (!eventos.length) {
    return (
      <div className="card p-6 text-sm text-[var(--ink-soft)]">
        Aún no hay eventos registrados.
      </div>
    );
  }
  return (
    <div className="card p-6">
      <ol className="relative border-l-2 border-[var(--line)] ml-2 space-y-5">
        {eventos.map((ev) => {
          const est = ESTADOS[ev.estado_nuevo];
          return (
            <li key={ev.id} className="ml-5">
              <span className="absolute -left-[9px] w-4 h-4 rounded-full bg-[var(--brand-red)] border-2 border-white" />
              <p className="text-sm font-semibold text-[var(--ink)]">
                {ev.tipo === "creado" ? "Caso registrado" : "Cambio de estado"}
                {est ? ` → ${est.label}` : ""}
              </p>
              <p className="text-xs text-[var(--ink-soft)]">
                {fechaLarga(ev.created_at)}
                {ev.user_email && ev.user_email !== "sistema" ? ` · ${ev.user_email}` : ""}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Cotizaciones({ lista, casoId }) {
  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-[var(--ink)]">Cotizaciones de este vehículo</h2>
        <Link
          to={`/cotizaciones/nueva?caso=${casoId}`}
          className="btn-primary text-sm py-2 px-3"
        >
          + Nueva
        </Link>
      </div>
      {lista.length === 0 ? (
        <p className="text-sm text-[var(--ink-soft)]">
          No hay cotizaciones enlazadas. Al generar una cotización con este mismo chasis, aparecerá aquí.
        </p>
      ) : (
        <div className="divide-y divide-[var(--line)]">
          {lista.map((c) => (
            <Link
              key={c.id}
              to={`/cotizaciones/${c.id}`}
              className="flex items-center justify-between py-3 hover:bg-[var(--paper)] px-2 rounded-lg"
            >
              <div>
                <p className="font-semibold text-[var(--ink)]">{c.numero}</p>
                <p className="text-xs text-[var(--ink-soft)]">{fechaLarga(c.created_at)}</p>
              </div>
              <span className="font-bold text-[var(--ink)]">{rd(c.total)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CitasCaso({ lista, casoId, caso, onRefresh }) {
  const [citaNueva, setCitaNueva] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  async function marcar(cita, estado) {
    const { error } = await supabase.from("citas").update({ estado }).eq("id", cita.id);
    if (!error) onRefresh();
  }
  async function guardarNueva(e) {
    e.preventDefault();
    if (!citaNueva?.fecha || !citaNueva?.nombre?.trim()) return;
    setGuardando(true); setError("");
    const { error: eInsert } = await supabase.from("citas").insert({
      caso_id: casoId,
      fecha: citaNueva.fecha,
      hora: citaNueva.hora || null,
      nombre: citaNueva.nombre.trim(),
      telefono: citaNueva.telefono?.trim() || null,
      cliente_id: caso?.cliente_id || null,
      motivo: citaNueva.motivo?.trim() || null,
      nota: citaNueva.nota?.trim() || null,
      estado: "pendiente",
    });
    setGuardando(false);
    if (eInsert) return setError("No se pudo guardar la cita. Revisa la conexión e inténtalo de nuevo.");
    setCitaNueva(null); onRefresh();
  }
  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div><h2 className="font-bold text-[var(--ink)]">Citas de este caso</h2><p className="text-xs text-[var(--ink-soft)] mt-0.5">Actualiza el estado sin salir del vehículo.</p></div>
        <button type="button" onClick={() => setCitaNueva({ nombre: caso?.cliente?.nombre_completo || "", fecha: new Date().toISOString().slice(0, 10), hora: "", telefono: caso?.cliente?.telefono || "", motivo: "", nota: "" })} className="btn-primary text-sm py-2 px-3">+ Nueva cita</button>
      </div>
      {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}
      {lista.length === 0 ? <p className="text-sm text-[var(--ink-soft)]">No hay citas enlazadas a este caso.</p> : <div className="space-y-2">{lista.map((cita) => <div key={cita.id} className="rounded-xl border border-[var(--line)] p-3 flex flex-wrap items-center justify-between gap-3"><div className="min-w-0"><p className="font-semibold text-[var(--ink)]">{cita.nombre}</p><p className="text-sm text-[var(--ink-soft)]">{cita.fecha}{cita.hora ? ` · ${cita.hora}` : ""}{cita.telefono ? ` · ${cita.telefono}` : ""}</p>{cita.motivo && <p className="text-xs text-[var(--ink-soft)] mt-1">{cita.motivo}</p>}</div><select value={cita.estado || "pendiente"} onChange={(e) => marcar(cita, e.target.value)} className="input text-sm py-1.5 px-2 w-auto">{["pendiente", "confirmada", "atendida", "cancelada"].map((estado) => <option key={estado} value={estado}>{estado}</option>)}</select></div>)}</div>}
      {citaNueva && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><form onSubmit={guardarNueva} className="card w-full max-w-lg p-5 sm:p-6 space-y-3"><div className="flex items-center justify-between"><h3 className="text-lg font-bold text-[var(--ink)]">Nueva cita para este caso</h3><button type="button" onClick={() => setCitaNueva(null)} className="text-xl text-[var(--ink-soft)]" aria-label="Cerrar">✕</button></div><div className="grid grid-cols-2 gap-3"><label className="block"><span className="field-label">Fecha *</span><input type="date" required value={citaNueva.fecha} onChange={(e) => setCitaNueva((c) => ({ ...c, fecha: e.target.value }))} className="input" /></label><label className="block"><span className="field-label">Hora</span><input type="time" value={citaNueva.hora} onChange={(e) => setCitaNueva((c) => ({ ...c, hora: e.target.value }))} className="input" /></label></div><label className="block"><span className="field-label">Nombre *</span><input required value={citaNueva.nombre} onChange={(e) => setCitaNueva((c) => ({ ...c, nombre: e.target.value }))} className="input" placeholder="Nombre del cliente" /></label><label className="block"><span className="field-label">Teléfono</span><input value={citaNueva.telefono} onChange={(e) => setCitaNueva((c) => ({ ...c, telefono: e.target.value }))} className="input" placeholder="809..." /></label><label className="block"><span className="field-label">Motivo</span><input value={citaNueva.motivo} onChange={(e) => setCitaNueva((c) => ({ ...c, motivo: e.target.value }))} className="input" placeholder="Revisión, entrega…" /></label><label className="block"><span className="field-label">Nota</span><textarea value={citaNueva.nota} onChange={(e) => setCitaNueva((c) => ({ ...c, nota: e.target.value }))} className="input min-h-20 resize-y" /></label><div className="flex justify-end gap-2 pt-1"><button type="button" onClick={() => setCitaNueva(null)} className="btn-ghost">Cancelar</button><button disabled={guardando} className="btn-primary">{guardando ? "Guardando…" : "Guardar cita"}</button></div></form></div>}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors inline-flex items-center gap-1.5 ${
        active
          ? "bg-[var(--brand-red)] text-white"
          : "bg-white border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--ink)]"
      }`}
    >
      {children}
    </button>
  );
}

function Info({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="text-[var(--ink-soft)] text-xs uppercase tracking-wide">{label}</p>
      <p className="font-semibold text-[var(--ink)] break-words">{value || "—"}</p>
    </div>
  );
}
