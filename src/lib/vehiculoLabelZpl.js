// ZPL para la ETIQUETA DE VEHÍCULO (4x2", impresora térmica): marca/modelo
// arriba y los TRABAJOS A REALIZAR en grande (para pegar en el carro y que el
// técnico vea de un vistazo qué hacer). 203 dpi → 812 x 406 dots.

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

/**
 * @param marca, modelo, anio  datos del vehículo
 * @param trabajos  ["Cambio y Pintura de flear derecho", ...]
 */
export function generarZplVehiculo({ marca, modelo, anio, trabajos = [] }) {
  const items = (trabajos || []).map((t) => ascii(t)).filter(Boolean);
  let z = `^XA^PW${W}^LL${H}^LH0,0`;
  let y = 16;

  // Vehículo
  const veh = [marca, modelo, anio].filter(Boolean).join(" ") || "-";
  const vehH = 46;
  const vehL = Math.min(2, lineas(veh, vehH, RW));
  z += `^FO${M},${y}^A0N,${vehH},${vehH}^FB${RW},2,0,L^FD${ascii(veh)}^FS`;
  y += vehL * (vehH + 2) + 8;

  // Divisor
  z += `^FO${M},${y}^GB${RW},3,3^FS`;
  y += 10;

  // Encabezado
  z += `^FO${M},${y}^A0N,24,24^FD${ascii(`TRABAJOS A REALIZAR (${items.length})`)}^FS`;
  y += 32;

  // Trabajos en grande (tamaño según cuántos haya)
  const n = items.length || 1;
  const fH = n <= 1 ? 58 : n === 2 ? 48 : n === 3 ? 40 : n === 4 ? 34 : 28;
  const gap = n <= 2 ? 12 : 7;
  const dispo = H - 6 - y;
  let usado = 0;
  items.forEach((t) => {
    const nl = Math.min(2, lineas(t, fH, RW - 10));
    const alto = nl * (fH + 4) + gap;
    if (usado + alto > dispo) return; // evita desbordar la etiqueta
    // viñeta + trabajo
    z += `^FO${M},${y + Math.round(fH / 2) - 4}^GB10,10,10^FS`;
    z += `^FO${M + 18},${y}^A0N,${fH},${fH}^FB${RW - 18},2,0,L^FD${t}^FS`;
    y += alto;
    usado += alto;
  });

  z += "^XZ";
  return z;
}
