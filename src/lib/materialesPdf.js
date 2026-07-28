import { jsPDF } from "jspdf";

const MATERIALES = ["Removedor", "Ferrer", "Lija #80", "Lija #120", "Lija #220", "Lija #40", "Lija #150", "Lija #320", "Lija #400", "Lija #600", "Lija #800", "Lija #1200", "Lija #1500", "Lija #2000", "Masken tape", "Disco adhesivo", "Presor", "Pintura laca negra", "Pintura laca", "Pintura Uretano", "Clear uretano", "Thinner", "Reductor", "Coladores", "Silicón regular", "Silicón uretano", "Abrazaderas plásticas", "Relleno Laca", "Relleno Uretano", "Masilla Polymax", "Masilla Star Glass", "Fended", "Fended especial", "Emeril", "Racine", "Aditivo P/ Plásticos", "Cinta doble cara", "Cinta decorativa", "Sea Scaler", "Varilla Bronce"];
const INK = [20, 24, 32]; const SOFT = [100, 116, 139]; const LINE = [178, 190, 205]; const RED = [220, 38, 38]; const M = 10;
const val = (x) => String(x || "—");

function dato(doc, x, y, label, value, w) { doc.setFont("helvetica", "bold"); doc.setFontSize(5.8); doc.setTextColor(...SOFT); doc.text(label, x, y); doc.setFontSize(7.6); doc.setTextColor(...INK); doc.text(doc.splitTextToSize(val(value), w)[0], x, y + 3.5); }

export function generarReporteMateriales({ caso = {}, orden = {} }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" }); const W = 210; const H = 297; const CW = W - M * 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...INK); doc.text("REPORTE DE MATERIALES PARA SUMINISTROS", M, 13);
  doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...SOFT); doc.text(`Fecha de impresión: ${new Date().toLocaleDateString("es-DO")}`, M, 18);
  doc.setFillColor(...RED); doc.roundedRect(W - M - 28, 5, 28, 16, 2, 2, "F"); doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(255,255,255); doc.text("LLAVE", W-M-14, 10, {align:"center"}); doc.setFontSize(17); doc.text(caso.numero_llave ? `#${caso.numero_llave}` : "—", W-M-14, 17, {align:"center"});
  let y = 26; doc.setDrawColor(...LINE); doc.roundedRect(M,y,CW,36,1.5,1.5,"S"); const cols = [M+4, M+52, M+100, M+148]; const w=42;
  dato(doc,cols[0],y+6,"SEGURO",caso.aseguradora_nombre,w); dato(doc,cols[1],y+6,"CLIENTE",caso.cliente_nombre,w); dato(doc,cols[2],y+6,"TELÉFONO",caso.cliente_telefono,w); dato(doc,cols[3],y+6,"VEHÍCULO",vehiculo,w);
  dato(doc,cols[0],y+17,"PLACA",caso.placa,w); dato(doc,cols[1],y+17,"CHASIS",caso.chasis,w); dato(doc,cols[2],y+17,"COLOR",caso.color,w); dato(doc,cols[3],y+17,"DEDUCTIBLE",caso.deductible || orden.costo,w);
  dato(doc,cols[0],y+28,"RECLAMO",caso.numero_reclamo,w); dato(doc,cols[1],y+28,"ENTRADA",caso.fecha_ingreso,w); dato(doc,cols[2],y+28,"SALIDA",caso.fecha_entrega ? new Date(caso.fecha_entrega).toLocaleDateString("es-DO") : "—",w); dato(doc,cols[3],y+28,"NÚMERO DE LLAVE",caso.numero_llave ? `#${caso.numero_llave}` : "Sin asignar",w);
  y += 42;
  const xs=[M,M+29,M+100,M+132,M+160,W-M]; const headers=["EMPLEADO","MATERIALES","MARCA","CANTIDAD","COSTO"];
  doc.setFillColor(...INK); doc.rect(M,y,CW,7,"F"); doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(255,255,255); headers.forEach((h,i)=>doc.text(h,xs[i]+2,y+4.5)); y+=7;
  const rowH=4.45; doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.setFont("helvetica","normal"); doc.setFontSize(6.2); doc.setTextColor(...INK);
  MATERIALES.forEach((material) => { doc.rect(M,y,CW,rowH,"S"); for(let i=1;i<xs.length-1;i++) doc.line(xs[i],y,xs[i],y+rowH); doc.text(material,xs[1]+2,y+3); y+=rowH; });
  y += 5; doc.setFont("helvetica","bold"); doc.setFontSize(9); doc.text("TOTAL DE MATERIALES: RD$ ______________________________", M, y); y += 15; doc.setDrawColor(...INK); doc.line(M+55,y,W-M-55,y); doc.setFontSize(7); doc.setTextColor(...SOFT); doc.text("ENCARGADO DPTO. SUMINISTRO", W/2, y+4,{align:"center"});
  doc.setFont("helvetica","bold"); doc.setFontSize(12); doc.setTextColor(...RED); doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", W-M, H-10,{align:"right"});
  return doc.output("blob");
}
