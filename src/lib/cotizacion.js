// Lógica compartida de cálculo de ítems y totales de una cotización.

export const ITBIS_DEFAULT = 18;

export const TIPOS_IDENTIFICACION = ["Cédula", "Pasaporte", "RNC"];

export const TIPOS_VEHICULO = [
  "Automóvil",
  "Jeep / SUV",
  "Camioneta",
  "Motocicleta",
  "Autobús / Minibús",
  "Van / Furgoneta",
  "Camión",
];

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * Calcula los montos de una línea (pieza o servicio).
 * Devuelve { neto, itbisMonto, total } para la cantidad indicada.
 */
export function calcularItem(item) {
  const cantidad = n(item.cantidad) || 1;
  const precio = n(item.precio);
  const pct = n(item.itbis_pct);

  let netoUnit, itbisUnit;
  if (item.incluye_itbis) {
    netoUnit = precio / (1 + pct / 100);
    itbisUnit = precio - netoUnit;
  } else {
    netoUnit = precio;
    itbisUnit = precio * (pct / 100);
  }

  return {
    neto: netoUnit * cantidad,
    itbisMonto: itbisUnit * cantidad,
    total: (netoUnit + itbisUnit) * cantidad,
  };
}

/** Suma los totales de piezas + mano de obra. */
export function calcularTotales(piezas = [], manoObra = []) {
  let subtotal = 0;
  let itbis = 0;
  [...piezas, ...manoObra].forEach((it) => {
    const c = calcularItem(it);
    subtotal += c.neto;
    itbis += c.itbisMonto;
  });
  return {
    subtotal: round2(subtotal),
    itbis: round2(itbis),
    total: round2(subtotal + itbis),
  };
}

// Abreviaturas únicas que se usan en el catálogo y al escribir una pieza.
// Mantenerlas aquí permite que las cotizaciones históricas (que tenían los
// campos lado/sub_lado) también se vean con el formato nuevo, sin tocar sus
// precios ni sus datos guardados.
const ABREVIATURAS_PIEZA = [
  [/\bPARACHOQUES?\b/g, "BUMPER"],
  [/\bBOMPER\b/g, "BUMPER"],
  [/\bGUARDALODOS\b/g, "GUARDALODO"],
  [/\bDELANTERO\b/g, "DELT"],
  [/\bTRASERO\b/g, "TRAS"],
  [/\bIZQUIERDO\b/g, "LH"],
  [/\bIZQUIERDA\b/g, "LH"],
  [/\bDERECHO\b/g, "RH"],
  [/\bDERECHA\b/g, "RH"],
  [/\bSUPERIOR\b/g, "SUP"],
  [/\bINFERIOR\b/g, "INF"],
  [/\bCENTRAL\b/g, "CENT"],
];

/** Convierte nombres y lados antiguos al formato corto del taller. */
export function normalizarNombrePieza(valor) {
  let texto = String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[,_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  ABREVIATURAS_PIEZA.forEach(([patron, reemplazo]) => {
    texto = texto.replace(patron, reemplazo);
  });
  return texto.replace(/\s+/g, " ").trim();
}

/** Nombre visible de la pieza. Compatibilidad con lado/sub-lado antiguos. */
export function nombrePieza(item) {
  const base = normalizarNombrePieza(item?.nombre);
  const extras = [item?.lado, item?.sub_lado]
    .filter((parte) => parte && parte !== "N/A")
    .map(normalizarNombrePieza)
    .filter(Boolean);
  const existentes = new Set(base.split(" "));
  const nuevos = extras.filter((parte) => !existentes.has(parte));
  return [base, ...nuevos].filter(Boolean).join(" ");
}

export function round2(x) {
  return Math.round((x + Number.EPSILON) * 100) / 100;
}

export function rd(x) {
  return `RD$ ${n(x).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
