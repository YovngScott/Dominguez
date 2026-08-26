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

const ROLES_EMPLEADO = ["Recepción", "Encargado de Taller", "Gerencia", "Compras / Repuestos", "Seguros"];
const TIPOS_EXCLUIDO = ["Socio / Dueño", "Familiar / Personal", "Proveedor No Automotriz", "Otro"];

export default function Conexiones() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Cuentas de correo
  const [cuentas, setCuentas] = useState(() => {
    try {
      const guardadas = localStorage.getItem("cuentas_correo_guardadas");
      return guardadas ? JSON.parse(guardadas) : [];
    } catch {
      return [];
    }
  });

  // Teléfonos de notificación de empleados
  const [telefonos, setTelefonos] = useState(() => {
    try {
      const guardados = localStorage.getItem("telefonos_notificacion_guardados");
      return guardados ? JSON.parse(guardados) : [];
    } catch {
      return [];
    }
  });

  // Números excluidos del bot (socios, etc.)
  const [excluidos, setExcluidos] = useState(() => {
    try {
      const guardados = localStorage.getItem("numeros_excluidos_guardados");
      return guardados ? JSON.parse(guardados) : [];
    } catch {
      return [];
    }
  });

  // Prompts personalizados de la IA
  const [promptWhatsapp, setPromptWhatsapp] = useState("");
  const [promptCorreos, setPromptCorreos] = useState("");
  const [defaultPromptWhatsapp, setDefaultPromptWhatsapp] = useState("");
  const [defaultPromptCorreos, setDefaultPromptCorreos] = useState("");
  const [guardandoPrompts, setGuardandoPrompts] = useState(false);
  const [notificacionPrompts, setNotificacionPrompts] = useState(null);
  const [tabPrompt, setTabPrompt] = useState("whatsapp");

  const [loading, setLoading] = useState(true);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waEstado, setWaEstado] = useState("loading");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cuentaEditar, setCuentaEditar] = useState(null);
  const [probandoId, setProbandoId] = useState(null);
  const [resultadoPrueba, setResultadoPrueba] = useState({});
  const [notificacionOAuth, setNotificacionOAuth] = useState(null);

  // Formulario Modal Correo
  const [metodoAuth, setMetodoAuth] = useState("oauth");
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

  // Formulario Modal Teléfono Empleado
  const [modalTelAbierto, setModalTelAbierto] = useState(false);
  const [telEditar, setTelEditar] = useState(null);
  const [formTel, setFormTel] = useState({
    nombre_empleado: "",
    telefono: "",
    rol: "Recepción",
    activo: true
  });
  const [errorTel, setErrorTel] = useState("");
  const [probandoTelId, setProbandoTelId] = useState(null);
  const [resultadoTelPrueba, setResultadoTelPrueba] = useState({});

  // Formulario Modal Número Excluido (Socio)
  const [modalExcAbierto, setModalExcAbierto] = useState(false);
  const [excEditar, setExcEditar] = useState(null);
  const [formExc, setFormExc] = useState({
    nombre: "",
    telefono: "",
    tipo: "Socio / Dueño",
    notas: ""
  });
  const [errorExc, setErrorExc] = useState("");

  // Helpers de sincronización local
  function guardarCuentasMemoria(nuevas) {
    setCuentas(nuevas);
    try { localStorage.setItem("cuentas_correo_guardadas", JSON.stringify(nuevas)); } catch { /* ignore */ }
  }

  function guardarTelefonosMemoria(nuevos) {
    setTelefonos(nuevos);
    try { localStorage.setItem("telefonos_notificacion_guardados", JSON.stringify(nuevos)); } catch { /* ignore */ }
  }

  function guardarExcluidosMemoria(nuevos) {
    setExcluidos(nuevos);
    try { localStorage.setItem("numeros_excluidos_guardados", JSON.stringify(nuevos)); } catch { /* ignore */ }
  }

  // Detectar retorno de autorización OAuth (code en la URL)
  useEffect(() => {
    const code = searchParams.get("code");
    if (code) {
      const pendingRaw = localStorage.getItem("oauth_pending_account");
      if (pendingRaw) {
        try {
          const pending = JSON.parse(pendingRaw);
          pending.estado_oauth = "autorizado";
          pending.autorizado_at = new Date().toISOString();

          setCuentas((prev) => {
            const index = prev.findIndex((c) => c.id === pending.id || c.email === pending.email);
            const actualizadas = index >= 0 ? [...prev] : [...prev, pending];
            if (index >= 0) actualizadas[index] = pending;
            guardarCuentasMemoria(actualizadas);
            return actualizadas;
          });

          fetch("/api/whatsapp-estado?action=guardar_cuenta", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pending)
          }).then(() => cargarDatos());

          localStorage.removeItem("oauth_pending_account");
        } catch (e) {
          console.error("Error procesando cuenta retornada de OAuth:", e);
        }
      }

      setNotificacionOAuth({
        tipo: "exito",
        texto: "¡Acceso concedido con éxito! El bot de IA ha quedado autorizado para leer esta cuenta de correo."
      });
      searchParams.delete("code");
      searchParams.delete("state");
      setSearchParams(searchParams);
    }
  }, [searchParams, setSearchParams]);

  // Cargar datos globales desde el backend
  async function cargarDatos() {
    setLoading(true);
    try {
      const resCuentas = await fetch("/api/whatsapp-estado?action=listar_cuentas");
      const dataCuentas = await resCuentas.json().catch(() => ({}));
      if (dataCuentas?.data && Array.isArray(dataCuentas.data)) {
        guardarCuentasMemoria(dataCuentas.data);
      }

      const resTel = await fetch("/api/whatsapp-estado?action=listar_telefonos");
      const dataTel = await resTel.json().catch(() => ({}));
      if (dataTel?.data && Array.isArray(dataTel.data)) {
        guardarTelefonosMemoria(dataTel.data);
      }

      const resExc = await fetch("/api/whatsapp-estado?action=listar_excluidos");
      const dataExc = await resExc.json().catch(() => ({}));
      if (dataExc?.data && Array.isArray(dataExc.data)) {
        guardarExcluidosMemoria(dataExc.data);
      }

      const resPrompts = await fetch("/api/whatsapp-estado?action=obtener_prompts");
      const dataPrompts = await resPrompts.json().catch(() => ({}));
      if (dataPrompts?.success) {
        setPromptWhatsapp(dataPrompts.prompt_whatsapp || "");
        setPromptCorreos(dataPrompts.prompt_correos || "");
        setDefaultPromptWhatsapp(dataPrompts.default_prompt_whatsapp || "");
        setDefaultPromptCorreos(dataPrompts.default_prompt_correos || "");
      }
    } catch (e) {
      console.error("Error al cargar datos globales:", e);
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
    cargarDatos();
    cargarEstadoWhatsApp();
  }, []);

  // Guardar Prompts de IA
  async function guardarPrompts(e) {
    if (e) e.preventDefault();
    setGuardandoPrompts(true);
    setNotificacionPrompts(null);
    try {
      const res = await fetch("/api/whatsapp-estado?action=guardar_prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt_whatsapp: promptWhatsapp,
          prompt_correos: promptCorreos
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setNotificacionPrompts({
          tipo: "exito",
          texto: "✅ ¡Prompts de la IA guardados y actualizados en tiempo real!"
        });
      } else {
        setNotificacionPrompts({
          tipo: "error",
          texto: data.error || "Error al guardar los prompts en el servidor."
        });
      }
    } catch (err) {
      setNotificacionPrompts({
        tipo: "error",
        texto: err.message
      });
    } finally {
      setGuardandoPrompts(false);
      setTimeout(() => setNotificacionPrompts(null), 5000);
    }
  }

  // Restablecer Prompt a valor por defecto
  function restablecerPromptPorDefecto() {
    if (!confirm("¿Deseas restablecer el prompt seleccionado a sus valores originales por defecto?")) return;
    if (tabPrompt === "whatsapp") {
      setPromptWhatsapp(defaultPromptWhatsapp);
    } else {
      setPromptCorreos(defaultPromptCorreos);
    }
  }

  // Toggle activo correo
  async function toggleActivo(cuenta) {
    const itemActualizado = { ...cuenta, activo: !cuenta.activo };
    const actualizadas = cuentas.map((c) => (c.id === cuenta.id ? itemActualizado : c));
    guardarCuentasMemoria(actualizadas);

    try {
      await fetch("/api/whatsapp-estado?action=guardar_cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemActualizado)
      });
    } catch { /* fallback */ }
  }

  // Toggle activo teléfono
  async function toggleActivoTel(tel) {
    const itemActualizado = { ...tel, activo: !tel.activo };
    const actualizados = telefonos.map((t) => (t.id === tel.id ? itemActualizado : t));
    guardarTelefonosMemoria(actualizados);

    try {
      await fetch("/api/whatsapp-estado?action=guardar_telefono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemActualizado)
      });
    } catch { /* fallback */ }
  }

  // Establecer correo como principal
  async function marcarPredeterminado(cuenta) {
    const actualizadas = cuentas.map((c) => ({
      ...c,
      es_predeterminado: c.id === cuenta.id
    }));
    guardarCuentasMemoria(actualizadas);

    try {
      await fetch("/api/whatsapp-estado?action=guardar_cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuenta, es_predeterminado: true })
      });
    } catch { /* fallback */ }
  }

  // Eliminar correo
  async function eliminarCuenta(id) {
    if (!confirm("¿Seguro que deseas revocar el acceso del bot a esta cuenta de correo?")) return;

    const filtradas = cuentas.filter((c) => c.id !== id);
    if (!filtradas.some((c) => c.es_predeterminado) && filtradas.length > 0) {
      filtradas[0].es_predeterminado = true;
    }
    guardarCuentasMemoria(filtradas);

    try {
      await fetch("/api/whatsapp-estado?action=eliminar_cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
    } catch { /* fallback */ }
  }

  // Eliminar teléfono de empleado
  async function eliminarTelefono(id) {
    if (!confirm("¿Seguro que deseas eliminar este número de las alertas de WhatsApp?")) return;

    const filtrados = telefonos.filter((t) => t.id !== id);
    guardarTelefonosMemoria(filtrados);

    try {
      await fetch("/api/whatsapp-estado?action=eliminar_telefono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
    } catch { /* fallback */ }
  }

  // Eliminar número excluido
  async function eliminarExcluido(id) {
    if (!confirm("¿Seguro que deseas quitar este número de la lista de exclusión del bot?")) return;

    const filtrados = excluidos.filter((e) => e.id !== id);
    guardarExcluidosMemoria(filtrados);

    try {
      await fetch("/api/whatsapp-estado?action=eliminar_excluido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
    } catch { /* fallback */ }
  }

  // Probar lectura de correo
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

  // Probar envío de alerta por WhatsApp a empleado
  async function probarEnvioWhatsApp(tel) {
    setProbandoTelId(tel.id);
    setResultadoTelPrueba((prev) => ({ ...prev, [tel.id]: null }));
    try {
      const r = await fetch("/api/whatsapp-estado?action=probar_telefono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telefono: tel.telefono,
          nombre: tel.nombre_empleado,
          rol: tel.rol
        })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.success) {
        setResultadoTelPrueba((prev) => ({ ...prev, [tel.id]: { ok: true, msg: "Mensaje de prueba enviado por WhatsApp con éxito." } }));
      } else {
        setResultadoTelPrueba((prev) => ({ ...prev, [tel.id]: { ok: false, msg: d.error || "Error al enviar WhatsApp." } }));
      }
    } catch (e) {
      setResultadoTelPrueba((prev) => ({ ...prev, [tel.id]: { ok: false, msg: e.message } }));
    } finally {
      setProbandoTelId(null);
    }
  }

  // Flujos OAuth
  function iniciarGoogleOAuth(emailActual) {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "1086486162907-61uap64mm6hv8rtfqo0mf2l4apkqs776.apps.googleusercontent.com";
    const redirectUri = window.location.origin + "/conexiones";
    const scope = encodeURIComponent("https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify");
    const loginHint = emailActual ? `&login_hint=${encodeURIComponent(emailActual)}` : "";
    const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}&access_type=offline&prompt=consent${loginHint}`;
    window.location.href = url;
  }

  function iniciarMicrosoftOAuth(emailActual) {
    const clientId = import.meta.env.VITE_MICROSOFT_CLIENT_ID || "00000000-0000-0000-0000-000000000000";
    const redirectUri = window.location.origin + "/conexiones";
    const scope = encodeURIComponent("offline_access https://graph.microsoft.com/Mail.Read");
    const loginHint = emailActual ? `&login_hint=${encodeURIComponent(emailActual)}` : "";
    const url = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(redirectUri)}&response_mode=query&scope=${scope}&prompt=consent${loginHint}`;
    window.location.href = url;
  }

  // Modales Correo
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

  // Modales Teléfono Empleado
  function abrirModalNuevoTel() {
    setTelEditar(null);
    setFormTel({
      nombre_empleado: "",
      telefono: "",
      rol: "Recepción",
      activo: true
    });
    setErrorTel("");
    setModalTelAbierto(true);
  }

  function abrirModalEditarTel(tel) {
    setTelEditar(tel);
    setFormTel({
      nombre_empleado: tel.nombre_empleado || "",
      telefono: tel.telefono || "",
      rol: tel.rol || "Recepción",
      activo: tel.activo ?? true
    });
    setErrorTel("");
    setModalTelAbierto(true);
  }

  // Modales Número Excluido (Socio)
  function abrirModalNuevoExc() {
    setExcEditar(null);
    setFormExc({
      nombre: "",
      telefono: "",
      tipo: "Socio / Dueño",
      notas: ""
    });
    setErrorExc("");
    setModalExcAbierto(true);
  }

  function abrirModalEditarExc(exc) {
    setExcEditar(exc);
    setFormExc({
      nombre: exc.nombre || "",
      telefono: exc.telefono || "",
      tipo: exc.tipo || "Socio / Dueño",
      notas: exc.notas || ""
    });
    setErrorExc("");
    setModalExcAbierto(true);
  }

  function cambiarProveedor(provId) {
    const prov = PROVEEDORES.find((p) => p.id === provId);
    setForm((f) => ({
      ...f,
      proveedor: provId,
      imap_host: prov ? prov.imapHost : f.imap_host,
      imap_port: prov ? prov.imapPort : f.imap_port
    }));
  }

  // Guardar Correo
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

    // La autorización real se completa en el servidor y el refresh token se
    // guarda cifrado. Esta pantalla antigua ya no simula un OAuth local.
    if (metodoAuth === "oauth" && (form.proveedor === "gmail" || form.proveedor === "google_workspace")) {
      window.location.href = `/mensajes?correo=abrir&email=${encodeURIComponent(emailClean)}`;
      return;
    }

    const payload = {
      id: cuentaEditar ? cuentaEditar.id : crypto.randomUUID(),
      email: emailClean,
      proveedor: form.proveedor,
      nombre_cuenta: form.nombre_cuenta || "Correo del Taller",
      es_predeterminado: form.es_predeterminado || cuentas.length === 0,
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

    guardarCuentasMemoria(actualizadas);
    setModalAbierto(false);
    setGuardandoModal(false);

    try {
      await fetch("/api/whatsapp-estado?action=guardar_cuenta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch { /* fallback */ }

    if (metodoAuth === "oauth") {
      localStorage.setItem("oauth_pending_account", JSON.stringify(payload));
      if (form.proveedor === "gmail" || form.proveedor === "google_workspace") {
        iniciarGoogleOAuth(emailClean);
      } else if (form.proveedor === "outlook") {
        iniciarMicrosoftOAuth(emailClean);
      }
    }
  }

  // Guardar Teléfono Empleado
  async function guardarTelefonoEmpleado(e) {
    e.preventDefault();
    setErrorTel("");

    const telDigits = formTel.telefono.replace(/\D/g, "");
    if (!telDigits || telDigits.length < 10) {
      setErrorTel("Ingresa un número de teléfono válido (ej: 8095757986).");
      return;
    }

    const payload = {
      id: telEditar ? telEditar.id : crypto.randomUUID(),
      nombre_empleado: formTel.nombre_empleado.trim() || "Empleado Taller",
      telefono: telDigits,
      rol: formTel.rol,
      activo: formTel.activo
    };

    let actualizados = [...telefonos];
    if (telEditar) {
      actualizados = actualizados.map((t) => (t.id === telEditar.id ? payload : t));
    } else {
      actualizados.push(payload);
    }

    guardarTelefonosMemoria(actualizados);
    setModalTelAbierto(false);

    try {
      await fetch("/api/whatsapp-estado?action=guardar_telefono", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch { /* fallback */ }
  }

  // Guardar Número Excluido (Socio)
  async function guardarNumeroExcluido(e) {
    e.preventDefault();
    setErrorExc("");

    const telDigits = formExc.telefono.replace(/\D/g, "");
    if (!telDigits || telDigits.length < 10) {
      setErrorExc("Ingresa un número de teléfono válido (ej: 8095757986).");
      return;
    }

    const payload = {
      id: excEditar ? excEditar.id : crypto.randomUUID(),
      nombre: formExc.nombre.trim() || "Socio / Excluido",
      telefono: telDigits,
      tipo: formExc.tipo,
      notas: formExc.notas.trim() || ""
    };

    let actualizados = [...excluidos];
    if (excEditar) {
      actualizados = actualizados.map((item) => (item.id === excEditar.id ? payload : item));
    } else {
      actualizados.push(payload);
    }

    guardarExcluidosMemoria(actualizados);
    setModalExcAbierto(false);

    try {
      await fetch("/api/whatsapp-estado?action=guardar_excluido", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
    } catch { /* fallback */ }
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
            <Icon name="link" className="w-4 h-4" /> Conexiones, Prompts y Automatizaciones · Dominguez Auto Pintura
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
            Vinculación de Cuentas, Alertas y Personalización de IA
          </h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            Modifica los prompts de la IA en tiempo real, administra números excluidos, correos y alertas de WhatsApp.
          </p>
        </div>

        <button
          onClick={abrirModalNuevo}
          disabled={cuentas.length >= 4}
          className="btn-primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
        >
          <Icon name="plus" className="w-4 h-4" /> Conectar Correo ({cuentas.length}/4)
        </button>
      </div>

      {/* SECCIÓN NUEVA: EDITOR DE PROMPTS DE LA IA (DIRECTO) */}
      <div className="mb-10 card p-6 border-2 border-indigo-200 shadow-sm bg-gradient-to-br from-indigo-50/30 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-sm">
              ✨
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
                Personalización de Prompts e Instrucciones de la IA
              </h2>
              <p className="text-xs text-[var(--ink-soft)] mt-0.5">
                Edita las directrices del bot de WhatsApp o del lector de correos directamente. Los cambios aplican de inmediato en vivo.
              </p>
            </div>
          </div>

          {/* Selector de Pestaña de Prompt */}
          <div className="flex bg-[var(--paper)] p-1 rounded-xl border border-[var(--line)] text-xs font-bold">
            <button
              onClick={() => setTabPrompt("whatsapp")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                tabPrompt === "whatsapp" ? "bg-indigo-600 text-white shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon name="whatsapp" className="w-3.5 h-3.5" /> Prompt de WhatsApp
            </button>
            <button
              onClick={() => setTabPrompt("correos")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                tabPrompt === "correos" ? "bg-indigo-600 text-white shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              <Icon name="mail" className="w-3.5 h-3.5" /> Prompt de Correos / PDFs
            </button>
          </div>
        </div>

        {/* Notificación de Guardado de Prompts */}
        {notificacionPrompts && (
          <div className={`mb-4 p-3 rounded-xl text-xs font-semibold flex items-center justify-between ${
            notificacionPrompts.tipo === "exito" ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-red-50 text-red-800 border border-red-200"
          }`}>
            <span>{notificacionPrompts.texto}</span>
            <button onClick={() => setNotificacionPrompts(null)} className="font-bold">✕</button>
          </div>
        )}

        {/* Editor de Texto del Prompt Activo */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--ink)] flex items-center gap-1.5">
              <span>{tabPrompt === "whatsapp" ? "Instrucciones del Sistema para el Bot de WhatsApp (Atención al Cliente):" : "Instrucciones para el Análisis de Correos y Órdenes de Aseguradoras:"}</span>
            </label>
            <button
              type="button"
              onClick={restablecerPromptPorDefecto}
              className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline flex items-center gap-1"
            >
              <Icon name="refresh" className="w-3 h-3" /> Restablecer a Valores por Defecto
            </button>
          </div>

          {tabPrompt === "whatsapp" ? (
            <textarea
              rows={14}
              value={promptWhatsapp}
              onChange={(e) => setPromptWhatsapp(e.target.value)}
              className="input w-full font-mono text-xs leading-relaxed p-3.5 bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl border border-indigo-200 shadow-inner resize-y"
              placeholder="Escribe aquí las instrucciones de tono, horarios, aseguradoras, precios o respuestas para el bot de WhatsApp..."
            />
          ) : (
            <textarea
              rows={14}
              value={promptCorreos}
              onChange={(e) => setPromptCorreos(e.target.value)}
              className="input w-full font-mono text-xs leading-relaxed p-3.5 bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl border border-indigo-200 shadow-inner resize-y"
              placeholder="Escribe aquí las instrucciones para la extracción de cotizaciones y análisis de PDFs de seguros..."
            />
          )}

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <p className="text-[11px] text-[var(--ink-soft)] italic">
              💡 Tip: Puedes cambiar horarios, agregar reglas nuevas o modificar el guión cuando quieras sin necesidad de reiniciar nada.
            </p>

            <button
              type="button"
              disabled={guardandoPrompts}
              onClick={guardarPrompts}
              className="btn-primary text-xs py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 shrink-0 shadow-md font-bold"
            >
              <Icon name="check" className="w-4 h-4" />
              {guardandoPrompts ? "Guardando en Servidor…" : "Guardar Instrucciones de IA"}
            </button>
          </div>
        </div>
      </div>

      {/* LISTA DE CUENTAS DE CORREO */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="mail" className="w-5 h-5 text-[var(--brand-red)]" />
            Cuentas de Correo Conectadas
          </h2>
          <span className="text-xs font-semibold text-[var(--ink-soft)] bg-[var(--paper)] border border-[var(--line)] px-3 py-1 rounded-full">
            {cuentas.length} de 4 cuentas con acceso
          </span>
        </div>

        {loading && cuentas.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--ink-soft)]">Cargando permisos y cuentas globales…</div>
        ) : cuentas.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-[var(--line)] rounded-2xl text-center">
            <Icon name="mail" className="w-10 h-10 mx-auto text-[var(--ink-soft)] mb-2" />
            <h3 className="font-bold text-[var(--ink)]">No hay cuentas de correo vinculadas</h3>
            <p className="text-xs text-[var(--ink-soft)] mt-1 mb-4">Haz clic abajo para autorizar la primera cuenta de correo para el bot.</p>
            <button onClick={abrirModalNuevo} className="btn-primary text-xs py-2 px-4">
              + Vincular Primera Cuenta
            </button>
          </div>
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

                    <div className="mt-3 p-3 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[var(--ink-soft)]">Acceso del Bot:</span>
                        <span className={`font-bold flex items-center gap-1 ${autorizado ? "text-emerald-600" : "text-amber-600"}`}>
                          <span className={`w-2 h-2 rounded-full ${autorizado ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
                          {autorizado ? "Permiso Concedido (OAuth)" : "Pendiente de Autorización"}
                        </span>
                      </div>
                    </div>
                  </div>

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
                          title="Editar"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => eliminarCuenta(c.id)}
                          className="btn-ghost text-[11px] py-1 px-2 text-[var(--brand-red)]"
                          title="Eliminar"
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

      {/* SECCIÓN TELÉFONOS DE EMPLEADOS PARA ALERTAS DE WHATSAPP */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
              <Icon name="whatsapp" className="w-5 h-5 text-emerald-600" />
              Teléfonos de Empleados para Alertas de WhatsApp
            </h2>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5">
              Los empleados añadidos aquí recibirán todas las notificaciones automáticas del bot cuando ingresen cotizaciones o aprueben piezas.
            </p>
          </div>

          <button
            onClick={abrirModalNuevoTel}
            className="btn-primary text-xs py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shrink-0"
          >
            <Icon name="plus" className="w-4 h-4" /> Agregar Empleado
          </button>
        </div>

        {telefonos.length === 0 ? (
          <div className="p-6 border-2 border-dashed border-[var(--line)] rounded-2xl text-center">
            <p className="text-xs text-[var(--ink-soft)]">No hay teléfonos de empleados registrados. Haz clic en "Agregar Empleado" para añadir el primero.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {telefonos.map((t) => {
              const probandoTel = probandoTelId === t.id;
              const resTel = resultadoTelPrueba[t.id];

              return (
                <div key={t.id} className="card p-4 border border-[var(--line)] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                        {t.rol || "Recepción"}
                      </span>
                      
                      <label className="relative inline-flex items-center cursor-pointer" title="Activar/Desactivar alertas para este número">
                        <input
                          type="checkbox"
                          checked={t.activo}
                          onChange={() => toggleActivoTel(t)}
                          className="sr-only peer"
                        />
                        <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500"></div>
                      </label>
                    </div>

                    <h3 className="font-bold text-sm text-[var(--ink)]">{t.nombre_empleado}</h3>
                    <p className="text-xs font-mono text-[var(--ink-soft)] mt-0.5">📱 {t.telefono}</p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-[var(--line)]">
                    {resTel && (
                      <div className={`mb-2 p-2 rounded text-[11px] ${resTel.ok ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                        {resTel.msg}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <div className="flex gap-1">
                        <button onClick={() => abrirModalEditarTel(t)} className="btn-ghost text-[11px] p-1 text-[var(--ink-soft)]">
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => eliminarTelefono(t.id)} className="btn-ghost text-[11px] p-1 text-[var(--brand-red)]">
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => probarEnvioWhatsApp(t)}
                        disabled={probandoTel}
                        className="btn-ghost text-[11px] text-emerald-600 hover:text-emerald-700 font-bold flex items-center gap-1"
                      >
                        <Icon name="whatsapp" className="w-3 h-3" />
                        {probandoTel ? "Enviando…" : "Probar Alerta"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN NÚMEROS EXCLUIDOS DEL BOT (SOCIOS / DUEÑOS / IGNORAR) */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
              <Icon name="shield" className="w-5 h-5 text-indigo-600" />
              Números Excluidos del Bot (Socios / Dueños / Ignorar)
            </h2>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5">
              El bot de IA **NO responderá** de forma automática a los números agregados aquí (para conversaciones privadas de socios o familiares).
            </p>
          </div>

          <button
            onClick={abrirModalNuevoExc}
            className="btn-primary text-xs py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shrink-0"
          >
            <Icon name="plus" className="w-4 h-4" /> Agregar Excluido
          </button>
        </div>

        {excluidos.length === 0 ? (
          <div className="p-6 border-2 border-dashed border-[var(--line)] rounded-2xl text-center">
            <p className="text-xs text-[var(--ink-soft)]">No hay números excluidos configurados. El bot responderá a todos los mensajes entrantes de clientes.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {excluidos.map((exc) => (
              <div key={exc.id} className="card p-4 border border-[var(--line)] flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 uppercase tracking-wider">
                      {exc.tipo || "Socio / Dueño"}
                    </span>
                    <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      🚫 Bot Silenciado
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-[var(--ink)]">{exc.nombre}</h3>
                  <p className="text-xs font-mono text-[var(--ink-soft)] mt-0.5">📱 {exc.telefono}</p>
                  {exc.notas && <p className="text-[11px] text-[var(--ink-soft)] mt-1 italic">{exc.notas}</p>}
                </div>

                <div className="mt-3 pt-3 border-t border-[var(--line)] flex justify-end gap-1">
                  <button onClick={() => abrirModalEditarExc(exc)} className="btn-ghost text-[11px] p-1 text-[var(--ink-soft)]">
                    <Icon name="pencil" className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => eliminarExcluido(exc.id)} className="btn-ghost text-[11px] p-1 text-[var(--brand-red)]">
                    <Icon name="trash" className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* DISPOSITIVO WHATSAPP */}
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

      {/* MODAL CORREO */}
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
                <button type="submit" disabled={guardandoModal} className="btn-primary text-xs py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2">
                  <Icon name="mail" className="w-4 h-4" />
                  {form.proveedor === "outlook" ? "Iniciar sesión con Microsoft" : "Iniciar sesión con Google"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TELÉFONO EMPLEADO */}
      {modalTelAbierto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalTelAbierto(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--line)]">
              <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                <Icon name="whatsapp" className="w-5 h-5 text-emerald-600" />
                {telEditar ? "Editar Teléfono de Empleado" : "Agregar Empleado para Alertas"}
              </h3>
              <button onClick={() => setModalTelAbierto(false)} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl font-bold">✕</button>
            </div>

            {errorTel && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl mb-4">{errorTel}</p>}

            <form onSubmit={guardarTelefonoEmpleado} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Nombre del Empleado / Departamento</label>
                <input
                  type="text"
                  required
                  value={formTel.nombre_empleado}
                  onChange={(e) => setFormTel({ ...formTel, nombre_empleado: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="Ej: Juan Pérez (Recepción)"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Número de WhatsApp (con o sin código)</label>
                <input
                  type="text"
                  required
                  value={formTel.telefono}
                  onChange={(e) => setFormTel({ ...formTel, telefono: e.target.value })}
                  className="input w-full text-sm font-mono"
                  placeholder="8095757986"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Rol / Departamento</label>
                <select
                  value={formTel.rol}
                  onChange={(e) => setFormTel({ ...formTel, rol: e.target.value })}
                  className="input w-full text-xs font-semibold"
                >
                  {ROLES_EMPLEADO.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--line)]">
                <button type="button" onClick={() => setModalTelAbierto(false)} className="btn-ghost text-xs">Cancelar</button>
                <button type="submit" className="btn-primary text-xs py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white">
                  Guardar Destinatario de Alertas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL NÚMERO EXCLUIDO (SOCIO) */}
      {modalExcAbierto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalExcAbierto(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--line)]">
              <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                <Icon name="shield" className="w-5 h-5 text-indigo-600" />
                {excEditar ? "Editar Número Excluido" : "Agregar Número Excluido del Bot"}
              </h3>
              <button onClick={() => setModalExcAbierto(false)} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl font-bold">✕</button>
            </div>

            {errorExc && <p className="text-xs font-bold text-red-600 bg-red-50 p-3 rounded-xl mb-4">{errorExc}</p>}

            <form onSubmit={guardarNumeroExcluido} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Nombre / Identificación</label>
                <input
                  type="text"
                  required
                  value={formExc.nombre}
                  onChange={(e) => setFormExc({ ...formExc, nombre: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="Ej: Lic. Carlos Domínguez (Socio)"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Número de Teléfono / WhatsApp</label>
                <input
                  type="text"
                  required
                  value={formExc.telefono}
                  onChange={(e) => setFormExc({ ...formExc, telefono: e.target.value })}
                  className="input w-full text-sm font-mono"
                  placeholder="8095757986"
                />
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Tipo de Exclusión</label>
                <select
                  value={formExc.tipo}
                  onChange={(e) => setFormExc({ ...formExc, tipo: e.target.value })}
                  className="input w-full text-xs font-semibold"
                >
                  {TIPOS_EXCLUIDO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Notas / Motivo (Opcional)</label>
                <input
                  type="text"
                  value={formExc.notas}
                  onChange={(e) => setFormExc({ ...formExc, notas: e.target.value })}
                  className="input w-full text-xs"
                  placeholder="Ej: Conversaciones de gerencia no deben ser respondidas por la IA"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--line)]">
                <button type="button" onClick={() => setModalExcAbierto(false)} className="btn-ghost text-xs">Cancelar</button>
                <button type="submit" className="btn-primary text-xs py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white">
                  Guardar Número Excluido
                </button>
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
