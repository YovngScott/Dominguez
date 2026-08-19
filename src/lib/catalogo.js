import { supabase } from "./supabaseClient";
import { normalizarNombrePieza } from "./cotizacion";

/**
 * Mientras se limpia la base, pueden coexistir nombres viejos como
 * "PUERTA TRASERA LH". La interfaz los canoniza y elimina repetidos antes
 * de mostrarlos para que el buscador no confunda al usuario.
 */
export function opcionesPiezasCanonicas(filas = []) {
  const unicas = new Map();
  filas.forEach((fila) => {
    const nombre = normalizarNombrePieza(typeof fila === "string" ? fila : fila?.nombre);
    if (nombre) unicas.set(nombre, { id: nombre, label: nombre });
  });
  return [...unicas.values()].sort((a, b) => a.label.localeCompare(b.label, "es"));
}

// Busca una marca por nombre; si no existe, la crea. Devuelve su id.
export async function findOrCreateMarca(nombre) {
  const n = (nombre || "").trim();
  if (!n) return null;
  const { data: existe } = await supabase.from("marcas").select("id").ilike("nombre", n).limit(1);
  if (existe?.[0]) return existe[0].id;
  const { data: nueva } = await supabase.from("marcas").insert({ nombre: n }).select("id").single();
  return nueva?.id || null;
}

// Busca un modelo dentro de una marca; si no existe, lo crea. Devuelve su id.
export async function findOrCreateModelo(marcaId, nombre) {
  const n = (nombre || "").trim();
  if (!n || !marcaId) return null;
  const { data: existe } = await supabase
    .from("modelos")
    .select("id")
    .eq("marca_id", marcaId)
    .ilike("nombre", n)
    .limit(1);
  if (existe?.[0]) return existe[0].id;
  const { data: nuevo } = await supabase
    .from("modelos")
    .insert({ marca_id: marcaId, nombre: n })
    .select("id")
    .single();
  return nuevo?.id || null;
}

// Busca una aseguradora por nombre; si no existe, la crea. Devuelve su id.
export async function findOrCreateAseguradora(nombre) {
  const n = (nombre || "").trim();
  if (!n) return null;
  const { data: existe } = await supabase.from("aseguradoras").select("id").ilike("nombre", n).limit(1);
  if (existe?.[0]) return existe[0].id;
  const { data: nueva } = await supabase
    .from("aseguradoras")
    .insert({ nombre: n })
    .select("id")
    .single();
  return nueva?.id || null;
}

// Aseguradora "General" (categoría sin seguro real) usada como respaldo
// cuando no se indicó ninguna compañía de seguro.
export async function getAseguradoraGeneralId() {
  const { data } = await supabase.from("aseguradoras").select("id").eq("es_personal", true).limit(1).maybeSingle();
  return data?.id || null;
}

// Agrega una pieza al catálogo si aún no existe (para autocompletar luego).
export async function agregarPiezaCatalogo(nombre) {
  const n = normalizarNombrePieza(nombre);
  if (!n) return;
  const { data: existe } = await supabase.from("piezas_catalogo").select("id").ilike("nombre", n).limit(1);
  if (existe?.[0]) return;
  await supabase.from("piezas_catalogo").insert({ nombre: n });
  // si ya existe, el unique constraint lo rechaza silenciosamente (ignoramos error)
}

// Agrega un servicio al catálogo si aún no existe (para autocompletar luego).
export async function agregarServicioCatalogo(nombre) {
  const n = (nombre || "").trim();
  if (!n) return;
  await supabase.from("servicios_catalogo").insert({ nombre: n });
  // si ya existe, el unique constraint lo rechaza silenciosamente (ignoramos error)
}
