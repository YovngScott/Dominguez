/**
 * Redimensiona y comprime una imagen en el navegador antes de subirla.
 * Evita saturar el bucket de Storage cuando se cargan hasta 50 fotos por caso:
 * una foto de cámara de tablet (4-12 MB) se reduce típicamente a 150-400 KB
 * sin pérdida visible en pantalla ni al imprimir un reporte.
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
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", quality)
  );

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
  });
}
