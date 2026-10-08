import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseStrict, parseTolerant } from "../index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, "..", "corpus", "manifest.json"), "utf8"));
const read = (file) => readFileSync(join(HERE, "..", "corpus", file), "utf8");

for (const entry of manifest.valid) {
  test(`accepts ${entry.file}`, async () => {
    const result = await parseStrict(read(entry.file));
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.equal((result.ast.objects || []).length, entry.objects);
  });
}

for (const entry of manifest.invalid) {
  test(`rejects ${entry.file}`, async () => {
    const result = await parseStrict(read(entry.file));
    assert.equal(result.ok, false);
    const codes = result.diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
    for (const code of entry.expect) assert.ok(codes.includes(code), `missing ${code}, got ${codes}`);
    for (const d of result.diagnostics) {
      assert.ok(typeof d.line === "number" && typeof d.column === "number", "every diagnostic carries a position");
    }
  });
}

test("tolerant mode never throws and keeps what parsed", async () => {
  const result = await parseTolerant(read("invalid/unknown-trait.holo"));
  assert.equal(result.ok, true);
  assert.equal((result.ast.objects || []).length, 1);
  assert.ok(result.diagnostics.length > 0);
});
