import { supabase } from "./supabaseClient";

// Devuelve una signed URL de la firma del cliente guardada en el caso
// (capturada al hacer la cotización en tablet), o null si no tiene.
export async function obtenerFirmaClienteUrl(casoId) {
  if (!casoId) return null;
  const { data: caso } = await supabase
    .from("casos")
    .select("firma_cliente_url")
    .eq("id", casoId)
    .maybeSingle();
  if (!caso?.firma_cliente_url) return null;
  const { data: signed } = await supabase.storage
    .from("fotos-casos")
    .createSignedUrl(caso.firma_cliente_url, 3600);
  return signed?.signedUrl || null;
}
