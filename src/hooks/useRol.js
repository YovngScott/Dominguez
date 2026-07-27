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
  const [rol, setRol] = useState(undefined); // undefined = cargando

  useEffect(() => {
    let vivo = true;

    async function cargar() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        if (vivo) setRol(null);
        return;
      }
      const { data } = await supabase
        .from("perfiles")
        .select("rol")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (vivo) setRol(data?.rol || "admin");
    }

    cargar();
    const { data: listener } = supabase.auth.onAuthStateChange(() => cargar());
    return () => {
      vivo = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return { rol, cargandoRol: rol === undefined, esKiosk: rol === "almacen_kiosk" };
}
