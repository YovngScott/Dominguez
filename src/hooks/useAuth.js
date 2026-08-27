import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useAuth() {
  const [session, setSession] = useState(undefined); // undefined = cargando

  useEffect(() => {
    let vivo = true;
    const fallback = window.setTimeout(() => { if (vivo) setSession(null); }, 10000);
    const cargar = async () => {
      const { data } = await supabase.auth.getSession();
      if (vivo) {
        window.clearTimeout(fallback);
        setSession(data.session || null);
      }
    };
    cargar();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    const alVolver = () => { if (document.visibilityState === "visible") cargar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      window.clearTimeout(fallback);
      document.removeEventListener("visibilitychange", alVolver);
      listener.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    loading: session === undefined,
    signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
    async signInWithPin(pin) {
      const r = await fetch("/api/auth-pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return { error: { message: d.error || "No se pudo validar el PIN." } };
      const intento = await supabase.auth.signInWithPassword({ email: d.loginEmail, password: pin });
      if (intento.error) return intento;
      return { ...intento, perfil: d.usuario };
    },
    signOut: () => supabase.auth.signOut(),
  };
}
