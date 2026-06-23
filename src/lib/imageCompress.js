/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla.
 * Evita saturar el bucket de Storage cuando se cargan hasta 100 fotos por caso:
 * una foto de cámara de tablet (4-12 MB) se reduce típicamente a 120-300 KB
 * sin pérdida visible en pantalla ni al imprimir un reporte.
 *
 * Usa WebP (pesa ~30% menos que JPEG con la misma calidad visual); si el
 * navegador no lo soporta, cae a JPEG automáticamente.
 */
export async function compressImage(file, { maxWidth = 1600, quality = 0.78 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await aBlob(canvas, "image/webp", quality);
  let tipo = "image/webp";
  if (!blob) {
    blob = await aBlob(canvas, "image/jpeg", quality);
    tipo = "image/jpeg";
  }

  const ext = tipo === "image/webp" ? ".webp" : ".jpg";
  return new File([blob], file.name.replace(/\.\w+$/, ext), { type: tipo });
}

function aBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
