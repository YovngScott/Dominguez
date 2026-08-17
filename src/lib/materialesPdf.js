import { jsPDF } from "jspdf";

const MATERIALES = ["Removedor", "Ferrer", "Lija #80", "Lija #120", "Lija #220", "Lija #40", "Lija #150", "Lija #320", "Lija #400", "Lija #600", "Lija #800", "Lija #1200", "Lija #1500", "Lija #2000", "Masken tape", "Disco adhesivo", "Presor", "Pintura laca negra", "Pintura laca", "Pintura Uretano", "Clear uretano", "Thinner", "Reductor", "Coladores", "Silicon regular", "Silicon uretano", "Abrazaderas plasticas", "Relleno Laca", "Relleno Uretano", "Masilla Polymax", "Masilla Star Glass", "Fended", "Fended especial", "Emeril", "Racine", "Aditivo P/ Plasticos", "Cinta doble cara", "Cinta decorativa", "Sea Scaler", "Varilla Bronce"];
const INK = [20, 24, 32];
const SOFT = [100, 116, 139];
const LINE = [160, 177, 196];
const RED = [220, 38, 38];
const M = 7;
const val = (x) => String(x || "-");

function dato(doc, x, y, label, value, w) {
  // Tipografía cómoda para lectura en papel, manteniendo el bloque compacto.
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...RED); doc.text(label, x, y);
  doc.setFontSize(9.6); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(val(value), w)[0], x, y + 3.5);
}

// Formato compacto de UNA hoja, igual a la hoja física anterior. Los datos del
// caso se imprimen arriba y se conserva el espacio manual para suministros.
export function generarReporteMateriales({ caso = {}, orden = {} }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210; const H = 297; const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...INK); doc.text("REPORTE DE MATERIALES", M, 8);
  doc.setFontSize(8.5); doc.setTextColor(...SOFT); doc.text("PARA SUMINISTROS", M, 11.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...RED); doc.text(`FECHA DE IMPRESION: ${new Date().toLocaleDateString("es-DO")}`, M, 14.5);
  doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("LLAVE", W - M, 6.5, { align: "right" }); doc.setFontSize(17); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "-", W - M, 13, { align: "right" });

  let y = 17;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, 21, 1.2, 1.2, "S");
  const cols = [M + 3, M + 51, M + 99, M + 147]; const w = 43;
  dato(doc, cols[0], y + 4, "SEGURO", caso.aseguradora_nombre, w); dato(doc, cols[1], y + 4, "CLIENTE", caso.cliente_nombre, w); dato(doc, cols[2], y + 4, "TELEFONO", caso.cliente_telefono, w); dato(doc, cols[3], y + 4, "VEHICULO", vehiculo, w);
  dato(doc, cols[0], y + 10.5, "PLACA", caso.placa, w); dato(doc, cols[1], y + 10.5, "CHASIS", caso.chasis, w); dato(doc, cols[2], y + 10.5, "COLOR", caso.color, w); dato(doc, cols[3], y + 10.5, "DEDUCTIBLE", caso.deductible || orden.costo, w);
  dato(doc, cols[0], y + 17, "RECLAMO", caso.numero_reclamo, w); dato(doc, cols[1], y + 17, "ENTRADA", caso.fecha_ingreso, w); dato(doc, cols[2], y + 17, "SALIDA", caso.fecha_entrega ? new Date(caso.fecha_entrega).toLocaleDateString("es-DO") : "-", w); dato(doc, cols[3], y + 17, "NUMERO DE LLAVE", caso.numero_llave ? `#${caso.numero_llave}` : "Sin asignar", w);

  y += 24;
  const xs = [M, M + 36, M + 118, M + 146, M + 170, W - M];
  const headers = ["EMPLEADO", "MATERIALES", "MARCA", "CANTIDAD", "COSTO"];
  doc.setFillColor(...INK); doc.rect(M, y, CW, 5.8, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(9.2); doc.setTextColor(255, 255, 255); headers.forEach((h, i) => doc.text(h, xs[i] + 2, y + 4.1)); y += 5.8;
  // Se reserva el pie para el número de llave y se prioriza una letra mayor.
  const rowH = 5.85;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.setFont("helvetica", "bold"); doc.setFontSize(11.8); doc.setTextColor(...INK);
  MATERIALES.forEach((material) => {
    doc.rect(M, y, CW, rowH, "S");
    for (let i = 1; i < xs.length - 1; i += 1) doc.line(xs[i], y, xs[i], y + rowH);
    doc.text(material, xs[1] + 2, y + 4.35);
    y += rowH;
  });
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...RED);
  doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", W - M, H - 7, { align: "right" });
  return doc.output("blob");
}
