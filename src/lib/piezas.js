import { supabase } from "./supabaseClient";

// Clave estable para identificar una pieza entre cotizaciones, etiquetas y el
// checklist del caso. Es la misma en todos lados: nombre sin espacios sobrantes
// y en minúsculas.
export const clavePieza = (s) => (s || "").trim().toLowerCase();

/**
 * Marca piezas como RECIBIDAS en el checklist del caso.
 *
 * Se usa al guardar una etiqueta: si se está imprimiendo la etiqueta de una
 * pieza es porque la pieza ya llegó al taller, así que no tiene sentido
 * obligar a marcarla otra vez a mano en el caso. Las que ya estaban marcadas
 * se quedan como están (no se pisa quién ni cuándo las recibió).
 *
 * piezas = [{ nombre }]. Devuelve cuántas quedaron marcadas.
 */
export async function marcarPiezasRecibidas(casoId, piezas) {
  if (!casoId) return 0;

  // Una fila por pieza distinta: la misma pieza en dos cajas es una sola línea
  // del checklist.
  const unicas = new Map();
  (piezas || []).forEach((p) => {
    const nombre = (p?.nombre || "").trim();
    const k = clavePieza(nombre);
    if (k && !unicas.has(k)) unicas.set(k, nombre);
  });
  if (!unicas.size) return 0;

  const { data: userData } = await supabase.auth.getUser();
  const filas = [...unicas].map(([k, nombre]) => ({
    caso_id: casoId,
    pieza_clave: k,
    pieza_nombre: nombre,
    recibida_by: userData?.user?.id,
  }));

  // ignoreDuplicates: si la pieza ya estaba recibida no se toca su fila.
  const { error } = await supabase
    .from("piezas_recibidas")
    .upsert(filas, { onConflict: "caso_id,pieza_clave", ignoreDuplicates: true });
  if (error) throw error;
  return filas.length;
}
