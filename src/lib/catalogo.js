import { supabase } from "./supabaseClient";

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

// Agrega una pieza al catálogo si aún no existe (para autocompletar luego).
export async function agregarPiezaCatalogo(nombre) {
  const n = (nombre || "").trim();
  if (!n) return;
  await supabase.from("piezas_catalogo").insert({ nombre: n });
  // si ya existe, el unique constraint lo rechaza silenciosamente (ignoramos error)
}
