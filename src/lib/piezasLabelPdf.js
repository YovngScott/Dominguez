import { jsPDF } from "jspdf";

// Tamaño real de las etiquetas del rollo (impresora térmica 2Connet 2C-LP427B): 4 x 3".
// Si cambias de rollo, ajusta LABEL_W / LABEL_H (mm) y el tamaño de papel
// seleccionado en el diálogo de impresión.
const LABEL_W = 101.6; // 4"
const LABEL_H = 76.2; // 3"
const M = 5;
const PIE = 5; // margen inferior reservado

const TINTA = [20, 20, 20];
const GRIS = [120, 124, 132];
const LINEA = [190, 192, 196];

const VAL_FONT = 9; // tamaño del valor de un campo
const VAL_LINE_H = 3.3; // alto por línea del valor
const PIEZA_FONT = 9;
const PIEZA_LINE_H = 3.8; // alto por línea del nombre de una pieza
const PIEZA_PAD = 1.6; // separación entre piezas

const contentW = LABEL_W - M * 2;
const mitad = contentW / 2;
const colX = M + mitad + 2;

function linea(doc, x, y, w) {
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

// Dibuja "LABEL" + valor; si el valor no cabe en el ancho, baja a la
// siguiente línea (no se corta). Devuelve el alto total usado. Con medir=true
// solo calcula el alto, sin dibujar.
function campoCorto(doc, x, y, label, valor, maxW, medir) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(VAL_FONT);
  const lineas = doc.splitTextToSize(String(valor || "—"), maxW || 40);
  if (!medir) {
    doc.setFontSize(6.2);
    doc.setTextColor(...GRIS);
    doc.text(label.toUpperCase(), x, y);
    doc.setFontSize(VAL_FONT);
    doc.setTextColor(...TINTA);
    doc.text(lineas, x, y + 3.4);
  }
  return 3.4 + lineas.length * VAL_LINE_H;
}

// Dibuja (o solo mide) el encabezado compartido: vehículo + datos del seguro
// + reclamo + línea divisoria. Devuelve la y donde empieza la lista de piezas.
function encabezado(doc, caso, medir) {
  let y = M;

  // Vehículo (envuelve si es muy largo)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  const titulo = doc.splitTextToSize([caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "—", contentW);
  if (!medir) {
    doc.setTextColor(...TINTA);
    doc.text(titulo, M, y + 1);
  }
  y += 1 + titulo.length * 5.0 + 0.6;

  // Solo se muestran los datos con valor; en pares (2 columnas), el alto de
  // la fila lo marca el campo más alto para que no se encimen.
  const datos = [
    ["Placa", caso.placa],
    ["Chasis", caso.chasis],
    ["Asegurado", caso.cliente_nombre],
    ["Aseguradora", caso.aseguradora_nombre],
  ].filter(([, v]) => v && String(v).trim());

  for (let i = 0; i < datos.length; i += 2) {
    const izq = datos[i];
    const der = datos[i + 1];
    const solo = !der; // sin pareja → usa todo el ancho (no se corta)
    const hIzq = campoCorto(doc, M, y, izq[0], izq[1], solo ? contentW : mitad - 4, medir);
    const hDer = der ? campoCorto(doc, colX, y, der[0], der[1], mitad - 4, medir) : 0;
    y += Math.max(hIzq, hDer) + 0.6;
  }

  if (caso.numero_reclamo) {
    const h = campoCorto(doc, M, y, "No. de reclamo", caso.numero_reclamo, contentW, medir);
    y += h + 0.6;
  }

  y += 0.4;
  if (!medir) linea(doc, M, y, contentW);
  y += 3.5;
  return y;
}

// Dibuja una hoja completa: encabezado + "PIEZAS"/indicador de caja + lista.
function renderHoja(doc, caso, pagina, totalCajas) {
  const { grupo, cajaIdx, grupoIdx, totalGrupos } = pagina;
  let y = encabezado(doc, caso, false);

  // Encabezado de piezas + indicador de caja
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TINTA);
  doc.text(`PIEZAS (${grupo.length})`, M, y);

  let cajaTxt = "";
  if (totalCajas > 1) cajaTxt = `CAJA ${cajaIdx + 1} DE ${totalCajas}`;
  if (totalGrupos > 1) cajaTxt += `${cajaTxt ? " · " : ""}${grupoIdx + 1}/${totalGrupos}`;
  if (cajaTxt) doc.text(cajaTxt, M + contentW, y, { align: "right" });
  y += 5;

  // Lista de piezas (cada pieza envuelve si no cabe en el ancho)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(PIEZA_FONT);
  grupo.forEach((p) => {
    const lineas = doc.splitTextToSize(p.nombre || "Pieza", contentW - 18);

    // casilla para marcar a mano (alineada a la 1ª línea)
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.35);
    doc.rect(M, y - 2.6, 3.0, 3.0);

    doc.setFontSize(PIEZA_FONT);
    doc.setTextColor(...TINTA);
    lineas.forEach((ln, li) => doc.text(ln, M + 6, y + li * PIEZA_LINE_H));

    if (p.cantidad > 1) {
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(`x${p.cantidad}`, M + contentW, y, { align: "right" });
      doc.setFontSize(PIEZA_FONT);
    }
    y += lineas.length * PIEZA_LINE_H + PIEZA_PAD;
  });

  // Pie
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(...GRIS);
  const piePartes = [
    caso.numero_poliza ? `Póliza ${caso.numero_poliza}` : null,
    new Date().toLocaleDateString("es-DO"),
  ].filter(Boolean);
  doc.text(piePartes.join("   ·   "), M, LABEL_H - 2.4);
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
    const nl = doc.splitTextToSize(p.nombre || "Pieza", contentW - 18).length;
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
 * Genera un PDF de etiquetas térmicas de 4x3" para marcar las cajas de un
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
  const yPiezas = encabezado(doc, caso, true) + 5; // +5 = línea "PIEZAS (n)"
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
