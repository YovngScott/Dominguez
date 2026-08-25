import test from "node:test";
import assert from "node:assert/strict";
import { compareQuoteLines, descriptionSimilarity, extractIdentifiers } from "../api/_insurance-core.js";

test("extrae chasis y placa del asunto", () => {
  assert.deepEqual(extractIdentifiers("Kia placa G624728, chasis MZBEP814BPN407288"), {
    chassis: "MZBEP814BPN407288",
    plate: "G624728",
  });
});

test("reconoce nombres equivalentes sin confundir lados", () => {
  assert.ok(descriptionSimilarity("BUMPER DELT RH", "Parachoque delantero derecho") > 0.85);
  assert.ok(descriptionSimilarity("GUARDALODO DELT LH", "guardafango delantero izquierdo") > 0.85);
  assert.ok(descriptionSimilarity("GUARDALODO DELT LH", "guardafango delantero derecho") < 0.8);
});

test("detecta precio cambiado, línea eliminada y línea agregada", () => {
  const quote = {
    items_piezas: [
      { nombre: "BONETE", cantidad: 1, precio: 2000 },
      { nombre: "FOCO DELT RH", cantidad: 1, precio: 900 },
    ],
    items_mano_obra: [{ nombre: "DESAB Y PINT", pieza: "PUERTA DELT RH", cantidad: 1, precio: 5000 }],
  };
  const result = compareQuoteLines(quote, [
    { tipo: "pieza", descripcion: "CAPO", cantidad: 1, precio_unitario: 1700, monto: 1700 },
    { tipo: "mano_obra", descripcion: "DESABOLLAR Y PINTAR PUERTA DELANTERA DERECHA", cantidad: 1, monto: 5000 },
    { tipo: "pieza", descripcion: "PARRILLA DELANTERA", cantidad: 1, monto: 1200 },
  ]);
  assert.equal(result.changed.length, 1);
  assert.equal(result.removed.length, 1);
  assert.equal(result.added.length, 1);
  assert.equal(result.hasDifferences, true);
});

test("no marca diferencias cuando las líneas equivalentes coinciden", () => {
  const result = compareQuoteLines(
    { items_piezas: [{ nombre: "BUMPER TRAS", cantidad: 1, precio: 3000 }], items_mano_obra: [] },
    [{ tipo: "pieza", descripcion: "PARACHOQUE TRASERO", cantidad: 1, monto: 3000 }],
  );
  assert.equal(result.hasDifferences, false);
});
