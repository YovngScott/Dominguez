// ZPL para la ETIQUETA DE VEHÍCULO (4x2", impresora térmica): marca/modelo
// arriba y los TRABAJOS A REALIZAR en grande. Se pueden hacer VARIAS etiquetas
// (una por puerta/zona): cada "unidad" se imprime en su propia hoja.
// 203 dpi → 812 x 406 dots.

const W = 812;
const H = 406;
const M = 18;
const RW = W - M * 2;

function ascii(s) {
  return String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\^~\\]/g, " ")
    .trim();
}

function lineas(texto, fontH, anchoDots) {
  const charW = fontH * 0.58;
  const porLinea = Math.max(1, Math.floor(anchoDots / charW));
  return Math.max(1, Math.ceil(ascii(texto).length / porLinea));
}

// Una etiqueta (un ^XA…^XZ): vehículo + lista de trabajos de esa unidad.
function etiquetaVehiculo(marca, modelo, anio, trabajos) {
  const items = (trabajos || []).map((t) => ascii(t)).filter(Boolean);
  let z = `^XA^PW${W}^LL${H}^LH0,0`;
  let y = 16;

  const veh = [marca, modelo, anio].filter(Boolean).join(" ") || "-";
  const vehH = 46;
  const vehL = Math.min(2, lineas(veh, vehH, RW));
  z += `^FO${M},${y}^A0N,${vehH},${vehH}^FB${RW},2,0,L^FD${ascii(veh)}^FS`;
  y += vehL * (vehH + 2) + 8;

  z += `^FO${M},${y}^GB${RW},3,3^FS`;
  y += 10;

  z += `^FO${M},${y}^A0N,24,24^FD${ascii(`TRABAJOS A REALIZAR (${items.length})`)}^FS`;
  y += 32;

  const n = items.length || 1;
  const fH = n <= 1 ? 58 : n === 2 ? 48 : n === 3 ? 40 : n === 4 ? 34 : 28;
  const gap = n <= 2 ? 12 : 7;
  const dispo = H - 6 - y;
  let usado = 0;
  items.forEach((t) => {
    const nl = Math.min(2, lineas(t, fH, RW - 18));
    const alto = nl * (fH + 4) + gap;
    if (usado + alto > dispo) return;
    z += `^FO${M},${y + Math.round(fH / 2) - 4}^GB10,10,10^FS`;
    z += `^FO${M + 18},${y}^A0N,${fH},${fH}^FB${RW - 18},2,0,L^FD${t}^FS`;
    y += alto;
    usado += alto;
  });

  z += "^XZ";
  return z;
}

function normalizarUnidades(unidades, trabajos) {
  if (unidades && unidades.length) {
    return unidades.map((u) => (Array.isArray(u) ? u : u.trabajos || []));
  }
  return [trabajos || []];
}

/**
 * @param marca, modelo, anio  datos del vehículo (compartidos por todas)
 * @param unidades  [["Cambio y Pintura de flear derecho"], ["Reparacion puerta izq"], ...]
 *                  (cada unidad = una etiqueta aparte)
 * @param trabajos  formato viejo: una sola etiqueta
 */
export function generarZplVehiculo({ marca, modelo, anio, unidades = null, trabajos = null }) {
  const lista = normalizarUnidades(unidades, trabajos).filter((u) => (u || []).some((t) => ascii(t)));
  const reales = lista.length ? lista : [[]];
  return reales.map((u) => etiquetaVehiculo(marca, modelo, anio, u)).join("");
}
