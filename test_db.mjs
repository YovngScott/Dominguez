import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const envLocal = fs.readFileSync(".env.local", "utf8");
let url = "";
let anonKey = "";

envLocal.split("\n").forEach(line => {
  if (line.startsWith("VITE_SUPABASE_URL=")) {
    url = line.split("=")[1].replace(/"/g, "").trim();
  }
  if (line.startsWith("VITE_SUPABASE_ANON_KEY=")) {
    anonKey = line.split("=")[1].replace(/"/g, "").trim();
  }
});

console.log("Testing Supabase URL:", url);
const supabase = createClient(url, anonKey);

async function check() {
  const { data: cuentas, error: errCuentas } = await supabase.from("cuentas_correo_config").select("*");
  console.log("cuentas_correo_config query:", { cuentas, errCuentas });

  const { data: telefonos, error: errTel } = await supabase.from("telefonos_notificacion").select("*");
  console.log("telefonos_notificacion query:", { telefonos, errTel });
}

check();
