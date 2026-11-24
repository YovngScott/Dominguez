export const MAX_DOCUMENTO_BYTES = 50 * 1024 * 1024;
export const DOCUMENTOS_BUCKET = "documentos-casos";

const MIME_POR_EXTENSION = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function extensionDocumento(nombre = "") {
  return nombre.match(/\.([a-z0-9]{1,20})$/i)?.[1].toLowerCase() || "";
}

// Solo PDF e imagenes raster se muestran dentro de la pagina.
// Los demas formatos se descargan para abrirlos en su programa correspondiente.
export function vistaPreviaDocumento(nombre) {
  const extension = extensionDocumento(nombre);
  if (extension === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"].includes(extension)) return "imagen";
  return null;
}

export async function subirDocumentoCaso({ client, casoId, tipoId, file, id }) {
  if (!casoId || !tipoId) throw new Error("Selecciona un caso y un tipo de documento.");
  if (!file || file.size > MAX_DOCUMENTO_BYTES) {
    throw new Error("El archivo supera el límite de 50 MB.");
  }
  const { data: userData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!userData?.user?.id) throw new Error("Inicia sesión para subir documentos.");

  const extension = extensionDocumento(file.name);
  const path = `${casoId}/${id}${extension ? `.${extension}` : ""}`;
  const bucket = client.storage.from(DOCUMENTOS_BUCKET);
  const { error: uploadError } = await bucket.upload(path, file, {
    contentType: file.type || MIME_POR_EXTENSION[extension] || "application/octet-stream",
  });
  if (uploadError) throw uploadError;

  const { error: insertError } = await client.from("documentos_caso").insert({
    caso_id: casoId,
    tipo_id: tipoId,
    nombre_archivo: file.name,
    storage_path: path,
    url: "", // Los enlaces privados se generan al abrir el documento, no al guardarlo.
    uploaded_by: userData.user.id,
  });
  if (insertError) {
    const { error: cleanupError } = await bucket.remove([path]);
    if (cleanupError) {
      throw new Error("No se pudo registrar el documento ni retirar el archivo subido. Actualiza la página antes de reintentar.");
    }
    throw insertError;
  }
  return path;
}
