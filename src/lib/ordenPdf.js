import { jsPDF } from "jspdf";

const TALLER = {
  tels: "809.575.7986 / 809.330.3554 / 809.576.5349",
  email1: "dominguez.apintura@gmail.com",
  email2: "cotizaciones.dautopintura@gmail.com",
  direccion: "Av. Hatuey #16, Santiago, Rep. Dom.",
  rnc: "RNC: 130-66659-8",
  registro: "Registro Mercantil 04-12-2009",
};

const LEGAL =
  "Aseguro y garantizo que soy el propietario y/o estoy autorizado por el mismo para efectuar la reparación del vehículo. " +
  "Con la presente autorizo el trabajo arriba escrito junto con las piezas de repuesto y otros materiales necesarios para " +
  "efectuarlo, y autorizo a usted o a sus empleados a operar el vehículo arriba especificado en las calles o en el garage " +
  "para probarlo y revisarlo. Así mismo otorgo el derecho de disponer del vehículo en caso de no pagar las reparaciones y " +
  "repuestos utilizados, para amparar así el gasto de los mismos. Si transcurridos los días contados a partir de la fecha en " +
  "que se haya notificado al cliente que su vehículo está listo para entregar éste no fuere retirado, el cliente deberá pagar " +
  "por uso de garage la suma de cien pesos (RD$100.00) diarios, hasta el momento en que el vehículo sea retirado.";

const LEGAL_BOLD = [
  "LA EMPRESA NO ES RESPONSABLE POR DAÑOS SUFRIDOS EN CASO DE INCENDIO, ACCIDENTE, MOTÍN, HURACANES Y/O CONSECUENCIA DE MOVIMIENTOS TELÚRICOS O CUALQUIER OTRA CAUSA FUERA DE NUESTRO CONTROL.",
  "HE LEÍDO Y ACEPTADO TODAS LAS ESTIPULACIONES Y CONDICIONES INDICADAS. LOS PAGOS DEBERÁN REALIZARSE ANTES DE RETIRAR EL VEHÍCULO.",
  "NOTA: LA EMPRESA NO ES RESPONSABLE DE OBJETOS PERSONALES O DE VALOR DEJADOS EN EL VEHÍCULO.",
];

const TINTA = [17, 17, 17];
const GRIS = [110, 116, 128];
const ROJO = [200, 30, 30];
const LINEA = [220, 222, 226];
const M = 14;

async function urlADataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const mime = url.endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

function campos(doc, x, y, pares, size = 9) {
  doc.setFontSize(size);
  let cx = x;
  pares.forEach(([lab, val]) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...TINTA);
    doc.text(lab, cx, y);
    cx += doc.getTextWidth(lab) + 1.2;
    doc.setFont("helvetica", "normal");
    const v = String(val ?? "");
    doc.text(v, cx, y);
    cx += doc.getTextWidth(v) + 4;
  });
}

function bloque(doc, x, y, w, titulo, lineas) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ROJO);
  doc.text(titulo, x + 4, y + 6);
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  let yy = y + 12;
  lineas.filter(Boolean).forEach((l) => {
    if (Array.isArray(l)) campos(doc, x + 4, yy, l, 9);
    else {
      doc.setFont("helvetica", "normal");
      doc.text(String(l), x + 4, yy);
    }
    yy += 5.5;
  });
}

export async function generarPdfOrden(orden) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  let y = 12;

  // ===== Encabezado =====
  const logo = await urlADataUrl("/logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, y, 40, 30, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  const der = [TALLER.tels, TALLER.email1, TALLER.email2, TALLER.direccion, `${TALLER.rnc}  ·  ${TALLER.registro}`];
  der.forEach((t, i) => doc.text(t, W - M, y + 4 + i * 4, { align: "right" }));

  y += 34;
  doc.setDrawColor(...ROJO);
  doc.setLineWidth(0.6);
  doc.line(M, y, W - M, y);
  y += 8;

  // Título + número + fecha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...TINTA);
  doc.text("ORDEN DE REPARACIÓN", M, y);
  doc.setFontSize(13);
  doc.setTextColor(...ROJO);
  doc.text(`Orden No. ${orden.numero || "—"}`, W - M, y - 1, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(
    `Fecha: ${orden.fecha || ""}${orden.hora ? "   Hora: " + orden.hora : ""}`,
    W - M,
    y + 5,
    { align: "right" }
  );
  y += 10;

  // ===== Cajas Cliente / Vehículo =====
  const colW = (W - M * 2 - 6) / 2;
  const boxH = 40;
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.3);
  doc.roundedRect(M, y, colW, boxH, 2, 2, "S");
  doc.roundedRect(M + colW + 6, y, colW, boxH, 2, 2, "S");

  bloque(doc, M, y, colW, "CLIENTE", [
    orden.cliente,
    orden.direccion,
    [["Tel:", orden.tel || "—"], ...(orden.cel ? [["Cel:", orden.cel]] : [])],
    orden.email,
  ]);
  bloque(doc, M + colW + 6, y, colW, "VEHÍCULO", [
    [["Marca:", orden.marca || "—"], ["Modelo:", orden.modelo || "—"]],
    [["Año:", orden.anio || "—"], ["Color:", orden.color || "—"]],
    [["Placa:", orden.placa || "—"], ["Km:", orden.km || "—"]],
    [["Chasis:", orden.chasis || "—"]],
    [["Combustible:", orden.tipo_combustible || "—"]],
  ]);
  y += boxH + 6;

  // ===== Seguro =====
  doc.setDrawColor(...LINEA);
  doc.roundedRect(M, y, W - M * 2, 14, 2, 2, "S");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...ROJO);
  doc.text("SEGURO", M + 4, y + 5.5);
  campos(doc, M + 4, y + 11, [
    ["Aseguradora:", orden.cia_seguro || "—"],
    ["Póliza:", orden.poliza || "—"],
    ["No. reclamo/ficha:", orden.ficha || "—"],
  ]);
  y += 20;

  // ===== Recepción (costo / observaciones / trabajos) =====
  const hayRecepcion = orden.costo || orden.observaciones || orden.trabajos;
  if (hayRecepcion) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...ROJO);
    doc.text("RECEPCIÓN", M, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TINTA);
    if (orden.costo) {
      campos(doc, M, y, [["Costo de reparación: RD$", orden.costo]], 9);
      y += 6;
    }
    if (orden.observaciones) {
      doc.setFont("helvetica", "bold");
      doc.text("Observaciones:", M, y);
      doc.setFont("helvetica", "normal");
      const ls = doc.splitTextToSize(orden.observaciones, W - M * 2 - 30);
      doc.text(ls, M + 28, y);
      y += Math.max(6, ls.length * 4.5 + 1);
    }
    if (orden.trabajos) {
      doc.setFont("helvetica", "bold");
      doc.text("Trabajos a realizar:", M, y);
      doc.setFont("helvetica", "normal");
      const ls = doc.splitTextToSize(orden.trabajos, W - M * 2 - 36);
      doc.text(ls, M + 34, y);
      y += Math.max(6, ls.length * 4.5 + 1);
    }
    y += 4;
  }

  // ===== Texto legal =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  const legalLines = doc.splitTextToSize(LEGAL, W - M * 2);
  doc.text(legalLines, M, y);
  y += legalLines.length * 3.1 + 2;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TINTA);
  LEGAL_BOLD.forEach((t) => {
    const ls = doc.splitTextToSize(t, W - M * 2);
    doc.text(ls, M, y);
    y += ls.length * 3.1 + 1.5;
  });

  // ===== Firmas + sello =====
  const yFirma = Math.max(y + 16, H - 34);
  const sello = await urlADataUrl("/sello.jpg");
  if (sello) {
    try {
      doc.addImage(sello, "JPEG", M + 6, yFirma - 30, 40, 34, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.3);
  doc.line(M, yFirma, M + 70, yFirma);
  doc.line(W - M - 70, yFirma, W - M, yFirma);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...TINTA);
  doc.text("Dominguez Auto Pintura", M + 35, yFirma + 5, { align: "center" });
  doc.text("Cliente", W - M - 35, yFirma + 5, { align: "center" });

  return doc.output("blob");
}
