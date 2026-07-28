import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Logo from "../components/Logo";
import Icon from "../components/Icon";

const DIGITOS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function Login() {
  const { session, loading, signIn, signInWithPin } = useAuth();
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mostrarLegacy, setMostrarLegacy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (!loading && session) return <Navigate to="/" replace />;

  async function ingresarConPin(valor = pin) {
    if (valor.length !== 4 || submitting) return;
    setSubmitting(true);
    setError("");
    const { error: e, perfil } = await signInWithPin(valor);
    if (e) {
      setError(e.message || "PIN incorrecto.");
      setPin("");
      setSubmitting(false);
      return;
    }
    navigate(perfil?.rol === "suministros" ? "/suministros/pedir" : "/", { replace: true });
    setSubmitting(false);
  }

  function presionar(n) {
    if (submitting || pin.length >= 4) return;
    const siguiente = `${pin}${n}`;
    setPin(siguiente);
    if (siguiente.length === 4) ingresarConPin(siguiente);
  }

  async function legacySubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: eAuth } = await signIn(email, password);
    if (eAuth) setError("Correo o contraseña incorrectos.");
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen bg-[var(--paper)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8 shadow-xl">
          <div className="flex justify-center mb-5"><Logo size={58} /></div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-[var(--ink)]">Bienvenido</h1>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">Introduce tu PIN de acceso</p>
          </div>

          <div className="flex justify-center gap-4 my-7" aria-label={`${pin.length} de 4 dígitos ingresados`}>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={`w-4 h-4 rounded-full border-2 transition-all ${
                  i < pin.length ? "bg-[var(--brand-red)] border-[var(--brand-red)] scale-110" : "border-[var(--line)] bg-[var(--surface-2)]"
                }`}
              />
            ))}
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-[18rem] mx-auto">
            {DIGITOS.map((n) => (
              <button key={n} type="button" onClick={() => presionar(n)} className="h-16 rounded-2xl bg-[var(--surface-2)] text-2xl font-bold text-[var(--ink)] hover:bg-[var(--brand-red-50)] hover:text-[var(--brand-red)] active:scale-95 transition" disabled={submitting}>{n}</button>
            ))}
            <button type="button" onClick={() => setPin("")} className="h-16 rounded-2xl text-sm font-bold text-[var(--ink-soft)] hover:bg-[var(--surface-2)]" disabled={submitting}>Limpiar</button>
            <button type="button" onClick={() => presionar(0)} className="h-16 rounded-2xl bg-[var(--surface-2)] text-2xl font-bold text-[var(--ink)] hover:bg-[var(--brand-red-50)] hover:text-[var(--brand-red)] active:scale-95 transition" disabled={submitting}>0</button>
            <button type="button" onClick={() => setPin((v) => v.slice(0, -1))} className="h-16 rounded-2xl flex items-center justify-center text-[var(--ink-soft)] hover:bg-[var(--surface-2)]" aria-label="Borrar último dígito" disabled={submitting}><Icon name="backspace" className="w-6 h-6" /></button>
          </div>

          {submitting && <p className="text-center text-sm text-[var(--ink-soft)] mt-5">Verificando acceso…</p>}
          {error && <p className="text-center text-sm font-medium text-[var(--brand-red)] mt-5">{error}</p>}

          <button type="button" onClick={() => { setMostrarLegacy((v) => !v); setError(""); }} className="w-full mt-7 text-xs font-semibold text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
            {mostrarLegacy ? "Ocultar acceso de administrador" : "¿Administrador existente? Ingresar con correo"}
          </button>

          {mostrarLegacy && (
            <form onSubmit={legacySubmit} className="mt-4 pt-4 border-t border-[var(--line)] space-y-3">
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="Correo" />
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Contraseña" />
              <button type="submit" className="btn-ghost w-full" disabled={submitting}>Ingresar con correo</button>
            </form>
          )}
        </div>
        <p className="text-center text-xs text-[var(--ink-soft)] mt-5">Domínguez Auto Pintura · Sistema interno</p>
      </div>
    </div>
  );
}
