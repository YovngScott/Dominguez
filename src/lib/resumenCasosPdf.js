import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ETIQUETAS_CASO } from "./etiquetasCaso.js";

export function generarResumenCasosPdf({ casos, citas, titulo, aseguradora }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const grupos = new Map();
  casos.forEach((c) => {
    const nombre = c.aseguradora?.nombre || "Sin aseguradora";
    if (!grupos.has(nombre)) grupos.set(nombre, []);
    grupos.get(nombre).push(c);
  });
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(28, 30, 34);
  doc.text("RESUMEN DE VEHÍCULOS", 14, 18);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(95, 102, 114);
  doc.text(`${titulo}  |  ${aseguradora}  |  ${casos.length} vehículos`, 14, 26);
  doc.text(`Generado: ${new Date().toLocaleString("es-DO")}`, 14, 32);
  let y = 40;
  for (const [nombre, lista] of [...grupos].sort(([a], [b]) => a.localeCompare(b))) {
    if (y > 175) { doc.addPage(); y = 16; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(185, 20, 20);
    doc.text(`${nombre.toUpperCase()}  (${lista.length})`, 14, y);
    const filas = lista.map((c) => {
      const cita = citas[c.id];
      const situacion = c.estado === "listo_para_trabajar"
        ? cita ? `LISTO - CON CITA: ${cita.fecha}${cita.hora ? ` ${cita.hora.slice(0, 5)}` : ""}` : "LISTO - SIN CITA"
        : ETIQUETAS_CASO.find((e) => e.id === c.etiqueta_organizacion)?.label || "SIN ETIQUETA";
      return [[c.marca?.nombre, c.modelo?.nombre, c.anio].filter(Boolean).join(" ") || "-", c.color || "-", c.placa || "-", c.chasis || "-", c.cliente?.nombre_completo || "-", c.numero_poliza || "-", c.numero_reclamo || "-", situacion];
    });
    autoTable(doc, { startY: y + 3, head: [["VEHÍCULO / AÑO", "COLOR", "PLACA", "CHASIS", "ASEGURADO", "PÓLIZA", "RECLAMO", "SITUACIÓN"]], body: filas, margin: { left: 14, right: 14, bottom: 15 }, styles: { fontSize: 8, cellPadding: 2.3, overflow: "linebreak" }, headStyles: { fillColor: [48, 54, 65], fontSize: 7 }, alternateRowStyles: { fillColor: [246, 247, 249] }, columnStyles: { 3: { cellWidth: 34 }, 7: { cellWidth: 35 } } });
    y = doc.lastAutoTable.finalY + 12;
  }
  if (!casos.length) { doc.setFontSize(11); doc.text("No hay vehículos para los filtros seleccionados.", 14, y); }
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(110); doc.text(`Domínguez Auto Pintura  |  Página ${i} de ${pages}`, 14, 200); }
  return doc.output("blob");
}
