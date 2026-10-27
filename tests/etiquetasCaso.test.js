import test from "node:test";
import assert from "node:assert/strict";

import { casoAdmiteEtiqueta, etiquetaDeCaso, ETIQUETAS_CASO } from "../src/lib/etiquetasCaso.js";

test("las tres etiquetas tienen identificadores y colores distintos", () => {
  assert.deepEqual(
    ETIQUETAS_CASO.map((etiqueta) => etiqueta.id),
    ["suplir_piezas", "espera_piezas", "espera_orden"]
  );
  assert.equal(new Set(ETIQUETAS_CASO.map((etiqueta) => etiqueta.dot)).size, 3);
});

test("las etiquetas desaparecen al pasar a listo o a estados posteriores", () => {
  for (const estado of ["listo_para_trabajar", "vehiculo_en_taller", "entregado", "completado"]) {
    assert.equal(casoAdmiteEtiqueta(estado), false);
    assert.equal(etiquetaDeCaso({ estado, etiqueta_organizacion: "espera_piezas" }), null);
  }

  assert.equal(casoAdmiteEtiqueta("en_espera_piezas"), true);
  assert.equal(
    etiquetaDeCaso({ estado: "en_espera_piezas", etiqueta_organizacion: "espera_orden" })?.label,
    "Espera de orden"
  );
});
