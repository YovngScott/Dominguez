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

// Hardcode fallback if redacted
if (!url) url = "https://uynfceaqpllqhhnhptgq.supabase.co";

console.log("Supabase URL:", url);
console.log("Service Key exists:", !!serviceKey);

if (url && serviceKey) {
  const supabase = createClient(url, serviceKey);
  async function test() {
    console.log("--- Checking accounts table ---");
    const { data: cData, error: cErr } = await supabase.from("cuentas_correo_config").select("*");
    console.log("cuentas_correo_config:", { cData, cErr });

    console.log("--- Checking telefonos table ---");
    const { data: tData, error: tErr } = await supabase.from("telefonos_notificacion").select("*");
    console.log("telefonos_notificacion:", { tData, tErr });

    console.log("--- Checking casos table ---");
    const { data: casoData, error: casoErr } = await supabase.from("casos").select("id").limit(1);
    console.log("casos:", { casoData, casoErr });
  }
  test();
}
