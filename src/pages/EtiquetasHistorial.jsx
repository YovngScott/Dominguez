import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import Icon from "../components/Icon";

// Cajas de una etiqueta (formato nuevo); si es vieja, envuelve su lista de
// piezas como una sola caja.
function cajasDe(et) {
  if (et.cajas?.length) return et.cajas.map((c) => ({ piezas: c.piezas || [] }));
  return [{ piezas: et.piezas || [] }];
}

function piezasPlanas(et) {
  return cajasDe(et).flatMap((c) => c.piezas || []);
}

// Historial de etiquetas de piezas generadas/impresas. Permite abrir una para
// modificar sus piezas/datos y reimprimirla, reimprimir directo, o eliminarla.
export default function EtiquetasHistorial() {
  const navigate = useNavigate();
  const [etiquetas, setEtiquetas] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [imprimiendoId, setImprimiendoId] = useState(null);

  async function load() {
    const { data } = await supabase
      .from("etiquetas_piezas")
      .select("*")
      .order("created_at", { ascending: false });
    const filas = data || [];
    const paths = filas.flatMap((e) => piezasPlanas(e).map((p) => p.foto_path).filter(Boolean));
    const { data: signed } = paths.length
      ? await supabase.storage.from("fotos-casos").createSignedUrls(paths, 60 * 60)
      : { data: [] };
    const urls = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
    const conFotos = filas.map((e) => {
      const pintar = (p) => ({ ...p, foto_url: p.foto_path ? urls.get(p.foto_path) || "" : "" });
      return {
        ...e,
        piezas: (e.piezas || []).map(pintar),
        cajas: (e.cajas || []).map((c) => ({ ...c, piezas: (c.piezas || []).map(pintar) })),
      };
    });
    setEtiquetas(conFotos);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function reimprimir(et) {
    setImprimiendoId(et.id);
    try {
      const payload = {
        caso: {
          marca: et.marca,
          modelo: et.modelo,
          anio: et.anio,
          aseguradora_nombre: et.aseguradora_nombre,
          numero_reclamo: et.numero_reclamo,
        },
        cajas: cajasDe(et),
        qrUrl: et.caso_id ? `https://dominguez.vercel.app/piezas/${et.caso_id}` : null,
      };
      const { imprimirEtiquetas } = await import("../lib/printServer");
      const res = await imprimirEtiquetas(payload);
      if (res.modo === "pdf") window.open(URL.createObjectURL(res.blob), "_blank");
    } catch (err) {
      alert(err.message || "No se pudo imprimir.");
    } finally {
      setImprimiendoId(null);
    }
  }

  async function eliminar(et) {
    if (!confirm("¿Eliminar esta etiqueta del historial?")) return;
    await supabase.from("etiquetas_piezas").delete().eq("id", et.id);
    setEtiquetas((prev) => prev.filter((e) => e.id !== et.id));
  }

  const term = q.trim().toLowerCase();
  const lista = term
    ? etiquetas.filter((e) =>
        [e.marca, e.modelo, e.anio, e.aseguradora_nombre, e.numero_reclamo, ...piezasPlanas(e).map((p) => p.nombre)]
          .filter(Boolean)
          .some((x) => String(x).toLowerCase().includes(term))
      )
    : etiquetas;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--ink)]">Etiquetas</h1>
          <p className="text-sm text-[var(--ink-soft)]">Etiquetas de piezas generadas.</p>
        </div>
        <Link to="/piezas/etiquetas" className="btn-primary gap-1.5">
          <Icon name="plus" className="w-4 h-4" /> Nueva etiqueta
        </Link>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por vehículo, aseguradora, reclamo o pieza…"
        className="input w-full mb-5"
      />

      {loading ? (
        <p className="text-[var(--ink-soft)]">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="card p-10 text-center text-[var(--ink-soft)]">
          {term
            ? "No hay etiquetas que coincidan."
            : "Aún no se ha generado ninguna etiqueta. Crea una con “Nueva etiqueta”."}
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((et) => {
            const titulo = [et.marca, et.modelo, et.anio].filter(Boolean).join(" ") || "Vehículo";
            const numCajas = cajasDe(et).length;
            const piezas = piezasPlanas(et);
            return (
              <div key={et.id} className="card p-5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => navigate(`/piezas/etiquetas/${et.id}`)}
                    className="text-left min-w-0 flex-1"
                  >
                    <p className="font-bold text-[var(--ink)] truncate">{titulo}</p>
                    <p className="text-sm text-[var(--ink-soft)] truncate">
                      {et.aseguradora_nombre || "Sin aseguradora"}
                      {et.numero_reclamo ? ` · Reclamo ${et.numero_reclamo}` : ""}
                    </p>
                    <p className="text-xs text-[var(--ink-soft)] mt-1">
                      {numCajas} caja(s) · {piezas.length} pieza(s) · {new Date(et.created_at).toLocaleDateString("es-DO")}
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => reimprimir(et)}
                      disabled={imprimiendoId === et.id}
                      title="Reimprimir"
                       className="p-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)] disabled:opacity-50"
                     >
                      <Icon name="printer" className="w-4 h-4" />
                    </button>
                    <Link
                      to={`/piezas/etiquetas/${et.id}`}
                      title="Modificar piezas"
                      className="p-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)]"
                    >
                      <Icon name="pencil" className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={() => eliminar(et)}
                      title="Eliminar"
                      className="p-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--paper)] hover:text-[var(--brand-red)]"
                    >
                      <Icon name="trash" className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {piezas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {piezas.map((p, i) => (
                      <span
                        key={i}
                        className="text-xs bg-[var(--paper)] text-[var(--ink)] px-2 py-1 rounded-md inline-flex items-center gap-1.5"
                      >
                        {p.foto_url && <img src={p.foto_url} alt="" className="w-7 h-7 object-cover rounded" />}
                         <span>
                        {p.nombre}
                        {p.cantidad > 1 ? ` ×${p.cantidad}` : ""}
                      </span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
