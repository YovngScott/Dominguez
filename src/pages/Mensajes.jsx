import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";

const TIPO_LABEL = {
  diferencia_cotizacion: "Diferencia de cotización",
  caso_no_encontrado: "Caso no encontrado",
  correo_sin_pdf: "Correo sin PDF",
  remitente_no_autorizado: "Remitente no autorizado",
  baja_confianza: "Revisión manual",
  aprobacion_pendiente: "Aprobación pendiente",
  error: "Error",
};

function fecha(valor) {
  if (!valor) return "";
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(valor));
}

async function seguroApi(action, { id, method = "GET" } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Tu sesión venció. Vuelve a iniciar sesión.");
  const query = new URLSearchParams({ action: `insurance_${action}` });
  if (id && method === "GET") query.set("id", id);
  const response = await fetch(`/api/procesar-seguro?${query}`, {
    method,
    headers: {
      authorization: `Bearer ${session.access_token}`,
      ...(method !== "GET" ? { "content-type": "application/json" } : {}),
    },
    body: method !== "GET" ? JSON.stringify({ id }) : undefined,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "No se pudo completar la operación.");
  return body;
}

export default function Mensajes() {
  const [mensajes, setMensajes] = useState([]);
  const [estado, setEstado] = useState("pendientes");
  const [tipo, setTipo] = useState("todos");
  const [buscar, setBuscar] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [busy, setBusy] = useState("");

  const cargar = useCallback(async () => {
    setError("");
    let query = supabase.from("mensajes_dashboard").select("*").order("creado_en", { ascending: false }).limit(100);
    if (estado === "pendientes") query = query.in("estado", ["nuevo", "leido"]);
    else if (estado !== "todos") query = query.eq("estado", estado);
    if (tipo !== "todos") query = query.eq("tipo", tipo);
    const { data, error: queryError } = await query;
    if (queryError) setError("No se pudieron cargar los mensajes.");
    setMensajes(data || []);
    setLoading(false);
  }, [estado, tipo]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const channel = supabase
      .channel("mensajes-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "mensajes_dashboard" }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [cargar]);

  const visibles = useMemo(() => {
    const term = buscar.trim().toLowerCase();
    if (!term) return mensajes;
    return mensajes.filter((m) => [m.titulo, m.cuerpo, m.metadata?.remitente, m.metadata?.placa, m.metadata?.chasis, m.metadata?.aseguradora]
      .filter(Boolean).some((value) => String(value).toLowerCase().includes(term)));
  }, [mensajes, buscar]);

  async function marcar(mensaje, nuevoEstado = "leido") {
    const { data: { user } } = await supabase.auth.getUser();
    const payload = nuevoEstado === "resuelto"
      ? { estado: "resuelto", resuelto_en: new Date().toISOString(), actualizado_en: new Date().toISOString() }
      : { estado: "leido", leido_en: new Date().toISOString(), leido_por: user?.id || null, actualizado_en: new Date().toISOString() };
    const { error: updateError } = await supabase.from("mensajes_dashboard").update(payload).eq("id", mensaje.id);
    if (updateError) throw updateError;
  }

  async function abrir(mensaje) {
    setBusy(`abrir:${mensaje.id}`);
    setError("");
    try {
      if (mensaje.estado === "nuevo") await marcar(mensaje);
      const body = await seguroApi("detail", { id: mensaje.revision_id });
      setDetalle({ mensaje: { ...mensaje, estado: mensaje.estado === "nuevo" ? "leido" : mensaje.estado }, revision: body.data });
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo abrir la revisión.");
    } finally {
      setBusy("");
    }
  }

  async function resolver(action) {
    const verbo = action === "approve" ? "aprobar y guardar el PDF" : "rechazar la revisión";
    if (!confirm(`¿Confirmas que deseas ${verbo}?`)) return;
    setBusy(action);
    setError("");
    try {
      await seguroApi(action, { id: detalle.revision.id, method: "POST" });
      setDetalle(null);
      await cargar();
    } catch (err) {
      setError(err.message || "No se pudo resolver la revisión.");
    } finally {
      setBusy("");
    }
  }

  const nuevos = mensajes.filter((m) => m.estado === "nuevo").length;
  const altos = mensajes.filter((m) => ["alta", "critica"].includes(m.prioridad) && m.estado !== "resuelto").length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--brand-red)]">Automatización de seguros</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Centro de mensajes</h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">Avisos persistentes de los correos y documentos que necesitan tu atención.</p>
        </div>
        <button onClick={cargar} className="btn-ghost self-start sm:self-auto"><Icon name="clock" className="w-4 h-4" /> Actualizar</button>
      </div>

      {error && <div role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metrica label="Sin leer" value={nuevos} tone="red" />
        <Metrica label="Prioridad alta" value={altos} tone="amber" />
        <Metrica label="Mostrados" value={visibles.length} />
      </div>

      <div className="card mt-5 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-[var(--ink-soft)]" />
            <input className="input !pl-10" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar placa, chasis, aseguradora o remitente…" />
          </div>
          <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="pendientes">Pendientes</option><option value="nuevo">Sin leer</option><option value="leido">Leídos</option><option value="resuelto">Resueltos</option><option value="todos">Todos</option>
          </select>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="todos">Todos los tipos</option>
            {Object.entries(TIPO_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {loading ? <div className="card p-10 text-center text-[var(--ink-soft)]">Cargando mensajes…</div> : visibles.length === 0 ? (
          <div className="card p-12 text-center"><Icon name="check" className="mx-auto w-10 h-10 text-green-600" /><p className="mt-3 font-bold text-[var(--ink)]">Todo al día</p><p className="mt-1 text-sm text-[var(--ink-soft)]">No hay mensajes con estos filtros.</p></div>
        ) : visibles.map((mensaje) => (
          <button key={mensaje.id} onClick={() => abrir(mensaje)} disabled={busy === `abrir:${mensaje.id}`} className={`card w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${mensaje.estado === "nuevo" ? "border-l-4 !border-l-[var(--brand-red)]" : ""}`}>
            <div className="flex items-start gap-3">
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${mensaje.prioridad === "critica" ? "bg-red-600" : mensaje.prioridad === "alta" ? "bg-orange-500" : mensaje.prioridad === "media" ? "bg-amber-400" : "bg-blue-500"}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><h2 className="font-bold text-[var(--ink)]">{mensaje.titulo}</h2><span className="rounded-full bg-[var(--paper)] px-2 py-0.5 text-[11px] font-semibold text-[var(--ink-soft)]">{TIPO_LABEL[mensaje.tipo] || mensaje.tipo}</span>{mensaje.estado === "nuevo" && <span className="rounded-full bg-[var(--brand-red)] px-2 py-0.5 text-[11px] font-bold text-white">Nuevo</span>}</div>
                <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-soft)]">{mensaje.cuerpo}</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-soft)]"><span>{mensaje.metadata?.remitente || "Remitente no identificado"}</span>{mensaje.metadata?.placa && <span>Placa: <b>{mensaje.metadata.placa}</b></span>}<span>{fecha(mensaje.creado_en)}</span></div>
              </div>
              <span className="shrink-0 text-sm font-bold text-[var(--brand-red)]">Abrir</span>
            </div>
          </button>
        ))}
      </div>

      {detalle && <DetalleModal data={detalle} busy={busy} onClose={() => setDetalle(null)} onResolve={resolver} />}
    </div>
  );
}

function Metrica({ label, value, tone = "blue" }) {
  const color = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-blue-600";
  return <div className="card p-4"><p className={`text-2xl font-extrabold ${color}`}>{value}</p><p className="text-xs font-semibold text-[var(--ink-soft)]">{label}</p></div>;
}

function DetalleModal({ data, busy, onClose, onResolve }) {
  const r = data.revision;
  const c = r.comparacion;
  const noAprobable = !r.caso_id || !r.cotizacion_id || !r.autorizado_remitente || Number(r.confianza || 0) < 0.8 || c?.hasDifferences || !r.archivos?.length;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><div className="card max-h-[92vh] w-full max-w-4xl overflow-y-auto p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--brand-red)]">Revisión del seguro</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ink)]">{r.asunto || data.mensaje.titulo}</h2><p className="mt-1 text-xs text-[var(--ink-soft)]">{r.remitente} · {fecha(r.recibido_en)}</p></div><button onClick={onClose} aria-label="Cerrar" className="btn-ghost !p-2"><Icon name="close" className="w-5 h-5" /></button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Dato label="Placa" value={r.placa_detectada} /><Dato label="Chasis" value={r.chasis_detectado} /><Dato label="Confianza" value={`${Math.round(Number(r.confianza || 0) * 100)}%`} /></div>
    {r.resumen && <p className="mt-4 rounded-xl bg-[var(--paper)] p-4 text-sm text-[var(--ink-soft)]">{r.resumen}</p>}
    {c && <div className="mt-5 space-y-2"><h3 className="font-bold text-[var(--ink)]">Comparación con la última cotización</h3>{c.changed?.map((x, i) => <Cambio key={`c${i}`} title={x.ours.description} text={`Taller RD$${Number(x.ours.subtotal || 0).toLocaleString()} → Seguro RD$${Number(x.theirs.subtotal || 0).toLocaleString()}`} tone="amber" />)}{c.removed?.map((x, i) => <Cambio key={`r${i}`} title={`Eliminada: ${x.description}`} text={`Cotizada en RD$${Number(x.subtotal || 0).toLocaleString()}`} tone="red" />)}{c.added?.map((x, i) => <Cambio key={`a${i}`} title={`Agregada: ${x.description}`} text={`Seguro RD$${Number(x.subtotal || 0).toLocaleString()}`} />)}{!c.hasDifferences && <Cambio title="Todas las líneas coinciden" text="El PDF permanece pendiente hasta tu aprobación." tone="green" />}</div>}
    <div className="mt-5 flex flex-wrap gap-2">{r.archivos?.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="btn-ghost"><Icon name="file" className="w-4 h-4" />{f.nombre_archivo}</a>)}</div>
    {r.caso_id && <Link to={`/casos/${r.caso_id}`} className="mt-4 inline-flex text-sm font-bold text-[var(--brand-red)] hover:underline">Abrir caso relacionado</Link>}
    <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[var(--line)] pt-5"><button disabled={Boolean(busy)} onClick={() => onResolve("reject")} className="btn-ghost !text-red-600">Rechazar</button><button disabled={Boolean(busy) || noAprobable} onClick={() => onResolve("approve")} className="btn-primary disabled:opacity-40">Aprobar y guardar PDF</button></div>
    {noAprobable && r.estado === "revision" && <p className="mt-3 text-right text-xs text-[var(--ink-soft)]">La aprobación se habilita únicamente cuando el caso, remitente, cotización, confianza y comparación están correctos.</p>}
  </div></div>;
}

function Dato({ label, value }) { return <div className="rounded-xl border border-[var(--line)] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">{label}</p><p className="mt-1 truncate font-bold text-[var(--ink)]">{value || "—"}</p></div>; }
function Cambio({ title, text, tone = "blue" }) { const style = tone === "red" ? "border-red-200 bg-red-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : tone === "green" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"; return <div className={`rounded-xl border p-3 ${style}`}><p className="text-sm font-bold text-gray-900">{title}</p><p className="mt-0.5 text-xs text-gray-600">{text}</p></div>; }
