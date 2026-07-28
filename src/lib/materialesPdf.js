import { jsPDF } from "jspdf";

const MATERIALES = ["Removedor", "Ferrer", "Lija #80", "Lija #120", "Lija #220", "Lija #40", "Lija #150", "Lija #320", "Lija #400", "Lija #600", "Lija #800", "Lija #1200", "Lija #1500", "Lija #2000", "Masken tape", "Disco adhesivo", "Presor", "Pintura laca negra", "Pintura laca", "Pintura Uretano", "Clear uretano", "Thinner", "Reductor", "Coladores", "Silicon regular", "Silicon uretano", "Abrazaderas plasticas", "Relleno Laca", "Relleno Uretano", "Masilla Polymax", "Masilla Star Glass", "Fended", "Fended especial", "Emeril", "Racine", "Aditivo P/ Plasticos", "Cinta doble cara", "Cinta decorativa", "Sea Scaler", "Varilla Bronce"];
const INK = [20, 24, 32];
const SOFT = [100, 116, 139];
const LINE = [160, 177, 196];
const RED = [220, 38, 38];
const M = 7;
const val = (x) => String(x || "-");

function dato(doc, x, y, label, value, w) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...SOFT); doc.text(label, x, y);
  doc.setFontSize(8); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(val(value), w)[0], x, y + 3.8);
}

export function generarReporteMateriales({ caso = {}, orden = {} }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210; const H = 297; const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...INK); doc.text("REPORTE DE MATERIALES", M, 12);
  doc.setFontSize(9); doc.setTextColor(...SOFT); doc.text("PARA SUMINISTROS", M, 17);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(`Fecha de impresion: ${new Date().toLocaleDateString("es-DO")}`, M, 22);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("LLAVE", W - M, 9, { align: "right" }); doc.setFontSize(21); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "-", W - M, 18, { align: "right" });

  let y = 27;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, 24, 1.2, 1.2, "S");
  const cols = [M + 3, M + 51, M + 99, M + 147]; const w = 43;
  dato(doc, cols[0], y + 5, "SEGURO", caso.aseguradora_nombre, w); dato(doc, cols[1], y + 5, "CLIENTE", caso.cliente_nombre, w); dato(doc, cols[2], y + 5, "TELEFONO", caso.cliente_telefono, w); dato(doc, cols[3], y + 5, "VEHICULO", vehiculo, w);
  dato(doc, cols[0], y + 13, "PLACA", caso.placa, w); dato(doc, cols[1], y + 13, "CHASIS", caso.chasis, w); dato(doc, cols[2], y + 13, "COLOR", caso.color, w); dato(doc, cols[3], y + 13, "DEDUCTIBLE", caso.deductible || orden.costo, w);
  dato(doc, cols[0], y + 21, "RECLAMO", caso.numero_reclamo, w); dato(doc, cols[1], y + 21, "ENTRADA", caso.fecha_ingreso, w); dato(doc, cols[2], y + 21, "SALIDA", caso.fecha_entrega ? new Date(caso.fecha_entrega).toLocaleDateString("es-DO") : "-", w); dato(doc, cols[3], y + 21, "NUMERO DE LLAVE", caso.numero_llave ? `#${caso.numero_llave}` : "Sin asignar", w);

  y += 29;
  const xs = [M, M + 36, M + 118, M + 146, M + 170, W - M];
  const headers = ["EMPLEADO", "MATERIALES", "MARCA", "CANTIDAD", "COSTO"];
  doc.setFillColor(...INK); doc.rect(M, y, CW, 7.5, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(7.1); doc.setTextColor(255, 255, 255); headers.forEach((h, i) => doc.text(h, xs[i] + 2, y + 5)); y += 7.5;
  const rowH = 5;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.25); doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...INK);
  MATERIALES.forEach((material) => {
    doc.rect(M, y, CW, rowH, "S");
    for (let i = 1; i < xs.length - 1; i += 1) doc.line(xs[i], y, xs[i], y + rowH);
    doc.text(material, xs[1] + 2, y + 3.55);
    y += rowH;
  });
  y += 6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text("TOTAL DE MATERIALES: RD$ __________________________________", M, y);
  y += 14;
  doc.setDrawColor(...INK); doc.line(M + 55, y, W - M - 55, y);
  doc.setFontSize(7.5); doc.setTextColor(...SOFT); doc.text("ENCARGADO DPTO. SUMINISTRO", W / 2, y + 4, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", W - M, H - 9, { align: "right" });
  return doc.output("blob");
}
