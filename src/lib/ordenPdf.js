import { jsPDF } from "jspdf";

const TALLER = {
  nombre: "DOMINGUEZ AUTO PINTURA",
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
const GRIS_CLARO = [148, 153, 163];
const ROJO = [200, 30, 30];
const ROJO_CLARO = [253, 235, 235];
const LINEA = [224, 226, 230];
const FONDO = [246, 247, 249];
const BLANCO = [255, 255, 255];
const M = 13;

async function urlADataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    // blob.type es más fiable que la extensión: una signed URL de Supabase
    // no termina en ".png" aunque la imagen sí lo sea.
    const mime = blob.type || (url.endsWith(".png") ? "image/png" : "image/jpeg");
    return `data:${mime};base64,${btoa(bin)}`;
  } catch {
    return null;
  }
}

// Etiqueta pequeña (gris, mayúsculas) + valor en negrita, en una sola línea.
function campo(doc, x, y, label, valor, { labelW = null } = {}) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.6);
  doc.setTextColor(...GRIS_CLARO);
  doc.text(label.toUpperCase(), x, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.6);
  doc.setTextColor(...TINTA);
  doc.text(String(valor || "—"), x + (labelW ?? 0), y + 4.6);
}

// Tarjeta con barra de acento a la izquierda + encabezado con ícono simple.
function tarjeta(doc, x, y, w, h, titulo) {
  doc.setFillColor(...BLANCO);
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.35);
  doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
  doc.setFillColor(...ROJO);
  doc.roundedRect(x, y, 2.6, h, 2.5, 2.5, "F");
  doc.rect(x + 1.3, y, 1.3, h, "F"); // cuadra la esquina interior de la barra

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...ROJO);
  doc.text(titulo.toUpperCase(), x + 8, y + 8);
  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.2);
  doc.line(x + 8, y + 10.5, x + w - 6, y + 10.5);
}

export async function generarPdfOrden(orden) {
  const doc = new jsPDF({ unit: "mm", format: "letter" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const contentW = W - M * 2;

  // ===== Letterhead (fondo blanco, logo + datos del taller) =====
  const bandH = 30;

  const logo = await urlADataUrl("/logo.png");
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 2, 40, bandH - 6, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(...GRIS);
  const der = [TALLER.tels, `${TALLER.email1}  ·  ${TALLER.email2}`, TALLER.direccion, `${TALLER.rnc}   ${TALLER.registro}`];
  der.forEach((t, i) => doc.text(t, W - M, 7.5 + i * 4.4, { align: "right" }));

  doc.setDrawColor(...ROJO);
  doc.setLineWidth(1.2);
  doc.line(0, bandH, W, bandH);

  // ===== Título + No. + fecha =====
  let y = bandH + 11;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(...TINTA);
  doc.text("RECIBO DE ENTRADA", M, y);

  const numTxt = `No. ${orden.numero || "—"}`;
  doc.setFontSize(13);
  const numW = doc.getTextWidth(numTxt) + 8;
  doc.setFillColor(...ROJO);
  doc.roundedRect(W - M - numW, y - 7.2, numW, 9.2, 2, 2, "F");
  doc.setTextColor(...BLANCO);
  doc.text(numTxt, W - M - numW / 2, y - 1, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`Fecha: ${orden.fecha || "—"}    Hora: ${orden.hora || "—"}`, W - M, y + 6.5, { align: "right" });
  y += 12;

  // ===== Tarjetas Cliente / Vehículo =====
  const gap = 6;
  const colW = (contentW - gap) / 2;
  const cardH = 50;
  tarjeta(doc, M, y, colW, cardH, "Cliente");
  tarjeta(doc, M + colW + gap, y, colW, cardH, "Vehículo");

  // Cliente
  {
    const cx = M + 8;
    let cy = y + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...TINTA);
    doc.text(String(orden.cliente || "—"), cx, cy);
    cy += 7;
    campo(doc, cx, cy, "Dirección", orden.direccion);
    cy += 9.5;
    const mitad = colW / 2 - 4;
    campo(doc, cx, cy, "Teléfono", orden.tel);
    campo(doc, cx + mitad, cy, "Celular", orden.cel);
    cy += 9.5;
    campo(doc, cx, cy, "Email", orden.email);
  }

  // Vehículo
  {
    const cx = M + colW + gap + 8;
    let cy = y + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11.5);
    doc.setTextColor(...TINTA);
    doc.text([orden.marca, orden.modelo, orden.anio].filter(Boolean).join(" ") || "—", cx, cy);
    cy += 7;
    const mitad = colW / 2 - 4;
    campo(doc, cx, cy, "Color", orden.color);
    campo(doc, cx + mitad, cy, "Placa", orden.placa);
    cy += 9.5;
    campo(doc, cx, cy, "Chasis", orden.chasis);
    campo(doc, cx + mitad, cy, "Km/M", orden.km);
    cy += 9.5;
    campo(doc, cx, cy, "Combustible", orden.tipo_combustible);
    campo(doc, cx + mitad, cy, "Aseguradora", orden.cia_seguro);
  }
  y += cardH + 7;

  // ===== Recepción: costo + observaciones + trabajos =====
  const hayObs = !!orden.observaciones;
  const hayTrab = !!orden.trabajos;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const obsLines = hayObs ? doc.splitTextToSize(orden.observaciones, contentW - 16) : [];
  const trabLines = hayTrab ? doc.splitTextToSize(orden.trabajos, contentW - 16) : [];
  const textBlockH = Math.max(obsLines.length, trabLines.length, 1) * 4.6 + 10;
  const recepH = 16 + (hayObs || hayTrab ? textBlockH : 0);

  tarjeta(doc, M, y, contentW, recepH, "Recepción del vehículo");
  doc.setFillColor(...ROJO_CLARO);
  doc.roundedRect(W - M - 58, y + 3, 50, 8, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...ROJO);
  doc.text(`Costo: RD$ ${orden.costo || "0.00"}`, W - M - 33, y + 8.3, { align: "center" });

  let ry = y + 18;
  if (hayObs) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...GRIS_CLARO);
    doc.text("OBSERVACIONES", M + 8, ry);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TINTA);
    doc.text(obsLines, M + 8, ry + 4.4);
    ry += obsLines.length * 4.6 + 6;
  }
  if (hayTrab) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...GRIS_CLARO);
    doc.text("TRABAJOS A REALIZAR", M + 8, ry);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...TINTA);
    doc.text(trabLines, M + 8, ry + 4.4);
  }
  y += recepH + 7;

  // ===== Texto legal (caja gris, dos columnas) =====
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.9);
  const legalColW = contentW / 2 - 6;
  const legalLinesAll = doc.splitTextToSize(LEGAL, legalColW);
  const mitadIdx = Math.ceil(legalLinesAll.length / 2);
  const colA = legalLinesAll.slice(0, mitadIdx);
  const colB = legalLinesAll.slice(mitadIdx);
  const legalH = Math.max(colA.length, colB.length) * 3.05 + 8;

  doc.setFillColor(...FONDO);
  doc.roundedRect(M, y, contentW, legalH, 2.5, 2.5, "F");
  doc.setTextColor(...GRIS);
  doc.text(colA, M + 5, y + 5.5);
  doc.text(colB, M + 6 + legalColW, y + 5.5);
  y += legalH + 4;

  // Avisos legales (discretos: gris claro y pequeño, presentes pero poco
  // visibles a simple vista, sin recuadro rojo).
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  const boldLines = LEGAL_BOLD.map((t) => doc.splitTextToSize(t, contentW));
  doc.setTextColor(...GRIS_CLARO);
  let by = y + 3;
  boldLines.forEach((ls) => {
    doc.text(ls, M, by);
    by += ls.length * 2.35 + 0.6;
  });
  y = by + 6;

  // ===== Firmas + sello =====
  const yFirma = Math.max(y + 14, H - 24);
  const sello = await urlADataUrl("/sello.jpg");
  if (sello) {
    try {
      doc.addImage(sello, "JPEG", M + 8, yFirma - 28, 36, 30, undefined, "FAST");
    } catch {
      /* opcional */
    }
  }
  // Firma que el cliente hizo con el dedo en la tablet al hacer la
  // cotización: se coloca sobre la línea, igual que el sello del taller.
  if (orden.firma_cliente_url) {
    const firmaCliente = await urlADataUrl(orden.firma_cliente_url);
    if (firmaCliente) {
      try {
        doc.addImage(firmaCliente, "PNG", W - M - 73, yFirma - 15, 68, 14, undefined, "FAST");
      } catch {
        /* opcional */
      }
    }
  }
  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.3);
  doc.line(M, yFirma, M + 78, yFirma);
  doc.line(W - M - 78, yFirma, W - M, yFirma);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...TINTA);
  doc.text(TALLER.nombre, M + 39, yFirma + 5, { align: "center" });
  doc.text("Firma del cliente", W - M - 39, yFirma + 5, { align: "center" });

  return doc.output("blob");
}
