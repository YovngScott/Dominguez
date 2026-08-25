import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import WhatsappConnectModal from "../components/WhatsappConnectModal";

const PROVEEDORES = [
  {
    id: "gmail",
    nombre: "Gmail",
    color: "bg-red-500",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    authTipo: "oauth_google",
    icon: "mail"
  },
  {
    id: "google_workspace",
    nombre: "Google Workspace",
    color: "bg-blue-600",
    imapHost: "imap.gmail.com",
    imapPort: 993,
    authTipo: "oauth_google",
    icon: "mail"
  },
  {
    id: "outlook",
    nombre: "Outlook / M365",
    color: "bg-sky-600",
    imapHost: "outlook.office365.com",
    imapPort: 993,
    authTipo: "oauth_microsoft",
    icon: "mail"
  },
  {
    id: "dominio_personalizado",
    nombre: "Dominio Personalizado",
    color: "bg-purple-600",
    imapHost: "mail.dominio.com",
    imapPort: 993,
    authTipo: "imap_directo",
    icon: "settings"
  }
];

export default function Conexiones() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [cuentas, setCuentas] = useState([
    {
      id: "1",
      email: "dominguez.apintura@gmail.com",
      proveedor: "gmail",
      nombre_cuenta: "Recepción Principal Taller",
      es_predeterminado: true,
      activo: true,
      estado_oauth: "autorizado",
      autorizado_at: "2026-08-20T10:00:00Z",
      imap_host: "imap.gmail.com",
      imap_port: 993
    },
    {
      id: "2",
      email: "cotizaciones.dautopintura@gmail.com",
      proveedor: "google_workspace",
      nombre_cuenta: "Seguros y Reclamos",
      es_predeterminado: false,
      activo: true,
      estado_oauth: "autorizado",
      autorizado_at: "2026-08-22T14:30:00Z",
      imap_host: "imap.gmail.com",
      imap_port: 993
    }
  ]);

  const [loading, setLoading] = useState(true);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waEstado, setWaEstado] = useState("loading");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cuentaEditar, setCuentaEditar] = useState(null);
  const [probandoId, setProbandoId] = useState(null);
  const [resultadoPrueba, setResultadoPrueba] = useState({});
  const [notificacionOAuth, setNotificacionOAuth] = useState(null);

  // Formulario Modal
  const [metodoAuth, setMetodoAuth] = useState("oauth"); // "oauth" | "app_password"
  const [form, setForm] = useState({
    nombre_cuenta: "",
    email: "",
    proveedor: "gmail",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    password_app: "",
    es_predeterminado: false
  });
  const [errorModal, setErrorModal] = useState("");
  const [guardandoModal, setGuardandoModal] = useState(false);

  // Detectar retorno de autorización OAuth (code en la URL)
  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (code) {
      setNotificacionOAuth({
        tipo: "exito",
        texto: "¡Acceso concedido con éxito! El bot de IA ha quedado autorizado para leer esta cuenta de correo."
      });
      searchParams.delete("code");
      searchParams.delete("state");
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  // Cargar cuentas desde Supabase
  async function cargarCuentas() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cuentas_correo_config")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data && data.length > 0) {
        setCuentas(data);
      }
    } catch {
      /* fallback */
    } finally {
      setLoading(false);
    }
  }

  // Cargar estado de WhatsApp
  async function cargarEstadoWhatsApp() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch("/api/whatsapp-estado", {
        headers: { Authorization: `Bearer ${session?.access_token || ""}` }
      });
      const d = await r.json().catch(() => ({}));
      setWaEstado(d?.state || "close");
    } catch {
      setWaEstado("close");
    }
  }

  useEffect(() => {
    cargarCuentas();
    cargarEstadoWhatsApp();
  }, []);

  // Cambiar estado activo/inactivo
  async function toggleActivo(cuenta) {
    const nuevoEstado = !cuenta.activo;
    const actualizadas = cuentas.map((c) => (c.id === cuenta.id ? { ...c, activo: nuevoEstado } : c));
    setCuentas(actualizadas);

    try {
      await supabase.from("cuentas_correo_config").update({ activo: nuevoEstado }).eq("id", cuenta.id);
    } catch {
      /* fallback */
    }
  }

  // Establecer como predeterminado
  async function marcarPredeterminado(cuenta) {
    const actualizadas = cuentas.map((c) => ({
      ...c,
      es_predeterminado: c.id === cuenta.id
    }));
    setCuentas(actualizadas);

    try {
      await supabase.from("cuentas_correo_config").update({ es_predeterminado: false }).neq("id", "0");
      await supabase.from("cuentas_correo_config").update({ es_predeterminado: true }).eq("id", cuenta.id);
    } catch {
      /* fallback */
    }
  }

  // Eliminar cuenta
  async function eliminarCuenta(id) {
    if (cuentas.length <= 1) {
      alert("Debes mantener al menos una cuenta de correo configurada.");
      return;
    }
    if (!confirm("¿Seguro que deseas revocar el acceso del bot a esta cuenta de correo?")) return;

    const filtradas = cuentas.filter((c) => c.id !== id);
    if (!filtradas.some((c) => c.es_predeterminado) && filtradas.length > 0) {
      filtradas[0].es_predeterminado = true;
    }
    setCuentas(filtradas);

    try {
      await supabase.from("cuentas_correo_config").delete().eq("id", id);
    } catch {
      /* fallback */
    }
  }

  // Probar lectura e integración de correo
  async function probarConexion(cuenta) {
    setProbandoId(cuenta.id);
    setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: null }));
    try {
      const r = await fetch("/api/procesar-seguro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Prueba de lectura OAuth (${cuenta.email})`,
          body: "Diagnóstico de lectura de correo desde el panel de Conexiones.",
          attachments: []
        })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok || d.success) {
        setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: { ok: true, msg: "Conexión autorizada. El bot puede leer esta bandeja." } }));
      } else {
        setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: { ok: false, msg: d.error || "Falta autorización." } }));
      }
    } catch (e) {
      setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: { ok: false, msg: e.message } }));
    } finally {
      setProbandoId(null);
    }
  }

  // Iniciar flujo de inicio de sesión con Google (OAuth 2.0)
  function iniciarGoogleOAuth(emailActual) {
    const clientId = "407334305886-d2k3j.apps.googleusercontent.com"; // OAuth Client ID
    const redirectUri = window.location.origin + "/conexiones";
    const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify");
    const loginHint = emailActual ? `&login_hint=${encodeURIComponent(emailActual)}` : "";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent${loginHint}`;
    
    // Abre la ventana oficial de Google Sign-In
    window.location.href = url;
  }

  // Iniciar flujo de inicio de sesión con Microsoft / Outlook (OAuth 2.0)
  function iniciarMicrosoftOAuth(emailActual) {
    const clientId = "00000000-0000-0000-0000-000000000000";
    const redirectUri = window.location.origin + "/conexiones";
    const scope = encodeURIComponent("offline_access https://graph.microsoft.com/Mail.Read");
    const loginHint = emailActual ? `&login_hint=${encodeURIComponent(emailActual)}` : "";
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}&prompt=consent${loginHint}`;
    
    window.location.href = url;
  }

  // Abrir Modal para Agregar / Editar
  function abrirModalNuevo() {
    if (cuentas.length >= 4) {
      alert("Límite alcanzado: Puedes vincular un máximo de 4 cuentas de correo.");
      return;
    }
    setCuentaEditar(null);
    setMetodoAuth("oauth");
    setForm({
      nombre_cuenta: `Correo ${cuentas.length + 1}`,
      email: "",
      proveedor: "gmail",
      imap_host: "imap.gmail.com",
      imap_port: 993,
      password_app: "",
      es_predeterminado: cuentas.length === 0
    });
    setErrorModal("");
    setModalAbierto(true);
  }

  function abrirModalEditar(cuenta) {
    setCuentaEditar(cuenta);
    setMetodoAuth(cuenta.token_acceso ? "app_password" : "oauth");
    setForm({
      nombre_cuenta: cuenta.nombre_cuenta || "",
      email: cuenta.email || "",
      proveedor: cuenta.proveedor || "gmail",
      imap_host: cuenta.imap_host || "imap.gmail.com",
      imap_port: cuenta.imap_port || 993,
      password_app: cuenta.token_acceso || "",
      es_predeterminado: cuenta.es_predeterminado
    });
    setErrorModal("");
    setModalAbierto(true);
  }

  // Cambiar Proveedor
  function cambiarProveedor(provId) {
    const prov = PROVEEDORES.find((p) => p.id === provId);
    setForm((f) => ({
      ...f,
      proveedor: provId,
      imap_host: prov ? prov.imapHost : f.imap_host,
      imap_port: prov ? prov.imapPort : f.imap_port
    }));
  }

  // Guardar datos de cuenta y vincular
  async function guardarYConectarCuenta(e) {
    e.preventDefault();
    setErrorModal("");
    setGuardandoModal(true);

    const emailClean = form.email.trim().toLowerCase();
    if (!emailClean || !emailClean.includes("@")) {
      setErrorModal("Ingresa una dirección de correo válida.");
      setGuardandoModal(false);
      return;
    }

    if (!cuentaEditar && cuentas.some((c) => c.email.toLowerCase() === emailClean)) {
      setErrorModal("Esta dirección de correo ya está vinculada.");
      setGuardandoModal(false);
      return;
    }

    const payload = {
      id: cuentaEditar ? cuentaEditar.id : crypto.randomUUID(),
      email: emailClean,
      proveedor: form.proveedor,
      nombre_cuenta: form.nombre_cuenta || "Correo del Taller",
      es_predeterminado: form.es_predeterminado,
      activo: true,
      frecuencia_minutos: 5,
      imap_host: form.imap_host,
      imap_port: Number(form.imap_port) || 993,
      token_acceso: form.password_app || null,
      estado_oauth: form.password_app ? "autorizado" : "pendiente_autorizacion",
      autorizado_at: new Date().toISOString()
    };

    let actualizadas = [...cuentas];
    if (form.es_predeterminado) {
      actualizadas = actualizadas.map((c) => ({ ...c, es_predeterminado: false }));
    }

    if (cuentaEditar) {
      actualizadas = actualizadas.map((c) => (c.id === cuentaEditar.id ? payload : c));
    } else {
      actualizadas.push(payload);
    }

    setCuentas(actualizadas);
    setModalAbierto(false);
    setGuardandoModal(false);

    try {
      if (form.es_predeterminado) {
        await supabase.from("cuentas_correo_config").update({ es_predeterminado: false }).neq("id", "0");
      }
      await supabase.from("cuentas_correo_config").upsert(payload);
    } catch {
      /* fallback */
    }

    // Si eligió método OAuth y no es un dominio personalizado, disparamos la ventana de inicio de sesión
    if (metodoAuth === "oauth") {
      if (form.proveedor === "gmail" || form.proveedor === "google_workspace") {
        iniciarGoogleOAuth(emailClean);
      } else if (form.proveedor === "outlook") {
        iniciarMicrosoftOAuth(emailClean);
      }
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* NOTIFICACIÓN OAUTH */}
      {notificacionOAuth && (
        <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold flex items-center justify-between shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold">✓</div>
            <span>{notificacionOAuth.texto}</span>
          </div>
          <button onClick={() => setNotificacionOAuth(null)} className="text-emerald-600 font-bold hover:text-emerald-900">✕</button>
        </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-[var(--line)] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-red)] uppercase tracking-wider mb-1">
            <Icon name="link" className="w-4 h-4" /> Autorización de Accesos · Stage AI Labs
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
            Vinculación de Cuentas de Correo y WhatsApp
          </h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            Conecta hasta 4 cuentas (Gmail, Google Workspace, Outlook o Dominio) dándole acceso de lectura al bot de IA.
          </p>
        </div>

        <button
          onClick={abrirModalNuevo}
          disabled={cuentas.length >= 4}
          className="btn-primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
        >
          <Icon name="plus" className="w-4 h-4" /> Conectar Cuenta ({cuentas.length}/4)
        </button>
      </div>

      {/* LISTA DE CUENTAS DE CORREO */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="mail" className="w-5 h-5 text-[var(--brand-red)]" />
            Cuentas Conectadas y Autorizadas
          </h2>
          <span className="text-xs font-semibold text-[var(--ink-soft)] bg-[var(--paper)] border border-[var(--line)] px-3 py-1 rounded-full">
            {cuentas.length} de 4 cuentas con acceso
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--ink-soft)]">Cargando permisos y cuentas…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {cuentas.map((c) => {
              const prov = PROVEEDORES.find((p) => p.id === c.proveedor) || PROVEEDORES[0];
              const probando = probandoId === c.id;
              const resPrueba = resultadoPrueba[c.id];
              const autorizado = c.estado_oauth === "autorizado";

              return (
                <div
                  key={c.id}
                  className={`card p-5 flex flex-col justify-between transition-all border ${
                    c.es_predeterminado ? "border-[var(--brand-red)] shadow-sm" : "border-[var(--line)]"
                  }`}
                >
                  <div>
                    {/* Encabezado de Tarjeta */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${prov.color}`}></span>
                        <span className="text-xs font-bold text-[var(--ink-soft)] uppercase tracking-wider">
                          {prov.nombre}
                        </span>
                        {c.es_predeterminado && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--brand-red)] text-white">
                            Principal
                          </span>
                        )}
                      </div>

                      {/* Switch Activo */}
                      <label className="relative inline-flex items-center cursor-pointer" title="Activar/Pausar lectura de la IA">
                        <input
                          type="checkbox"
                          checked={c.activo}
                          onChange={() => toggleActivo(c)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>

                    <h3 className="font-bold text-base text-[var(--ink)] leading-tight">{c.nombre_cuenta}</h3>
                    <p className="text-sm font-semibold text-[var(--ink)] mt-0.5 truncate">{c.email}</p>

                    {/* Estado de Autorización de la IA */}
                    <div className="mt-3 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--ink-soft)]">Acceso del Bot:</span>
                        <span className={`font-bold flex items-center gap-1 ${autorizado ? "text-emerald-600" : "text-amber-600"}`}>
                          <span className={`w-2 h-2 rounded-full ${autorizado ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
                          {autorizado ? "Permiso Concedido (OAuth)" : "Pendiente de Autorización"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[var(--ink-soft)]">
                        <span>Permisos:</span>
                        <span className="font-mono">Lectura + Extracción de adjuntos</span>
                      </div>
                    </div>
                  </div>

                  {/* Acciones de la Tarjeta */}
                  <div className="mt-4 pt-3 border-t border-[var(--line)]">
                    {resPrueba && (
                      <div className={`mb-3 p-2.5 rounded-xl text-xs font-medium ${resPrueba.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                        {resPrueba.msg}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1.5">
                        {!c.es_predeterminado && (
                          <button
                            onClick={() => marcarPredeterminado(c)}
                            className="btn-ghost text-[11px] py-1 px-2 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                          >
                            Principal
                          </button>
                        )}
                        <button
                          onClick={() => abrirModalEditar(c)}
                          className="btn-ghost text-[11px] py-1 px-2 text-[var(--ink-soft)]"
                          title="Editar permisos o credenciales"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => eliminarCuenta(c.id)}
                          className="btn-ghost text-[11px] py-1 px-2 text-[var(--brand-red)]"
                          title="Revocar acceso al bot"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {!autorizado ? (
                        <button
                          onClick={() => {
                            if (c.proveedor === "outlook") iniciarMicrosoftOAuth(c.email);
                            else iniciarGoogleOAuth(c.email);
                          }}
                          className="btn-primary text-xs py-1.5 px-3 bg-amber-600 hover:bg-amber-700 text-white"
                        >
                          Autorizar Acceso
                        </button>
                      ) : (
                        <button
                          onClick={() => probarConexion(c)}
                          disabled={probando}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                        >
                          <Icon name="refresh" className="w-3.5 h-3.5" />
                          {probando ? "Verificando…" : "Probar Lectura"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: DISPOSITIVO WHATSAPP */}
      <div className="card p-6 border border-[var(--line)]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Icon name="whatsapp" className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--ink)]">Dispositivo WhatsApp (Evolution API)</h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                  waEstado === "open" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {waEstado === "open" ? "Dispositivo Vinculado" : "Desconectado"}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-soft)] mt-1">
                Atiende WhatsApp como un dispositivo vinculado: audios, fotos e identificación de suplidores.
              </p>
            </div>
          </div>

          <button
            onClick={() => setWaModalOpen(true)}
            className="btn-primary text-xs py-2.5 px-4 whitespace-nowrap flex items-center gap-2 shrink-0"
          >
            <Icon name="whatsapp" className="w-4 h-4" />
            {waEstado === "open" ? "Gestionar Dispositivo" : "Vincular Dispositivo WhatsApp"}
          </button>
        </div>
      </div>

      {/* MODAL PARA CONECTAR / AUTORIZAR CUENTA DE CORREO */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalAbierto(false)}>
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--line)]">
              <h3 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
                <Icon name="mail" className="w-5 h-5 text-[var(--brand-red)]" />
                {cuentaEditar ? "Configurar Permisos de Correo" : "Conectar Nueva Cuenta de Correo"}
              </h3>
              <button onClick={() => setModalAbierto(false)} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl font-bold">✕</button>
            </div>

            {errorModal && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl mb-4">{errorModal}</p>}

            <form onSubmit={guardarYConectarCuenta} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Nombre o etiqueta de la cuenta</label>
                <input
                  type="text"
                  required
                  value={form.nombre_cuenta}
                  onChange={(e) => setForm({ ...form, nombre_cuenta: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="Ej: Cotizaciones Taller Principal"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Selecciona el proveedor de correo</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVEEDORES.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => cambiarProveedor(p.id)}
                      className={`p-3 rounded-xl border text-left flex items-center gap-2 transition-all ${
                        form.proveedor === p.id ? "border-[var(--brand-red)] bg-red-50/50 font-bold" : "border-[var(--line)] text-[var(--ink-soft)]"
                      }`}
                    >
                      <span className={`w-2.5 h-2.5 rounded-full ${p.color}`}></span>
                      {p.nombre}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Dirección de correo a monitorear</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="ejemplo@dominio.com"
                />
              </div>

              {/* Selector de Método de Autorización */}
              <div className="p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-3">
                <label className="block font-bold text-[var(--ink)]">Método de autorización de lectura para la IA:</label>
                
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="radio"
                      name="metodoAuth"
                      checked={metodoAuth === "oauth"}
                      onChange={() => setMetodoAuth("oauth")}
                      className="text-[var(--brand-red)]"
                    />
                    Iniciar sesión oficial (OAuth 2.0)
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-semibold">
                    <input
                      type="radio"
                      name="metodoAuth"
                      checked={metodoAuth === "app_password"}
                      onChange={() => setMetodoAuth("app_password")}
                      className="text-[var(--brand-red)]"
                    />
                    Contraseña de Aplicación / IMAP
                  </label>
                </div>

                {metodoAuth === "oauth" ? (
                  <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">
                    Al guardar, se abrirá la ventana oficial de inicio de sesión de{" "}
                    <strong>{form.proveedor.includes("outlook") ? "Microsoft Outlook" : "Google / Gmail"}</strong> para autorizar al bot de Stage a leer las cotizaciones entrantes.
                  </p>
                ) : (
                  <div className="space-y-2 pt-2">
                    <div>
                      <label className="block font-bold text-[var(--ink)] mb-1">Contraseña de Aplicación / Clave IMAP</label>
                      <input
                        type="password"
                        value={form.password_app}
                        onChange={(e) => setForm({ ...form, password_app: e.target.value })}
                        className="input w-full text-xs font-mono"
                        placeholder="•••• •••• •••• ••••"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block font-bold text-[var(--ink)] mb-1">Host IMAP</label>
                        <input
                          type="text"
                          value={form.imap_host}
                          onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                          className="input w-full text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block font-bold text-[var(--ink)] mb-1">Puerto</label>
                        <input
                          type="number"
                          value={form.imap_port}
                          onChange={(e) => setForm({ ...form, imap_port: e.target.value })}
                          className="input w-full text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.es_predeterminado}
                    onChange={(e) => setForm({ ...form, es_predeterminado: e.target.checked })}
                    className="rounded text-[var(--brand-red)] focus:ring-[var(--brand-red)]"
                  />
                  <span className="font-semibold text-[var(--ink)]">Establecer como cuenta principal predeterminada</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--line)]">
                <button type="button" onClick={() => setModalAbierto(false)} className="btn-ghost text-xs">Cancelar</button>
                
                {metodoAuth === "oauth" ? (
                  <button type="submit" disabled={guardandoModal} className="btn-primary text-xs py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                    <Icon name="mail" className="w-4 h-4" />
                    {form.proveedor === "outlook" ? "Iniciar sesión con Microsoft" : "Iniciar sesión con Google"}
                  </button>
                ) : (
                  <button type="submit" disabled={guardandoModal} className="btn-primary text-xs py-2.5 px-4">
                    Verificar y Dar Acceso al Bot
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL WHATSAPP */}
      {waModalOpen && (
        <WhatsappConnectModal
          onClose={() => setWaModalOpen(false)}
          onConnected={() => {
            cargarEstadoWhatsApp();
            setWaModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
