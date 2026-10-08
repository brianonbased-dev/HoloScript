import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { coreInfo, parseStrict, parseTolerant } from '../index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, '..', 'corpus', 'manifest.json'), 'utf8'));
const read = (file) => readFileSync(join(HERE, '..', 'corpus', file), 'utf8');
const errorsOf = (result) => result.diagnostics.filter((d) => d.severity === 'error');

/** Every diagnostic must point at a real place: 1-based, inside the source. */
function assertRealPositions(source, diagnostics) {
  const lines = source.split(/\r\n|\n|\r/);
  for (const d of diagnostics) {
    const where = `${d.code} at ${d.line}:${d.column}`;
    assert.ok(Number.isInteger(d.line) && Number.isInteger(d.column), `${where}: not integers`);
    assert.ok(d.line >= 1 && d.line <= lines.length, `${where}: line outside the source`);
    assert.ok(
      d.column >= 1 && d.column <= lines[d.line - 1].length + 1,
      `${where}: column outside the line`
    );
  }
}

for (const entry of manifest.valid) {
  test(`accepts ${entry.file}`, async () => {
    const result = await parseStrict(read(entry.file));
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(errorsOf(result), []);
    assert.equal((result.ast.objects || []).length, entry.objects);
  });
}

// Real files from the repo, copied verbatim. Rejecting any of these means the
// layer is refusing HoloScript as it is actually written.
for (const entry of manifest.real) {
  test(`accepts real file ${entry.from}`, async () => {
    const source = read(entry.file);
    const result = await parseStrict(source);
    assert.equal(result.ok, true, `${entry.covers}: ${JSON.stringify(errorsOf(result))}`);
    assertRealPositions(source, result.diagnostics);
  });
}

// An unknown trait is a warning in both modes: strict accepts the file and
// still reports the trait, at its `@`.
for (const entry of manifest.warns) {
  test(`accepts ${entry.file} with exact warnings`, async () => {
    const source = read(entry.file);
    const result = await parseStrict(source);
    assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
    assert.deepEqual(errorsOf(result), []);
    assert.equal((result.ast.objects || []).length, entry.objects);
    const warnings = result.diagnostics.filter((d) => d.severity === 'warning');
    assert.deepEqual(
      warnings.map((d) => [d.code, d.line, d.column]),
      entry.warnings
    );
    assertRealPositions(source, result.diagnostics);
  });
}

for (const entry of manifest.invalid) {
  test(`rejects ${entry.file} with exact codes and positions`, async () => {
    const source = read(entry.file);
    const result = await parseStrict(source);
    assert.equal(result.ok, false);
    assert.equal(result.ast, null);
    const got = errorsOf(result).map((d) => [d.code, d.line, d.column]);
    assert.deepEqual(got, entry.errors);
    assertRealPositions(source, result.diagnostics);
  });
}

test('an unknown trait is a warning in both modes', async () => {
  const source = read('warns/unknown-trait.holo');
  for (const result of [await parseStrict(source), await parseTolerant(source)]) {
    assert.equal(result.ok, true, result.mode);
    assert.equal((result.ast.objects || []).length, 1);
    const unknown = result.diagnostics.find((d) => d.code === 'HS1006');
    assert.ok(unknown, `HS1006 reported in ${result.mode} mode`);
    assert.equal(unknown.severity, 'warning');
  }
});

test('a caller can make unknown traits refuse the file', async () => {
  const result = await parseStrict(read('warns/unknown-trait.holo'), { unknownTraits: 'error' });
  assert.equal(result.ok, false);
  assert.deepEqual(
    errorsOf(result).map((d) => [d.code, d.line, d.column]),
    [['HS1006', 3, 3]]
  );
});

test('a caller can make a trait known (plugin vocabularies)', async () => {
  const result = await parseStrict(read('warns/unknown-trait.holo'), { knownTraits: ['nope_xyz'] });
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(
    result.diagnostics.some((d) => d.code === 'HS1006'),
    false
  );
});

test('a trait declared with @trait in the same source is known there', async () => {
  const source = '@trait {\n  name: "@made_here_xyz"\n}\n\nobject Ball {\n  @made_here_xyz\n}\n';
  const result = await parseStrict(source);
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics));
  assert.equal(
    result.diagnostics.some((d) => d.code === 'HS1006'),
    false
  );
});

test('positions stay real with Windows line endings', async () => {
  const source = 'object Cube {\r\n  position: [0, 1, 0]\r\n}\r\n}\r\n';
  const result = await parseStrict(source);
  assert.deepEqual(
    errorsOf(result).map((d) => [d.code, d.line, d.column]),
    [['HS1002', 4, 1]]
  );
});

test('the unknown-trait check is on, with every vocabulary core publishes', async () => {
  const info = await coreInfo({ fullVocabulary: true });
  assert.equal(info.traitCheck, true);
  assert.deepEqual(info.traitSources.sort(), [
    '@holoscript/core#DERIVED_TRAIT_SCHEMAS',
    '@holoscript/core#buildKnownTraitSet',
    '@holoscript/core/constants#VR_TRAITS',
    '@holoscript/core/traits/trait-registry.json',
  ]);
});
