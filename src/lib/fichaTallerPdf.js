import { jsPDF } from "jspdf";

const INK = [20, 24, 32];
const SOFT = [100, 116, 139];
const LINE = [190, 200, 212];
const RED = [220, 38, 38];
const M = 11;

const fechaImpresion = () => new Date().toLocaleDateString("es-DO", { day: "2-digit", month: "long", year: "numeric" });
const texto = (v) => String(v || "-");

function dato(doc, x, y, label, value, w) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...SOFT);
  doc.text(label.toUpperCase(), x, y);
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(texto(value), w)[0], x, y + 5);
}

export function generarFichaTaller({ caso, piezas = [], manoObra = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");

  // Encabezado en blanco: ahorra tinta y deja visible la informacion principal.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("FICHA DE TALLER", M, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text(`Impreso: ${fechaImpresion()}`, M, 22);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.8);
  doc.line(M, 26, W - M, 26);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...SOFT);
  doc.text("LLAVE", W - M, 13, { align: "right" });
  doc.setFontSize(24);
  doc.setTextColor(...RED);
  doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "SIN LLAVE", W - M, 22, { align: "right" });

  let y = 33;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, CW, 37, 1.8, 1.8, "S");
  const a = M + 5;
  const b = M + CW / 2 + 3;
  const col = CW / 2 - 9;
  dato(doc, a, y + 7, "Seguro", caso.aseguradora_nombre, col);
  dato(doc, b, y + 7, "Vehiculo", vehiculo, col);
  dato(doc, a, y + 18, "Cliente", caso.cliente_nombre, col);
  dato(doc, b, y + 18, "Placa", caso.placa, col);
  dato(doc, a, y + 29, "Telefono", caso.cliente_telefono, col);
  dato(doc, b, y + 29, "Reclamo", caso.numero_reclamo, col);
  y += 48;

  const colW = (CW - 8) / 2;
  const fila = (items, getText) => items.reduce((total, it) => {
    const lines = doc.splitTextToSize(getText(it), colW - 27).slice(0, 2);
    return total + Math.max(8, lines.length * 4.8 + 2);
  }, 0);
  const alturaCuerpo = Math.max(19, fila(piezas, (it) => it.nombre || "Pieza"), fila(manoObra, (it) => it.descripcion || it.nombre || "Trabajo"));

  function seccion(x, titulo, items, getText) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...RED);
    doc.text(titulo, x, y + 6);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.35);
    doc.line(x, y + 9, x + colW, y + 9);
    let iy = y + 16;
    if (!items.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(...SOFT);
      doc.text("Sin registros.", x, iy);
      return;
    }
    items.slice(0, 20).forEach((it, i) => {
      const lines = doc.splitTextToSize(getText(it), colW - 27).slice(0, 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...SOFT);
      doc.text(String(i + 1).padStart(2, "0"), x, iy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(lines, x + 11, iy);
      doc.setFont("helvetica", "bold");
      doc.text(`x${Number(it.cantidad) || 1}`, x + colW, iy, { align: "right" });
      iy += Math.max(8, lines.length * 4.8 + 2);
    });
  }

  seccion(M, "PIEZAS A REEMPLAZAR", piezas, (it) => it.nombre || "Pieza");
  seccion(M + colW + 8, "MANO DE OBRA", manoObra, (it) => it.descripcion || it.nombre || "Trabajo");

  // El pie se coloca justo despues de la lista mas larga para que se pueda
  // cortar y reutilizar el resto de la hoja cuando la ficha es corta.
  const footerY = y + 12 + alturaCuerpo + 7;
  // Separador central: mantiene las dos listas claramente diferenciadas sin
  // gastar tinta en fondos o recuadros pesados.
  const separadorX = M + colW + 4;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.4);
  doc.line(separadorX, y + 1, separadorX, footerY - 6);
  doc.setDrawColor(...RED);
  doc.setLineWidth(0.55);
  doc.line(M, footerY, W - M, footerY);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SOFT);
  doc.text("DOMINGUEZ AUTO PINTURA - FICHA INTERNA DE TALLER", M, footerY + 6);
  doc.setFontSize(15);
  doc.setTextColor(...RED);
  doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", W - M, footerY + 6, { align: "right" });
  return doc.output("blob");
}
