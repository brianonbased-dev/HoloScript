#!/usr/bin/env node
/**
 * Owned-metal std ABI conformance runner.
 *
 * Self-contained: designed to execute from a pushed job bundle on owned
 * hardware (Jetson Orin) with zero npm dependencies. The bundle directory must
 * contain, beside this script:
 *   - pkg-node/                          (compiler-wasm nodejs artifact)
 *   - std-abi-conformance.trait.hsplus   (generated trait projection)
 *   - std-abi-vectors.v0.jsonl           (generated vector corpus)
 *   - bundle-manifest.json               ({files: {<name>: {sha256}}} pins)
 *
 * Executes every vector through the wasm evaluate_trait_handler export inside
 * this host's WebAssembly runtime and writes an owned-metal target receipt.
 *
 * Usage (from the bundle dir):
 *   node std-abi-owned-metal-runner.mjs --out receipt.json [--host-label jetson-orin]
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const bundleDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
function flagValue(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}
const outPath = resolve(flagValue('--out', join(bundleDir, 'receipt.json')));
const hostLabel = flagValue('--host-label', 'owned-metal');

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-abi-owned-metal] FAIL: ${message}`);
  process.exit(1);
}

// --- Verify bundle pins ------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(bundleDir, 'bundle-manifest.json'), 'utf8'));
for (const [name, pin] of Object.entries(manifest.files)) {
  const actual = sha256(readFileSync(join(bundleDir, ...name.split('/'))));
  if (actual !== pin.sha256) {
    fail(`bundle pin mismatch for ${name}: pinned ${pin.sha256}, actual ${actual}`);
  }
}

const traitSource = readFileSync(join(bundleDir, 'std-abi-conformance.trait.hsplus'), 'utf8');
const vectors = readFileSync(join(bundleDir, 'std-abi-vectors.v0.jsonl'), 'utf8')
  .split('\n')
  .filter((line) => line.trim().length > 0)
  .map((line) => JSON.parse(line));

const wasm = require(join(bundleDir, 'pkg-node', 'holoscript_wasm.js'));
const evaluatorExport =
  typeof wasm.evaluate_trait_handler_v2 === 'function'
    ? 'evaluate_trait_handler_v2'
    : 'evaluate_trait_handler';
if (typeof wasm[evaluatorExport] !== 'function') {
  fail('pkg-node artifact has no trait-handler evaluator export');
}
const traitName = manifest.conformanceTrait || 'std_math_conformance';

// --- Comparison --------------------------------------------------------------

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

// --- Execute -----------------------------------------------------------------

const results = [];
for (const vector of vectors) {
  const outcome = { id: vector.id, op: vector.op, pass: false };
  let parsed;
  try {
    const raw = wasm[evaluatorExport](
      traitSource,
      traitName,
      vector.op,
      JSON.stringify(vector.args)
    );
    parsed = JSON.parse(raw);
  } catch (error) {
    outcome.error = String((error && error.message) || error);
    results.push(outcome);
    continue;
  }
  if (!parsed.ok) {
    outcome.error = JSON.stringify(parsed.error);
    results.push(outcome);
    continue;
  }
  const mismatches = [];
  compareValues(parsed.value, vector.expected, vector.tolerance, 'value', mismatches);
  outcome.pass = mismatches.length === 0;
  outcome.actual = parsed.value;
  if (!outcome.pass) outcome.mismatches = mismatches;
  results.push(outcome);
}

const failed = results.filter((result) => !result.pass);

const receipt = {
  schema: 'holoscript.std-abi-conformance.owned-metal.v0',
  generatedAtISO: new Date().toISOString(),
  target: 'owned-metal',
  executionRuntime: {
    engine: `compiler-wasm ${evaluatorExport} (WebAssembly)`,
    evaluatorExport,
    executedProjection: 'std-abi-conformance.trait.hsplus (bundle copy, pin-verified)',
    wasmArtifactSha256: manifest.files['pkg-node/holoscript_wasm_bg.wasm']?.sha256 || 'unpinned',
  },
  sources: {
    'packages/std/conformance/generated/std-abi-vectors.v0.jsonl': {
      sha256: manifest.files['std-abi-vectors.v0.jsonl'].sha256,
    },
    'packages/std/conformance/generated/std-abi-conformance.trait.hsplus': {
      sha256: manifest.files['std-abi-conformance.trait.hsplus'].sha256,
    },
  },
  environment: {
    node: process.version,
    arch: process.arch,
    platform: process.platform,
    hostLabel,
    hostname: os.hostname(),
    cpus: os.cpus()[0]?.model || 'unknown',
  },
  summary: {
    vectors: vectors.length,
    passed: results.length - failed.length,
    failed: failed.length,
  },
  results,
  claimBoundary: {
    provesOwnedMetalWasmExecution: true,
    provesNodeDeterministicSubsetExecution: false,
    note: 'Executed the generated trait projection through the compiler-wasm evaluator inside this host WebAssembly runtime on owned hardware. Cross-target equality is claimed only by the cross-target checker over sibling receipts.',
  },
};

const receiptForHash = { ...receipt };
delete receiptForHash.receiptHash;
receipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

writeFileSync(outPath, `${JSON.stringify(receipt, null, 2)}\n`);

if (failed.length > 0) {
  console.error(
    `[std-abi-owned-metal] FAIL: ${failed.length}/${vectors.length} vectors failed; receipt at ${outPath}`
  );
  process.exit(1);
}
console.log(
  `[std-abi-owned-metal] OK: ${results.length}/${vectors.length} vectors passed on ${hostLabel} node ${process.version} (${process.arch}); receipt at ${outPath}`
);
