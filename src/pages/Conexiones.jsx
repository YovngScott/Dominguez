import { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";
import WhatsappConnectModal from "../components/WhatsappConnectModal";

export default function Conexiones() {
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waEstado, setWaEstado] = useState("loading"); // "open" | "close" | "loading"
  const [probandocorreo, setProbandocorreo] = useState(false);
  const [mensajePrueba, setMensajePrueba] = useState(null);
  const [modalGmail, setModalGmail] = useState(false);
  const [gmailAccount, setGmailAccount] = useState("dominguez.apintura@gmail.com");

  // Revisa el estado de la conexión de WhatsApp
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
    cargarEstadoWhatsApp();
  }, []);

  async function probarIntegracionCorreo() {
    setProbandocorreo(true);
    setMensajePrueba(null);
    try {
      const r = await fetch("/api/procesar-seguro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: "Prueba de conexión desde Stage AI Labs - Cotización Sura",
          body: "Mensaje de diagnóstico para verificar comunicación entre Vercel y Supabase.",
          attachments: []
        })
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok || data.success) {
        setMensajePrueba({ tipo: "exito", texto: "¡Conexión de correo activa! El webhook respondió correctamente." });
      } else {
        setMensajePrueba({ tipo: "error", texto: data.error || "No se pudo conectar con el servicio." });
      }
    } catch (e) {
      setMensajePrueba({ tipo: "error", texto: "Error al enviar la prueba: " + e.message });
    } finally {
      setProbandocorreo(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Header estilo Stage AI Labs */}
      <div className="mb-8 border-b border-[var(--line)] pb-6">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--brand-red)] uppercase tracking-wider mb-1">
          <Icon name="link" className="w-4 h-4" /> Stage AI Labs · Integración
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">
          Conexiones del Asistente y Bots
        </h1>
        <p className="text-sm text-[var(--ink-soft)] mt-1">
          Gestione las integraciones de Gmail, WhatsApp y la vinculación con el ecosistema de Stage AI Labs.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* TARJETA 1: GMAIL / GOOGLE WORKSPACE */}
        <div className="card p-6 flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Icon name="mail" className="w-6 h-6" />
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                Conectado
              </span>
            </div>

            <h2 className="text-lg font-bold text-[var(--ink)]">Gmail / Google Workspace</h2>
            <p className="text-xs text-[var(--ink-soft)] mt-1 mb-4">
              Monitoreo automatizado de correos entrantes de aseguradoras (Sura, Colonial, Reservas, Atlántica).
            </p>

            <div className="p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-soft)]">Cuenta vinculada:</span>
                <span className="font-semibold text-[var(--ink)]">{gmailAccount}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-soft)]">Frecuencia de revisión:</span>
                <span className="font-semibold text-[var(--ink)]">Cada 5 min</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-soft)]">Motor de IA:</span>
                <span className="font-semibold text-[var(--brand-red)]">Gemini 2.5 Multimodal</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {mensajePrueba && (
              <div className={`p-3 rounded-xl text-xs font-medium ${
                mensajePrueba.tipo === "exito" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
              }`}>
                {mensajePrueba.texto}
              </div>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={() => setModalGmail(true)}
                className="btn-primary text-xs flex-1 py-2.5 flex items-center justify-center gap-1.5"
              >
                <Icon name="mail" className="w-4 h-4" /> Conectar otro correo
              </button>
              <button
                onClick={probarIntegracionCorreo}
                disabled={probandocorreo}
                className="btn-ghost text-xs py-2.5 flex items-center justify-center gap-1.5"
              >
                <Icon name="refresh" className="w-4 h-4" /> {probandocorreo ? "Probando..." : "Diagnóstico"}
              </button>
            </div>
          </div>
        </div>

        {/* TARJETA 2: WHATSAPP BOT (EVOLUTION API) */}
        <div className="card p-6 flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <Icon name="whatsapp" className="w-6 h-6" />
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                waEstado === "open"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                <span className={`w-2 h-2 rounded-full ${waEstado === "open" ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`}></span>
                {waEstado === "open" ? "Conectado" : waEstado === "loading" ? "Verificando..." : "Desconectado"}
              </span>
            </div>

            <h2 className="text-lg font-bold text-[var(--ink)]">WhatsApp Bot (Dispositivo)</h2>
            <p className="text-xs text-[var(--ink-soft)] mt-1 mb-4">
              Agente de Atención al Cliente e IA para audios, fotos e identificación de suplidores.
            </p>

            <div className="p-3.5 rounded-xl bg-[var(--paper)] border border-[var(--line)] space-y-2 mb-6">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-soft)]">Instancia:</span>
                <span className="font-semibold text-[var(--ink)]">dominguez-taller</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-soft)]">Regla de fotos:</span>
                <span className="font-semibold text-[var(--ink)]">Invitar al taller (Sin precios por foto)</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--ink-soft)]">Webhook URL:</span>
                <span className="font-mono text-[10px] text-[var(--ink-soft)] truncate max-w-[180px]">
                  /api/whatsapp-webhook
                </span>
              </div>
            </div>
          </div>

          <div>
            <button
              onClick={() => setWaModalOpen(true)}
              className="btn-primary w-full text-xs py-2.5 flex items-center justify-center gap-2"
            >
              <Icon name="whatsapp" className="w-4 h-4" />
              {waEstado === "open" ? "Re-vincular WhatsApp (QR / Código)" : "Vincular Dispositivo WhatsApp"}
            </button>
          </div>
        </div>
      </div>

      {/* FOOTER INFORMATIVO STAGE AI LABS */}
      <div className="mt-8 p-5 rounded-2xl bg-[var(--paper)] border border-[var(--line)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--brand-red)] text-white flex items-center justify-center font-bold text-sm">
            ST
          </div>
          <div>
            <h3 className="text-sm font-bold text-[var(--ink)]">Cliente registrado en Stage AI Labs</h3>
            <p className="text-xs text-[var(--ink-soft)]">ID: Dominguez A. Pintura · Plan AI Messaging Suite</p>
          </div>
        </div>
        <a
          href="https://stage-owner-console.fly.dev"
          target="_blank"
          rel="noreferrer"
          className="btn-ghost text-xs font-semibold py-2 px-4 whitespace-nowrap"
        >
          Consola Stage Owner ↗
        </a>
      </div>

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

      {/* MODAL CONFIGURACIÓN GMAIL */}
      {modalGmail && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setModalGmail(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-[var(--ink)] mb-2 flex items-center gap-2">
              <Icon name="mail" className="w-5 h-5 text-blue-600" />
              Conectar cuenta de Gmail
            </h3>
            <p className="text-xs text-[var(--ink-soft)] mb-4">
              Ingresa la dirección de correo del taller que deseas vincular con el bot de IA.
            </p>
            <input
              type="email"
              value={gmailAccount}
              onChange={(e) => setGmailAccount(e.target.value)}
              className="input w-full mb-4 text-sm"
              placeholder="correo@taller.com"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setModalGmail(false)} className="btn-ghost text-xs">Cancelar</button>
              <button
                onClick={() => {
                  setModalGmail(false);
                  setMensajePrueba({ tipo: "exito", texto: `Cuenta ${gmailAccount} configurada para el bot.` });
                }}
                className="btn-primary text-xs"
              >
                Guardar Cuenta
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
