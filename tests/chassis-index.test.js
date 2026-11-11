import { test } from "node:test";
import assert from "node:assert/strict";
import { jsPDF } from "jspdf";
import { identifiers, normalizeChassis, readPdf } from "../server/chassis-document.js";
import { initialWindows, indexView, messageParts } from "../server/chassis-index.js";

const chassis = "5XYPGA3XHG270421";

test("localiza el chasis de La Colonial en un PDF de dos vehículos y conserva la página", async () => {
  const pdf = new jsPDF();
  pdf.text("ORDEN DE COMPRA - LA COLONIAL", 15, 20);
  pdf.text("Chasis: KMHE341DBCAA560284", 15, 40);
  pdf.addPage();
  pdf.text("Chasis: " + chassis, 15, 20);
  const result = await readPdf(new Uint8Array(pdf.output("arraybuffer")), () => assert.fail("PDF de texto"));
  assert.equal(result.order, true);
  assert.deepEqual(result.evidence.find(e => e.chasis === chassis), { chasis: chassis, fuente: "PDF", pagina: 2 });
});

test("pide lectura visual para una página sin texto y una lectura dudosa queda por revisar", async () => {
  const pdf = new jsPDF();
  const bin = new Uint8Array(pdf.output("arraybuffer"));
  for (const legible of [true, false]) {
    const result = await readPdf(bin, async (_bytes, pages) => {
      assert.deepEqual(pages, [1]);
      return [{ pagina: 1, orden: true, chasis: [chassis], legible }];
    });
    assert.equal(result.uncertain, !legible);
    assert.equal(result.order, true);
    assert.equal(result.evidence.length, Number(legible));
  }
});

test("acepta el identificador literal con separadores y recorre adjuntos MIME anidados", () => {
  assert.equal(normalizeChassis("5xy pga3x-hg270421"), chassis);
  assert.ok(identifiers("CHASIS: 5XY PGA3X HG270421").includes(chassis));
  assert.deepEqual(messageParts({ parts: [{ parts: [{ mimeType: "application/pdf" }] }] }).map(e => e.path), ["0", "0.0", "0.0.0"]);
});

test("la carga comienza 93 días atrás y la búsqueda espera los PDF y las incidencias históricas", async () => {
  const [past, live] = initialWindows("cuenta", 1800000000);
  assert.equal(live.desde - past.desde, 93 * 86400);
  assert.equal(live.desde, past.hasta);
  for (const issue of [{ terminado: false }, { pendientes_historicos: 4 }, { incidencias_historicas_abiertas: 1 }]) {
    const coverage = [{ id: "cuenta", terminado: true, pendientes_historicos: 0, incidencias_historicas_abiertas: 0, ...issue }];
    const db = { from: () => ({ select: () => ({ order: () => ({ data: coverage }), in: () => ({}) }) }) };
    const view = await indexView(db, "index_search", { chasis: chassis });
    assert.equal(view.ready, false);
    assert.deepEqual(view.rows, []);
  }
});
