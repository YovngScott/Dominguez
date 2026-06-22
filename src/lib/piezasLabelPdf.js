import { jsPDF } from "jspdf";

// Tamaño de etiqueta para impresoras térmicas de envío (4" x 6").
// Si tu impresora usa otro tamaño de rollo, ajusta LABEL_W / LABEL_H (en mm)
// y selecciona el mismo tamaño de papel en el diálogo de impresión.
const LABEL_W = 101.6; // 4"
const LABEL_H = 152.4; // 6"
const M = 6;
const ROW_H = 8.2;

const TINTA = [17, 17, 17];
const GRIS = [110, 116, 128];
const ROJO = [200, 30, 30];
const LINEA = [222, 224, 228];
const FONDO = [246, 247, 249];

function linea(doc, x, y, w) {
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.4);
  doc.line(x, y, x + w, y);
}

// Dibuja un campo (etiqueta + valor) en (x, y); devuelve nada, el avance de
// fila lo controla quien llama (ROW_H por fila, o un valor propio).
function dato(doc, x, y, label, valor, fontSize = 9) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.2);
  doc.setTextColor(...GRIS);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  doc.setTextColor(...TINTA);
  doc.text(String(valor || "—"), x, y + 4.3);
}

/**
 * Genera un PDF con una etiqueta por página (una por pieza seleccionada),
 * pensado para imprimirse en una impresora de etiquetas térmica de 4x6"
 * (p. ej. 2Connet 2C-LP427B) y pegarse en la caja de la pieza al recibirla.
 */
export async function generarPdfEtiquetas({ caso = {}, piezas = [] }) {
  const doc = new jsPDF({ unit: "mm", format: [LABEL_W, LABEL_H] });
  const W = LABEL_W;
  const contentW = W - M * 2;
  const colX = M + contentW / 2 + 2;

  piezas.forEach((p, idx) => {
    if (idx > 0) doc.addPage([LABEL_W, LABEL_H]);
    let y = M + 2;

    // Encabezado del taller
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...ROJO);
    doc.text("DOMINGUEZ AUTO PINTURA", W / 2, y, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GRIS);
    doc.text("Etiqueta de pieza recibida", W / 2, y + 4.4, { align: "center" });
    y += 8;
    linea(doc, M, y, contentW);
    y += 6;

    // Nombre de la pieza: lo más grande y visible de la etiqueta
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    const nombreLines = doc.splitTextToSize(p.nombre || "Pieza", contentW - 8);
    const piezaBoxH = Math.max(17, nombreLines.length * 6.6 + 8);
    doc.setFillColor(...FONDO);
    doc.roundedRect(M, y, contentW, piezaBoxH, 2.5, 2.5, "F");
    doc.setTextColor(...TINTA);
    doc.text(nombreLines, W / 2, y + piezaBoxH / 2 - (nombreLines.length - 1) * 3 + 1.5, {
      align: "center",
    });
    if (p.cantidad > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(...ROJO);
      doc.text(`CANT: ${p.cantidad}`, W - M - 3, y + piezaBoxH - 3, { align: "right" });
    }
    y += piezaBoxH + 6;

    // Vehículo
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...TINTA);
    doc.text([caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "—", M, y);
    y += 6.5;
    dato(doc, M, y, "Placa", caso.placa);
    dato(doc, colX, y, "Color", caso.color);
    y += ROW_H;
    if (caso.chasis) {
      dato(doc, M, y, "Chasis", caso.chasis, 8);
      y += ROW_H;
    }

    y += 1.5;
    linea(doc, M, y, contentW);
    y += 6;

    // Asegurado + seguro (todo en cuadrícula de 2 columnas para no desbordar)
    dato(doc, M, y, "Asegurado", caso.cliente_nombre, 8.5);
    y += ROW_H;
    dato(doc, M, y, "Teléfono", caso.cliente_telefono);
    dato(doc, colX, y, "Aseguradora", caso.aseguradora_nombre, 8.5);
    y += ROW_H;
    if (caso.numero_reclamo || caso.numero_poliza) {
      dato(doc, M, y, "Reclamo", caso.numero_reclamo, 8.5);
      dato(doc, colX, y, "Póliza", caso.numero_poliza, 8.5);
    }

    // Pie: fecha de impresión
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GRIS);
    doc.text(`Impreso: ${new Date().toLocaleDateString("es-DO")}`, M, LABEL_H - 4);
  });

  return doc.output("blob");
}
