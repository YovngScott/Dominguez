import { jsPDF } from "jspdf";

// Tamaño real de las etiquetas del rollo (impresora térmica 2Connet 2C-LP427B): 4 x 3".
// Si cambias de rollo, ajusta LABEL_W / LABEL_H (mm) y el tamaño de papel
// seleccionado en el diálogo de impresión.
const LABEL_W = 101.6; // 4"
const LABEL_H = 76.2; // 3"
const M = 5;
const MAX_POR_ETIQUETA = 7; // si una caja tiene más piezas, se reparten en varias hojas

const TINTA = [20, 20, 20];
const GRIS = [120, 124, 132];
const LINEA = [190, 192, 196];

function linea(doc, x, y, w) {
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

function campoCorto(doc, x, y, label, valor, maxW) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(...GRIS);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...TINTA);
  const v = doc.splitTextToSize(String(valor || "—"), maxW || 40)[0];
  doc.text(v, x, y + 4.2);
}

function partirEnGrupos(arr, tam) {
  const grupos = [];
  for (let i = 0; i < arr.length; i += tam) grupos.push(arr.slice(i, i + tam));
  return grupos;
}

// Dibuja una etiqueta (una hoja): vehículo + seguro arriba, "Caja N de M"
// cuando hay varias cajas, y el checklist de piezas de esa caja.
function renderEtiqueta(doc, caso, pagina, totalCajas) {
  const { grupo, cajaIdx, grupoIdx, totalGrupos } = pagina;
  const contentW = LABEL_W - M * 2;
  const mitad = contentW / 2;
  const colX = M + mitad + 2;
  let y = M;

  // ===== Vehículo =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11.5);
  doc.setTextColor(...TINTA);
  doc.text([caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "—", M, y + 1);
  y += 6.4;

  // Solo se muestran los datos que tengan valor (en etiquetas de vehículos
  // sin caso solo se llena marca/modelo/año + aseguradora).
  const datos = [
    ["Placa", caso.placa],
    ["Chasis", caso.chasis],
    ["Asegurado", caso.cliente_nombre],
    ["Aseguradora", caso.aseguradora_nombre],
  ].filter(([, v]) => v && String(v).trim());

  datos.forEach(([label, valor], idx) => {
    const x = idx % 2 === 0 ? M : colX;
    // Si el dato queda solo en su fila (sin pareja a la derecha), usa todo
    // el ancho para que no se corte (ej. el nombre de la aseguradora).
    const soloEnFila = idx % 2 === 0 && idx === datos.length - 1;
    campoCorto(doc, x, y, label, valor, soloEnFila ? contentW : mitad - 4);
    if (idx % 2 === 1) y += 7;
  });
  if (datos.length % 2 === 1) y += 7; // cierra la última fila impar

  // ===== Reclamo (debajo de la aseguradora, destacado) =====
  if (caso.numero_reclamo) {
    campoCorto(doc, M, y, "No. de reclamo", caso.numero_reclamo, contentW);
    y += 7;
  }

  y += 0.4;
  linea(doc, M, y, contentW);
  y += 4.5;

  // ===== Encabezado de piezas + indicador de caja =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TINTA);
  doc.text(`PIEZAS (${grupo.length})`, M, y);

  let cajaTxt = "";
  if (totalCajas > 1) cajaTxt = `CAJA ${cajaIdx + 1} DE ${totalCajas}`;
  if (totalGrupos > 1) cajaTxt += `${cajaTxt ? " · " : ""}${grupoIdx + 1}/${totalGrupos}`;
  if (cajaTxt) {
    doc.setTextColor(...TINTA);
    doc.text(cajaTxt, M + contentW, y, { align: "right" });
  }
  y += 5;

  // ===== Lista de piezas =====
  const n = grupo.length || 1;
  const espacioRestante = LABEL_H - 6 - y; // deja 6mm de pie
  const filaH = Math.max(4, Math.min(6.4, espacioRestante / n));
  const fontPieza = filaH >= 5 ? 9.5 : 8;

  grupo.forEach((p) => {
    // casilla para marcar a mano cuando se verifique
    doc.setDrawColor(...TINTA);
    doc.setLineWidth(0.35);
    doc.rect(M, y - 2.9, 3.2, 3.2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(fontPieza);
    doc.setTextColor(...TINTA);
    const nombre = doc.splitTextToSize(p.nombre || "Pieza", contentW - 16)[0];
    doc.text(nombre, M + 6, y);

    if (p.cantidad > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(`x${p.cantidad}`, M + contentW, y, { align: "right" });
    }
    y += filaH;
  });

  // ===== Pie =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(...GRIS);
  const piePartes = [
    caso.numero_poliza ? `Póliza ${caso.numero_poliza}` : null,
    new Date().toLocaleDateString("es-DO"),
  ].filter(Boolean);
  doc.text(piePartes.join("   ·   "), M, LABEL_H - 2.4);
}

// Normaliza la entrada a una lista de cajas, cada una con su arreglo de piezas.
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
 * una caja tiene muchas piezas, se reparte en varias hojas. Pensado para una
 * impresora térmica (p. ej. 2Connet 2C-LP427B).
 *
 * @param caso   datos del vehículo/seguro (compartidos por todas las cajas)
 * @param cajas  [{ piezas: [{nombre, cantidad}] }, ...]  (formato nuevo)
 * @param piezas [{nombre, cantidad}]  (formato viejo: una sola caja)
 */
export async function generarPdfEtiquetas({ caso = {}, cajas = null, piezas = null }) {
  const listaCajas = normalizarCajas(cajas, piezas);
  const totalCajas = listaCajas.length;

  // Una "página" (hoja) por cada grupo de hasta MAX piezas dentro de cada caja.
  const paginas = [];
  listaCajas.forEach((piezasCaja, ci) => {
    const grupos = partirEnGrupos(piezasCaja, MAX_POR_ETIQUETA);
    const reales = grupos.length ? grupos : [[]]; // una caja vacía igual imprime su hoja
    reales.forEach((grupo, gi) => {
      paginas.push({ grupo, cajaIdx: ci, grupoIdx: gi, totalGrupos: reales.length });
    });
  });

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [LABEL_W, LABEL_H] });
  paginas.forEach((pagina, idx) => {
    if (idx > 0) doc.addPage([LABEL_W, LABEL_H], "landscape");
    renderEtiqueta(doc, caso, pagina, totalCajas);
  });

  return doc.output("blob");
}
