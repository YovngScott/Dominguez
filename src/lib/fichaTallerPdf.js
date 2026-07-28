import { jsPDF } from "jspdf";

const INK = [20, 24, 32];
const SOFT = [100, 116, 139];
const LINE = [203, 213, 225];
const RED = [220, 38, 38];
const M = 14;

const fechaImpresion = () => new Date().toLocaleDateString("es-DO", { day: "2-digit", month: "long", year: "numeric" });
const texto = (v) => String(v || "—");

function dato(doc, x, y, label, value, w) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...SOFT); doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(texto(value), w)[0], x, y + 4.5);
}

export function generarFichaTaller({ caso, piezas = [], manoObra = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight(); const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");

  doc.setFillColor(...INK); doc.rect(0, 0, W, 28, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(255, 255, 255); doc.text("FICHA DE TALLER", M, 15);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.text(`Impreso: ${fechaImpresion()}`, M, 21);
  doc.setFillColor(...RED); doc.roundedRect(W - M - 34, 6, 34, 17, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(255, 255, 255); doc.text("NÚMERO DE LLAVE", W - M - 17, 11, { align: "center" });
  doc.setFontSize(21); doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "SIN #", W - M - 17, 19, { align: "center" });

  let y = 37; doc.setDrawColor(...LINE); doc.roundedRect(M, y, CW, 34, 2, 2, "S");
  const a = M + 5; const b = M + CW / 2 + 3; const col = CW / 2 - 9;
  dato(doc, a, y + 7, "Seguro", caso.aseguradora_nombre, col); dato(doc, b, y + 7, "Vehículo", vehiculo, col);
  dato(doc, a, y + 17, "Cliente", caso.cliente_nombre, col); dato(doc, b, y + 17, "Placa", caso.placa, col);
  dato(doc, a, y + 27, "Teléfono", caso.cliente_telefono, col); dato(doc, b, y + 27, "Reclamo", caso.numero_reclamo, col);
  y += 43;

  const section = (x, title, items, getText) => {
    const w = (CW - 6) / 2; const bottom = H - 31;
    doc.setFillColor(241, 245, 249); doc.roundedRect(x, y, w, bottom - y, 2, 2, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...RED); doc.text(title, x + 4, y + 7);
    doc.setDrawColor(...LINE); doc.line(x + 4, y + 10, x + w - 4, y + 10);
    let iy = y + 16;
    if (!items.length) { doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...SOFT); doc.text("Sin registros.", x + 4, iy); return; }
    items.slice(0, 18).forEach((it, i) => {
      const lines = doc.splitTextToSize(getText(it), w - 20).slice(0, 2);
      if (iy + lines.length * 4 > bottom - 4) return;
      doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...SOFT); doc.text(String(i + 1).padStart(2, "0"), x + 4, iy);
      doc.setFont("helvetica", "normal"); doc.setTextColor(...INK); doc.text(lines, x + 12, iy);
      const cant = Number(it.cantidad) || 1; doc.setFont("helvetica", "bold"); doc.text(`x${cant}`, x + w - 4, iy, { align: "right" });
      iy += Math.max(6.5, lines.length * 4.1 + 2);
    });
  };
  section(M, "PIEZAS A REEMPLAZAR", piezas, (it) => it.nombre || "Pieza");
  section(M + (CW + 6) / 2, "MANO DE OBRA", manoObra, (it) => it.descripcion || it.nombre || "Trabajo");
  doc.setDrawColor(...RED); doc.setLineWidth(0.6); doc.line(M, H - 21, W - M, H - 21);
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...SOFT); doc.text("DOMINGUEZ AUTO PINTURA · FICHA INTERNA DE TALLER", M, H - 15);
  doc.setFontSize(16); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", W - M, H - 14, { align: "right" });
  return doc.output("blob");
}
