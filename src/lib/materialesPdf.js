import { jsPDF } from "jspdf";

const MATERIALES = ["Removedor", "Ferrer", "Lija #80", "Lija #120", "Lija #220", "Lija #40", "Lija #150", "Lija #320", "Lija #400", "Lija #600", "Lija #800", "Lija #1200", "Lija #1500", "Lija #2000", "Masken tape", "Disco adhesivo", "Presor", "Pintura laca negra", "Pintura laca", "Pintura Uretano", "Clear uretano", "Thinner", "Reductor", "Coladores", "Silicon regular", "Silicon uretano", "Abrazaderas plasticas", "Relleno Laca", "Relleno Uretano", "Masilla Polymax", "Masilla Star Glass", "Fended", "Fended especial", "Emeril", "Racine", "Aditivo P/ Plasticos", "Cinta doble cara", "Cinta decorativa", "Sea Scaler", "Varilla Bronce"];
const INK = [20, 24, 32];
const SOFT = [100, 116, 139];
const LINE = [160, 177, 196];
const RED = [220, 38, 38];
const M = 10;
const val = (x) => String(x || "-");

function dato(doc, x, y, label, value, w) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...SOFT); doc.text(label, x, y);
  doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(val(value), w)[0], x, y + 4);
}

function encabezadoPrincipal(doc, caso, orden) {
  const W = 210; const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor(...INK); doc.text("REPORTE DE MATERIALES", M, 13);
  doc.setFontSize(9); doc.setTextColor(...SOFT); doc.text("PARA SUMINISTROS - HOJA 1 DE 2", M, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.text(`Fecha de impresion: ${new Date().toLocaleDateString("es-DO")}`, M, 23);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("LLAVE", W - M, 10, { align: "right" }); doc.setFontSize(21); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "-", W - M, 19, { align: "right" });

  const y = 28; doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, 37, 1.2, 1.2, "S");
  const cols = [M + 3, M + 51, M + 99, M + 147]; const w = 43;
  dato(doc, cols[0], y + 6, "SEGURO", caso.aseguradora_nombre, w); dato(doc, cols[1], y + 6, "CLIENTE", caso.cliente_nombre, w); dato(doc, cols[2], y + 6, "TELEFONO", caso.cliente_telefono, w); dato(doc, cols[3], y + 6, "VEHICULO", vehiculo, w);
  dato(doc, cols[0], y + 17, "PLACA", caso.placa, w); dato(doc, cols[1], y + 17, "CHASIS", caso.chasis, w); dato(doc, cols[2], y + 17, "COLOR", caso.color, w); dato(doc, cols[3], y + 17, "DEDUCTIBLE", caso.deductible || orden.costo, w);
  dato(doc, cols[0], y + 28, "RECLAMO", caso.numero_reclamo, w); dato(doc, cols[1], y + 28, "ENTRADA", caso.fecha_ingreso, w); dato(doc, cols[2], y + 28, "SALIDA", caso.fecha_entrega ? new Date(caso.fecha_entrega).toLocaleDateString("es-DO") : "-", w); dato(doc, cols[3], y + 28, "NUMERO DE LLAVE", caso.numero_llave ? `#${caso.numero_llave}` : "Sin asignar", w);
  return 71;
}

function encabezadoContinuacion(doc, caso) {
  const W = 210; const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...INK); doc.text("REPORTE DE MATERIALES", M, 14);
  doc.setFontSize(9); doc.setTextColor(...SOFT); doc.text("CONTINUACION - HOJA 2 DE 2", M, 19);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.text("LLAVE", W - M, 11, { align: "right" }); doc.setFontSize(20); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "-", W - M, 20, { align: "right" });
  const y = 26; doc.setDrawColor(...LINE); doc.roundedRect(M, y, CW, 16, 1.2, 1.2, "S");
  dato(doc, M + 4, y + 6, "CLIENTE", caso.cliente_nombre, 55);
  dato(doc, M + 65, y + 6, "VEHICULO", vehiculo, 55);
  dato(doc, M + 126, y + 6, "RECLAMO", caso.numero_reclamo, 28);
  dato(doc, M + 158, y + 6, "LLAVE", caso.numero_llave ? `#${caso.numero_llave}` : "Sin asignar", 27);
  return 48;
}

function tablaMateriales(doc, y, materiales) {
  const W = 210; const CW = W - M * 2;
  // Columnas amplias, pensadas para que se escriba a mano con comodidad.
  const xs = [M, M + 38, M + 118, M + 143, M + 165, W - M];
  const headers = ["EMPLEADO", "MATERIALES", "MARCA", "CANTIDAD", "COSTO"];
  doc.setFillColor(...INK); doc.rect(M, y, CW, 8, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(255, 255, 255); headers.forEach((h, i) => doc.text(h, xs[i] + 2, y + 5.3));
  y += 8;
  const rowH = 9.2;
  doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
  materiales.forEach((material) => {
    doc.rect(M, y, CW, rowH, "S");
    for (let i = 1; i < xs.length - 1; i += 1) doc.line(xs[i], y, xs[i], y + rowH);
    doc.text(material, xs[1] + 2, y + 5.9);
    y += rowH;
  });
  return y;
}

export function generarReporteMateriales({ caso = {}, orden = {} }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const primera = MATERIALES.slice(0, 20);
  const segunda = MATERIALES.slice(20);
  tablaMateriales(doc, encabezadoPrincipal(doc, caso, orden), primera);

  doc.addPage();
  let y = tablaMateriales(doc, encabezadoContinuacion(doc, caso), segunda);
  y += 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK); doc.text("TOTAL DE MATERIALES: RD$ __________________________________", M, y);
  y += 15;
  doc.setDrawColor(...INK); doc.setLineWidth(0.35); doc.line(M + 55, y, 210 - M - 55, y);
  doc.setFontSize(7.5); doc.setTextColor(...SOFT); doc.text("ENCARGADO DPTO. SUMINISTRO", 105, y + 4, { align: "center" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", 210 - M, 288, { align: "right" });
  return doc.output("blob");
}
