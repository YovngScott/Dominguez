import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Icon from "../components/Icon";
import { supabase } from "../lib/supabaseClient";
import { dedupeDashboardMessages } from "../lib/emailInbox";

const TIPO_LABEL = {
  diferencia_cotizacion: "Diferencia de cotización",
  caso_no_encontrado: "Caso no encontrado",
  correo_sin_pdf: "Correo sin PDF",
  remitente_no_autorizado: "Remitente no autorizado",
  baja_confianza: "Revisión manual",
  aprobacion_pendiente: "Aprobación pendiente",
  error: "Error",
  correo_cliente: "Cliente",
  correo_suplidor: "Suplidor",
  factura: "Factura",
  cita: "Cita",
  correo_interno: "Interno",
  correo_general: "Correo general",
};

function fecha(valor) {
  if (!valor) return "";
  return new Intl.DateTimeFormat("es-DO", { dateStyle: "medium", timeStyle: "short" }).format(new Date(valor));
}

async function seguroApi(action, { id, method = "GET", payload } = {}) {
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
    body: method !== "GET" ? JSON.stringify(payload || { id }) : undefined,
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
  const [configurador, setConfigurador] = useState(null);
  const [cuentasCorreo, setCuentasCorreo] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("correo")) setCuentasCorreo(true);
  }, []);

  const cargar = useCallback(async () => {
    setError("");
    let query = supabase.from("mensajes_dashboard").select("*").neq("tipo", "publicidad").order("creado_en", { ascending: false }).limit(100);
    if (estado === "pendientes") query = query.in("estado", ["nuevo", "leido"]);
    else if (estado !== "todos") query = query.eq("estado", estado);
    if (tipo !== "todos") query = query.eq("tipo", tipo);
    const { data, error: queryError } = await query;
    if (queryError) setError("No se pudieron cargar los mensajes.");
    setMensajes(dedupeDashboardMessages(data || []));
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
        <div className="flex flex-wrap gap-2 self-start sm:self-auto">
          <button onClick={() => setCuentasCorreo(true)} className="btn-primary"><Icon name="mail" className="w-4 h-4" /> Conectar correos</button>
          <button onClick={() => setConfigurador("prompt")} className="btn-ghost"><Icon name="pencil" className="w-4 h-4" /> Prompt y comportamiento</button>
          <button onClick={() => setConfigurador("acciones")} className="btn-primary"><span className="text-lg leading-none">+</span> Agregar acciones</button>
          <button onClick={cargar} className="btn-ghost"><Icon name="clock" className="w-4 h-4" /> Actualizar</button>
        </div>
      </div>

      {error && <div role="alert" className="mt-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Metrica label="Sin leer" value={nuevos} tone="red" />
        <Metrica label="Prioridad alta" value={altos} tone="amber" />
        <Metrica label="Mostrados" value={visibles.length} />
      </div>

      <WeeklyAppointmentPhone />

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
                {mensaje.metadata?.accion_sugerida && <p className="mt-2 text-xs font-semibold text-[var(--ink)]">Siguiente acción: {mensaje.metadata.accion_sugerida}</p>}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--ink-soft)]"><span>{mensaje.metadata?.remitente || "Remitente no identificado"}</span>{mensaje.metadata?.placa && <span>Placa: <b>{mensaje.metadata.placa}</b></span>}<span>{fecha(mensaje.creado_en)}</span></div>
              </div>
              <span className="shrink-0 text-sm font-bold text-[var(--brand-red)]">Abrir</span>
            </div>
          </button>
        ))}
      </div>

      {detalle && <DetalleModal data={detalle} busy={busy} onClose={() => setDetalle(null)} onResolve={resolver} />}
      {configurador && <AssistantConfigModal initialTab={configurador} onClose={() => setConfigurador(null)} />}
      {cuentasCorreo && <EmailAccountsModal onClose={() => setCuentasCorreo(false)} onProcessed={cargar} />}
    </div>
  );
}

function WeeklyAppointmentPhone() {
  const [phones, setPhones] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const { data, error: e } = await supabase.from("telefonos_notificacion").select("id,nombre_empleado,telefono,activo,resumen_semanal").order("created_at", { ascending: true });
    if (!e) setPhones(data || []); else setError("Ejecuta la migración de citas para activar esta configuración.");
  }, []);
  useEffect(() => { load(); }, [load]);
  async function selectPhone(id) {
    setBusy(true); setError("");
    const { error: e1 } = await supabase.from("telefonos_notificacion").update({ resumen_semanal: false }).neq("id", id);
    const { error: e2 } = await supabase.from("telefonos_notificacion").update({ resumen_semanal: true }).eq("id", id);
    if (e1 || e2) setError("No se pudo guardar el número seleccionado."); else await load();
    setBusy(false);
  }
  async function addPhone(event) {
    event.preventDefault(); if (!phone.trim()) return;
    setBusy(true); setError("");
    const { data, error: e } = await supabase.from("telefonos_notificacion").insert({ nombre_empleado: name.trim() || "Resumen semanal", telefono: phone.trim(), activo: true, resumen_semanal: true }).select("id").single();
    if (e) setError(e.message || "No se pudo agregar el número."); else { await supabase.from("telefonos_notificacion").update({ resumen_semanal: false }).neq("id", data.id); await load(); setName(""); setPhone(""); }
    setBusy(false);
  }
  return <div className="card mt-5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--brand-red)]">WhatsApp</p><h2 className="mt-1 font-bold text-[var(--ink)]">Resumen semanal de citas</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">Se envía los lunes a las 7:30 a. m. (hora de Santo Domingo). Elige un solo número.</p></div><span className="rounded-full bg-[var(--paper)] px-3 py-1 text-xs font-bold text-[var(--ink-soft)]">Lunes–sábado</span></div><div className="mt-4 grid gap-2">{phones.filter((p) => p.activo).map((p) => <button key={p.id} type="button" disabled={busy} onClick={() => selectPhone(p.id)} className={`flex items-center justify-between rounded-xl border p-3 text-left ${p.resumen_semanal ? "border-green-400 bg-green-50" : "border-[var(--line)]"}`}><span><b className="block text-sm text-[var(--ink)]">{p.nombre_empleado}</b><span className="text-xs text-[var(--ink-soft)]">{p.telefono}</span></span><span className="text-xs font-bold text-[var(--brand-red)]">{p.resumen_semanal ? "Seleccionado" : "Usar este"}</span></button>)}</div><form onSubmit={addPhone} className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (opcional)" /><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="8095551234" inputMode="tel" /><button className="btn-ghost" disabled={busy || !phone.trim()}>Agregar número</button></form>{error && <p className="mt-2 text-xs text-red-600">{error}</p>}</div>;
}

function Metrica({ label, value, tone = "blue" }) {
  const color = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-blue-600";
  return <div className="card p-4"><p className={`text-2xl font-extrabold ${color}`}>{value}</p><p className="text-xs font-semibold text-[var(--ink-soft)]">{label}</p></div>;
}

function DetalleModal({ data, busy, onClose, onResolve }) {
  const r = data.revision;
  const c = r.comparacion;
  const esSeguro = r.categoria_correo === "seguro";
  const noAprobable = !r.caso_id || !r.cotizacion_id || !r.autorizado_remitente || Number(r.confianza || 0) < 0.8 || c?.hasDifferences || !r.archivos?.length;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><div className="card max-h-[92vh] w-full max-w-4xl overflow-y-auto p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--brand-red)]">Revisión del seguro</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ink)]">{r.asunto || data.mensaje.titulo}</h2><p className="mt-1 text-xs text-[var(--ink-soft)]">{r.remitente} · {fecha(r.recibido_en)}</p></div><button onClick={onClose} aria-label="Cerrar" className="btn-ghost !p-2"><Icon name="close" className="w-5 h-5" /></button></div>
    <div className="mt-5 grid gap-3 sm:grid-cols-3"><Dato label="Placa" value={r.placa_detectada} /><Dato label="Chasis" value={r.chasis_detectado} /><Dato label="Confianza" value={`${Math.round(Number(r.confianza || 0) * 100)}%`} /></div>
    {r.resumen && <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">Resumen del asistente</p><p className="mt-1 text-sm text-gray-700">{r.resumen}</p>{r.accion_sugerida && <p className="mt-3 text-sm font-bold text-gray-900">Acción sugerida: {r.accion_sugerida}</p>}</div>}
    {c && <div className="mt-5 space-y-2"><h3 className="font-bold text-[var(--ink)]">Comparación con la última cotización</h3>{c.changed?.map((x, i) => <Cambio key={`c${i}`} title={x.ours.description} text={`Taller RD$${Number(x.ours.subtotal || 0).toLocaleString()} → Seguro RD$${Number(x.theirs.subtotal || 0).toLocaleString()}`} tone="amber" />)}{c.removed?.map((x, i) => <Cambio key={`r${i}`} title={`Eliminada: ${x.description}`} text={`Cotizada en RD$${Number(x.subtotal || 0).toLocaleString()}`} tone="red" />)}{c.added?.map((x, i) => <Cambio key={`a${i}`} title={`Agregada: ${x.description}`} text={`Seguro RD$${Number(x.subtotal || 0).toLocaleString()}`} />)}{!c.hasDifferences && <Cambio title="Todas las líneas coinciden" text="El PDF permanece pendiente hasta tu aprobación." tone="green" />}</div>}
    <div className="mt-5 flex flex-wrap gap-2">{r.archivos?.map((f) => <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="btn-ghost"><Icon name="file" className="w-4 h-4" />{f.nombre_archivo}</a>)}</div>
    {r.caso_id && <Link to={`/casos/${r.caso_id}`} className="mt-4 inline-flex text-sm font-bold text-[var(--brand-red)] hover:underline">Abrir caso relacionado</Link>}
    <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-[var(--line)] pt-5"><button disabled={Boolean(busy)} onClick={() => onResolve("reject")} className="btn-ghost !text-red-600">Marcar resuelto</button>{esSeguro && <button disabled={Boolean(busy) || noAprobable} onClick={() => onResolve("approve")} className="btn-primary disabled:opacity-40">Aprobar y guardar PDF</button>}</div>
    {esSeguro && noAprobable && r.estado === "revision" && <p className="mt-3 text-right text-xs text-[var(--ink-soft)]">Si uno de los PDF tiene diferencias o controles pendientes, se bloquea el paquete completo.</p>}
  </div></div>;
}

function Dato({ label, value }) { return <div className="rounded-xl border border-[var(--line)] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">{label}</p><p className="mt-1 truncate font-bold text-[var(--ink)]">{value || "—"}</p></div>; }
function Cambio({ title, text, tone = "blue" }) { const style = tone === "red" ? "border-red-200 bg-red-50" : tone === "amber" ? "border-amber-200 bg-amber-50" : tone === "green" ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"; return <div className={`rounded-xl border p-3 ${style}`}><p className="text-sm font-bold text-gray-900">{title}</p><p className="mt-0.5 text-xs text-gray-600">{text}</p></div>; }

function EmailAccountsModal({ onClose, onProcessed }) {
  const [accounts, setAccounts] = useState([]);
  const [email, setEmail] = useState(() => new URLSearchParams(window.location.search).get("email") || "");
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const params = new URLSearchParams(window.location.search);
  const initialNotice = params.get("correo") === "conectado"
    ? `Cuenta ${params.get("email") || "de Gmail"} conectada correctamente.`
    : params.get("correo") === "error" ? params.get("detalle") || "No se pudo conectar Gmail." : "";
  const [notice, setNotice] = useState(initialNotice);
  const [error, setError] = useState(params.get("correo") === "error" ? initialNotice : "");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const body = await seguroApi("gmail_accounts");
      setAccounts(body.data || []);
      setConfigured(body.oauthConfigured !== false);
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function connect(event) {
    event.preventDefault(); setError(""); setNotice("");
    if (accounts.length >= 4) return setError("Puedes conectar un máximo de cuatro cuentas.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Escribe el correo de Gmail que deseas conectar.");
    setBusy("connect");
    try {
      const body = await seguroApi("gmail_oauth_url", { method: "POST", payload: { email: email.trim() } });
      window.location.assign(body.url);
    } catch (connectError) { setError(connectError.message); setBusy(""); }
  }

  async function poll() {
    setBusy("poll"); setError(""); setNotice("");
    try {
      const result = await seguroApi("gmail_poll", { method: "POST", payload: {} });
      const summary = `Revisión terminada: ${result.messages} correo(s) nuevo(s), ${result.duplicates || 0} ya revisado(s) y ${result.ignored || 0} spam/promoción(es) descartado(s), en ${result.accounts} cuenta(s).`;
      if (result.failures) setError(`${summary} ${result.failures} correo(s) requieren atención.`);
      else setNotice(summary);
      await load(); await onProcessed();
    } catch (pollError) { setError(pollError.message); }
    finally { setBusy(""); }
  }

  async function disconnect(account) {
    if (!confirm(`¿Quitar el acceso a ${account.email}? El bot dejará de leer esa bandeja.`)) return;
    setBusy(account.id); setError("");
    try {
      await seguroApi("gmail_disconnect", { method: "POST", payload: { id: account.id } });
      setNotice(`${account.email} fue desconectado.`); await load();
    } catch (disconnectError) { setError(disconnectError.message); }
    finally { setBusy(""); }
  }

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}><div className="card max-h-[92vh] w-full max-w-3xl overflow-y-auto p-5 sm:p-7" onClick={(event) => event.stopPropagation()}>
    <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--brand-red)]">Acceso de solo lectura</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ink)]">Cuentas de Gmail</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">Conecta hasta cuatro bandejas. El bot puede leer y analizar, pero no enviar, eliminar ni modificar correos.</p></div><button onClick={onClose} className="btn-ghost !p-2"><Icon name="close" className="w-5 h-5" /></button></div>
    {notice && !error && <div className="mt-5 rounded-xl border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-800">{notice}</div>}
    {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {!configured && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="font-bold text-amber-900">Falta habilitar Google OAuth en el servidor</p><p className="mt-1 text-sm text-amber-800">Agrega GOOGLE_OAUTH_CLIENT_ID y GOOGLE_OAUTH_CLIENT_SECRET en Vercel y registra esta redirección exacta:</p><code className="mt-2 block break-all rounded-lg bg-white p-2 text-xs text-amber-900">https://dominguez.vercel.app/api/gmail-callback</code></div>}
    <form onSubmit={connect} className="mt-5 rounded-xl border border-[var(--line)] p-4"><label className="text-sm font-bold text-[var(--ink)]">Correo que deseas conectar</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input className="input flex-1" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="servicio@dominguezautopintura.com" /><button disabled={!configured || busy === "connect" || accounts.length >= 4} className="btn-primary shrink-0 disabled:opacity-40">{busy === "connect" ? "Abriendo Google…" : "Continuar con Google"}</button></div><p className="mt-2 text-xs text-[var(--ink-soft)]">Google mostrará la cuenta y el permiso Gmail de solo lectura antes de autorizar.</p></form>
    <div className="mt-6 flex items-center justify-between gap-3"><h3 className="font-extrabold text-[var(--ink)]">Conectadas ({accounts.length}/4)</h3><button disabled={!accounts.length || busy === "poll"} onClick={poll} className="btn-ghost disabled:opacity-40"><Icon name="clock" className="w-4 h-4" />{busy === "poll" ? "Revisando…" : "Revisar ahora"}</button></div>
    <div className="mt-3 space-y-3">{loading ? <div className="rounded-xl border border-[var(--line)] p-8 text-center text-sm text-[var(--ink-soft)]">Cargando cuentas…</div> : accounts.length === 0 ? <div className="rounded-xl border-2 border-dashed border-[var(--line)] p-8 text-center"><Icon name="mail" className="mx-auto w-9 h-9 text-[var(--ink-soft)]" /><p className="mt-2 font-bold text-[var(--ink)]">Aún no hay correos conectados</p></div> : accounts.map((account) => <div key={account.id} className="rounded-xl border border-[var(--line)] p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-[var(--ink)]">{account.email}</p><p className={`mt-1 text-xs font-semibold ${account.ultimo_error ? "text-red-600" : "text-green-600"}`}>{account.ultimo_error ? `Requiere atención: ${account.ultimo_error}` : "Conectada y lista para lectura"}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">Última revisión: {account.ultima_revision ? fecha(account.ultima_revision) : "todavía no realizada"}</p></div><button disabled={Boolean(busy)} onClick={() => disconnect(account)} className="btn-ghost !text-red-600">Desconectar</button></div></div>)}</div>
  </div></div>;
}

function AssistantConfigModal({ initialTab, onClose }) {
  const [tab, setTab] = useState(initialTab);
  const [config, setConfig] = useState(null);
  const [actions, setActions] = useState([]);
  const [form, setForm] = useState({ nombre: "", condicion: "", instruccion: "", prioridad: "normal" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    const [{ data: configData, error: configError }, { data: actionData, error: actionsError }] = await Promise.all([
      supabase.from("asistente_correo_config").select("*").eq("id", "principal").single(),
      supabase.from("asistente_correo_acciones").select("*").order("orden"),
    ]);
    if (configError || actionsError) return setError("No se pudo cargar la configuración del asistente.");
    setConfig(configData);
    setActions(actionData || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function savePrompt() {
    setSaving(true); setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const { error: updateError } = await supabase.from("asistente_correo_config").update({
      nombre: config.nombre.trim(), prompt_personalizado: config.prompt_personalizado.trim(),
      version: Number(config.version || 0) + 1, actualizado_por: user?.id || null,
      actualizado_en: new Date().toISOString(),
    }).eq("id", "principal");
    setSaving(false);
    if (updateError) return setError("No se pudo guardar el comportamiento.");
    await load();
  }

  async function addAction(event) {
    event.preventDefault();
    if (!form.nombre.trim() || !form.condicion.trim() || !form.instruccion.trim()) return setError("Completa el nombre, la condición y la acción.");
    setSaving(true); setError("");
    const { error: insertError } = await supabase.from("asistente_correo_acciones").insert({
      ...form, nombre: form.nombre.trim(), condicion: form.condicion.trim(), instruccion: form.instruccion.trim(),
      orden: (actions.at(-1)?.orden || 0) + 10,
    });
    setSaving(false);
    if (insertError) return setError("No se pudo agregar la acción.");
    setForm({ nombre: "", condicion: "", instruccion: "", prioridad: "normal" });
    await load();
  }

  async function toggleAction(action) {
    const { error: updateError } = await supabase.from("asistente_correo_acciones").update({ activa: !action.activa, actualizado_en: new Date().toISOString() }).eq("id", action.id);
    if (updateError) return setError("No se pudo cambiar la acción.");
    await load();
  }

  async function removeAction(action) {
    if (!confirm(`¿Eliminar la acción “${action.nombre}”?`)) return;
    const { error: deleteError } = await supabase.from("asistente_correo_acciones").delete().eq("id", action.id);
    if (deleteError) return setError("No se pudo eliminar la acción.");
    await load();
  }

  const effectivePrompt = config ? `${config.prompt_protegido}\n\nCOMPORTAMIENTO DEL PROPIETARIO:\n${config.prompt_personalizado || "Sin instrucciones adicionales."}\n\nACCIONES ACTIVAS:\n${actions.filter((action) => action.activa).map((action) => `- ${action.nombre}: SI ${action.condicion}, ENTONCES ${action.instruccion}`).join("\n") || "Sin acciones adicionales."}` : "";

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
    <div className="card max-h-[94vh] w-full max-w-5xl overflow-y-auto p-5 sm:p-7" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-[var(--brand-red)]">Asistente de bandeja</p><h2 className="mt-1 text-xl font-extrabold text-[var(--ink)]">Prompt y acciones</h2><p className="mt-1 text-sm text-[var(--ink-soft)]">Controla qué debe detectar y cómo debe avisarte. El asistente nunca responderá correos por sí solo.</p></div><button onClick={onClose} className="btn-ghost !p-2"><Icon name="close" className="w-5 h-5" /></button></div>
      <div className="mt-5 flex flex-wrap gap-2 border-b border-[var(--line)] pb-3">{[["prompt","Comportamiento"],["acciones","Acciones"],["completo","Prompt completo"]].map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={tab === value ? "btn-primary" : "btn-ghost"}>{label}</button>)}</div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {!config ? <div className="py-12 text-center text-[var(--ink-soft)]">Cargando configuración…</div> : tab === "prompt" ? <div className="mt-5 space-y-5">
        <label className="block"><span className="text-sm font-bold text-[var(--ink)]">Nombre del asistente</span><input className="input mt-2" value={config.nombre} onChange={(e) => setConfig({ ...config, nombre: e.target.value })} /></label>
        <div className="rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4"><p className="text-sm font-bold text-[var(--ink)]">Reglas protegidas</p><p className="mt-1 text-xs text-[var(--ink-soft)]">Son visibles, pero no se pueden desactivar para evitar respuestas, pérdidas o guardados incorrectos.</p><p className="mt-3 whitespace-pre-wrap text-sm text-[var(--ink-soft)]">{config.prompt_protegido}</p></div>
        <label className="block"><span className="text-sm font-bold text-[var(--ink)]">Comportamiento personalizado</span><span className="mt-1 block text-xs text-[var(--ink-soft)]">Añade tono, prioridades, nombres internos y criterios particulares del taller.</span><textarea rows="8" className="input mt-2 resize-y" value={config.prompt_personalizado} onChange={(e) => setConfig({ ...config, prompt_personalizado: e.target.value })} /></label>
        <div className="flex justify-end"><button disabled={saving} onClick={savePrompt} className="btn-primary">{saving ? "Guardando…" : "Guardar nueva versión"}</button></div>
      </div> : tab === "acciones" ? <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <form onSubmit={addAction} className="rounded-xl border border-[var(--line)] p-4"><h3 className="font-extrabold text-[var(--ink)]">Agregar acción</h3><p className="mt-1 text-xs text-[var(--ink-soft)]">Define una condición clara y qué debe mostrar o priorizar el asistente.</p><input className="input mt-4" placeholder="Nombre de la acción" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /><textarea rows="3" className="input mt-3 resize-y" placeholder="Cuando ocurra…" value={form.condicion} onChange={(e) => setForm({ ...form, condicion: e.target.value })} /><textarea rows="4" className="input mt-3 resize-y" placeholder="El asistente debe…" value={form.instruccion} onChange={(e) => setForm({ ...form, instruccion: e.target.value })} /><select className="input mt-3" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })}><option value="baja">Baja</option><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select><button disabled={saving} className="btn-primary mt-4 w-full">Agregar acción</button></form>
        <div className="space-y-3"><h3 className="font-extrabold text-[var(--ink)]">Acciones configuradas</h3>{actions.map((action) => <div key={action.id} className={`rounded-xl border border-[var(--line)] p-4 ${action.activa ? "" : "opacity-55"}`}><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[var(--ink)]">{action.nombre}</p><p className="mt-1 text-xs text-[var(--ink-soft)]">Si {action.condicion}</p><p className="mt-2 text-sm text-[var(--ink)]">Entonces: {action.instruccion}</p></div><span className="rounded-full bg-[var(--paper)] px-2 py-1 text-[10px] font-bold uppercase text-[var(--ink-soft)]">{action.prioridad}</span></div><div className="mt-3 flex gap-2"><button type="button" onClick={() => toggleAction(action)} className="btn-ghost !px-3 !py-1.5 text-xs">{action.activa ? "Desactivar" : "Activar"}</button><button type="button" onClick={() => removeAction(action)} className="btn-ghost !px-3 !py-1.5 text-xs !text-red-600">Eliminar</button></div></div>)}</div>
      </div> : <div className="mt-5"><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-sm font-bold text-blue-900">Prompt efectivo · versión {config.version}</p><p className="mt-1 text-xs text-blue-700">Esta es exactamente la combinación que recibe el analizador.</p></div><pre className="mt-4 max-h-[58vh] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-950 p-5 text-sm leading-6 text-gray-100">{effectivePrompt}</pre></div>}
    </div>
  </div>;
}
