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

// Tamaño de las piezas según cuántas haya: pocas = letra grande (legible de
// lejos); muchas = letra normal para que quepan todas.
function sizing(n) {
  const pieceH = n <= 1 ? 56 : n === 2 ? 46 : n === 3 ? 38 : n === 4 ? 32 : 26;
  const boxS = n <= 1 ? 38 : n === 2 ? 32 : n <= 4 ? 28 : 24;
  const gap = n <= 2 ? 12 : 7;
  return { pieceH, boxS, gap };
}

// Fecha y hora actual, formato "dd/mm/aaaa hh:mm" (hora local).
function fechaHoraAhora() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}  ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// Construye una etiqueta (un ^XA…^XZ) con el encabezado + un grupo de piezas.
// Si hay qrUrl, dibuja un QR arriba a la derecha (abre el caso al escanearlo).
function etiqueta(caso, grupo, qrUrl, sello) {
  let z = `^XA^PW${W}^LL${H}^LH0,0`;
  let y = 16;

  // QR arriba a la derecha. Magnificación 3 (no 4): con la URL real (que lleva
  // el UUID del caso) el QR es de ~41 módulos; a mag 4 se salía del borde y
  // bajaba tapando la fecha. A mag 3 (~124 dots) cabe en su esquina.
  const QRW = 128; // ancho aprox. del QR a mag 3
  const headW = qrUrl ? RW - (QRW + 20) : RW;
  if (qrUrl) {
    z += `^FO${W - 8 - QRW},10^BQN,2,3^FDLA,${ascii(qrUrl)}^FS`;
  }

  // Vehículo
  const veh = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "-";
  const vehH = 40;
  const vehL = Math.min(2, lineas(veh, vehH, headW));
  z += campo(LX, y, vehH, veh, headW, 2);
  y += vehL * (vehH + 2) + 6;

  // Aseguradora
  if (ascii(caso.aseguradora_nombre)) {
    const h = 32;
    const l = Math.min(2, lineas(caso.aseguradora_nombre, h, headW));
    z += campo(LX, y, h, caso.aseguradora_nombre, headW, 2);
    y += l * (h + 2) + 4;
  }

  // Reclamo (prominente)
  if (ascii(caso.numero_reclamo)) {
    const h = 30;
    z += campo(LX, y, h, `Reclamo ${ascii(caso.numero_reclamo)}`, headW, 1);
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
    // bajo el QR ya hay espacio: si el encabezado superó la zona del QR usa todo el ancho
    const w = y > 150 ? RW : headW;
    const l = Math.min(2, lineas(txt, h, w));
    z += campo(LX, y, h, txt, w, 2);
    y += l * (h + 2) + 4;
  }

  // Fecha y hora (encima de la línea, alineada a la derecha).
  if (sello) {
    const h = 24;
    z += `^FO${LX},${y}^A0N,${h},${h}^FB${RW},1,0,R^FD${ascii(sello)}^FS`;
    y += h + 4;
  }

  // Línea divisoria
  y += 2;
  z += `^FO${LX},${y}^GB${RW},2,2^FS`;
  y += 10;

  // "PIEZAS (n)"
  z += `^FO${LX},${y}^A0N,26,26^FD${ascii(`PIEZAS (${grupo.length})`)}^FS`;
  y += 34;

  // Lista de piezas con casilla. El tamaño depende de CUÁNTAS piezas haya:
  // pocas = letra grande (legible de lejos en el almacén); muchas = letra
  // normal para que quepan todas.
  const { pieceH, boxS, gap } = sizing(grupo.length);
  const textX = LX + boxS + 12;
  const textW = W - textX - LX - 64; // espacio a la derecha para "xN"

  grupo.forEach((p) => {
    const nl = Math.min(2, lineas(p.nombre, pieceH, textW));
    const boxY = y + Math.max(0, Math.round((pieceH - boxS) / 2)); // casilla centrada con la 1ª línea
    z += `^FO${LX},${boxY}^GB${boxS},${boxS},3^FS`;
    z += `^FO${textX},${y}^A0N,${pieceH},${pieceH}^FB${textW},2,0,L^FD${ascii(p.nombre || "Pieza")}^FS`;
    if (Number(p.cantidad) > 1) {
      const qh = Math.min(34, Math.round(pieceH * 0.6));
      z += `^FO${W - LX - 58},${y}^A0N,${qh},${qh}^FD${ascii(`x${p.cantidad}`)}^FS`;
    }
    y += Math.max(boxS, nl * (pieceH + 4)) + gap;
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
  header += 28; // línea de fecha/hora
  header += 12 + 34; // divisor + "PIEZAS (n)"

  const dispo = H - 2 - header; // alto disponible para piezas
  const textW = W - (LX + 38) - LX - 56;

  const grupos = [];
  let actual = [];
  let alto = 0;
  for (const p of piezasCaja) {
    // Se estima con fuente 32 (la que usa un grupo de 4) para que los nombres
    // largos que envuelven a 2 líneas hagan agrupar menos y no se corten.
    const nl = Math.min(2, lineas(p.nombre, 32, textW));
    const h = Math.max(34, nl * 34) + 6;
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
export function generarZplEtiquetas({ caso = {}, cajas = null, piezas = null, qrUrl = null }) {
  const listaCajas = normalizarCajas(cajas, piezas);
  const sello = fechaHoraAhora();
  let zpl = "";
  listaCajas.forEach((piezasCaja) => {
    repartir(caso, piezasCaja).forEach((grupo) => {
      zpl += etiqueta(caso, grupo, qrUrl, sello);
    });
  });
  return zpl;
}
