import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Logo from "../components/Logo";

export default function Login() {
  const { session, loading, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && session) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const { error } = await signIn(email, password);
    if (error) setError("Correo o contraseña incorrectos.");
    setSubmitting(false);
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Panel de marca */}
      <div className="hidden lg:flex flex-col justify-between bg-[var(--ink)] text-white p-12 relative overflow-hidden">
        <div className="absolute -right-20 -top-20 w-96 h-96 rounded-full bg-[var(--brand-red)] opacity-20 blur-3xl" />
        <div className="absolute right-10 bottom-10 w-72 h-72 rounded-full bg-[var(--brand-red)] opacity-10 blur-3xl" />
        <Logo size={56} light />
        <div className="relative z-10">
          <h2 className="text-4xl font-extrabold leading-tight">
            Gestión digital del taller
          </h2>
          <p className="mt-4 text-white/70 max-w-md">
            Adiós a las carpetas y libretas. Vehículos, seguros, fotos de evidencia
            y cotizaciones — todo centralizado y a un clic.
          </p>
        </div>
        <p className="relative z-10 text-sm text-white/40">
          Dominguez Auto Pintura · Sistema interno
        </p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center bg-[var(--paper)] px-4 py-12">
        <form onSubmit={handleSubmit} className="card w-full max-w-sm p-8 space-y-5">
          <div className="lg:hidden flex justify-center mb-2">
            <Logo size={52} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--ink)]">Iniciar sesión</h1>
            <p className="text-sm text-[var(--ink-soft)] mt-1">
              Acceso exclusivo para administradores
            </p>
          </div>

          <div>
            <label className="field-label">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
          </div>

          <div>
            <label className="field-label">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </div>

          {error && <p className="text-sm text-[var(--brand-red)]">{error}</p>}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </div>
  );
}
