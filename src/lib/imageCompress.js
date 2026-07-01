/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla.
 * Evita saturar el bucket de Storage cuando se cargan hasta 100 fotos por caso:
 * una foto de cámara de tablet (4-12 MB) se reduce típicamente a 150-350 KB
 * sin pérdida visible en pantalla ni al imprimir un reporte.
 *
 * Usa JPEG: para fotografías es el formato más liviano y con soporte universal
 * (WhatsApp, Windows, impresoras, etc.). PNG pesaría mucho más en fotos.
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
  // Fondo blanco: las fotos JPEG no soportan transparencia; sin esto, las zonas
  // transparentes saldrían negras.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await aBlob(canvas, "image/jpeg", quality);

  const ext = ".jpg";
  return new File([blob], file.name.replace(/\.\w+$/, ext), { type: "image/jpeg" });
}

function aBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
