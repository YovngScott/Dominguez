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
  try {
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          try {
            const scale = Math.min(1, maxWidth / (img.width || 1600));
            const width = Math.round((img.width || 1600) * scale);
            const height = Math.round((img.height || 1200) * scale);

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  const ext = ".jpg";
                  const cleanName = (file.name || "foto.jpg").replace(/\.\w+$/, ext);
                  resolve(new File([blob], cleanName, { type: "image/jpeg" }));
                } else {
                  resolve(file);
                }
              },
              "image/jpeg",
              quality
            );
          } catch {
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  } catch {
    return file;
  }
}
