import { jsPDF } from "jspdf";

// Hoja de trabajo: papel instructivo que se imprime y se pone dentro del
// vehículo cuando está en el taller, para que los trabajadores sepan qué
// piezas reemplazar y qué mano de obra hacer. Compacto, no llena la hoja.

const TINTA = [17, 17, 17];
const GRIS = [110, 116, 128];
const GRIS_CLARO = [148, 153, 163];
const ROJO = [200, 30, 30];
const LINEA = [224, 226, 230];
const FONDO = [246, 247, 249];
const M = 14;

function dato(doc, x, y, label, valor, maxW) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GRIS_CLARO);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...TINTA);
  const v = doc.splitTextToSize(String(valor || "—"), maxW || 80)[0];
  doc.text(v, x, y + 5);
}

/**
 * Genera la hoja "Trabajo a realizar".
 * @param caso     { aseguradora_nombre, cliente_nombre, cliente_telefono, marca, modelo, anio, placa, numero_reclamo }
 * @param piezas   [{ nombre, cantidad }]                 piezas a reemplazar
 * @param manoObra [{ descripcion, cantidad }]            trabajos a realizar
 */
export async function generarPdfTrabajo({ caso = {}, piezas = [], manoObra = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - M * 2;
  const colW = contentW / 2;
  let y = M;

  // ===== Título =====
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...TINTA);
  doc.text("TRABAJO A REALIZAR", M, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  doc.text(new Date().toLocaleDateString("es-DO"), W - M, y + 4, { align: "right" });
  doc.setDrawColor(...ROJO);
  doc.setLineWidth(1.2);
  doc.line(M, y + 7, W - M, y + 7);
  y += 14;

  // ===== Tarjeta de datos =====
  const cardH = 30;
  doc.setFillColor(...FONDO);
  doc.roundedRect(M, y, contentW, cardH, 2.5, 2.5, "F");
  const colA = M + 5;
  const colB = M + colW + 3;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  dato(doc, colA, y + 7, "Seguro", caso.aseguradora_nombre, colW - 8);
  dato(doc, colB, y + 7, "Vehículo", vehiculo, colW - 8);
  dato(doc, colA, y + 16.5, "Cliente", caso.cliente_nombre, colW - 8);
  dato(doc, colB, y + 16.5, "Placa", caso.placa, colW - 8);
  dato(doc, colA, y + 26, "Teléfono", caso.cliente_telefono, colW - 8);
  dato(doc, colB, y + 26, "Reclamo", caso.numero_reclamo, colW - 8);
  y += cardH + 10;

  // ===== Secciones de lista (con salto de página si hace falta) =====
  function encabezadoSeccion(titulo, n) {
    if (y > H - 30) {
      doc.addPage();
      y = M;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ROJO);
    doc.text(`${titulo} (${n})`, M, y);
    y += 2.5;
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.4);
    doc.line(M, y, W - M, y);
    y += 6;
  }

  function filas(items, getTexto) {
    doc.setFontSize(10);
    items.forEach((it, i) => {
      const cant = Number(it.cantidad) || 1;
      const texto = getTexto(it);
      const lineas = doc.splitTextToSize(texto, contentW - 26);
      const filaH = Math.max(7, lineas.length * 4.6 + 2.4);

      if (y + filaH > H - M) {
        doc.addPage();
        y = M;
      }

      // número
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRIS_CLARO);
      doc.text(String(i + 1).padStart(2, "0"), M, y + 3.4);

      // descripción
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...TINTA);
      doc.text(lineas, M + 9, y + 3.4);

      // cantidad
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GRIS);
      doc.text(`x${cant}`, W - M, y + 3.4, { align: "right" });

      y += filaH;
      doc.setDrawColor(...LINEA);
      doc.setLineWidth(0.2);
      doc.line(M, y - 1.2, W - M, y - 1.2);
    });
    y += 8;
  }

  if (piezas.length) {
    encabezadoSeccion("PIEZAS A REEMPLAZAR", piezas.length);
    filas(piezas, (it) => it.nombre || "Pieza");
  }

  if (manoObra.length) {
    encabezadoSeccion("MANO DE OBRA — TRABAJOS A REALIZAR", manoObra.length);
    filas(manoObra, (it) => it.descripcion || "Trabajo");
  }

  if (!piezas.length && !manoObra.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRIS);
    doc.text("Este caso no tiene piezas ni mano de obra registradas en su cotización.", M, y);
  }

  return doc.output("blob");
}
