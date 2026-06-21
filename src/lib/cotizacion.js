// Lógica compartida de cálculo de ítems y totales de una cotización.

export const ITBIS_DEFAULT = 18;

export const LADOS = ["Delantero", "Trasero", "Izquierdo", "Derecho", "N/A"];
export const SUB_LADOS = ["Izquierdo", "Derecho", "Central", "N/A"];

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

/** Nombre completo de una pieza incluyendo lado/sub-lado si aplica. */
export function nombrePieza(item) {
  const partes = [item.nombre];
  if (item.lado && item.lado !== "N/A") partes.push(item.lado.toUpperCase());
  if (item.sub_lado && item.sub_lado !== "N/A") partes.push(item.sub_lado.toUpperCase());
  return partes.filter(Boolean).join(" ");
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
