import { jsPDF } from "jspdf";

// Tamaño real de las etiquetas del rollo (impresora térmica 2Connet 2C-LP427B): 4 x 3".
// Si cambias de rollo, ajusta LABEL_W / LABEL_H (mm) y el tamaño de papel
// seleccionado en el diálogo de impresión.
const LABEL_W = 101.6; // 4"
const LABEL_H = 76.2; // 3"
const M = 5;
const MAX_POR_ETIQUETA = 9; // si hay más piezas, se reparten en varias etiquetas

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
  doc.setFontSize(5.4);
  doc.setTextColor(...GRIS);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...TINTA);
  const v = doc.splitTextToSize(String(valor || "—"), maxW || 40)[0];
  doc.text(v, x, y + 3.6);
}

function partirEnGrupos(arr, tam) {
  const grupos = [];
  for (let i = 0; i < arr.length; i += tam) grupos.push(arr.slice(i, i + tam));
  return grupos;
}

/**
 * Genera un PDF con una etiqueta por cada grupo de piezas seleccionadas
 * (todas las piezas elegidas salen juntas en la(s) misma(s) etiqueta(s),
 * no una por pieza), pensado para una impresora térmica de 4x3"
 * (p. ej. 2Connet 2C-LP427B) y pegarse en la caja al recibir las piezas.
 */
export async function generarPdfEtiquetas({ caso = {}, piezas = [] }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [LABEL_W, LABEL_H] });
  const contentW = LABEL_W - M * 2;
  const mitad = contentW / 2;
  const colX = M + mitad + 2;

  const grupos = partirEnGrupos(piezas, MAX_POR_ETIQUETA);

  grupos.forEach((grupo, gi) => {
    if (gi > 0) doc.addPage([LABEL_W, LABEL_H], "landscape");
    let y = M;

    // ===== Encabezado =====
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...TINTA);
    doc.text("DOMINGUEZ AUTO PINTURA", LABEL_W / 2, y, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.8);
    doc.setTextColor(...GRIS);
    const sub = grupos.length > 1 ? `Piezas recibidas (${gi + 1}/${grupos.length})` : "Piezas recibidas";
    doc.text(sub, LABEL_W / 2, y + 3.6, { align: "center" });
    y += 6.5;
    linea(doc, M, y, contentW);
    y += 4.5;

    // ===== Vehículo + asegurado (compacto, 2 columnas) =====
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...TINTA);
    doc.text([caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ") || "—", M, y);
    y += 4.6;

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
      campoCorto(doc, x, y, label, valor, mitad - 4);
      if (idx % 2 === 1) y += 6;
    });
    if (datos.length % 2 === 1) y += 6; // cierra la última fila impar
    y += 0.2;
    linea(doc, M, y, contentW);
    y += 4;

    // ===== Lista de piezas =====
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...TINTA);
    doc.text(`PIEZAS (${grupo.length})`, M, y);
    y += 4.5;

    const espacioRestante = LABEL_H - 6 - y; // deja 6mm de pie
    const filaH = Math.max(3.6, Math.min(5.2, espacioRestante / grupo.length));
    const fontPieza = filaH >= 4.6 ? 8.2 : 7;

    grupo.forEach((p) => {
      // casilla para marcar a mano cuando se verifique
      doc.setDrawColor(...TINTA);
      doc.setLineWidth(0.3);
      doc.rect(M, y - 2.6, 2.6, 2.6);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontPieza);
      doc.setTextColor(...TINTA);
      const nombre = doc.splitTextToSize(p.nombre || "Pieza", contentW - 14)[0];
      doc.text(nombre, M + 5, y);

      if (p.cantidad > 1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.setTextColor(...GRIS);
        doc.text(`x${p.cantidad}`, M + contentW, y, { align: "right" });
      }
      y += filaH;
    });

    // ===== Pie =====
    let pieY = LABEL_H - 4.8;
    if (caso.numero_reclamo) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(...TINTA);
      doc.text(`Reclamo ${caso.numero_reclamo}`, M, pieY);
      pieY -= 3.2;
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.8);
    doc.setTextColor(...GRIS);
    const piePartes = [
      caso.numero_poliza ? `Póliza ${caso.numero_poliza}` : null,
      new Date().toLocaleDateString("es-DO"),
    ].filter(Boolean);
    doc.text(piePartes.join("   ·   "), M, pieY);
  });

  return doc.output("blob");
}
