import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { compressImage } from "../lib/imageCompress";
import { uuid } from "../lib/uuid";
import { subirFotoR2, urlsDescargaR2, eliminarFotosR2 } from "../lib/r2";
import Icon from "./Icon";
import Lightbox from "./Lightbox";

const SIGNED_URL_TTL = 60 * 60; // 1 hora

export default function PhotoManager({ casoId }) {
  const [categorias, setCategorias] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [activeCat, setActiveCat] = useState(""); // categoría activa = sub-pestaña + destino de subida
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0 });
  const [error, setError] = useState("");
  const [lightbox, setLightbox] = useState(null);
  const [comparar, setComparar] = useState(false);
  const [descargando, setDescargando] = useState(null); // { actual, total } | null

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  useEffect(() => {
    async function loadCategorias() {
      const { data } = await supabase.from("categorias_foto").select("*").order("orden");
      setCategorias(data || []);
      if (data?.length) setActiveCat(data[0].id);
    }
    loadCategorias();
  }, []);

  async function loadFotos() {
    const { data } = await supabase
      .from("fotos_caso")
      .select("id, storage_path, storage_backend, categoria_id, descripcion, uploaded_at, categoria:categorias_foto(nombre)")
      .eq("caso_id", casoId)
      .order("uploaded_at", { ascending: false });

    const filas = data || [];
    const urlPorPath = new Map();

    // Las fotos nuevas están en Cloudflare R2; las viejas en Supabase Storage.
    // Se firman por separado según el backend de cada una.
    const r2Paths = filas.filter((f) => f.storage_backend === "r2").map((f) => f.storage_path);
    const supaPaths = filas.filter((f) => f.storage_backend !== "r2").map((f) => f.storage_path);

    if (supaPaths.length) {
      const { data: signed } = await supabase.storage
        .from("fotos-casos")
        .createSignedUrls(supaPaths, SIGNED_URL_TTL);
      (signed || []).forEach((s) => urlPorPath.set(s.path, s.signedUrl));
    }
    if (r2Paths.length) {
      try {
        const urls = await urlsDescargaR2(r2Paths);
        Object.entries(urls).forEach(([p, u]) => urlPorPath.set(p, u));
      } catch {
        /* si R2 falla, esas fotos quedan sin URL (no rompe el resto) */
      }
    }
    setFotos(filas.map((f) => ({ ...f, signedUrl: urlPorPath.get(f.storage_path) })));
  }

  useEffect(() => {
    if (casoId) loadFotos();
  }, [casoId]);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (!activeCat) {
      setError("Selecciona una categoría antes de subir fotos.");
      return;
    }
    if (fotos.length + files.length > 100) {
      setError(`Este caso solo admite 100 fotos en total (tiene ${fotos.length}).`);
      return;
    }

    setError("");
    setSubiendo(true);
    setProgreso({ actual: 0, total: files.length });

    for (let i = 0; i < files.length; i++) {
      try {
        const compressed = await compressImage(files[i]);
        const ext = compressed.type === "image/webp" ? "webp" : "jpg";
        const path = `${casoId}/${activeCat}/${uuid()}.${ext}`;

        // Sube a Cloudflare R2 (10 GB gratis) en vez de Supabase Storage.
        await subirFotoR2(path, compressed, compressed.type);

        const { data: userData } = await supabase.auth.getUser();

        // No guardamos la URL firmada: expira en 1 h y al cargar siempre se
        // vuelve a firmar desde storage_path. Guardarla solo ocupaba espacio.
        await supabase.from("fotos_caso").insert({
          caso_id: casoId,
          categoria_id: activeCat,
          storage_path: path,
          storage_backend: "r2",
          url: "",
          uploaded_by: userData?.user?.id,
        });
      } catch (err) {
        setError(err.message || "Error subiendo una de las fotos.");
      }
      setProgreso((p) => ({ ...p, actual: p.actual + 1 }));
    }

    setSubiendo(false);
    loadFotos();
  }

  // Borra los archivos del almacenamiento que corresponda (R2 o Supabase).
  async function borrarDeStorage(fotos) {
    const r2 = fotos.filter((f) => f.storage_backend === "r2").map((f) => f.storage_path);
    const supa = fotos.filter((f) => f.storage_backend !== "r2").map((f) => f.storage_path);
    if (r2.length) await eliminarFotosR2(r2).catch(() => {});
    if (supa.length) await supabase.storage.from("fotos-casos").remove(supa);
  }

  async function eliminarFoto(foto) {
    if (!confirm("¿Eliminar esta foto?")) return;
    await borrarDeStorage([foto]);
    await supabase.from("fotos_caso").delete().eq("id", foto.id);
    setFotos((prev) => prev.filter((f) => f.id !== foto.id));
  }

  // Elimina TODAS las fotos de la categoría activa (útil si se subieron mal).
  async function eliminarTodas(lista, nombreCat) {
    if (!lista.length) return;
    if (
      !confirm(
        `¿Eliminar TODAS las ${lista.length} foto(s) de "${nombreCat}"? Esta acción no se puede deshacer.`
      )
    )
      return;
    setError("");
    const ids = lista.map((f) => f.id);
    const { error: e } = await supabase.from("fotos_caso").delete().in("id", ids);
    if (e) {
      setError("No se pudieron eliminar las fotos.");
      return;
    }
    await borrarDeStorage(lista);
    setFotos((prev) => prev.filter((f) => !ids.includes(f.id)));
  }

  // Descarga TODAS las fotos de la categoría activa de una sola vez. En
  // Chrome/Edge deja elegir la carpeta destino y las guarda ahí; en otros
  // navegadores las baja una por una a la carpeta de descargas.
  async function descargarTodas(lista, nombreCat) {
    if (!lista.length || descargando) return;
    setError("");
    const base = (nombreCat || "fotos").replace(/[^\wáéíóúñ\s-]/gi, "").trim() || "fotos";
    const nombreArchivo = (i) => {
      const ext = (lista[i].storage_path.split(".").pop() || "jpg").toLowerCase();
      return `${base}-${String(i + 1).padStart(2, "0")}.${ext}`;
    };

    let dirHandle = null;
    if (window.showDirectoryPicker) {
      try {
        dirHandle = await window.showDirectoryPicker();
      } catch {
        return; // el usuario canceló el selector de carpeta
      }
    }

    setDescargando({ actual: 0, total: lista.length });
    for (let i = 0; i < lista.length; i++) {
      try {
        const resp = await fetch(lista[i].signedUrl);
        const blob = await resp.blob();

        if (dirHandle) {
          const fileHandle = await dirHandle.getFileHandle(nombreArchivo(i), { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = nombreArchivo(i);
          document.body.appendChild(a);
          a.click();
          a.remove();
          URL.revokeObjectURL(url);
          await new Promise((r) => setTimeout(r, 250)); // evita que el navegador bloquee descargas en ráfaga
        }
      } catch {
        setError("No se pudo descargar una de las fotos.");
      }
      setDescargando({ actual: i + 1, total: lista.length });
    }
    setDescargando(null);
  }

  // Fotos de la sub-pestaña activa
  const fotosCat = fotos.filter((f) => f.categoria_id === activeCat);
  const catActiva = categorias.find((c) => c.id === activeCat);

  // Conteo por categoría (para mostrarlo en cada sub-pestaña)
  const conteoPorCat = fotos.reduce((acc, f) => {
    acc[f.categoria_id] = (acc[f.categoria_id] || 0) + 1;
    return acc;
  }, {});

  // Comparación antes/después por nombre de categoría
  const porNombre = (frag) =>
    fotos.filter((f) => (f.categoria?.nombre || "").toLowerCase().includes(frag));
  const fotosAntes = porNombre("daño").length ? porNombre("daño") : porNombre("ingreso");
  const fotosDespues = porNombre("entrega").length ? porNombre("entrega") : porNombre("finaliz");

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-slate-800">Fotos ({fotos.length}/100)</h2>
        <button
          type="button"
          onClick={() => setComparar((v) => !v)}
          className={`text-sm font-medium px-3 py-1.5 rounded-full inline-flex items-center gap-1.5 ${
            comparar ? "bg-[var(--brand-red)] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          <Icon name="compare" className="w-4 h-4" /> Antes / Después
        </button>
      </div>

      {comparar ? (
        <div className="grid sm:grid-cols-2 gap-4">
          <ColumnaComparacion titulo="Antes (daños)" fotos={fotosAntes} onVer={setLightbox} />
          <ColumnaComparacion titulo="Después (entrega / final)" fotos={fotosDespues} onVer={setLightbox} />
        </div>
      ) : (
        <>
          {/* Sub-pestañas: una por categoría, cada una independiente */}
          <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
            {categorias.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`text-sm px-3.5 py-2 rounded-lg whitespace-nowrap font-semibold transition-colors inline-flex items-center gap-1.5 ${
                  activeCat === c.id
                    ? "bg-[var(--brand-red)] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {c.nombre}
                <span
                  className={`text-xs px-1.5 rounded-full ${
                    activeCat === c.id ? "bg-white/25" : "bg-white text-slate-500"
                  }`}
                >
                  {conteoPorCat[c.id] || 0}
                </span>
              </button>
            ))}
          </div>

          {/* Subida dentro de la categoría activa */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <p className="text-sm text-slate-500">
              Subir a <strong className="text-slate-700">{catActiva?.nombre || "—"}</strong>:
            </p>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              disabled={subiendo || fotos.length >= 100}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Icon name="camera" className="w-4 h-4" /> Tomar foto
            </button>
            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              disabled={subiendo || fotos.length >= 100}
              className="bg-slate-100 text-slate-800 px-4 py-2 rounded-lg font-medium hover:bg-slate-200 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <Icon name="image" className="w-4 h-4" /> Subir desde galería
            </button>

            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>

          {subiendo && (
            <p className="text-sm text-slate-500 mb-3">
              Subiendo {progreso.actual}/{progreso.total}…
            </p>
          )}
          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          {fotosCat.length > 0 && (
            <div className="flex items-center justify-between mb-3 gap-3">
              <p className="text-sm text-slate-500">
                {fotosCat.length} foto(s) en <strong className="text-slate-700">{catActiva?.nombre}</strong>
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => descargarTodas(fotosCat, catActiva?.nombre)}
                  disabled={!!descargando}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Icon name="download" className="w-4 h-4" />
                  {descargando
                    ? `Descargando ${descargando.actual}/${descargando.total}…`
                    : `Descargar todas (${fotosCat.length})`}
                </button>
                <button
                  type="button"
                  onClick={() => eliminarTodas(fotosCat, catActiva?.nombre)}
                  disabled={!!descargando}
                  className="text-sm font-medium px-3 py-1.5 rounded-lg bg-[var(--brand-red-50)] text-[var(--brand-red)] hover:bg-[var(--brand-red)] hover:text-white disabled:opacity-50 inline-flex items-center gap-1.5"
                >
                  <Icon name="trash" className="w-4 h-4" />
                  Eliminar todas ({fotosCat.length})
                </button>
              </div>
            </div>
          )}

          {fotosCat.length === 0 ? (
            <p className="text-slate-500 text-sm">No hay fotos en “{catActiva?.nombre}” todavía.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {fotosCat.map((f) => (
                <div key={f.id} className="relative group">
                  <button
                    onClick={() => setLightbox(f)}
                    className="block w-full aspect-square rounded-lg overflow-hidden bg-slate-100"
                  >
                    <img src={f.signedUrl} alt={f.categoria?.nombre} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  </button>
                  <button
                    onClick={() => eliminarFoto(f)}
                    className="absolute top-1 right-1 bg-black/60 text-white w-7 h-7 rounded-full flex items-center justify-center text-sm opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {lightbox && (
        <Lightbox
          src={lightbox.signedUrl}
          alt={lightbox.categoria?.nombre || ""}
          filename={`${lightbox.categoria?.nombre || "foto"}.${(lightbox.storage_path.split(".").pop() || "jpg").toLowerCase()}`}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}

function ColumnaComparacion({ titulo, fotos, onVer }) {
  return (
    <div>
      <p className="font-semibold text-slate-700 mb-2">{titulo}</p>
      {fotos.length === 0 ? (
        <p className="text-sm text-slate-400 border border-dashed border-slate-200 rounded-lg p-6 text-center">
          Sin fotos en esta etapa.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {fotos.map((f) => (
            <button
              key={f.id}
              onClick={() => onVer(f)}
              className="block w-full aspect-square rounded-lg overflow-hidden bg-slate-100"
            >
              <img src={f.signedUrl} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
