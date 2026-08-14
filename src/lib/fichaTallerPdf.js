import { jsPDF } from "jspdf";

const INK = [20, 24, 32];
const SOFT = [100, 116, 139];
const LINE = [190, 200, 212];
const RED = [220, 38, 38];
const M = 11;

// Espacio que se reserva abajo para el pie (linea + textos) y su margen.
const PIE_ALTO = 13;
const MARGEN_INF = 10;

const fechaImpresion = () => new Date().toLocaleDateString("es-DO", { day: "2-digit", month: "long", year: "numeric" });
const texto = (v) => String(v || "-");

function dato(doc, x, y, label, value, w) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...SOFT);
  doc.text(label.toUpperCase(), x, y);
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text(doc.splitTextToSize(texto(value), w)[0], x, y + 5);
}

export function generarFichaTaller({ caso, piezas = [], manoObra = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const CW = W - M * 2;
  const colW = (CW - 8) / 2;
  const vehiculo = [caso.marca, caso.modelo, caso.anio].filter(Boolean).join(" ");
  const llave = caso.numero_llave ? `#${caso.numero_llave}` : "SIN LLAVE";

  const textoPieza = (it) => it.nombre || "Pieza";
  const textoMano = (it) => it.descripcion || it.nombre || "Trabajo";

  // Se mide cada renglon UNA vez, con la misma fuente con la que se dibuja,
  // para poder repartir las listas entre hojas sin cortar nada.
  function medir(items, getText) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    return items.map((it) => {
      const lines = doc.splitTextToSize(getText(it), colW - 27).slice(0, 2);
      return { it, lines, alto: Math.max(8, lines.length * 4.8 + 2) };
    });
  }
  const filasPiezas = medir(piezas, textoPieza);
  const filasMano = medir(manoObra, textoMano);

  // Encabezado completo (solo en la primera hoja). Devuelve la Y donde empieza
  // el cuerpo.
  function encabezadoPrincipal() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...INK);
    doc.text("FICHA DE TALLER", M, 16);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...SOFT);
    doc.text(`Impreso: ${fechaImpresion()}`, M, 22);
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.8);
    doc.line(M, 26, W - M, 26);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...SOFT);
    doc.text("LLAVE", W - M, 13, { align: "right" });
    doc.setFontSize(24);
    doc.setTextColor(...RED);
    doc.text(llave, W - M, 22, { align: "right" });

    const y = 33;
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, 37, 1.8, 1.8, "S");
    const a = M + 5;
    const b = M + CW / 2 + 3;
    const col = CW / 2 - 9;
    dato(doc, a, y + 7, "Seguro", caso.aseguradora_nombre, col);
    dato(doc, b, y + 7, "Vehiculo", vehiculo, col);
    dato(doc, a, y + 18, "Cliente", caso.cliente_nombre, col);
    dato(doc, b, y + 18, "Placa", caso.placa, col);
    dato(doc, a, y + 29, "Telefono", caso.cliente_telefono, col);
    dato(doc, b, y + 29, "Reclamo", caso.numero_reclamo, col);
    return y + 48;
  }

  // Encabezado reducido para las hojas siguientes: identifica la ficha por si
  // las hojas se separan, sin repetir todo el bloque de datos.
  function encabezadoContinuacion() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...INK);
    doc.text(`FICHA DE TALLER · ${vehiculo || "Vehiculo"}`, M, 15);
    doc.setFontSize(12);
    doc.setTextColor(...RED);
    doc.text(`LLAVE ${llave}`, W - M, 15, { align: "right" });
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.8);
    doc.line(M, 19, W - M, 19);
    return 27;
  }

  // Dibuja el titulo de una columna y devuelve la Y del primer renglon.
  function tituloColumna(x, y, titulo, continuacion) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...RED);
    doc.text(continuacion ? `${titulo} (cont.)` : titulo, x, y + 6);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.35);
    doc.line(x, y + 9, x + colW, y + 9);
    return y + 16;
  }

  // Dibuja los renglones que quepan hasta yTope. Devuelve cuantos dibujo y
  // hasta donde llego.
  function dibujarColumna(x, yInicio, filas, desde, yTope, numeroBase) {
    let iy = yInicio;
    let i = desde;
    while (i < filas.length) {
      const f = filas[i];
      // Siempre entra al menos un renglon, aunque la hoja quede justa: asi
      // nunca se cae en una hoja vacia por un texto muy largo.
      if (iy + f.alto > yTope && i > desde) break;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...SOFT);
      doc.text(String(numeroBase + (i - desde) + 1).padStart(2, "0"), x, iy);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(...INK);
      doc.text(f.lines, x + 11, iy);
      doc.setFont("helvetica", "bold");
      doc.text(`x${Number(f.it.cantidad) || 1}`, x + colW, iy, { align: "right" });
      iy += f.alto;
      i++;
    }
    return { hasta: i, y: iy };
  }

  function vacio(x, y) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...SOFT);
    doc.text("Sin registros.", x, y);
  }

  const xIzq = M;
  const xDer = M + colW + 8;
  const separadorX = M + colW + 4;

  let iP = 0; // cuantas piezas van dibujadas
  let iM = 0; // cuanta mano de obra va dibujada
  let hoja = 0;

  do {
    if (hoja > 0) doc.addPage();
    const yTop = hoja === 0 ? encabezadoPrincipal() : encabezadoContinuacion();
    const yTope = H - MARGEN_INF - PIE_ALTO;

    const yItems = tituloColumna(xIzq, yTop, "PIEZAS A REEMPLAZAR", iP > 0);
    tituloColumna(xDer, yTop, "MANO DE OBRA", iM > 0);

    let finIzq = yItems;
    let finDer = yItems;

    if (!filasPiezas.length) vacio(xIzq, yItems);
    else if (iP < filasPiezas.length) {
      const r = dibujarColumna(xIzq, yItems, filasPiezas, iP, yTope, iP);
      finIzq = r.y;
      iP = r.hasta;
    }

    if (!filasMano.length) vacio(xDer, yItems);
    else if (iM < filasMano.length) {
      const r = dibujarColumna(xDer, yItems, filasMano, iM, yTope, iM);
      finDer = r.y;
      iM = r.hasta;
    }

    const quedaAlgo = iP < filasPiezas.length || iM < filasMano.length;
    // Si la ficha continua, el pie va al fondo de la hoja. Si es la ultima,
    // se pega al contenido para poder cortar y reutilizar el resto del papel.
    const yPie = quedaAlgo ? yTope + 5 : Math.max(finIzq, finDer) + 5;

    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.4);
    doc.line(separadorX, yTop + 1, separadorX, yPie - 6);
    doc.setDrawColor(...RED);
    doc.setLineWidth(0.55);
    doc.line(M, yPie, W - M, yPie);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...SOFT);
    doc.text("DOMINGUEZ AUTO PINTURA - FICHA INTERNA DE TALLER", M, yPie + 6);
    doc.setFontSize(15);
    doc.setTextColor(...RED);
    doc.text(caso.numero_llave ? `LLAVE #${caso.numero_llave}` : "LLAVE SIN ASIGNAR", W - M, yPie + 6, { align: "right" });

    hoja++;
  } while (iP < filasPiezas.length || iM < filasMano.length);

  // Numero de hoja: solo tiene sentido cuando la ficha ocupa varias, y se
  // escribe al final porque hasta ahora no se sabia el total.
  if (hoja > 1) {
    for (let p = 1; p <= hoja; p++) {
      doc.setPage(p);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...SOFT);
      doc.text(`Hoja ${p} de ${hoja}`, W / 2, H - 5, { align: "center" });
    }
  }

  return doc.output("blob");
}
