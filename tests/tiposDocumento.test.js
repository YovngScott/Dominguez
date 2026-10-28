import test from "node:test";
import assert from "node:assert/strict";

import {
  nombreTipoDocumento,
  prepararTiposDocumento,
  TIPOS_DOCUMENTO,
  tiposDocumentoRequierenSincronizacion,
} from "../src/lib/tiposDocumento.js";

test("el catálogo solo contiene tipos específicos y en mayúsculas", () => {
  assert.equal(TIPOS_DOCUMENTO.length, 6);
  assert.equal(TIPOS_DOCUMENTO.some((tipo) => tipo.label === "COTIZACIÓN DEL SEGURO"), false);
  assert.equal(TIPOS_DOCUMENTO.some((tipo) => tipo.label === "OTRO"), false);
  assert.equal(TIPOS_DOCUMENTO.some((tipo) => tipo.label === "AJUSTE TÉCNICO"), true);
  TIPOS_DOCUMENTO.forEach((tipo) => assert.equal(tipo.label, tipo.label.toLocaleUpperCase("es-DO")));
});

test("filtra los tipos heredados y conserva el orden definido", () => {
  const filas = [
    { id: "otro", nombre: "Otro", orden: 7 },
    { id: "seguro", nombre: "Cotización del seguro", orden: 2 },
    ...TIPOS_DOCUMENTO.map((tipo) => ({ id: tipo.label, nombre: tipo.nombre, orden: tipo.orden })),
  ];

  const visibles = prepararTiposDocumento(filas);
  assert.deepEqual(visibles.map((tipo) => tipo.label), TIPOS_DOCUMENTO.map((tipo) => tipo.label));
  assert.equal(tiposDocumentoRequierenSincronizacion(filas), false);
  assert.equal(nombreTipoDocumento("Cotización del taller"), "COTIZACIÓN DEL TALLER");
  assert.equal(nombreTipoDocumento("documento anterior"), "DOCUMENTO ANTERIOR");
});
