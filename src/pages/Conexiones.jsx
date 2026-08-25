import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import WhatsappConnectModal from "../components/WhatsappConnectModal";

const PROVEEDORES = [
  { id: "gmail", nombre: "Gmail", color: "bg-red-500", imapHost: "imap.gmail.com", imapPort: 993 },
  { id: "google_workspace", nombre: "Google Workspace", color: "bg-blue-600", imapHost: "imap.gmail.com", imapPort: 993 },
  { id: "outlook", nombre: "Outlook / M365", color: "bg-sky-600", imapHost: "outlook.office365.com", imapPort: 993 },
  { id: "dominio_personalizado", nombre: "Dominio (IMAP)", color: "bg-purple-600", imapHost: "mail.dominio.com", imapPort: 993 }
];

export default function Conexiones() {
  const [cuentas, setCuentas] = useState([
    {
      id: "1",
      email: "dominguez.apintura@gmail.com",
      proveedor: "gmail",
      nombre_cuenta: "Recepción Principal Taller",
      es_predeterminado: true,
      activo: true,
      frecuencia_minutos: 5
    },
    {
      id: "2",
      email: "cotizaciones.dautopintura@gmail.com",
      proveedor: "google_workspace",
      nombre_cuenta: "Seguros y Cotizaciones",
      es_predeterminado: false,
      activo: true,
      frecuencia_minutos: 5
    }
  ]);

  const [loading, setLoading] = useState(true);
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waEstado, setWaEstado] = useState("loading");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [cuentaEditar, setCuentaEditar] = useState(null);
  const [probandoId, setProbandoId] = useState(null);
  const [resultadoPrueba, setResultadoPrueba] = useState({});

  // Formulario Modal
  const [form, setForm] = useState({
    nombre_cuenta: "",
    email: "",
    proveedor: "gmail",
    imap_host: "imap.gmail.com",
    imap_port: 993,
    es_predeterminado: false
  });
  const [errorModal, setErrorModal] = useState("");

  // Cargar cuentas desde Supabase si la tabla existe
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
      // Si la tabla no ha sido creada aún en Supabase, usa el estado en memoria
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
    if (!confirm("¿Seguro que deseas desvincular esta cuenta del monitoreo de IA?")) return;

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

  // Probar conexión de una cuenta específica
  async function probarConexion(cuenta) {
    setProbandoId(cuenta.id);
    setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: null }));
    try {
      const r = await fetch("/api/procesar-seguro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Prueba de conexión (${cuenta.email})`,
          body: "Diagnóstico de conexión desde el panel de Conexiones.",
          attachments: []
        })
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok || d.success) {
        setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: { ok: true, msg: "Conexión activa con el bot." } }));
      } else {
        setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: { ok: false, msg: d.error || "Error al conectar." } }));
      }
    } catch (e) {
      setResultadoPrueba((prev) => ({ ...prev, [cuenta.id]: { ok: false, msg: e.message } }));
    } finally {
      setProbandoId(null);
    }
  }

  // Abrir Modal para Agregar / Editar
  function abrirModalNuevo() {
    if (cuentas.length >= 4) {
      alert("Límite alcanzado: Puedes vincular un máximo de 4 cuentas de correo.");
      return;
    }
    setCuentaEditar(null);
    setForm({
      nombre_cuenta: `Correo ${cuentas.length + 1}`,
      email: "",
      proveedor: "gmail",
      imap_host: "imap.gmail.com",
      imap_port: 993,
      es_predeterminado: cuentas.length === 0
    });
    setErrorModal("");
    setModalAbierto(true);
  }

  function abrirModalEditar(cuenta) {
    setCuentaEditar(cuenta);
    setForm({
      nombre_cuenta: cuenta.nombre_cuenta || "",
      email: cuenta.email || "",
      proveedor: cuenta.proveedor || "gmail",
      imap_host: cuenta.imap_host || "imap.gmail.com",
      imap_port: cuenta.imap_port || 993,
      es_predeterminado: cuenta.es_predeterminado
    });
    setErrorModal("");
    setModalAbierto(true);
  }

  // Seleccionar proveedor y auto-rellenar host IMAP
  function cambiarProveedor(provId) {
    const prov = PROVEEDORES.find((p) => p.id === provId);
    setForm((f) => ({
      ...f,
      proveedor: provId,
      imap_host: prov ? prov.imapHost : f.imap_host,
      imap_port: prov ? prov.imapPort : f.imap_port
    }));
  }

  // Guardar cuenta desde el Modal
  async function guardarCuenta(e) {
    e.preventDefault();
    setErrorModal("");

    const emailClean = form.email.trim().toLowerCase();
    if (!emailClean || !emailClean.includes("@")) {
      setErrorModal("Ingresa una dirección de correo válida.");
      return;
    }

    if (!cuentaEditar && cuentas.some((c) => c.email.toLowerCase() === emailClean)) {
      setErrorModal("Esta dirección de correo ya está vinculada.");
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
      imap_port: Number(form.imap_port) || 993
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

    // Intentar persistir en Supabase
    try {
      if (form.es_predeterminado) {
        await supabase.from("cuentas_correo_config").update({ es_predeterminado: false }).neq("id", "0");
      }
      await supabase.from("cuentas_correo_config").upsert(payload);
    } catch {
      /* fallback */
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-[var(--line)] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-red)] uppercase tracking-wider mb-1">
            <Icon name="link" className="w-4 h-4" /> Multicanal · Stage AI Labs
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
            Gestión de Cuentas de Correo y WhatsApp
          </h1>
          <p className="text-sm text-[var(--ink-soft)] mt-1">
            Vincula hasta 4 cuentas de correo (Gmail, Workspace, Outlook o Dominio) y mantén conectado el WhatsApp del taller.
          </p>
        </div>

        <button
          onClick={abrirModalNuevo}
          disabled={cuentas.length >= 4}
          className="btn-primary text-xs py-2.5 px-4 flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
        >
          <Icon name="plus" className="w-4 h-4" /> Vincular Cuenta ({cuentas.length}/4)
        </button>
      </div>

      {/* SECCIÓN 1: CUENTAS DE CORREO VINCULADAS */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
            <Icon name="mail" className="w-5 h-5 text-[var(--brand-red)]" />
            Cuentas de Correo Monitoreadas por la IA
          </h2>
          <span className="text-xs font-semibold text-[var(--ink-soft)] bg-[var(--paper)] border border-[var(--line)] px-2.5 py-1 rounded-full">
            {cuentas.length} de 4 cuentas activas
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-[var(--ink-soft)]">Cargando cuentas vinculadas…</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cuentas.map((c) => {
              const prov = PROVEEDORES.find((p) => p.id === c.proveedor) || PROVEEDORES[0];
              const probando = probandoId === c.id;
              const resPrueba = resultadoPrueba[c.id];

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
                            Predeterminada (Principal)
                          </span>
                        )}
                      </div>

                      {/* Switch Activo / Inactivo */}
                      <label className="relative inline-flex items-center cursor-pointer">
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

                    <div className="mt-3 p-2.5 rounded-lg bg-[var(--paper)] text-xs space-y-1 text-[var(--ink-soft)]">
                      <div className="flex justify-between">
                        <span>Servidor IMAP:</span>
                        <span className="font-mono font-medium text-[var(--ink)]">{c.imap_host || prov.imapHost}:{c.imap_port || 993}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Revisión automática:</span>
                        <span className="font-medium text-[var(--ink)]">Cada {c.frecuencia_minutos || 5} minutos</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-[var(--line)]">
                    {resPrueba && (
                      <div className={`mb-3 p-2 rounded text-xs font-medium ${resPrueba.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                        {resPrueba.msg}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1.5">
                        {!c.es_predeterminado && (
                          <button
                            onClick={() => marcarPredeterminado(c)}
                            className="btn-ghost text-[11px] py-1 px-2.5 text-[var(--ink-soft)] hover:text-[var(--ink)]"
                            title="Marcar como cuenta principal"
                          >
                            Hacer Principal
                          </button>
                        )}
                        <button
                          onClick={() => abrirModalEditar(c)}
                          className="btn-ghost text-[11px] py-1 px-2 text-[var(--ink-soft)]"
                          title="Editar cuenta"
                        >
                          <Icon name="pencil" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => eliminarCuenta(c.id)}
                          className="btn-ghost text-[11px] py-1 px-2 text-[var(--brand-red)]"
                          title="Desvincular cuenta"
                        >
                          <Icon name="trash" className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <button
                        onClick={() => probarConexion(c)}
                        disabled={probando}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5"
                      >
                        <Icon name="refresh" className="w-3.5 h-3.5" />
                        {probando ? "Probando…" : "Probar"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECCIÓN 2: WHATSAPP DISPOSITIVO */}
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
                  {waEstado === "open" ? "Conectado" : "Desconectado"}
                </span>
              </div>
              <p className="text-xs text-[var(--ink-soft)] mt-1">
                Atención al cliente por voz, fotos de choques e identificación automática de suplidores.
              </p>
            </div>
          </div>

          <button
            onClick={() => setWaModalOpen(true)}
            className="btn-primary text-xs py-2.5 px-4 whitespace-nowrap flex items-center gap-2 shrink-0"
          >
            <Icon name="whatsapp" className="w-4 h-4" />
            {waEstado === "open" ? "Gestionar WhatsApp" : "Vincular Dispositivo"}
          </button>
        </div>
      </div>

      {/* MODAL VINCULAR / EDITAR CUENTA DE CORREO */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalAbierto(false)}>
          <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[var(--line)]">
              <h3 className="text-lg font-bold text-[var(--ink)] flex items-center gap-2">
                <Icon name="mail" className="w-5 h-5 text-[var(--brand-red)]" />
                {cuentaEditar ? "Editar Cuenta de Correo" : "Vincular Cuenta de Correo"}
              </h3>
              <button onClick={() => setModalAbierto(false)} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl font-bold">✕</button>
            </div>

            {errorModal && <p className="text-xs font-bold text-red-600 bg-red-50 p-2.5 rounded-xl mb-4">{errorModal}</p>}

            <form onSubmit={guardarCuenta} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-[var(--ink)] mb-1">Nombre identificador de la cuenta</label>
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
                <label className="block font-bold text-[var(--ink)] mb-1">Proveedor de Correo</label>
                <div className="grid grid-cols-2 gap-2">
                  {PROVEEDORES.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => cambiarProveedor(p.id)}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition-all ${
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
                <label className="block font-bold text-[var(--ink)] mb-1">Dirección de correo electrónico</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="input w-full text-sm"
                  placeholder="ejemplo@dominio.com"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block font-bold text-[var(--ink)] mb-1">Servidor IMAP (Host)</label>
                  <input
                    type="text"
                    required
                    value={form.imap_host}
                    onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                    className="input w-full text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-[var(--ink)] mb-1">Puerto</label>
                  <input
                    type="number"
                    required
                    value={form.imap_port}
                    onChange={(e) => setForm({ ...form, imap_port: e.target.value })}
                    className="input w-full text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.es_predeterminado}
                    onChange={(e) => setForm({ ...form, es_predeterminado: e.target.checked })}
                    className="rounded border-gray-300 text-[var(--brand-red)] focus:ring-[var(--brand-red)]"
                  />
                  <span className="font-semibold text-[var(--ink)]">Establecer como cuenta predeterminada (Principal)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-[var(--line)]">
                <button type="button" onClick={() => setModalAbierto(false)} className="btn-ghost text-xs">Cancelar</button>
                <button type="submit" className="btn-primary text-xs py-2.5 px-4">
                  {cuentaEditar ? "Guardar Cambios" : "Vincular Cuenta"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONECTAR WHATSAPP */}
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
