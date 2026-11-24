import test from "node:test";
import assert from "node:assert/strict";
import { MAX_DOCUMENTO_BYTES, subirDocumentoCaso, vistaPreviaDocumento } from "../src/lib/documentosCaso.js";

function setup({ insertError = null, uploadError = null, user = { id: "usuario" } } = {}) {
  const calls = [];
  const bucket = {
    async upload(...args) { calls.push(["upload", ...args]); return { error: uploadError }; },
    async remove(...args) { calls.push(["remove", ...args]); return { error: null }; },
  };
  const client = {
    auth: { async getUser() { return { data: { user }, error: null }; } },
    storage: { from(name) { assert.equal(name, "documentos-casos"); return bucket; } },
    from(name) {
      assert.equal(name, "documentos_caso");
      return { async insert(row) { calls.push(["insert", row]); return { error: insertError }; } };
    },
  };
  return { client, calls };
}

const options = { casoId: "caso", tipoId: "tipo", id: "archivo-unico" };

test("carga Word, Excel y archivos de formato desconocido con su nombre y contenido originales", async () => {
  for (const [name, type, expectedType, extension] of [
    ["Ajuste técnico.DOCX", "", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
    ["Orden de piezas.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
    ["Respaldo.zip", "application/zip", "application/zip", ".zip"],
    ["Datos.formato", "", "application/octet-stream", ".formato"],
    ["Sin extension", "", "application/octet-stream", ""],
    ["cotizacion.pdf", "application/pdf", "application/pdf", ".pdf"],
  ]) {
    const { client, calls } = setup();
    const file = { name, type, size: 1234 };
    const path = await subirDocumentoCaso({ ...options, client, file });
    assert.equal(path, `caso/archivo-unico${extension}`);
    assert.equal(calls[0][2], file);
    assert.equal(calls[0][3].contentType, expectedType);
    assert.equal(calls[1][1].nombre_archivo, name);
    assert.equal(calls[1][1].uploaded_by, "usuario");
    assert.equal(calls[1][1].storage_path, path);
  }
});

test("rechaza archivos mayores de 50 MB antes de subir y permite exactamente el límite", async () => {
  const { client, calls } = setup();
  await assert.rejects(subirDocumentoCaso({ ...options, client, file: { name: "grande.xlsx", size: MAX_DOCUMENTO_BYTES + 1 } }), /50 MB/);
  assert.deepEqual(calls, []);
  await subirDocumentoCaso({ ...options, client, file: { name: "limite.xlsx", size: MAX_DOCUMENTO_BYTES } });
  assert.equal(calls.length, 2);
});

test("si falla el registro retira el archivo subido y muestra el error", async () => {
  const { client, calls } = setup({ insertError: new Error("No se pudo guardar") });
  await assert.rejects(subirDocumentoCaso({ ...options, client, file: { name: "orden.docx", size: 100 } }), /No se pudo guardar/);
  assert.deepEqual(calls.at(-1), ["remove", ["caso/archivo-unico.docx"]]);
});

test("un error de almacenamiento no crea un registro y la sesión es obligatoria", async () => {
  const denied = setup({ uploadError: new Error("No autorizado") });
  await assert.rejects(subirDocumentoCaso({ ...options, client: denied.client, file: { name: "orden.xlsx", size: 100 } }), /No autorizado/);
  assert.equal(denied.calls.length, 1);
  const signedOut = setup({ user: null });
  await assert.rejects(subirDocumentoCaso({ ...options, client: signedOut.client, file: { name: "orden.xlsx", size: 100 } }), /Inicia sesión/);
  assert.deepEqual(signedOut.calls, []);
});

test("solo documentos compatibles se previsualizan; Office, HTML y SVG se descargan", () => {
  assert.equal(vistaPreviaDocumento("Cotización.PDF"), "pdf");
  assert.equal(vistaPreviaDocumento("Foto.jpg"), "imagen");
  for (const name of ["orden.docx", "piezas.xlsx", "pagina.html", "imagen.svg", "archivo"]) {
    assert.equal(vistaPreviaDocumento(name), null);
  }
});
