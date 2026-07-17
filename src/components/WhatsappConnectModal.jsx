import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import Icon from "./Icon";

// Modal para vincular el WhatsApp del taller SIN salir de la app: pide el QR a
// Evolution (vía /api/whatsapp-conectar) y lo muestra aquí mismo, o genera un
// código de 8 dígitos por número. Sondea /api/whatsapp-estado y, en cuanto el
// teléfono queda vinculado ("open"), muestra el éxito y avisa al Dashboard.
export default function WhatsappConnectModal({ onClose, onConnected }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [qr, setQr] = useState(null); // data URL de la imagen del QR
  const [pairingCode, setPairingCode] = useState(null);
  const [estado, setEstado] = useState(null); // "open" | "connecting" | "close" | ...
  const [modo, setModo] = useState("qr"); // "qr" | "codigo"
  const [numero, setNumero] = useState("");
  const [pidiendo, setPidiendo] = useState(false);
  const conectadoRef = useRef(false);

  async function authFetch(path) {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return fetch(path, { headers: { Authorization: `Bearer ${session?.access_token || ""}` } });
  }

  // Pide un QR nuevo (o un código si se pasa número).
  async function pedirConexion(num) {
    setError("");
    try {
      const r = await authFetch(`/api/whatsapp-conectar${num ? `?number=${encodeURIComponent(num)}` : ""}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Error ${r.status}`);
      // El QR (base64) puede venir con o sin el prefijo data:.
      if (d.base64) {
        setQr(d.base64.startsWith("data:") ? d.base64 : `data:image/png;base64,${d.base64}`);
      }
      if (d.pairingCode) setPairingCode(d.pairingCode);
      return true;
    } catch (e) {
      setError(e.message || "No se pudo generar el código de conexión.");
      return false;
    } finally {
      setCargando(false);
    }
  }

  // Carga inicial: primero revisa si ya está conectado; si no, pide el QR.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await authFetch("/api/whatsapp-estado");
        const d = await r.json().catch(() => ({}));
        if (!vivo) return;
        setEstado(d?.state || null);
        if (d?.state === "open") {
          conectadoRef.current = true;
          setCargando(false);
          return; // ya conectado, no hace falta QR
        }
      } catch {
        /* si falla el estado, igual intentamos el QR */
      }
      if (vivo) await pedirConexion();
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sondeo del estado cada 3s: al conectar, marca éxito y avisa al Dashboard.
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const r = await authFetch("/api/whatsapp-estado");
        const d = await r.json().catch(() => ({}));
        setEstado(d?.state || null);
        if (d?.state === "open" && !conectadoRef.current) {
          conectadoRef.current = true;
          onConnected?.();
        }
      } catch {
        /* ignorar; reintenta en el próximo tick */
      }
    }, 3000);
    return () => clearInterval(t);
  }, [onConnected]);

  // Mientras no esté conectado y estemos en modo QR, refresca el QR cada 30s
  // (los QR de WhatsApp caducan a los ~40s).
  useEffect(() => {
    if (estado === "open" || modo !== "qr") return;
    const t = setInterval(() => pedirConexion(), 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, modo]);

  async function pedirCodigo() {
    const limpio = numero.replace(/\D/g, "");
    if (limpio.length < 10) {
      setError("Escribe el número completo con código de país. Ej: 18095551234.");
      return;
    }
    setPidiendo(true);
    setPairingCode(null);
    await pedirConexion(limpio);
    setPidiendo(false);
  }

  const conectado = estado === "open";

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="flex items-center gap-2 text-lg font-bold text-[var(--ink)]">
            <Icon name="whatsapp" className="w-5 h-5 text-[var(--brand-red)]" />
            Conectar WhatsApp
          </h3>
          <button onClick={onClose} className="text-[var(--ink-soft)] hover:text-[var(--ink)] text-xl leading-none">✕</button>
        </div>

        {/* Estado conectado */}
        {conectado ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <Icon name="whatsapp" className="w-7 h-7" />
            </div>
            <p className="text-lg font-bold text-[var(--ink)]">¡WhatsApp conectado!</p>
            <p className="text-sm text-[var(--ink-soft)] mt-1">
              El teléfono ya está vinculado. Las citas y confirmaciones se enviarán por WhatsApp.
            </p>
            <button onClick={onClose} className="btn-primary mt-5">Listo</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-4">
              {modo === "qr"
                ? "Abre WhatsApp en el teléfono del taller → Dispositivos vinculados → Vincular un dispositivo, y escanea este código."
                : "Escribe el número del teléfono del taller (con código de país) y te damos un código de 8 dígitos para vincular sin escanear."}
            </p>

            {error && <p className="text-sm text-[var(--brand-red)] mb-3">{error}</p>}

            {modo === "qr" ? (
              <div className="flex flex-col items-center">
                {cargando ? (
                  <div className="w-[260px] h-[260px] flex items-center justify-center text-sm text-[var(--ink-soft)]">
                    Generando código…
                  </div>
                ) : qr ? (
                  <img
                    src={qr}
                    alt="Código QR para vincular WhatsApp"
                    className="w-[260px] h-[260px] rounded-xl border border-[var(--line)] bg-white p-2"
                  />
                ) : (
                  <div className="w-[260px] h-[260px] flex items-center justify-center text-sm text-[var(--ink-soft)] text-center px-4">
                    No se pudo cargar el QR. Intenta refrescar.
                  </div>
                )}
                <button onClick={() => pedirConexion()} className="btn-ghost mt-4">
                  Refrescar código
                </button>
              </div>
            ) : (
              <div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={numero}
                    onChange={(e) => setNumero(e.target.value)}
                    className="input flex-1"
                    placeholder="18095551234"
                    inputMode="numeric"
                  />
                  <button onClick={pedirCodigo} disabled={pidiendo} className="btn-primary whitespace-nowrap disabled:opacity-50">
                    {pidiendo ? "Pidiendo…" : "Pedir código"}
                  </button>
                </div>
                {pairingCode && (
                  <div className="mt-4 text-center">
                    <p className="text-xs text-[var(--ink-soft)] mb-1">Ingresa este código en WhatsApp:</p>
                    <p className="text-3xl font-bold tracking-[0.3em] text-[var(--brand-red)]">{pairingCode}</p>
                    <p className="text-xs text-[var(--ink-soft)] mt-2">
                      WhatsApp → Dispositivos vinculados → Vincular con número de teléfono. Caduca en ~60 s.
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-5 pt-4 border-t border-[var(--line)]">
              <button
                onClick={() => {
                  setError("");
                  setModo((m) => (m === "qr" ? "codigo" : "qr"));
                }}
                className="text-sm font-semibold text-[var(--brand-red)] hover:underline"
              >
                {modo === "qr" ? "Prefiero usar un código de 8 dígitos" : "Prefiero escanear el QR"}
              </button>
              <span className="text-xs text-[var(--ink-soft)]">
                {estado === "connecting" ? "Conectando…" : "Esperando escaneo…"}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
