#!/usr/bin/env node
/**
 * Cross-target std ABI conformance equality checker.
 *
 * Consumes two or more per-target conformance receipts (node / browser-wasm /
 * owned-metal), verifies that every receipt executed the identical pinned
 * vector corpus, that every vector passed on every target, and that the actual
 * produced values are exactly equal across targets. Writes a cross-target
 * equality receipt.
 *
 * Usage:
 *   node scripts/holo-ci/check-std-abi-cross-target.mjs \
 *     --receipt reports/library-coherence/2026-07-26_std-abi-conformance.node.v0.json \
 *     --receipt reports/library-coherence/2026-07-26_std-abi-conformance.wasm.v0.json \
 *     [--receipt <owned-metal receipt>] [--out <path>] [--self-test]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');

const args = process.argv.slice(2);
const receiptPaths = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--receipt') receiptPaths.push(resolve(args[i + 1]));
}
const outFlagIndex = args.indexOf('--out');
const outPath =
  outFlagIndex >= 0
    ? resolve(args[outFlagIndex + 1])
    : join(
        repoRoot,
        'reports',
        'library-coherence',
        '2026-07-26_std-abi-conformance.cross-target.v0.json'
      );
const selfTest = args.includes('--self-test');

function sha256(buffer) {
  return `sha256:${createHash('sha256').update(buffer).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-abi-cross-target] FAIL: ${message}`);
  process.exit(1);
}

function durableReceiptPath(path) {
  const repoRelative = relative(repoRoot, path).replace(/\\/g, '/');
  return repoRelative !== '..' && !repoRelative.startsWith('../')
    ? repoRelative
    : path.replace(/\\/g, '/');
}

function valuesEqual(a, b, tolerance, path, mismatches) {
  if (typeof a !== typeof b) {
    mismatches.push(`${path}: type ${typeof a} vs ${typeof b}`);
    return;
  }
  if (a !== null && typeof a === 'object') {
    const aKeys = Object.keys(a).sort();
    const bKeys = Object.keys(b).sort();
    if (aKeys.join(',') !== bKeys.join(',')) {
      mismatches.push(`${path}: keys [${aKeys}] vs [${bKeys}]`);
      return;
    }
    for (const key of aKeys) valuesEqual(a[key], b[key], tolerance, `${path}.${key}`, mismatches);
    return;
  }
  if (typeof a === 'number' && tolerance > 0) {
    if (Math.abs(a - b) > tolerance) {
      mismatches.push(`${path}: |${a} - ${b}| > ${tolerance}`);
    }
    return;
  }
  if (!Object.is(a, b)) {
    mismatches.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  }
}

function loadCorpusVectorMeta() {
  const vectorsPath = join(
    repoRoot,
    'packages',
    'std',
    'conformance',
    'generated',
    'std-abi-vectors.v0.jsonl'
  );
  const map = new Map();
  try {
    for (const line of readFileSync(vectorsPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const vector = JSON.parse(line);
      map.set(vector.id, {
        tolerance: vector.tolerance ?? 0,
        targets: Array.isArray(vector.targets) ? vector.targets : null,
      });
    }
  } catch {
    // no corpus available (e.g. self-test fixtures) — exact comparison, all targets
  }
  return map;
}

function compareReceipts(receipts, vectorMeta = new Map()) {
  const problems = [];
  const vectorsPin = 'packages/std/conformance/generated/std-abi-vectors.v0.jsonl';

  const pins = receipts.map((entry) => entry.receipt.sources?.[vectorsPin]?.sha256);
  if (pins.some((pin) => !pin)) {
    problems.push('a receipt is missing the pinned vectors sha');
  } else if (new Set(pins).size !== 1) {
    problems.push(`receipts pin different vector corpora: ${pins.join(' vs ')}`);
  }

  for (const entry of receipts) {
    if (entry.receipt.summary?.failed !== 0) {
      problems.push(`${entry.receipt.target}: ${entry.receipt.summary?.failed} failed vectors`);
    }
  }

  const byTarget = receipts.map((entry) => ({
    target: entry.receipt.target,
    results: new Map((entry.receipt.results || []).map((result) => [result.id, result])),
  }));

  const allIds = new Set();
  for (const entry of byTarget) for (const id of entry.results.keys()) allIds.add(id);
  for (const id of vectorMeta.keys()) allIds.add(id);

  let comparedVectors = 0;
  let toleranceBoundedVectors = 0;
  let targetScopedVectors = 0;
  for (const id of allIds) {
    const meta = vectorMeta.get(id) ?? { tolerance: 0, targets: null };
    const eligible = meta.targets
      ? byTarget.filter((entry) => meta.targets.includes(entry.target))
      : byTarget;
    if (meta.targets) targetScopedVectors += 1;
    if (eligible.length === 0) continue;
    const carriers = eligible.filter((entry) => entry.results.has(id));
    for (const entry of eligible) {
      if (!entry.results.has(id)) problems.push(`${entry.target}: vector ${id} missing`);
    }
    if (carriers.length < 2) {
      if (carriers.length === 1 && eligible.length === 1) comparedVectors += 1;
      continue;
    }
    if (meta.tolerance > 0) toleranceBoundedVectors += 1;
    const [anchor, ...others] = carriers;
    for (const other of others) {
      const mismatches = [];
      valuesEqual(
        anchor.results.get(id).actual,
        other.results.get(id).actual,
        meta.tolerance,
        id,
        mismatches
      );
      if (mismatches.length > 0) {
        problems.push(
          `${anchor.target} vs ${other.target} diverge on ${id}: ${mismatches.join('; ')}`
        );
      }
    }
    comparedVectors += 1;
  }

  return { problems, comparedVectors, toleranceBoundedVectors, targetScopedVectors };
}

if (selfTest) {
  const fixture = (target, value) => ({
    receipt: {
      target,
      sources: {
        'packages/std/conformance/generated/std-abi-vectors.v0.jsonl': { sha256: 'sha256:fixture' },
      },
      summary: { failed: 0 },
      results: [{ id: 'v1', op: 'on_lerp', pass: true, actual: { value } }],
    },
  });
  const agree = compareReceipts([fixture('node', 5), fixture('browser-wasm', 5)]);
  const diverge = compareReceipts([fixture('node', 5), fixture('browser-wasm', 5.0000001)]);
  if (agree.problems.length !== 0 || diverge.problems.length === 0) {
    fail(
      `self-test failed: agreeing receipts problems=${agree.problems.length}, diverging receipts problems=${diverge.problems.length}`
    );
  }
  const fixturePath = join(repoRoot, 'reports', 'fixture.json');
  if (durableReceiptPath(fixturePath) !== 'reports/fixture.json') {
    fail('self-test failed: repository receipt path was not made portable');
  }
  console.log('[std-abi-cross-target] self-test OK: agreement passes, divergence goes red');
  process.exit(0);
}

if (receiptPaths.length < 2) {
  fail('need at least two --receipt paths (or --self-test)');
}

const receipts = receiptPaths.map((path) => {
  const raw = readFileSync(path, 'utf8');
  const receipt = JSON.parse(raw);
  if (!String(receipt.schema || '').startsWith('holoscript.std-abi-conformance.')) {
    fail(`${path}: unexpected schema ${receipt.schema}`);
  }
  return { path, raw, receipt };
});

const { problems, comparedVectors, toleranceBoundedVectors, targetScopedVectors } = compareReceipts(
  receipts,
  loadCorpusVectorMeta()
);

const crossReceipt = {
  schema: 'holoscript.std-abi-conformance.cross-target.v0',
  generatedAtISO: new Date().toISOString(),
  targets: receipts.map((entry) => ({
    target: entry.receipt.target,
    schema: entry.receipt.schema,
    path: durableReceiptPath(entry.path),
    receiptSha256: sha256(Buffer.from(entry.raw)),
    vectors: entry.receipt.summary?.vectors,
    passed: entry.receipt.summary?.passed,
    failed: entry.receipt.summary?.failed,
    environment: entry.receipt.environment,
  })),
  comparison: {
    method:
      'per-vector equality across the targets each vector declares (default: all): exact (Object.is, recursive, key-set strict) for tolerance-0 vectors; absolute-difference bound for vectors whose corpus entry declares a non-zero tolerance (libm transcendental ulp variance)',
    comparedVectors,
    toleranceBoundedVectors,
    targetScopedVectors,
    problems,
  },
  verdict: problems.length === 0 ? 'EQUAL' : 'DIVERGED',
  claimBoundary: {
    note: 'Equality is claimed only for the targets, corpus pin, and vector set named above. Each per-target receipt carries its own execution claim boundary; this receipt adds only cross-target value agreement.',
  },
};

const receiptForHash = { ...crossReceipt };
delete receiptForHash.receiptHash;
crossReceipt.receiptHash = sha256(Buffer.from(JSON.stringify(receiptForHash)));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(crossReceipt, null, 2)}\n`);

if (problems.length > 0) {
  for (const problem of problems) console.error(`[std-abi-cross-target] ${problem}`);
  fail(`${problems.length} cross-target problem(s); receipt at ${outPath}`);
}
console.log(
  `[std-abi-cross-target] OK: ${comparedVectors} vectors equal across ${receipts.length} targets (${comparedVectors - toleranceBoundedVectors} exact, ${toleranceBoundedVectors} within declared tolerance); receipt at ${outPath}`
);
