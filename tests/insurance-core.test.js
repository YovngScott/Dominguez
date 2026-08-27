import test from "node:test";
import assert from "node:assert/strict";
import { assessPdfPackage, compareQuoteLines, descriptionSimilarity, extractIdentifiers, inferInsurerSections, insurerLineType, isDominguezSupplier } from "../server/insurance-core.js";

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

test("un PDF solo de piezas no marca la mano de obra como eliminada", () => {
  const result = compareQuoteLines(
    { items_piezas: [{ nombre: "BUMPER", cantidad: 1, precio: 3000 }], items_mano_obra: [{ nombre: "PINTAR BUMPER", precio: 5000 }] },
    [{ tipo: "pieza", descripcion: "PARACHOQUE", cantidad: 1, monto: 3000, proveedor: "Dominguez Auto Pintura" }],
    { sectionsPresent: { pieza: true, mano_obra: false } },
  );
  assert.equal(result.removed.length, 0);
  assert.deepEqual(result.omittedTypes, ["mano_obra"]);
});

test("SURA MAN significa mano de obra y no elimina las piezas ausentes", () => {
  const insurerLines = [
    {
      type: "pieza",
      source_type_code: "MAN",
      description: "GUARDALODO DELANTERO LH",
      quantity: 1,
      effective_subtotal: 7200,
    },
  ];
  const sectionsPresent = inferInsurerSections(insurerLines, ["pieza"]);
  const result = compareQuoteLines(
    {
      items_piezas: [{ nombre: "FARO DELANTERO LH", cantidad: 1, precio: 12000 }],
      items_mano_obra: [{ nombre: "CAMB Y PINT", pieza: "GUARDALODO DELT LH", cantidad: 1, precio: 7200 }],
    },
    insurerLines,
    { sectionsPresent },
  );

  assert.equal(insurerLineType(insurerLines[0]), "mano_obra");
  assert.deepEqual(sectionsPresent, { pieza: false, mano_obra: true });
  assert.equal(result.removed.length, 0);
  assert.equal(result.added.length, 0);
  assert.equal(result.changed.length, 0);
  assert.deepEqual(result.omittedTypes, ["pieza"]);
});

test("SURA empareja abreviaturas y errores frecuentes en nombres de mano de obra", () => {
  const comparison = compareQuoteLines({
    items_piezas: [{ nombre: "SOPORTE SUPERIOR DE FRENTIL", cantidad: 1, precio: 12000 }],
    items_mano_obra: [
      { nombre: "CAMB Y PINT", pieza: "BUMPER DEL SUP", cantidad: 1, precio: 7200 },
      { nombre: "DESAB Y PINT", pieza: "FRENTIN", cantidad: 1, precio: 7200 },
    ],
  }, [
    { description: "BUMPER DELANTERO SUPERIOR", type: "pieza", source_type_code: "MAN", quantity: 1, unit_price: 7200 },
    { description: "FRENTIL", type: "pieza", source_type_code: "MAN", quantity: 1, unit_price: 7200 },
  ], { sectionsPresent: { pieza: false, mano_obra: true } });

  assert.equal(comparison.summary.localLines, 2);
  assert.equal(comparison.summary.matched, 2);
  assert.equal(comparison.summary.removed, 0);
  assert.equal(comparison.summary.added, 0);
  assert.deepEqual(comparison.omittedTypes, ["pieza"]);
});

test("reconoce proveedor Dominguez con acentos y razón social", () => {
  assert.equal(isDominguezSupplier("DOMÍNGUEZ AUTO PINTURA, SRL"), true);
  assert.equal(isDominguezSupplier("Otro suplidor"), false);
});

test("bloquea los tres PDF si cualquiera tiene diferencias", () => {
  const status = assessPdfPackage(3, [
    { legible: true, confidence: 0.99 },
    { legible: true, confidence: 0.95 },
    { legible: true, confidence: 0.98 },
  ], { hasDifferences: true });
  assert.equal(status.blocked, true);
  assert.equal(status.hasDifferences, true);
});

test("bloquea el paquete si falta o no se entiende un PDF", () => {
  assert.equal(assessPdfPackage(3, [{ legible: true, confidence: 1 }, { legible: false, confidence: 0.3 }], { hasDifferences: false }).blocked, true);
});
