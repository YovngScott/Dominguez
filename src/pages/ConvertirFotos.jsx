import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const BUCKET = "fotos-casos";
const CALIDAD_JPG = 0.9; // alta, para perder lo mínimo al reconvertir

// Reconvierte un blob de imagen a JPEG (fondo blanco, misma resolución).
async function aJpeg(blob) {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", CALIDAD_JPG));
}

export default function ConvertirFotos() {
  const [estado, setEstado] = useState("idle"); // idle | corriendo | listo
  const [prog, setProg] = useState({ actual: 0, total: 0, ok: 0, fallos: 0 });
  const [log, setLog] = useState([]);

  function agregarLog(linea) {
    setLog((prev) => [linea, ...prev].slice(0, 200));
  }

  async function convertir() {
    if (estado === "corriendo") return;
    setEstado("corriendo");
    setLog([]);
    setProg({ actual: 0, total: 0, ok: 0, fallos: 0 });

    // 1) Todas las filas cuya ruta termina en .webp
    const { data: filas, error } = await supabase
      .from("fotos_caso")
      .select("id, storage_path")
      .ilike("storage_path", "%.webp");

    if (error) {
      agregarLog(`Error consultando la base de datos: ${error.message}`);
      setEstado("listo");
      return;
    }

    const total = filas?.length || 0;
    setProg((p) => ({ ...p, total }));
    if (!total) {
      agregarLog("No hay fotos .webp por convertir. Todo listo.");
      setEstado("listo");
      return;
    }

    let ok = 0;
    let fallos = 0;

    for (let i = 0; i < filas.length; i++) {
      const { id, storage_path: viejo } = filas[i];
      const nuevo = viejo.replace(/\.webp$/i, ".jpg");
      try {
        // a) Descargar la .webp original
        const { data: descarga, error: eDl } = await supabase.storage.from(BUCKET).download(viejo);
        if (eDl || !descarga) throw new Error(eDl?.message || "no se pudo descargar");

        // b) Reconvertir a JPEG
        const jpg = await aJpeg(descarga);
        if (!jpg) throw new Error("falló la conversión a JPG");

        // c) Subir la .jpg (upsert por si ya existía)
        const { error: eUp } = await supabase.storage
          .from(BUCKET)
          .upload(nuevo, jpg, { contentType: "image/jpeg", upsert: true });
        if (eUp) throw new Error(eUp.message);

        // d) Apuntar la fila a la nueva ruta (y limpiar la url cacheada)
        const { error: eDb } = await supabase
          .from("fotos_caso")
          .update({ storage_path: nuevo, url: "" })
          .eq("id", id);
        if (eDb) throw new Error(eDb.message);

        // e) Borrar la .webp vieja
        await supabase.storage.from(BUCKET).remove([viejo]);

        ok += 1;
      } catch (err) {
        fallos += 1;
        agregarLog(`✗ ${viejo}: ${err.message || err}`);
      }
      setProg({ actual: i + 1, total, ok, fallos });
    }

    agregarLog(`Terminado: ${ok} convertidas, ${fallos} con error, de ${total}.`);
    setEstado("listo");
  }

  const pct = prog.total ? Math.round((prog.actual / prog.total) * 100) : 0;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <Link to="/" className="text-sm text-[var(--ink-soft)] hover:text-[var(--brand-red)]">
        ← Inicio
      </Link>

      <div className="card p-6 mt-3">
        <h1 className="text-2xl font-extrabold text-[var(--ink)]">Convertir fotos WebP → JPG</h1>
        <p className="text-sm text-[var(--ink-soft)] mt-2">
          Herramienta de un solo uso. Recorre todas las fotos guardadas en formato
          <strong> .webp</strong>, las reconvierte a <strong>.jpg</strong>, actualiza la base de
          datos y borra la versión .webp. No cierres esta pestaña mientras corre.
        </p>

        <button
          onClick={convertir}
          disabled={estado === "corriendo"}
          className="btn-primary mt-5 disabled:opacity-50"
        >
          {estado === "corriendo" ? "Convirtiendo…" : "Iniciar conversión"}
        </button>

        {prog.total > 0 && (
          <div className="mt-5">
            <div className="h-3 rounded-full bg-[var(--paper)] overflow-hidden">
              <div
                className="h-full bg-[var(--brand-red)] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="text-sm text-[var(--ink-soft)] mt-2">
              {prog.actual}/{prog.total} · {prog.ok} ok · {prog.fallos} con error
            </p>
          </div>
        )}

        {log.length > 0 && (
          <div className="mt-5 max-h-64 overflow-y-auto text-xs font-mono bg-[var(--paper)] rounded-lg p-3 space-y-1">
            {log.map((l, i) => (
              <p key={i} className="text-[var(--ink-soft)] break-all">
                {l}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
