import test from "node:test";
import assert from "node:assert/strict";
import { calcularTotales, calcularTotalesPorGrupo } from "../src/lib/cotizacion.js";

const piezas = [
  { nombre: "TAPA DE BAUL", cantidad: 1, precio: 14406.78, itbis_pct: 18, incluye_itbis: false },
];

const manoObra = [
  { nombre: "CAMB Y PINT BAUL", cantidad: 1, precio: 9000, itbis_pct: 18, incluye_itbis: false },
  { nombre: "CAMB Y PINT ADITAMENTO DE BAUL", cantidad: 1, precio: 2000, itbis_pct: 18, incluye_itbis: false },
  { nombre: "CUADRE COMPLETO", cantidad: 1, precio: 3500, itbis_pct: 18, incluye_itbis: false },
  { nombre: "JUEGO DE CLIPS", cantidad: 1, precio: 500, itbis_pct: 18, incluye_itbis: false },
];

test("los totales de piezas y mano de obra incluyen su ITBIS", () => {
  const grupos = calcularTotalesPorGrupo(piezas, manoObra);

  assert.deepEqual(grupos.piezas, { subtotal: 14406.78, itbis: 2593.22, total: 17000 });
  assert.deepEqual(grupos.manoObra, { subtotal: 15000, itbis: 2700, total: 17700 });
  assert.deepEqual(calcularTotales(piezas, manoObra), {
    subtotal: 29406.78,
    itbis: 5293.22,
    total: 34700,
  });
});

test("un precio que ya incluye ITBIS no vuelve a gravarse", () => {
  const grupos = calcularTotalesPorGrupo(
    [{ nombre: "PIEZA", cantidad: 1, precio: 1180, itbis_pct: 18, incluye_itbis: true }],
    []
  );

  assert.deepEqual(grupos.piezas, { subtotal: 1000, itbis: 180, total: 1180 });
});
