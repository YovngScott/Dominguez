import { jsPDF } from "jspdf";

// PDF de respaldo de la ETIQUETA DE VEHÍCULO (4x2"): marca/modelo + trabajos
// a realizar en grande. Se usa cuando no hay print server (otros dispositivos).

const LABEL_W = 101.6; // 4"
const LABEL_H = 50.8; // 2"
const M = 4;
const TINTA = [20, 20, 20];
const GRIS = [120, 124, 132];
const LINEA = [190, 192, 196];

export async function generarPdfVehiculo({ marca, modelo, anio, trabajos = [] }) {
  const items = (trabajos || []).map((t) => String(t || "").trim()).filter(Boolean);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: [LABEL_W, LABEL_H] });
  const contentW = LABEL_W - M * 2;
  let y = M + 2;

  // Vehículo
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...TINTA);
  const veh = doc.splitTextToSize([marca, modelo, anio].filter(Boolean).join(" ") || "-", contentW);
  doc.text(veh, M, y);
  y += veh.length * 6 + 2;

  doc.setDrawColor(...LINEA);
  doc.setLineWidth(0.4);
  doc.line(M, y, M + contentW, y);
  y += 4;

  doc.setFontSize(7);
  doc.setTextColor(...GRIS);
  doc.text(`TRABAJOS A REALIZAR (${items.length})`, M, y);
  y += 4.5;

  // Trabajos en grande (tamaño según cuántos haya)
  const n = items.length || 1;
  const fS = n <= 1 ? 17 : n === 2 ? 14 : n === 3 ? 11.5 : n === 4 ? 10 : 8.5;
  const lH = n <= 1 ? 7.4 : n === 2 ? 6.2 : n === 3 ? 5.2 : n === 4 ? 4.6 : 4;
  const pad = n <= 2 ? 2.2 : 1.4;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...TINTA);
  items.forEach((t) => {
    const lns = doc.splitTextToSize(t, contentW - 5);
    doc.setFontSize(fS);
    // viñeta
    doc.setFillColor(...TINTA);
    doc.circle(M + 1.2, y - 1.4, 0.9, "F");
    lns.forEach((ln, i) => doc.text(ln, M + 4, y + i * lH));
    y += lns.length * lH + pad;
  });

  return doc.output("blob");
}
