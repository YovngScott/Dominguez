/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla.
 * Evita saturar el bucket de Storage cuando se cargan hasta 100 fotos por caso:
 * una foto de cámara de tablet (4-12 MB) se reduce típicamente a 100-250 KB
 * sin pérdida visible en pantalla ni al imprimir un reporte.
 *
 * Se guarda en WebP: pesa ~25-30% menos que JPEG a calidad similar, y todos
 * los navegadores modernos lo muestran nativo (<img>) sin conversión. Al
 * descargar o enviar por correo se convierte a JPG al vuelo (ver toJpeg.js)
 * para máxima compatibilidad fuera del navegador.
 */
export async function compressImage(file, { maxWidth = 1600, quality = 0.8 } = {}) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  // Fondo blanco por si el origen tuviera transparencia (queda igual en JPG/WebP).
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  let blob = await aBlob(canvas, "image/webp", quality);
  let tipo = "image/webp";
  if (!blob) {
    // Navegador sin soporte de codificación WebP (raro): cae a JPEG.
    blob = await aBlob(canvas, "image/jpeg", quality);
    tipo = "image/jpeg";
  }

  const ext = tipo === "image/webp" ? ".webp" : ".jpg";
  return new File([blob], file.name.replace(/\.\w+$/, ext), { type: tipo });
}

function aBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
