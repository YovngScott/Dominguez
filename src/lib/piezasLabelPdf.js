import { jsPDF } from "jspdf";

// Tamaño real de las etiquetas del rollo (impresora térmica 2Connet 2C-LP427B): 4 x 2".
// Si cambias de rollo, ajusta LABEL_W / LABEL_H (mm) y el tamaño de papel
// seleccionado en el diálogo de impresión.
const LABEL_W = 101.6; // 4"
const LABEL_H = 50.8; // 2"
const M = 4;
const PIE = 2.5; // margen inferior reservado

const TINTA = [20, 20, 20];
const GRIS = [120, 124, 132];
const LINEA = [190, 192, 196];

const PIEZA_FONT = 8.5;
const PIEZA_LINE_H = 3.4; // alto por línea del nombre de una pieza
const PIEZA_PAD = 0.9; // separación entre piezas

const contentW = LABEL_W - M * 2;

function linea(doc, x, y, w) {
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

// Dibuja (o solo mide con medir=true) el encabezado compartido por todas las
// hojas de un mismo caso: vehículo + aseguradora + reclamo + datos
// secundarios. Compacto para la etiqueta de 4x2". Los textos largos bajan de
// línea en vez de cortarse. Devuelve la y tras la línea divisoria.
function encabezado(doc, caso, medir) {
  let y = M;

  // Vehículo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  const titulo = doc.splitTextToSize([caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "—", contentW);
  if (!medir) {
    doc.setTextColor(...TINTA);
    doc.text(titulo, M, y + 0.5);
  }
  y += 0.5 + titulo.length * 4.4 + 0.5;

  // Aseguradora
  if (caso.aseguradora_nombre && String(caso.aseguradora_nombre).trim()) {
    doc.setFontSize(9);
    const ln = doc.splitTextToSize(String(caso.aseguradora_nombre), contentW);
    if (!medir) {
      doc.setTextColor(...TINTA);
      doc.text(ln, M, y);
    }
    y += ln.length * 3.7 + 0.3;
  }

  // Reclamo (prominente, debajo de la aseguradora)
  if (caso.numero_reclamo && String(caso.numero_reclamo).trim()) {
    doc.setFontSize(8.5);
    if (!medir) {
      doc.setTextColor(...TINTA);
      doc.text(`Reclamo ${caso.numero_reclamo}`, M, y);
    }
    y += 3.6;
  }

  // Datos secundarios (placa, chasis, asegurado) en una línea gris que envuelve
  const sec = [
    caso.placa ? `Placa ${caso.placa}` : null,
    caso.chasis ? `Chasis ${caso.chasis}` : null,
    caso.cliente_nombre || null,
  ].filter((v) => v && String(v).trim());
  if (sec.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const ln = doc.splitTextToSize(sec.join("   ·   "), contentW);
    if (!medir) {
      doc.setTextColor(...GRIS);
      doc.text(ln, M, y);
    }
    y += ln.length * 3.0 + 0.3;
  }

  y += 0.4;
  if (!medir) linea(doc, M, y, contentW);
  y += 2.2;
  return y;
}

// Dibuja una hoja completa: encabezado + "PIEZAS"/indicador de caja + lista.
function renderHoja(doc, caso, pagina, totalCajas) {
  const { grupo, cajaIdx, grupoIdx, totalGrupos } = pagina;
  let y = encabezado(doc, caso, false);

  // Encabezado de piezas + indicador de caja
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...TINTA);
  doc.text(`PIEZAS (${grupo.length})`, M, y);

  let cajaTxt = "";
  if (totalCajas > 1) cajaTxt = `CAJA ${cajaIdx + 1} DE ${totalCajas}`;
  if (totalGrupos > 1) cajaTxt += `${cajaTxt ? " · " : ""}${grupoIdx + 1}/${totalGrupos}`;
  if (cajaTxt) doc.text(cajaTxt, M + contentW, y, { align: "right" });
  y += 3.6;

  // Lista de piezas (cada pieza envuelve si no cabe en el ancho)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PIEZA_FONT);
  grupo.forEach((p) => {
    const lineas = doc.splitTextToSize(p.nombre || "Pieza", contentW - 16);

    // casilla para marcar a mano (alineada a la 1ª línea)
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.3);
    doc.rect(M, y - 2.3, 2.7, 2.7);

    doc.setFontSize(PIEZA_FONT);
    doc.setTextColor(...TINTA);
    lineas.forEach((ln, li) => doc.text(ln, M + 5.4, y + li * PIEZA_LINE_H));

    if (p.cantidad > 1) {
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(`x${p.cantidad}`, M + contentW, y, { align: "right" });
      doc.setFontSize(PIEZA_FONT);
    }
    y += lineas.length * PIEZA_LINE_H + PIEZA_PAD;
  });

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.6);
  doc.setTextColor(...GRIS);
  const piePartes = [
    caso.numero_poliza ? `Póliza ${caso.numero_poliza}` : null,
    new Date().toLocaleDateString("es-DO"),
  ].filter(Boolean);
  doc.text(piePartes.join("   ·   "), M, LABEL_H - 1.8);
}

// Reparte las piezas de una caja en grupos que quepan en el espacio disponible
// (mide cada pieza, ya envuelta, para que nunca se corte ni se desborde).
function repartirPorEspacio(doc, piezas, espacio) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PIEZA_FONT);
  const grupos = [];
  let actual = [];
  let alto = 0;
  for (const p of piezas) {
    const nl = doc.splitTextToSize(p.nombre || "Pieza", contentW - 16).length;
    const h = nl * PIEZA_LINE_H + PIEZA_PAD;
    if (actual.length && alto + h > espacio) {
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

// Normaliza la entrada a una lista de cajas (cada una con su arreglo de piezas).
// Acepta el formato nuevo (cajas) y el viejo (piezas = una sola caja).
function normalizarCajas(cajas, piezas) {
  if (cajas && cajas.length) {
    return cajas.map((c) => (Array.isArray(c) ? c : c.piezas || []));
  }
  return [piezas || []];
}

/**
 * Genera un PDF de etiquetas térmicas de 4x2" para marcar las cajas de un
 * vehículo. Cada caja va en su propia hoja (con su checklist de piezas); si
 * una caja tiene muchas piezas y no caben, se reparte en varias hojas según
 * el espacio real. Los textos largos (seguro, piezas, etc.) bajan de línea
 * en vez de cortarse.
 *
 * @param caso   datos del vehículo/seguro (compartidos por todas las cajas)
 * @param cajas  [{ piezas: [{nombre, cantidad}] }, ...]  (formato nuevo)
 * @param piezas [{nombre, cantidad}]  (formato viejo: una sola caja)
 */
export async function generarPdfEtiquetas({ caso = {}, cajas = null, piezas = null }) {
  const listaCajas = normalizarCajas(cajas, piezas);
  const totalCajas = listaCajas.length;

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [LABEL_W, LABEL_H] });

  // El encabezado es igual en todas las hojas de un mismo caso: se mide una
  // vez para saber cuánto espacio queda para las piezas.
  const yPiezas = encabezado(doc, caso, true) + 3.6; // +3.6 = línea "PIEZAS (n)"
  const espacioPiezas = LABEL_H - PIE - yPiezas;

  const paginas = [];
  listaCajas.forEach((piezasCaja, ci) => {
    const grupos = repartirPorEspacio(doc, piezasCaja, espacioPiezas);
    grupos.forEach((grupo, gi) => {
      paginas.push({ grupo, cajaIdx: ci, grupoIdx: gi, totalGrupos: grupos.length });
    });
  });

  paginas.forEach((pagina, idx) => {
    if (idx > 0) doc.addPage([LABEL_W, LABEL_H], "landscape");
    renderHoja(doc, caso, pagina, totalCajas);
  });

  return doc.output("blob");
}
