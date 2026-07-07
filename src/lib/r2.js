import { supabase } from "./supabaseClient";

// Cliente del frontend para las fotos en Cloudflare R2. Llama a la función
// serverless /api/foto-url (que firma las URLs); el navegador sube/lee directo
// a R2 con esas URLs prefirmadas. Las credenciales nunca están en el navegador.
async function call(body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const r = await fetch("/api/foto-url", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Error ${r.status}`);
  return data;
}

// Sube un blob a R2 usando una URL PUT prefirmada.
export async function subirFotoR2(path, blob, contentType) {
  const { url } = await call({ op: "upload", path });
  const put = await fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType || "application/octet-stream" },
    body: blob,
  });
  if (!put.ok) throw new Error(`No se pudo subir a R2 (${put.status}).`);
}

// Devuelve { path: urlFirmada } para ver/descargar las rutas dadas.
export async function urlsDescargaR2(paths) {
  if (!paths.length) return {};
  const { urls } = await call({ op: "download", paths });
  return urls || {};
}

// Elimina objetos de R2.
export async function eliminarFotosR2(paths) {
  if (!paths.length) return;
  await call({ op: "delete", paths });
}
