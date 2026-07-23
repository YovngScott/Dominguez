import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import PhotoManager from "../components/PhotoManager";
import PiezasManager from "../components/PiezasManager";
import DocumentManager from "../components/DocumentManager";
import SignaturePad from "../components/SignaturePad";
import Icon from "../components/Icon";
import { ESTADOS } from "../lib/estados";
import { rd, nombrePieza } from "../lib/cotizacion";

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
  const [firmaUrl, setFirmaUrl] = useState(null);
  const [showFirma, setShowFirma] = useState(false);
  const [guardandoFirma, setGuardandoFirma] = useState(false);
  const [generandoTrabajo, setGenerandoTrabajo] = useState(false);

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

  useEffect(() => {
    loadCaso();
    loadHistorial();
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

  // Genera la hoja "Trabajo a realizar" con las piezas y la mano de obra
  // tomadas de las cotizaciones del vehículo. Se imprime y se pone en el carro.
  async function imprimirTrabajo() {
    setGenerandoTrabajo(true);
    try {
      const filtros = [`caso_id.eq.${casoId}`];
      if (caso.chasis?.trim()) filtros.push(`chasis.ilike.${caso.chasis.trim()}`);
      const { data: cots } = await supabase
        .from("cotizaciones")
        .select("items_piezas, items_mano_obra, created_at")
        .or(filtros.join(","))
        .order("created_at", { ascending: false });

      // Junta piezas (sin repetir) y mano de obra de todas las cotizaciones.
      const piezasMap = new Map();
      const mano = [];
      const manoVistas = new Set();
      (cots || []).forEach((c) => {
        (c.items_piezas || []).forEach((it) => {
          const nombre = nombrePieza(it);
          const k = nombre.toLowerCase();
          if (nombre && !piezasMap.has(k)) piezasMap.set(k, { nombre, cantidad: Number(it.cantidad) || 1 });
        });
        (c.items_mano_obra || []).forEach((it) => {
          const desc = it.pieza ? `${it.nombre} · ${nombrePieza({ ...it, nombre: it.pieza })}` : it.nombre;
          const k = (desc || "").toLowerCase();
          if (desc && !manoVistas.has(k)) {
            manoVistas.add(k);
            mano.push({ descripcion: desc, cantidad: Number(it.cantidad) || 1 });
          }
        });
      });

      const { generarPdfTrabajo } = await import("../lib/trabajoPdf");
      const blob = await generarPdfTrabajo({
        caso: {
          aseguradora_nombre: caso.aseguradora?.nombre,
          cliente_nombre: caso.cliente?.nombre_completo,
          cliente_telefono: caso.cliente?.telefono,
          marca: caso.marca?.nombre,
          modelo: caso.modelo?.nombre,
          anio: caso.anio,
          placa: caso.placa,
          numero_reclamo: caso.numero_reclamo,
        },
        piezas: [...piezasMap.values()],
        manoObra: mano,
      });
      window.open(URL.createObjectURL(blob), "_blank");
    } finally {
      setGenerandoTrabajo(false);
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Link
          to={`/aseguradoras/${caso.aseguradora_id}`}
          className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)] truncate max-w-full"
        >
          ← {caso.aseguradora?.nombre}
        </Link>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {enTaller && (
            <button
              onClick={imprimirTrabajo}
              disabled={generandoTrabajo}
              className="btn-primary text-sm py-2 px-3 gap-1.5 disabled:opacity-50"
            >
              <Icon name="clipboard" className="w-4 h-4" />
              {generandoTrabajo ? "Generando…" : "Trabajo a realizar"}
            </button>
          )}
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

      <div className="card p-6 mt-3 mb-6">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
          {caso.marca?.nombre} {caso.modelo?.nombre} {caso.anio ? `(${caso.anio})` : ""}
        </h1>
        <p className="text-[var(--ink-soft)] mt-0.5">{caso.cliente?.nombre_completo}</p>

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

      {showFirma && (
        <SignaturePad
          onConfirm={confirmarEntrega}
          onCancel={() => setShowFirma(false)}
          submitting={guardandoFirma}
        />
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
