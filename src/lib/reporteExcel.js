import ExcelJS from "exceljs";

// Colores de marca en formato ARGB para ExcelJS.
const RED = "FFD42121";
const DARK = "FF111111";
const LIGHT = "FFF3F4F6";
const GRIS = "FF6E7480";
const LINEA = "FFE5E7EB";

function ddmmaaaa(v) {
  if (!v) return "";
  // Fechas tipo "yyyy-mm-dd" (date) o ISO (timestamptz)
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  }
  const d = new Date(v);
  return isNaN(d) ? s : d.toLocaleDateString("es-DO");
}

function veh(c) {
  return [c.marca, c.modelo].filter(Boolean).join(" ");
}

// Excel: nombre de hoja <= 31 chars y sin : \ / ? * [ ]
function nombreHoja(nombre) {
  return String(nombre || "Aseguradora").replace(/[:\\/?*[\]]/g, "").slice(0, 31) || "Aseguradora";
}

function tablaSeccion(ws, startRow, titulo, casos, fechaKey) {
  ws.mergeCells(`A${startRow}:F${startRow}`);
  const h = ws.getCell(`A${startRow}`);
  h.value = titulo;
  h.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
  h.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
  h.alignment = { horizontal: "left", vertical: "middle" };
  ws.getRow(startRow).height = 18;

  const headRow = startRow + 1;
  ws.getRow(headRow).values = ["#", "Fecha", "Placa", "Vehículo", "Cliente", "Reclamo"];
  ws.getRow(headRow).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: DARK } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    cell.border = { bottom: { style: "thin", color: { argb: LINEA } } };
  });

  let r = headRow + 1;
  if (!casos.length) {
    ws.mergeCells(`A${r}:F${r}`);
    const c = ws.getCell(`A${r}`);
    c.value = "Sin registros en este período.";
    c.font = { italic: true, color: { argb: GRIS } };
    return r + 1;
  }
  casos.forEach((c, i) => {
    const row = ws.getRow(r);
    row.values = [
      i + 1,
      ddmmaaaa(c[fechaKey]),
      c.placa || "—",
      veh(c) || "—",
      c.cliente_nombre || "—",
      c.numero_reclamo || "—",
    ];
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "hair", color: { argb: LINEA } } };
    });
    r += 1;
  });
  return r;
}

function hojaAseguradora(ws, seccion, desde, hasta) {
  ws.columns = [
    { width: 6 },
    { width: 14 },
    { width: 14 },
    { width: 22 },
    { width: 28 },
    { width: 16 },
  ];

  ws.mergeCells("A1:F1");
  const t = ws.getCell("A1");
  t.value = "DOMÍNGUEZ AUTO PINTURA";
  t.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
  ws.getRow(1).height = 26;

  ws.mergeCells("A2:F2");
  const s = ws.getCell("A2");
  s.value = `Reporte para ${seccion.nombre}`;
  s.font = { bold: true, size: 12, color: { argb: RED } };
  s.alignment = { horizontal: "center" };

  ws.mergeCells("A3:F3");
  const p = ws.getCell("A3");
  p.value = `Período: ${ddmmaaaa(desde)} al ${ddmmaaaa(hasta)}`;
  p.alignment = { horizontal: "center" };
  p.font = { size: 10, color: { argb: GRIS } };

  ws.mergeCells("A5:F5");
  const r = ws.getCell("A5");
  r.value = `Vehículos entregados: ${seccion.entregados.length}      Vehículos recibidos: ${seccion.ingresados.length}`;
  r.font = { bold: true, size: 11 };
  r.alignment = { horizontal: "center" };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
  ws.getRow(5).height = 20;

  let row = 7;
  row = tablaSeccion(ws, row, "VEHÍCULOS ENTREGADOS (que sacamos)", seccion.entregados, "fecha_entrega");
  row += 1;
  tablaSeccion(ws, row, "VEHÍCULOS RECIBIDOS (que nos llegan)", seccion.ingresados, "fecha_ingreso");
}

/**
 * Genera el Excel del reporte.
 * @param {object} args
 * @param {string} args.desde  fecha inicial yyyy-mm-dd
 * @param {string} args.hasta  fecha final yyyy-mm-dd
 * @param {Array}  args.secciones  [{ nombre, entregados:[], ingresados:[] }]
 * @returns {Promise<Blob>}
 */
export async function generarReporteExcel({ desde, hasta, secciones }) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Domínguez Auto Pintura";
  wb.created = new Date();

  if (secciones.length > 1) {
    // Hoja de resumen general
    const resumen = wb.addWorksheet("Resumen general");
    resumen.columns = [{ width: 32 }, { width: 16 }, { width: 16 }];

    resumen.mergeCells("A1:C1");
    const t = resumen.getCell("A1");
    t.value = `Resumen general — ${ddmmaaaa(desde)} al ${ddmmaaaa(hasta)}`;
    t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    t.alignment = { horizontal: "center", vertical: "middle" };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: DARK } };
    resumen.getRow(1).height = 24;

    resumen.getRow(3).values = ["Aseguradora", "Entregados", "Recibidos"];
    resumen.getRow(3).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: RED } };
    });

    let r = 4;
    let totE = 0;
    let totI = 0;
    secciones.forEach((s) => {
      resumen.getRow(r).values = [s.nombre, s.entregados.length, s.ingresados.length];
      totE += s.entregados.length;
      totI += s.ingresados.length;
      r += 1;
    });
    const totalRow = resumen.getRow(r);
    totalRow.values = ["TOTAL", totE, totI];
    totalRow.eachCell((cell) => {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    });

    secciones.forEach((s) => {
      const ws = wb.addWorksheet(nombreHoja(s.nombre));
      hojaAseguradora(ws, s, desde, hasta);
    });
  } else {
    const s = secciones[0] || { nombre: "—", entregados: [], ingresados: [] };
    const ws = wb.addWorksheet(nombreHoja(s.nombre));
    hojaAseguradora(ws, s, desde, hasta);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
