// Genera ZPL (lenguaje de impresoras térmicas) para las etiquetas de piezas,
// equivalente al PDF de piezasLabelPdf pero para imprimir directo vía el
// print server (impresora 4BARCODE 4B-2074B, 203 dpi). Una etiqueta de 4x2".
//
// Notas:
//  - 203 dpi = 8 dots/mm → 4" = 812 dots de ancho, 2" = 406 de alto.
//  - El print server escribe el ZPL a un archivo en ASCII, así que el texto se
//    transute a ASCII (sin acentos) para que no se dañe. Para una etiqueta de
//    taller es perfectamente legible.

const W = 812; // 4" @ 203 dpi
const H = 406; // 2"
const LX = 18; // margen izquierdo
const RW = W - LX * 2; // ancho útil

// Quita acentos y caracteres que rompen ZPL (^ ~ \).
function ascii(s) {
  return String(s == null ? "" : s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\^~\\]/g, " ")
    .trim();
}

// Estima cuántas líneas ocupa un texto a una altura de fuente dada dentro de
// un ancho (en dots). La fuente 0 de ZPL es ~0.58·altura de ancho por carácter.
function lineas(texto, fontH, anchoDots) {
  const charW = fontH * 0.58;
  const porLinea = Math.max(1, Math.floor(anchoDots / charW));
  return Math.max(1, Math.ceil(ascii(texto).length / porLinea));
}

function campo(x, y, fontH, texto, anchoDots, maxLineas) {
  const t = ascii(texto);
  if (!t) return "";
  const nl = Math.min(maxLineas || 1, lineas(t, fontH, anchoDots));
  return `^FO${x},${y}^A0N,${fontH},${fontH}^FB${anchoDots},${nl},0,L^FD${t}^FS`;
}

// Construye una etiqueta (un ^XA…^XZ) con el encabezado + un grupo de piezas.
function etiqueta(caso, grupo) {
  let z = `^XA^PW${W}^LL${H}^LH0,0`;
  let y = 16;

  // Vehículo
  const veh = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "-";
  const vehH = 40;
  const vehL = Math.min(2, lineas(veh, vehH, RW));
  z += campo(LX, y, vehH, veh, RW, 2);
  y += vehL * (vehH + 2) + 6;

  // Aseguradora
  if (ascii(caso.aseguradora_nombre)) {
    const h = 32;
    const l = Math.min(2, lineas(caso.aseguradora_nombre, h, RW));
    z += campo(LX, y, h, caso.aseguradora_nombre, RW, 2);
    y += l * (h + 2) + 4;
  }

  // Reclamo (prominente)
  if (ascii(caso.numero_reclamo)) {
    const h = 30;
    z += campo(LX, y, h, `Reclamo ${ascii(caso.numero_reclamo)}`, RW, 1);
    y += h + 6;
  }

  // Datos secundarios (placa, chasis, asegurado)
  const sec = [
    caso.placa ? `Placa ${ascii(caso.placa)}` : null,
    caso.chasis ? `Chasis ${ascii(caso.chasis)}` : null,
    caso.cliente_nombre ? ascii(caso.cliente_nombre) : null,
  ].filter(Boolean);
  if (sec.length) {
    const h = 20;
    const txt = sec.join("   -   ");
    const l = Math.min(2, lineas(txt, h, RW));
    z += campo(LX, y, h, txt, RW, 2);
    y += l * (h + 2) + 4;
  }

  // Línea divisoria
  y += 2;
  z += `^FO${LX},${y}^GB${RW},2,2^FS`;
  y += 10;

  // "PIEZAS (n)"
  z += `^FO${LX},${y}^A0N,26,26^FD${ascii(`PIEZAS (${grupo.length})`)}^FS`;
  y += 34;

  // Lista de piezas con casilla
  const pieceH = 28;
  const textX = LX + 38;
  const textW = W - textX - LX - 56; // deja espacio a la derecha para "xN"
  grupo.forEach((p) => {
    z += `^FO${LX},${y - 2}^GB26,26,3^FS`; // casilla
    const nl = Math.min(2, lineas(p.nombre, pieceH, textW));
    z += campo(textX, y, pieceH, p.nombre || "Pieza", textW, 2);
    if (Number(p.cantidad) > 1) {
      z += `^FO${W - LX - 52},${y}^A0N,24,24^FD${ascii(`x${p.cantidad}`)}^FS`;
    }
    y += Math.max(32, nl * (pieceH + 2)) + 6;
  });

  z += "^XZ";
  return z;
}

function normalizarCajas(cajas, piezas) {
  if (cajas && cajas.length) return cajas.map((c) => (Array.isArray(c) ? c : c.piezas || []));
  return [piezas || []];
}

// Reparte una caja en grupos que caben en el alto de la etiqueta.
function repartir(caso, piezasCaja) {
  // Estima el alto del encabezado (en dots) tal como lo dibuja etiqueta():
  let header = 16;
  const vehL = Math.min(2, lineas([caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "-", 40, RW));
  header += vehL * 42 + 6;
  if (ascii(caso.aseguradora_nombre)) header += Math.min(2, lineas(caso.aseguradora_nombre, 32, RW)) * 34 + 4;
  if (ascii(caso.numero_reclamo)) header += 36;
  const sec = [caso.placa, caso.chasis, caso.cliente_nombre].filter(Boolean);
  if (sec.length) header += Math.min(2, lineas(sec.join("   -   "), 20, RW)) * 22 + 4;
  header += 12 + 34; // divisor + "PIEZAS (n)"

  const dispo = H - 2 - header; // alto disponible para piezas
  const textW = W - (LX + 38) - LX - 56;

  const grupos = [];
  let actual = [];
  let alto = 0;
  for (const p of piezasCaja) {
    const nl = Math.min(2, lineas(p.nombre, 28, textW));
    const h = Math.max(32, nl * 30) + 6;
    if (actual.length && alto + h > dispo) {
      grupos.push(actual);
      actual = [];
      alto = 0;
    }
    actual.push(p);
    alto += h;
  }
  if (actual.length) grupos.push(actual);
  return grupos.length ? grupos : [[]];
}

/**
 * Devuelve el ZPL (varias etiquetas concatenadas) para imprimir directo.
 * Mismos parámetros que generarPdfEtiquetas.
 */
export function generarZplEtiquetas({ caso = {}, cajas = null, piezas = null }) {
  const listaCajas = normalizarCajas(cajas, piezas);
  let zpl = "";
  listaCajas.forEach((piezasCaja) => {
    repartir(caso, piezasCaja).forEach((grupo) => {
      zpl += etiqueta(caso, grupo);
    });
  });
  return zpl;
}
