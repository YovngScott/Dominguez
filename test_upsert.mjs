import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envLocal = fs.readFileSync(".env.local", "utf8");
let url = "";
let serviceKey = "";

envLocal.split("\n").forEach(line => {
  if (line.startsWith("VITE_SUPABASE_URL=") || line.startsWith("SUPABASE_URL=")) {
    const val = line.split("=")[1].replace(/"/g, "").trim();
    if (val && !val.includes("SENSITIVE")) url = val;
  }
  if (line.startsWith("SUPABASE_SERVICE_ROLE_KEY=")) {
    const val = line.split("=")[1].replace(/"/g, "").trim();
    if (val && !val.includes("SENSITIVE")) serviceKey = val;
  }
});

if (!url) url = "https://uynfceaqpllqhhnhptgq.supabase.co";

console.log("Supabase URL:", url);
const supabase = createClient(url, serviceKey);

async function test() {
  const payload = {
    id: "00000000-0000-0000-0000-000000000099",
    email: "telefonos@notificaciones.internal",
    nombre_cuenta: "Configuración Teléfonos Empleados",
    token_acceso: JSON.stringify([{ id: "1", nombre_empleado: "Joseph Test", telefono: "8498636074", rol: "Recepción", activo: true }]),
    es_predeterminado: false,
    activo: true
  };

  const { data, error } = await supabase.from("cuentas_correo_config").upsert(payload).select();
  console.log("Upsert result:", { data, error });

  const { data: readData, error: readErr } = await supabase.from("cuentas_correo_config").select("*").eq("id", "00000000-0000-0000-0000-000000000099");
  console.log("Read result:", { readData, readErr });
}

test();
