import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS,
  HOLOSYSTEM_SOURCE_CANON_SCHEMA,
  inspectSourceCanon,
  renderSourceCanonProjection,
} from '../src/source-canon.mjs';

test('accepts only parser-owned HoloScript source formats as canonical authoring', () => {
  const report = inspectSourceCanon({
    repository: { id: 'holo', head: 'abc1234' },
    trackedFiles: ['app.holo', 'logic/main.hs', 'traits/runtime.hsplus'],
    now: new Date('2026-07-17T00:00:00.000Z'),
  });

  assert.deepEqual(HOLOSCRIPT_CANONICAL_SOURCE_EXTENSIONS, ['.holo', '.hs', '.hsplus']);
  assert.equal(report.schema, HOLOSYSTEM_SOURCE_CANON_SCHEMA);
  assert.equal(report.status, 'blocked');
  assert.equal(report.verified, false);
  assert.equal(report.formatVerified, true);
  assert.equal(report.parserVerified, false);
  assert.equal(report.scope, 'git-tracked-canon');
  assert.equal(report.summary.trackedFiles, 3);
  assert.equal(report.summary.holoScriptFiles, 3);
  assert.equal(report.summary.foreignFiles, 0);
  assert.equal(report.summary.parseMissing, 3);
  assert.deepEqual(report.foreignFiles, []);
  assert.match(report.receiptHash, /^sha256:[a-f0-9]{64}$/u);
});

test('blocks foreign authored files without treating generated names as native', () => {
  const report = inspectSourceCanon({
    repository: { id: 'holo', head: 'abc1234' },
    trackedFiles: [
      'HOLOSYSTEM.holo',
      'package.json',
      'scripts/status.mjs',
      'generated/dashboard.tsx',
      '.holorepo/portrait.json',
      '.gitignore',
    ],
    now: new Date('2026-07-17T00:00:00.000Z'),
  });

  assert.equal(report.status, 'blocked');
  assert.equal(report.verified, false);
  assert.equal(report.summary.holoScriptFiles, 1);
  assert.equal(report.summary.foreignFiles, 5);
  assert.deepEqual(report.foreignFiles, [
    '.gitignore',
    '.holorepo/portrait.json',
    'generated/dashboard.tsx',
    'package.json',
    'scripts/status.mjs',
  ]);
  assert.equal(report.issues.filter((issue) => issue.code === 'foreign-source-format').length, 5);
});

test('rejects caller-controlled format allowlists and unsafe tracked paths', () => {
  assert.throws(
    () => inspectSourceCanon({ trackedFiles: ['status.mjs'], allowedExtensions: ['.mjs'] }),
    /Unknown source-canon option allowedExtensions/u
  );
  assert.throws(
    () => inspectSourceCanon({ trackedFiles: ['../outside.holo'] }),
    /portable repository-relative path/u
  );
  assert.throws(
    () => inspectSourceCanon({ trackedFiles: ['C:\\outside\\source.holo'] }),
    /portable repository-relative path/u
  );
});

test('empty or foreign-only repositories cannot claim language sovereignty', () => {
  const empty = inspectSourceCanon({ trackedFiles: [] });
  assert.equal(empty.verified, false);
  assert.ok(empty.issues.some((issue) => issue.code === 'holoscript-source-missing'));

  const foreign = inspectSourceCanon({ trackedFiles: ['README.md'] });
  assert.equal(foreign.verified, false);
  assert.ok(foreign.issues.some((issue) => issue.code === 'holoscript-source-missing'));
  assert.ok(foreign.issues.some((issue) => issue.code === 'foreign-source-format'));
});

test('renders a founder-visible HoloScript projection without host paths', () => {
  const report = inspectSourceCanon({
    repository: { id: 'holo', head: 'abc1234' },
    trackedFiles: ['HOLOSYSTEM.holo', 'scripts/status.mjs'],
    now: new Date('2026-07-17T00:00:00.000Z'),
  });
  const projection = renderSourceCanonProjection(report);

  assert.match(projection, /composition "HoloSystemSourceCanon"/u);
  assert.match(projection, /status: "blocked"/u);
  assert.match(projection, /foreignFiles: 1/u);
  assert.match(projection, /receiptHash: "sha256:/u);
  assert.doesNotMatch(projection, /C:\\/u);
});
