import test from "node:test";
import assert from "node:assert/strict";
import { dedupeDashboardMessages } from "../src/lib/emailInbox.js";
import { gmailMessageKey, ignoredGmailLabels } from "../server/insurance-automation.js";

test("usa el Message-ID global cuando Gmail entrega una copia a dos cuentas", () => {
  const message = { payload: { headers: [{ name: "Message-ID", value: "<CASO-123@SEGURO.COM>" }] } };
  assert.equal(gmailMessageKey(message, "cuenta-a", "gmail-a"), "gmail:rfc822:caso-123@seguro.com");
  assert.equal(gmailMessageKey(message, "cuenta-b", "gmail-b"), "gmail:rfc822:caso-123@seguro.com");
});

test("solo descarta categorías de Gmail sin valor operativo", () => {
  assert.equal(ignoredGmailLabels(["INBOX", "CATEGORY_PROMOTIONS"]), true);
  assert.equal(ignoredGmailLabels(["INBOX", "CATEGORY_UPDATES"]), false);
});

test("oculta una copia del mismo correo recibida por dos cuentas", () => {
  const base = {
    titulo: "Documento del seguro",
    cuerpo: "Cotización recibida sin diferencias.",
    metadata: { remitente: "ajustador@seguro.com", asunto: "Caso G123456" },
  };
  const result = dedupeDashboardMessages([
    { ...base, id: "a", creado_en: "2026-08-26T10:00:08Z" },
    { ...base, id: "b", creado_en: "2026-08-26T10:00:00Z" },
  ]);
  assert.deepEqual(result.map((message) => message.id), ["a"]);
});

test("conserva respuestas distintas aunque pertenezcan al mismo hilo", () => {
  const metadata = { remitente: "ajustador@seguro.com", asunto: "RE: Caso G123456" };
  const result = dedupeDashboardMessages([
    { id: "a", creado_en: "2026-08-26T10:05:00Z", titulo: "Correo", cuerpo: "Primera respuesta", metadata },
    { id: "b", creado_en: "2026-08-26T10:04:00Z", titulo: "Correo", cuerpo: "Segunda respuesta", metadata },
  ]);
  assert.equal(result.length, 2);
});

test("conserva correos iguales enviados en fechas separadas", () => {
  const base = { titulo: "Recordatorio", cuerpo: "Pendiente", metadata: { remitente: "a@b.com", asunto: "Caso" } };
  const result = dedupeDashboardMessages([
    { ...base, id: "a", creado_en: "2026-08-26T10:00:00Z" },
    { ...base, id: "b", creado_en: "2026-08-26T09:30:00Z" },
  ]);
  assert.equal(result.length, 2);
});
