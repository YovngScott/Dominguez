import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// La sesión se mantiene en un único origen. Antes cada pantalla consultaba
// Supabase por su cuenta después de introducir el PIN; si una de esas lecturas
// tardaba, el usuario podía quedarse viendo "Cargando" hasta recargar.
let sesionActual;
let inicioPreparado = false;
const oyentes = new Set();

function publicarSesion(sesion) {
  sesionActual = sesion || null;
  oyentes.forEach((actualizar) => actualizar(sesionActual));
}

function iniciarSesionCompartida() {
  if (inicioPreparado) return;
  inicioPreparado = true;

  // Nunca dejamos la aplicación bloqueada indefinidamente por una lectura de
  // almacenamiento o red lenta. Si llega tarde, su resultado igual se aplica.
  const limite = window.setTimeout(() => publicarSesion(null), 6000);
  supabase.auth.getSession()
    .then(({ data }) => publicarSesion(data?.session || null))
    .catch(() => publicarSesion(null))
    .finally(() => window.clearTimeout(limite));

  supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
    publicarSesion(nuevaSesion);
  });
}

function conLimite(promesa, mensaje, milisegundos = 12000) {
  return Promise.race([
    promesa,
    new Promise((resolve) => {
      window.setTimeout(() => resolve({ data: { session: null }, error: { message: mensaje } }), milisegundos);
    }),
  ]);
}

export function useAuth() {
  const [session, setSession] = useState(() => sesionActual);

  useEffect(() => {
    iniciarSesionCompartida();
    oyentes.add(setSession);
    if (sesionActual !== undefined) setSession(sesionActual);
    return () => oyentes.delete(setSession);
  }, []);

  return {
    session,
    loading: session === undefined,
    async signIn(email, password) {
      const intento = await conLimite(
        supabase.auth.signInWithPassword({ email, password }),
        "La conexión tardó demasiado. Inténtalo de nuevo."
      );
      if (!intento.error) publicarSesion(intento.data?.session);
      return intento;
    },
    async signInWithPin(pin) {
      const controlador = new AbortController();
      const limite = window.setTimeout(() => controlador.abort(), 12000);
      let respuesta;
      try {
        respuesta = await fetch("/api/auth-pin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pin }),
          signal: controlador.signal,
        });
      } catch {
        return { error: { message: "La conexión tardó demasiado. Inténtalo de nuevo." } };
      } finally {
        window.clearTimeout(limite);
      }

      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) return { error: { message: datos.error || "No se pudo validar el PIN." } };

      const intento = await conLimite(
        supabase.auth.signInWithPassword({ email: datos.loginEmail, password: pin }),
        "El acceso tardó demasiado. Inténtalo de nuevo."
      );
      if (intento.error) return intento;
      publicarSesion(intento.data?.session);
      return { ...intento, perfil: datos.usuario };
    },
    async signOut() {
      const resultado = await supabase.auth.signOut();
      if (!resultado.error) publicarSesion(null);
      return resultado;
    },
  };
}
