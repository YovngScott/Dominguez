// Configuración del anaquel (tramos) por aseguradora.
//   Filas = letras (A, B, C, D…) = "alto".
//   Columnas = números (1, 2, 3…) = "largo".
// Ej. 5 de largo × 4 de alto → A1..A5, B1..B5, C1..C5, D1..D5.

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Devuelve { cols, rows } para la aseguradora (match por palabra clave, tolera
// acentos y variaciones del nombre).
export function layoutTramos(aseguradora) {
  const n = norm(aseguradora);
  // Sura, La Colonial y Banreservas: 5 de largo × 4 de alto.
  if (["sura", "colonial", "reserva"].some((k) => n.includes(k))) return { cols: 5, rows: 4 };
  // CoopSeguros, Atlántica e Internacional: 1 de largo × 3 de alto.
  if (["coop", "atlantic", "internacional"].some((k) => n.includes(k))) return { cols: 1, rows: 3 };
  // Por defecto (otras aseguradoras): 3 de largo × 4 de alto.
  return { cols: 3, rows: 4 };
}

// Lista de espacios (ej. ["A1","A2",...]) para la aseguradora dada.
export function tramosDe(aseguradora) {
  const { cols, rows } = layoutTramos(aseguradora);
  const slots = [];
  for (let r = 0; r < rows; r++) {
    const letra = String.fromCharCode(65 + r);
    for (let c = 1; c <= cols; c++) slots.push(`${letra}${c}`);
  }
  return slots;
}

// Compatibilidad: lista por defecto (3 × 4) para código que aún importe TRAMOS.
export const TRAMOS = tramosDe("");
