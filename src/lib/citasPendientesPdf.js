import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

function fecha(iso) {
  if (!iso) return "Sin fecha";
  const [anio, mes, dia] = iso.split("-");
  return [dia, mes, anio].join("/");
}
export function generarCitasPendientesPdf({ citas, desde = "", hasta = "" }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const periodo = desde || hasta
    ? `Desde ${desde ? fecha(desde) : "el inicio"} hasta ${hasta ? fecha(hasta) : "la última cita"}`
    : "Todas las fechas";
  doc.setFillColor(220, 8, 8); doc.rect(14, 12, 14, 1.5, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(19); doc.setTextColor(28, 30, 34);
  doc.text("CITAS PENDIENTES", 14, 24);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90, 97, 109);
  doc.text(`${periodo}  |  ${citas.length} ${citas.length === 1 ? "cita" : "citas"} por atender`, 14, 32);
  doc.setFontSize(8);
  doc.text("Incluye pendientes y confirmadas. Ordenado por fecha y hora.", 14, 38);
  doc.text(`Generado: ${new Date().toLocaleString("es-DO")}`, 14, 44);

  const filas = citas.map(c => {
    const caso = c.caso;
    const vehiculo = [caso?.marca?.nombre, caso?.modelo?.nombre, caso?.anio].filter(Boolean).join(" ");
    return [
      `${fecha(c.fecha)}\n${c.hora ? c.hora.slice(0, 5) : "Hora por confirmar"}`,
      `${c.nombre || c.cliente?.nombre_completo || "Sin nombre"}\n${c.telefono || "Sin teléfono"}`,
      caso ? `${vehiculo || "Vehículo"}\nPlaca: ${caso.placa || "-"}\nChasis: ${caso.chasis || "-"}` : "Sin vehículo enlazado",
      caso?.aseguradora?.nombre || "-",
      `Póliza: ${caso?.numero_poliza || "-"}\nReclamo: ${caso?.numero_reclamo || "-"}`,
      c.motivo || "-",
      c.estado === "confirmada" ? "Confirmada" : "Pendiente",
    ];
  });
  if (filas.length) {
    autoTable(doc, {
      startY: 51, head: [["FECHA / HORA", "CLIENTE / TELÉFONO", "VEHÍCULO", "ASEGURADORA", "PÓLIZA / RECLAMO", "MOTIVO", "ESTADO"]],
      body: filas, rowPageBreak: "avoid", margin: { top: 17, left: 14, right: 14, bottom: 17 },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2.5, overflow: "linebreak", valign: "top" },
      headStyles: { fillColor: [40, 46, 57], fontSize: 7 },
      alternateRowStyles: { fillColor: [246, 247, 249] },
      columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 43 }, 2: { cellWidth: 54 }, 3: { cellWidth: 34 }, 4: { cellWidth: 40 }, 5: { cellWidth: 47 }, 6: { cellWidth: 24 } },
      didDrawPage: data => {
        if (data.pageNumber > 1) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(90);
          doc.text("CITAS PENDIENTES", 14, 11);
        }
      },
    });
  } else {
    doc.setFontSize(11); doc.text("No hay citas pendientes para el período seleccionado.", 14, 58);
  }
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
    doc.text("Domínguez Auto Pintura", 14, 200);
    doc.text(`Página ${i} de ${paginas}`, 283, 200, { align: "right" });
  }
  return doc.output("blob");
}
