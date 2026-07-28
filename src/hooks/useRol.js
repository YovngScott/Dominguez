import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// Rol del usuario que tiene la sesión abierta.
//   "admin"         → personal del taller: ve todo el sistema.
//   "almacen_kiosk" → la tablet del taller: SOLO ve la pantalla para pedir
//                     suministros (además, la base de datos le bloquea el
//                     resto de los datos vía RLS; ver sql/40_suministros.sql).
// Si el usuario no tiene fila en "perfiles" se asume admin, así los usuarios
// que ya existían siguen funcionando igual que siempre.
export function useRol() {
  const [perfil, setPerfil] = useState(undefined); // undefined = cargando

  useEffect(() => {
    let vivo = true;

    async function cargar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (vivo) setPerfil(null);
        return;
      }
      const { data } = await supabase
        .from("perfiles")
        .select("rol, nombre_completo, activo")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (vivo) {
        // Las cuentas antiguas sin perfil siguen siendo Administración General
        // para poder crear sus primeros accesos por PIN desde la app.
        setPerfil(data || { rol: "administrativo_general", activo: true, nombre_completo: "Administración" });
      }
    }

    cargar();
    const { data: listener } = supabase.auth.onAuthStateChange(() => cargar());
    return () => {
      vivo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const rol = perfil?.rol || null;
  return {
    perfil,
    rol,
    cargandoRol: perfil === undefined,
    esKiosk: rol === "suministros",
    esSuministros: rol === "suministros",
    esAdministrativo: rol === "administrativo_general",
    esTaller: rol === "administracion_taller",
    inactivo: perfil?.activo === false,
  };
}
