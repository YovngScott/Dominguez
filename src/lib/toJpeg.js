/**
 * Convierte cualquier Blob de imagen (ej. WebP) a un Blob JPEG. Se usa al
 * descargar o enviar fotos por correo: en el navegador/almacenamiento se
 * guardan en WebP (menos espacio), pero fuera de ahí (WhatsApp, Windows,
 * clientes de correo, impresoras) conviene entregar JPG por compatibilidad.
 */
export async function blobAJpeg(blob, quality = 0.9) {
  // Si ya es JPEG, no hace falta recodificar.
  if (blob.type === "image/jpeg") return blob;

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), "image/jpeg", quality));
}

// Convierte una URL (ej. signed URL de Storage) a un Blob JPEG.
export async function urlAJpegBlob(url, quality = 0.9) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  return blobAJpeg(blob, quality);
}

// Convierte un Blob a data URL base64 (sin el prefijo "data:...;base64,").
export function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
