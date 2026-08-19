#!/usr/bin/env node
/* global process */

// Executed negative controls for the Model Village lane census
// (scripts/check-hololand-model-village-lane-census.mjs).
//
// The census exists because 46 of 80 model-village proving tests were reachable
// from no runner, so a real safety guard could be deleted with every wired check
// still green. A census that cannot itself go red would reproduce exactly that
// defect one level up, so every failure class below is driven by a REAL fault
// injected into a real fixture tree on disk - not by asserting that a literal
// equals itself.
//
// Each test states the fault, then requires the census to name it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  runLaneCensus,
  collectLaneSurfaces,
  computeWiring,
  KNOWN_UNWIRED,
  UNWIRED_REASONS,
} from '../check-hololand-model-village-lane-census.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const created = [];

function makeFixture({ scripts = {}, checkFiles = [], testFiles = [], otherFiles = [] }) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'mv-lane-census-'));
  created.push(root);
  mkdirSync(path.join(root, 'scripts', '__tests__'), { recursive: true });
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ scripts }, null, 2));
  for (const f of checkFiles) writeFileSync(path.join(root, 'scripts', f), '// fixture\n');
  for (const f of testFiles) writeFileSync(path.join(root, 'scripts', '__tests__', f), '// fixture\n');
  for (const f of otherFiles) writeFileSync(path.join(root, 'scripts', f), '// fixture\n');
  return root;
}

test.after(() => {
  for (const dir of created) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

test('POSITIVE CONTROL: a fully wired fixture passes', () => {
  const root = makeFixture({
    checkFiles: ['check-hololand-model-village-alpha.mjs'],
    testFiles: ['hololand-model-village-alpha.test.mjs'],
    scripts: {
      'check:alpha': 'node scripts/check-hololand-model-village-alpha.mjs',
      'test:alpha': 'node --test scripts/__tests__/hololand-model-village-alpha.test.mjs',
    },
  });
  const result = runLaneCensus({ repoRoot: root, allowlist: [] });
  assert.equal(result.ok, true, `expected clean fixture to pass, got ${JSON.stringify(result.failures)}`);
  assert.equal(result.observed.wired, 2);
  assert.equal(result.observed.unwired, 0);
});

test('FAULT 1 - NEW_ORPHAN: an unwired, undeclared proof is caught', () => {
  const root = makeFixture({
    checkFiles: ['check-hololand-model-village-alpha.mjs'],
    testFiles: ['hololand-model-village-orphan.test.mjs'],
    scripts: { 'check:alpha': 'node scripts/check-hololand-model-village-alpha.mjs' },
  });
  const result = runLaneCensus({ repoRoot: root, allowlist: [] });
  assert.equal(result.ok, false, 'census stayed green with an undeclared orphan on disk');
  const kinds = result.failures.map((f) => `${f.kind}:${f.file}`);
  assert.ok(
    kinds.includes('NEW_ORPHAN:scripts/__tests__/hololand-model-village-orphan.test.mjs'),
    `expected the orphan test to be named; got ${JSON.stringify(kinds)}`,
  );
});

test('FAULT 2 - DEAD_ALLOWLIST_ENTRY: a declaration outliving its file is caught', () => {
  const root = makeFixture({
    checkFiles: ['check-hololand-model-village-alpha.mjs'],
    scripts: { 'check:alpha': 'node scripts/check-hololand-model-village-alpha.mjs' },
  });
  const result = runLaneCensus({
    repoRoot: root,
    allowlist: [{ file: 'scripts/check-hololand-model-village-deleted.mjs', reason: 'H_SERIES_RED_AT_HEAD' }],
  });
  assert.equal(result.ok, false, 'census stayed green with a declaration for a file that does not exist');
  assert.equal(result.failures[0].kind, 'DEAD_ALLOWLIST_ENTRY');
});

test('FAULT 3 - RETIRED_ALLOWLIST_ENTRY: still claiming a debt that was paid is caught', () => {
  const root = makeFixture({
    checkFiles: ['check-hololand-model-village-alpha.mjs'],
    scripts: { 'check:alpha': 'node scripts/check-hololand-model-village-alpha.mjs' },
  });
  const result = runLaneCensus({
    repoRoot: root,
    allowlist: [{ file: 'scripts/check-hololand-model-village-alpha.mjs', reason: 'H_SERIES_RED_AT_HEAD' }],
  });
  assert.equal(result.ok, false, 'census credited a declared-unwired file that is actually wired');
  assert.equal(result.failures[0].kind, 'RETIRED_ALLOWLIST_ENTRY');
});

test('FAULT 4 - MISSING_REASON: an unexplained declaration is caught', () => {
  const root = makeFixture({
    testFiles: ['hololand-model-village-orphan.test.mjs'],
    scripts: {},
  });
  const result = runLaneCensus({
    repoRoot: root,
    allowlist: [{ file: 'scripts/__tests__/hololand-model-village-orphan.test.mjs', reason: 'because' }],
  });
  assert.equal(result.ok, false, 'census accepted a declaration with no recognised reason');
  assert.equal(result.failures[0].kind, 'MISSING_REASON');
});

test('library modules are excluded, so the census cannot pad itself with false debt', () => {
  // scripts/model-village-*.mjs without a `check-` prefix are imported by other
  // scripts, never invoked by an npm script. Counting them would inflate the
  // debt with surfaces that are correctly unreferenced - the over-claiming
  // failure mode pointed the other way.
  const root = makeFixture({
    otherFiles: ['model-village-run-conductor.mjs', 'model-village-custody-store.mjs'],
    scripts: {},
  });
  const result = runLaneCensus({ repoRoot: root, allowlist: [] });
  assert.equal(result.ok, true, `library modules were counted as debt: ${JSON.stringify(result.failures)}`);
  assert.equal(result.observed.surfacesOnDisk, 0);
});

test('wiring is detected through both invocation forms the repo actually uses', () => {
  const root = makeFixture({
    checkFiles: ['check-hololand-model-village-alpha.mjs'],
    testFiles: ['hololand-model-village-beta.test.mjs', 'hololand-model-village-gamma.test.mjs'],
    scripts: {
      // bare `node`, `node --test`, and buried mid-chain behind && - all three
      // appear in package.json today.
      aggregate: 'node scripts/check-hololand-model-village-alpha.mjs && '
        + 'node --test scripts/__tests__/hololand-model-village-beta.test.mjs && '
        + 'node scripts/__tests__/hololand-model-village-gamma.test.mjs',
    },
  });
  const { wired, unwired } = computeWiring(root);
  assert.equal(unwired.length, 0, `missed a wired surface: ${JSON.stringify(unwired)}`);
  assert.equal(wired.length, 3);
});

test('THIS repo passes its own census at HEAD', () => {
  const result = runLaneCensus({ repoRoot });
  assert.equal(
    result.ok,
    true,
    `lane census failed:\n${result.failures.map((f) => `  ${f.kind} ${f.file}`).join('\n')}`,
  );
  // The census is only meaningful if it is actually looking at the lane.
  assert.ok(result.observed.surfacesOnDisk > 100, 'census found suspiciously few surfaces');
  assert.ok(result.observed.wired > 0, 'census found no wired surfaces at all');
});

test('every declared reason code is defined, and every defined code is used', () => {
  const used = new Set(KNOWN_UNWIRED.map((e) => e.reason));
  for (const reason of used) {
    assert.ok(UNWIRED_REASONS[reason], `KNOWN_UNWIRED cites undefined reason ${reason}`);
  }
  for (const reason of Object.keys(UNWIRED_REASONS)) {
    assert.ok(used.has(reason), `UNWIRED_REASONS defines ${reason} but nothing cites it - dead prose`);
  }
});

test('the emergency-stop negative control is wired, not declared', () => {
  // This is the specific regression the census was built for: the guard landed
  // in 804c511 and its only proof sat unreferenced, so neutralising the guard
  // turned exactly one check red and that check ran nowhere.
  const target = 'scripts/__tests__/hololand-model-village-emergency-stop-negative-control.test.mjs';
  assert.ok(
    collectLaneSurfaces(repoRoot).includes(target),
    'the emergency-stop negative control has gone missing from the lane',
  );
  const { wired } = computeWiring(repoRoot);
  assert.ok(wired.includes(target), 'the emergency-stop negative control is not reachable from any npm script');
  assert.ok(
    !KNOWN_UNWIRED.some((e) => e.file === target),
    'the emergency-stop negative control must not be declared unwired',
  );
});

process.on('exit', (code) => {
  if (code === 0) {
    // eslint-disable-next-line no-console
    console.log('model-village lane census: four fault classes driven red on real fixtures; repo passes its own census');
  }
});
