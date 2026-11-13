import { test } from "node:test";
import assert from "node:assert/strict";
import { listarCitasParaReporte } from "../src/lib/citasReporteDatos.js";

function clientePaginas(paginas, consultas) {
  return { from(tabla) {
    assert.equal(tabla, "citas");
    const filtros = {};
    const q = {
      select() { return this; },
      in(columna, valores) { filtros[columna] = valores; return this; },
      gte(columna, valor) { filtros.desde = [columna, valor]; return this; },
      lte(columna, valor) { filtros.hasta = [columna, valor]; return this; },
      order() { return this; },
      range(inicio, fin) {
        consultas.push({ inicio, fin, filtros });
        return paginas[consultas.length - 1];
      },
    };
    return q;
  } };
}

test("el reporte general recorre todas las páginas e incluye citas sin vehículo", async () => {
  const consultas = [];
  const primera = Array.from({ length: 500 }, (_, id) => ({ id, caso: null }));
  const segunda = [{ id: 500, caso: { archivado_en: null } }, { id: 501, caso: { archivado_en: "2026-10-01" } }];
  const citas = await listarCitasParaReporte(clientePaginas([{ data: primera }, { data: segunda }], consultas));
  assert.equal(citas.length, 501);
  assert.equal(citas.at(-1).id, 500);
  assert.deepEqual(consultas.map(c => c.inicio), [0, 500]);
  assert.deepEqual(consultas[0].filtros, { estado: ["pendiente", "confirmada"] });
});
test("el período incluye ambas fechas límite y rechaza un intervalo invertido", async () => {
  const consultas = [];
  const client = clientePaginas([{ data: [] }], consultas);
  await listarCitasParaReporte(client, { desde: "2026-11-01", hasta: "2026-11-30" });
  assert.deepEqual(consultas[0].filtros.desde, ["fecha", "2026-11-01"]);
  assert.deepEqual(consultas[0].filtros.hasta, ["fecha", "2026-11-30"]);
  await assert.rejects(listarCitasParaReporte(client, { desde: "2026-12-01", hasta: "2026-11-01" }), /intervalo/);
});

test("un error al descargar una página impide generar un reporte incompleto", async () => {
  const client = clientePaginas([{ data: null, error: new Error("Sin conexión") }], []);
  await assert.rejects(listarCitasParaReporte(client), /Sin conexión/);
});
