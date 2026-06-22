import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Datos fijos del taller (encabezado del documento)
const TALLER = {
  registro: "Registro Mercantil 04-12-2009",
  direccion: "Av. Hatuey # 16, Santiago, Rep. Dom.",
  tel: "Tel.: (809)575-7986 / (809)576-5349",
  rnc: "RNC: 130-66659-8",
};

const TINTA = [17, 17, 17];
const GRIS = [110, 116, 128];
const GRIS_BG = [243, 244, 246];
const LINEA = [220, 222, 226];
const M = 10;

async function urlADataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const mime = blob.type || "image/png";
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

/**
 * PDF con la lista de piezas del caso (sin la columna de "recibido"/checks).
 * Pensado para imprimir o enviar el pedido de piezas.
 */
export async function generarPdfPiezas({ caso = {}, piezas = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  // ===== Encabezado =====
  const logo = await urlADataUrl("/logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 9, 42, 32, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...TINTA);
  doc.text("LISTA DE PIEZAS", W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  [TALLER.registro, TALLER.direccion, TALLER.tel, TALLER.rnc].forEach((t, i) => {
    doc.text(t, W / 2, 24 + i * 4.2, { align: "center" });
  });

  // ===== Caja de información del vehículo / cliente =====
  const y = 48;
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, W - 2 * M, 26, 2.5, 2.5, "S");
  doc.setFontSize(9);
  const info = (label, val, x, yy) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TINTA);
    doc.text(label, x, yy);
    const w = doc.getTextWidth(label) + 1.5;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...GRIS);
    doc.text(String(val || "—"), x + w, yy);
  };
  const col2 = M + 100;
  info("Cliente:", caso.cliente_nombre, M + 5, y + 8);
  info("Aseguradora:", caso.aseguradora_nombre, col2, y + 8);
  info("Vehículo:", [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" "), M + 5, y + 15);
  info("Placa:", caso.placa, col2, y + 15);
  info("Reclamo:", caso.numero_reclamo, M + 5, y + 22);
  info("Fecha:", new Date().toLocaleDateString("es-DO"), col2, y + 22);

  // ===== Tabla de piezas (sin columna de checks) =====
  const body = piezas.map((p, i) => [String(i + 1), p.nombre, String(p.cantidad)]);
  autoTable(doc, {
    startY: y + 34,
    head: [["#", "PIEZA", "CANT."]],
    body: body.length ? body : [["—", "Sin piezas registradas", ""]],
    theme: "plain",
    margin: { left: M, right: M },
    styles: { fontSize: 9, textColor: TINTA, cellPadding: { top: 2.5, bottom: 2.5, left: 2, right: 2 } },
    headStyles: { fillColor: GRIS_BG, textColor: GRIS, fontStyle: "bold", fontSize: 8 },
    bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: LINEA },
    columnStyles: {
      0: { cellWidth: 14, halign: "center" },
      1: { halign: "left", fontStyle: "bold" },
      2: { cellWidth: 24, halign: "center" },
    },
  });

  return doc.output("blob");
}
