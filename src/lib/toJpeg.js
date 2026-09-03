/**
 * Convierte cualquier Blob de imagen (ej. WebP) a un Blob JPEG. Se usa al
 * descargar o enviar fotos por correo: en el navegador/almacenamiento se
 * guardan en WebP (menos espacio), pero fuera de ahí (WhatsApp, Windows,
 * clientes de correo, impresoras) conviene entregar JPG por compatibilidad.
 */
export async function blobAJpeg(blob, quality = 0.9, maxWidth) {

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  const scale = maxWidth ? Math.min(1, maxWidth / bitmap.width) : 1;
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b || blob), "image/jpeg", quality));
}

// Convierte una URL (ej. signed URL de Storage) a un Blob JPEG.
export async function urlAJpegBlob(url, quality = 0.9, maxWidth) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("No se pudo descargar una foto para adjuntarla.");
  const blob = await resp.blob();
  return blobAJpeg(blob, quality, maxWidth);
}

// Prepara una foto para correo. Los adjuntos se codifican en base64, por lo que
// una imagen de 2 MB puede ocupar casi 2.7 MB dentro del mensaje. Este límite
// mantiene varias fotos y el PDF por debajo del máximo de 20 MB de Brevo.
export async function urlAJpegCorreo(url, maxBytes = 1600 * 1024) {
  const intentos = [
    [0.72, 1280],
    [0.64, 1100],
    [0.56, 900],
    [0.5, 760],
    [0.45, 640],
    [0.42, 480],
  ];
  let jpg;
  for (const [quality, maxWidth] of intentos) {
    jpg = await urlAJpegBlob(url, quality, maxWidth);
    if (jpg.size <= maxBytes) return jpg;
  }
  return jpg;
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
