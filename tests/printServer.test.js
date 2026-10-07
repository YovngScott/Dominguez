import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

test("la web siempre usa el Print Server local", () => {
  const source = fs.readFileSync(new URL("../src/lib/printServer.js", import.meta.url), "utf8");
  assert.match(source, /http:\/\/127\.0\.0\.1:9100/);
  assert.doesNotMatch(source, /http:\/\/localhost:9100/);
  assert.doesNotMatch(source, /10\.0\.0\.13/);
});
