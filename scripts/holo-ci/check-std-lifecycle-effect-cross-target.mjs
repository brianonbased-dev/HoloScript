#!/usr/bin/env node
/** Compare lifecycle results exactly across two or more target receipts. */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const args = process.argv.slice(2);
const receiptPaths = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--receipt') receiptPaths.push(resolve(args[index + 1]));
}

function argValue(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 ? resolve(args[index + 1]) : fallback;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function fail(message) {
  console.error(`[std-lifecycle-effect-cross-target] FAIL: ${message}`);
  process.exit(1);
}

function compare(receipts) {
  const problems = [];
  const pinKey =
    'packages/std/conformance/generated/std-lifecycle-effects.v0.json';
  const pins = receipts.map((receipt) => receipt.sources?.[pinKey]?.sha256);
  if (pins.some((pin) => !pin) || new Set(pins).size !== 1) {
    problems.push(`vector corpus pins differ or are absent: ${pins.join(', ')}`);
  }
  const ids = new Set(
    receipts.flatMap((receipt) =>
      (receipt.results ?? []).map((result) => result.id)
    )
  );
  for (const receipt of receipts) {
    if (receipt.summary?.failed !== 0) {
      problems.push(`${receipt.target}: ${receipt.summary?.failed} failed`);
    }
    if (receipt.summary?.dispatched !== false) {
      problems.push(`${receipt.target}: dispatched is not pinned false`);
    }
  }
  for (const id of ids) {
    const carriers = receipts.map((receipt) => ({
      target: receipt.target,
      result: receipt.results.find((result) => result.id === id),
    }));
    for (const carrier of carriers) {
      if (!carrier.result) problems.push(`${carrier.target}: missing ${id}`);
    }
    const available = carriers.filter((carrier) => carrier.result);
    const anchor = available[0];
    for (const other of available.slice(1)) {
      if (!isDeepStrictEqual(anchor.result.actual, other.result.actual)) {
        problems.push(`${anchor.target} vs ${other.target}: ${id} diverged`);
      }
    }
  }
  return { problems, comparedVectors: ids.size };
}

if (args.includes('--self-test')) {
  const fixture = (target, value) => ({
    target,
    sources: {
      'packages/std/conformance/generated/std-lifecycle-effects.v0.json': {
        sha256: 'sha256:fixture',
      },
    },
    summary: { failed: 0, dispatched: false },
    results: [{ id: 'v', pass: true, actual: { value } }],
  });
  const equal = compare([fixture('a', 1), fixture('b', 1)]);
  const unequal = compare([fixture('a', 1), fixture('b', 2)]);
  if (equal.problems.length || !unequal.problems.length) {
    fail('self-test did not distinguish equality from divergence');
  }
  console.log('[std-lifecycle-effect-cross-target] self-test OK');
  process.exit(0);
}
if (receiptPaths.length < 2) fail('at least two --receipt paths are required');
const entries = receiptPaths.map((path) => ({
  path,
  raw: readFileSync(path),
}));
const receipts = entries.map((entry) =>
  JSON.parse(entry.raw.toString('utf8'))
);
for (const receipt of receipts) {
  if (
    !String(receipt.schema).startsWith(
      'holoscript.std-lifecycle-effect-conformance.'
    )
  ) {
    fail(`unexpected receipt schema ${receipt.schema}`);
  }
}
const comparison = compare(receipts);
const outPath = argValue(
  '--out',
  join(
    repoRoot,
    'reports',
    'library-coherence',
    '2026-07-30_std-lifecycle-effect-conformance.cross-target.v0.json'
  )
);
const crossReceipt = {
  schema: 'holoscript.std-lifecycle-effect-conformance.cross-target.v0',
  generatedAtISO: new Date().toISOString(),
  targets: entries.map((entry, index) => ({
    target: receipts[index].target,
    path: relative(repoRoot, entry.path).replace(/\\/g, '/'),
    receiptSha256: sha256(entry.raw),
  })),
  comparison: {
    method: 'recursive key-set-strict exact equality',
    comparedVectors: comparison.comparedVectors,
    problems: comparison.problems,
  },
  verdict: comparison.problems.length ? 'DIVERGED' : 'EQUAL',
  claimBoundary: {
    note:
      'This receipt proves equality only for the pinned lifecycle corpus and target receipts named above; it does not claim real effect dispatch.',
  },
};
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(crossReceipt, null, 2)}\n`);
if (comparison.problems.length) {
  fail(`${comparison.problems.length} cross-target problem(s); ${outPath}`);
}
console.log(
  `[std-lifecycle-effect-cross-target] OK: ${comparison.comparedVectors} vectors EQUAL across ${receipts.length} targets; ${outPath}`
);
