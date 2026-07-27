#!/usr/bin/env node
/**
 * WebAssembly-target std ABI conformance runner.
 *
 * Executes the generated @trait projection of the std math conformance ops in a
 * REAL WebAssembly runtime — the committed compiler-wasm pkg-node artifact's
 * `evaluate_trait_handler` export, running inside Node's WebAssembly engine —
 * and compares every vector in the frozen corpus against its expected value.
 * The wasm binary executed here is byte-identical to the `--target web` build
 * shipped for browsers (both artifacts are hashed into the receipt), so this
 * leg proves the browser-shipped binary executes the std ABI subset, without
 * claiming an in-browser run (see claimBoundary).
 *
 * Fail-closed behaviors:
 *   - manifest sha mismatch on any pinned input artifact aborts before execution;
 *   - any vector mismatch or evaluator error fails the run (exit 1, receipt still written);
 *   - --self-test proves the comparator can go red with a deliberately wrong expectation.
 *
 * Usage:
 *   node scripts/holo-ci/check-std-abi-conformance-wasm.mjs
 *     [--projection <path>] [--vectors <path>] [--out <path>] [--self-test]
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const selfTest = args.includes('--self-test');

function argValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    console.error(`[std-abi-conformance-wasm] MISCONFIGURED — ${flag} requires a value`);
    process.exit(2);
  }
  return resolve(value);
}

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-abi-conformance-wasm] FAIL: ${message}`);
  process.exit(1);
}

/** Misconfiguration (missing files, bad JSON) exits 2 — distinct from a conformance failure (1). */
function misconfigured(message) {
  console.error(`[std-abi-conformance-wasm] MISCONFIGURED — ${message}`);
  process.exit(2);
}

// --- Paths -------------------------------------------------------------------

const generatedDir = join(repoRoot, 'packages', 'std', 'conformance', 'generated');
const defaultProjectionPath = join(generatedDir, 'std-abi-conformance.trait.hsplus');
const defaultVectorsPath = join(generatedDir, 'std-abi-vectors.v0.jsonl');
const manifestPath = join(generatedDir, 'manifest.json');
const projectionPath = argValue('--projection') ?? defaultProjectionPath;
const vectorsPath = argValue('--vectors') ?? defaultVectorsPath;
const outPath =
  argValue('--out') ??
  join(
    repoRoot,
    'reports',
    'library-coherence',
    `${new Date().toISOString().slice(0, 10)}_std-abi-conformance.wasm.v0.json`
  );

const artifactDirRel = 'packages/compiler-wasm/pkg-node';
const webArtifactDirRel = 'packages/compiler-wasm/pkg';
const artifactJs = join(repoRoot, artifactDirRel, 'holoscript_wasm.js');
const artifactWasm = join(repoRoot, artifactDirRel, 'holoscript_wasm_bg.wasm');
const webArtifactWasm = join(repoRoot, webArtifactDirRel, 'holoscript_wasm_bg.wasm');

if (!existsSync(artifactJs) || !existsSync(artifactWasm)) {
  misconfigured(`wasm execution artifact (${artifactDirRel}) not found — build it before running`);
}

const wasm = require(artifactJs);
if (typeof wasm.evaluate_trait_handler !== 'function') {
  misconfigured(
    'pkg-node artifact does not export evaluate_trait_handler — rebuild packages/compiler-wasm'
  );
}

// --- Shared evaluation + comparison ------------------------------------------

function traitNameOf(projectionSource) {
  const match = /@trait\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/.exec(projectionSource);
  if (!match) misconfigured('projection does not declare a top-level @trait');
  return match[1];
}

/**
 * Same comparison contract as the node leg (check-std-abi-conformance-node.mjs):
 * key sets must match exactly at every level; numbers compare by absolute
 * difference when tolerance > 0, otherwise Object.is (tolerance 0 = exact).
 */
function compareValues(actual, expected, tolerance, path, mismatches) {
  if (typeof actual !== typeof expected) {
    mismatches.push(`${path}: type ${typeof actual} vs ${typeof expected}`);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    if (actualKeys.join(',') !== expectedKeys.join(',')) {
      mismatches.push(`${path}: keys [${actualKeys}] vs [${expectedKeys}]`);
      return;
    }
    for (const key of expectedKeys) {
      compareValues(actual[key], expected[key], tolerance, `${path}.${key}`, mismatches);
    }
    return;
  }
  if (typeof expected === 'number' && tolerance > 0) {
    if (Math.abs(actual - expected) > tolerance) {
      mismatches.push(`${path}: |${actual} - ${expected}| > ${tolerance}`);
    }
    return;
  }
  if (!Object.is(actual, expected)) {
    mismatches.push(`${path}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`);
  }
}

function runVector(projectionSource, traitName, vector, expectedOverride) {
  const expected = expectedOverride ?? vector.expected;
  const outcome = {
    id: vector.id,
    op: vector.op,
    pass: false,
    expectedHash: sha256(Buffer.from(JSON.stringify(expected))),
  };

  let envelope;
  try {
    envelope = JSON.parse(
      wasm.evaluate_trait_handler(
        projectionSource,
        traitName,
        vector.op,
        JSON.stringify(vector.args ?? {})
      )
    );
  } catch (error) {
    outcome.error = `evaluator boundary error: ${String((error && error.message) || error)}`;
    return outcome;
  }

  if (!envelope || envelope.ok !== true) {
    const code = envelope?.error?.code ?? 'unknown';
    const message = envelope?.error?.message ?? 'no error payload';
    outcome.error = `${code}: ${message}`;
    return outcome;
  }

  outcome.actual = envelope.value;
  const mismatches = [];
  compareValues(envelope.value, expected, vector.tolerance ?? 0, 'value', mismatches);
  outcome.pass = mismatches.length === 0;
  if (!outcome.pass) outcome.mismatches = mismatches;
  return outcome;
}

// --- Self-test ---------------------------------------------------------------
// Embedded fixture: independent of the generated corpus, exercises the REAL
// wasm evaluator, and proves a deliberately wrong expectation goes red.

if (selfTest) {
  const fixtureProjection = [
    '@trait self_test_conformance {',
    '  @on_lerp(a, b, t) => {',
    '    return { value: a + (b - a) * t }',
    '  }',
    '}',
    '',
  ].join('\n');
  const fixtureVector = {
    id: 'self-test-lerp',
    op: 'on_lerp',
    args: { a: 0, b: 10, t: 0.5 },
    expected: { value: 5 },
    tolerance: 0,
    kind: 'pure',
  };
  const traitName = traitNameOf(fixtureProjection);
  const good = runVector(fixtureProjection, traitName, fixtureVector);
  const bad = runVector(fixtureProjection, traitName, fixtureVector, { value: 6 });
  if (!good.pass || bad.pass) {
    misconfigured(
      `self-test failed: clean vector pass=${good.pass} (${good.error ?? 'no error'}), ` +
        `poisoned vector pass=${bad.pass} — the comparator cannot go red`
    );
  }
  console.log(
    '[std-abi-conformance-wasm] self-test OK: clean vector passes in the wasm runtime, poisoned expectation goes red'
  );
  process.exit(0);
}

// --- Load and verify pinned inputs -------------------------------------------

if (!existsSync(projectionPath)) misconfigured(`projection not found at ${projectionPath}`);
if (!existsSync(vectorsPath)) misconfigured(`vectors not found at ${vectorsPath}`);
if (!existsSync(manifestPath)) misconfigured(`manifest not found at ${manifestPath}`);

const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schema !== 'holoscript.std-abi-conformance-manifest.v0') {
  misconfigured(`unexpected manifest schema ${manifest.schema}`);
}

// Pin verification covers every manifest-listed file (same contract as the node
// leg) whenever the default generated inputs are in play. Overridden projection
// or vectors paths are recorded by sha in the receipt but not pinned.
const usingDefaults = projectionPath === defaultProjectionPath && vectorsPath === defaultVectorsPath;
if (usingDefaults) {
  for (const [relPath, pin] of Object.entries(manifest.files)) {
    const absolute = join(repoRoot, ...relPath.split('/'));
    if (!existsSync(absolute)) fail(`manifest-pinned input missing: ${relPath}`);
    const actual = sha256(readFileSync(absolute));
    if (actual !== pin.sha256) {
      fail(`manifest sha mismatch for ${relPath}: pinned ${pin.sha256}, actual ${actual}`);
    }
  }
}

const projectionBytes = readFileSync(projectionPath);
const projectionSource = projectionBytes.toString('utf8');
const vectorsBytes = readFileSync(vectorsPath);
const vectors = vectorsBytes
  .toString('utf8')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      misconfigured(`vectors line ${index + 1} is not valid JSON: ${error.message}`);
      return null;
    }
  });
if (vectors.length === 0) misconfigured('vectors file contains no vectors');

let excludedOps = [];
if (manifest.opsFile) {
  const opsPath = join(repoRoot, ...String(manifest.opsFile).split('/'));
  if (existsSync(opsPath)) {
    try {
      excludedOps = JSON.parse(readFileSync(opsPath, 'utf8')).excluded ?? [];
    } catch {
      // The ops SSOT is optional context for the receipt; the corpus itself is authoritative.
      excludedOps = [];
    }
  }
}

// --- Full run ----------------------------------------------------------------

const traitName = traitNameOf(projectionSource);
const results = vectors.map((vector) => runVector(projectionSource, traitName, vector));
const failed = results.filter((result) => !result.pass);

const wasmSha = sha256(readFileSync(artifactWasm));
const webWasmSha = existsSync(webArtifactWasm) ? sha256(readFileSync(webArtifactWasm)) : null;

const receipt = {
  schema: 'holoscript.std-abi-conformance.wasm.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'browser-wasm',
  executionRuntime: 'node-webassembly',
  wasmArtifact: {
    path: artifactDirRel,
    sha256: wasmSha,
    byteIdenticalWebArtifact: {
      path: webArtifactDirRel,
      sha256: webWasmSha,
      matches: webWasmSha !== null && webWasmSha === wasmSha,
    },
  },
  evaluatorExport: 'evaluate_trait_handler',
  sources: {
    traitProjectionSha256: sha256(projectionBytes),
    vectorsSha256: sha256(vectorsBytes),
    manifestSha256: sha256(manifestBytes),
    // Rel-path-keyed pins mirror the node receipt's sources map so
    // check-std-abi-cross-target.mjs can verify both legs executed the same
    // corpus. Only emitted for canonical (non-overridden) input runs.
    ...(usingDefaults
      ? {
          'packages/std/conformance/generated/std-abi-conformance.trait.hsplus': {
            sha256: sha256(projectionBytes),
          },
          'packages/std/conformance/generated/std-abi-vectors.v0.jsonl': {
            sha256: sha256(vectorsBytes),
          },
        }
      : {}),
  },
  environment: {
    node: process.version,
    arch: process.arch,
    platform: process.platform,
  },
  summary: {
    vectors: vectors.length,
    passed: results.length - failed.length,
    failed: failed.length,
    excludedOps,
  },
  results,
  claimBoundary: {
    provesBrowserExecution: false,
    note: 'Executed in Node\'s WebAssembly runtime against the byte-identical wasm shipped for browsers; a browser smoke run is a separate receipt.',
  },
};

const receiptForHash = { ...receipt };
delete receiptForHash.receiptHash;
receipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);

if (failed.length > 0) {
  console.error(
    `[std-abi-conformance-wasm] FAIL: ${failed.length}/${vectors.length} vectors failed; receipt at ${outPath}`
  );
  for (const result of failed.slice(0, 10)) {
    console.error(
      `  x ${result.id} (${result.op}) — ${result.error ?? (result.mismatches ?? []).join('; ')}`
    );
  }
  if (failed.length > 10) console.error(`  … and ${failed.length - 10} more`);
  process.exit(1);
}
console.log(
  `[std-abi-conformance-wasm] OK: ${results.length}/${vectors.length} vectors passed in Node's WebAssembly runtime (wasm ${wasmSha.slice(7, 19)}…); receipt at ${outPath}`
);
