import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { calcularItem, nombrePieza, calcularTotales } from "./cotizacion";

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

function fmt(x) {
  const n = Number(x) || 0;
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function urlADataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const mime = blob.type || (url.endsWith(".png") ? "image/png" : "image/jpeg");
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

// Dibuja una línea con pares [etiqueta, valor] (etiqueta en negrita)
function campos(doc, x, y, pares, size = 9) {
  doc.setFontSize(size);
  let cx = x;
  pares.forEach(([lab, val, gap = 3.5]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TINTA);
    doc.text(lab, cx, y);
    cx += doc.getTextWidth(lab) + 1.2;
    doc.setFont("helvetica", "normal");
    const v = String(val ?? "");
    doc.text(v, cx, y);
    cx += doc.getTextWidth(v) + gap;
  });
}

export async function generarPdfCotizacion(cot) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();

  // ===== Encabezado =====
  const logo = await urlADataUrl("/logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 9, 42, 32, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }

  // Centro
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...TINTA);
  doc.text("COTIZACIÓN", W / 2, 17, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  [TALLER.registro, TALLER.direccion, TALLER.tel, TALLER.rnc].forEach((t, i) => {
    doc.text(t, W / 2, 24 + i * 4.2, { align: "center" });
  });

  // Caja de número (derecha)
  doc.setFillColor(245, 245, 247);
  doc.roundedRect(143, 11, 57, 17, 2.5, 2.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TINTA);
  doc.text(cot.numero || "—", 171.5, 19, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  const ahora = new Date().toLocaleString("es-DO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  doc.text(ahora, 171.5, 25, { align: "center" });

  // ===== Cajas de información =====
  const boxY = 45;
  const boxH = 40;
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, boxY, 92, boxH, 2.5, 2.5, "S");
  doc.roundedRect(108, boxY, 92, boxH, 2.5, 2.5, "S");

  // Izquierda: aseguradora
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...TINTA);
  doc.text((cot.aseguradora_nombre || "—").toUpperCase(), M + 5, boxY + 9);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...GRIS);
  if (cot.aseguradora_direccion) doc.text(cot.aseguradora_direccion, M + 5, boxY + 16);
  if (cot.aseguradora_telefono) doc.text(`Tel: ${cot.aseguradora_telefono}`, M + 5, boxY + 24);
  campos(doc, M + 5, boxY + 33, [["No reclamo:", cot.numero_reclamo || "—"]], 9);

  // Derecha: vehículo + póliza + asegurado
  const rx = 113;
  let ry = boxY + 7;
  campos(doc, rx, ry, [["Marca:", cot.marca || "—"], ["Modelo:", cot.modelo || "—"]]);
  ry += 6;
  campos(doc, rx, ry, [["Año:", cot.anio || "—"], ["Color:", cot.color || "—"], ["Placa:", cot.placa || "—"]]);
  ry += 6;
  campos(doc, rx, ry, [["Chasis:", cot.chasis || "—"]]);
  ry += 6;
  campos(doc, rx, ry, [["Póliza:", cot.numero_poliza || "—"]]);
  ry += 6;
  campos(doc, rx, ry, [["Asegurado/a:", cot.cliente_nombre || "—"]]);
  ry += 6;
  campos(doc, rx, ry, [["Tel:", (cot.telefonos || []).filter(Boolean).join(" / ") || "—"]]);

  // ===== Tablas =====
  const piezas = cot.items_piezas || [];
  const mano = cot.items_mano_obra || [];

  const filasPieza = piezas.map((it) => {
    const c = calcularItem(it);
    const cant = Number(it.cantidad) || 1;
    return [
      nombrePieza(it).toUpperCase(),
      "UNID",
      cant,
      fmt(c.neto / cant),
      "0.00",
      fmt(c.itbisMonto),
      fmt(c.total),
    ];
  });
  const filasMano = mano.map((it) => {
    const c = calcularItem(it);
    const cant = Number(it.cantidad) || 1;
    const parte = it.pieza
      ? nombrePieza({ nombre: it.pieza, lado: it.lado, sub_lado: it.sub_lado })
      : "";
    const desc = [it.nombre, parte].filter(Boolean).join(" ").toUpperCase();
    return [desc, "UNID", cant, fmt(c.neto / cant), "0.00", fmt(c.itbisMonto), fmt(c.total)];
  });

  const head = [["DESCRIPCIÓN", "UNID.", "CANT.", "PRECIO", "DESCUENTO", "ITBIS", "IMPORTE"]];
  const colStyles = {
    0: { halign: "left", cellWidth: 70, fontStyle: "bold" },
    1: { halign: "center", cellWidth: 16 },
    2: { halign: "center", cellWidth: 16 },
    3: { halign: "right", cellWidth: 24 },
    4: { halign: "right", cellWidth: 26 },
    5: { halign: "right", cellWidth: 20 },
    6: { halign: "right", cellWidth: 18, fontStyle: "bold" },
  };

  function tabla(titulo, filas, netoTotal, startY) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    doc.text(titulo, M, startY);

    autoTable(doc, {
      startY: startY + 2,
      head,
      body: filas.length
        ? filas.map((f) => (f.length === 7 ? f : f))
        : [["—", "", "", "", "", "", ""]],
      foot: [["TOTAL", "", "", "", "", "", fmt(netoTotal)]],
      theme: "plain",
      margin: { left: M, right: M },
      styles: { fontSize: 8, textColor: TINTA, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 } },
      headStyles: { fillColor: GRIS_BG, textColor: GRIS, fontStyle: "bold", fontSize: 7, lineWidth: 0 },
      footStyles: { fillColor: [255, 255, 255], textColor: TINTA, fontStyle: "bold", lineWidth: { top: 0.3 }, lineColor: LINEA },
      bodyStyles: { lineWidth: { bottom: 0.2 }, lineColor: LINEA },
      columnStyles: colStyles,
      didParseCell: (data) => {
        // valores en cero se ven en gris claro (como el original)
        if (data.section === "body" && [3, 4, 5].includes(data.column.index) && data.cell.text[0] === "0.00") {
          data.cell.styles.textColor = [170, 174, 182];
        }
      },
    });
    return doc.lastAutoTable.finalY;
  }

  const netoPiezas = calcularTotales(piezas, []).subtotal;
  const netoMano = calcularTotales([], mano).subtotal;

  let y = boxY + boxH + 8;
  y = tabla("PIEZAS", filasPieza, netoPiezas, y) + 8;
  y = tabla("MANO DE OBRA", filasMano, netoMano, y) + 10;

  // ===== Caja de totales (derecha) =====
  const totales = calcularTotales(piezas, mano);
  const tbX = 130;
  const tbW = 70;
  const lineas = [];
  if (netoPiezas > 0) lineas.push(["Piezas:", fmt(netoPiezas), false]);
  if (netoMano > 0) lineas.push(["Mano de Obra:", fmt(netoMano), false]);
  lineas.push(["Sub-Total:", fmt(totales.subtotal), false]);
  lineas.push(["Descuento (0%):", fmt(0), false]);

  if (y + 10 + lineas.length * 7 + 28 > H - 45) {
    doc.addPage();
    y = M;
  }

  const tbH = lineas.length * 7 + 32;
  doc.setFillColor(247, 248, 250);
  doc.setDrawColor(...LINEA);
  doc.roundedRect(tbX, y, tbW, tbH, 2.5, 2.5, "FD");

  let ty = y + 8;
  doc.setFontSize(10);
  lineas.forEach(([lab, val]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...TINTA);
    doc.text(lab, tbX + 5, ty);
    doc.text(val, tbX + tbW - 5, ty, { align: "right" });
    ty += 7;
  });
  // separador
  doc.setDrawColor(...GRIS);
  doc.setLineWidth(0.3);
  doc.line(tbX + 5, ty - 3, tbX + tbW - 5, ty - 3);
  ty += 2;
  doc.setFont("helvetica", "bold");
  doc.text("ITBIS (18%):", tbX + 5, ty);
  doc.text(fmt(totales.itbis), tbX + tbW - 5, ty, { align: "right" });
  ty += 11;
  doc.setFontSize(15);
  doc.text("TOTAL:", tbX + 5, ty);
  doc.text(fmt(totales.total), tbX + tbW - 5, ty, { align: "right" });

  // ===== Pie: sello + firmas (en la última página) =====
  const sello = await urlADataUrl("/sello.jpg");
  if (sello) {
    try {
      doc.addImage(sello, "JPEG", 60, H - 62, 46, 39, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.3);
  doc.line(14, H - 20, 72, H - 20);
  doc.line(80, H - 20, 138, H - 20);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text("Recibido por", 43, H - 15, { align: "center" });
  doc.text("Entregado por", 109, H - 15, { align: "center" });

  return doc.output("blob");
}
