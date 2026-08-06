#!/usr/bin/env node
/**
 * check:core-baseline-receipt — the pre-push half of the core baseline gate.
 *
 * WHY THIS SHAPE. `packages/core/scripts/check-core-test-baseline.mjs` is the
 * real verifier: it runs the sharded core suite and classifies every failure
 * against `test-baseline.json` into flaky / known-stable / NEW. Measured
 * 2026-08-05: 18m54s red, 15m23s green. Nothing can run that at push time —
 * a 15-minute pre-push gate does not get obeyed, it gets `--no-verify`d, and a
 * gate that teaches its own bypass is worse than no gate.
 *
 * So the cost is split. The suite runs once, whenever the developer chooses, and
 * writes a receipt. This script checks the receipt in milliseconds.
 *
 * The receipt is bound to the CONTENT of packages/core at HEAD
 * (`git rev-parse HEAD:packages/core`), not to a commit sha — an amend or rebase
 * that leaves core's tree untouched keeps the proof valid, while any real change
 * to core invalidates it and demands a fresh run.
 *
 * A receipt captured against a dirty working tree is refused: that run did not
 * test what HEAD contains, so it proves nothing about what is being pushed.
 *
 * CONTEXT (decisions/2026-08-05_holoscript-native-testing.md): the classifier was
 * committed 2026-05-31 and registered NOWHERE for 66 days. When first run on
 * 2026-08-05 it immediately surfaced 5 unrecorded failures. This script exists so
 * that cannot recur silently.
 *
 * Usage:
 *   node scripts/holo-ci/check-core-baseline-receipt.mjs
 *   node scripts/holo-ci/check-core-baseline-receipt.mjs --self-test
 *
 * Exit codes: 0 = valid proof for this core tree, 1 = missing/stale/red receipt.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const RECEIPT = resolve(REPO_ROOT, 'packages/core/.test-baseline-receipt.json');
const RUN_CMD = 'corepack pnpm --filter @holoscript/core test:baseline';

function currentCoreTreeSha() {
  const r = spawnSync('git', ['rev-parse', 'HEAD:packages/core'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
}

/**
 * Returns { ok, reason }. Pure given its inputs so --self-test can drive it with
 * synthetic receipts and prove this gate is capable of rejecting.
 */
export function evaluateReceipt(receipt, currentTreeSha) {
  if (!receipt) return { ok: false, reason: 'no receipt — the core baseline gate has never run here' };
  if (receipt.schema !== 'holoscript.core-baseline-receipt.v1')
    return { ok: false, reason: `unrecognized receipt schema: ${receipt.schema}` };
  if (receipt.capturedFromDirtyWorkingTree)
    return {
      ok: false,
      reason: 'receipt was captured against a dirty working tree — it did not test what HEAD contains',
    };
  if (receipt.result !== 'clean')
    return {
      ok: false,
      reason: `last run was NOT clean (${receipt.totals?.new ?? '?'} new failures): ${(receipt.newFailures ?? []).slice(0, 3).join('; ')}`,
    };
  if (!receipt.coreTreeSha) return { ok: false, reason: 'receipt records no coreTreeSha' };
  if (!currentTreeSha) return { ok: false, reason: 'cannot resolve HEAD:packages/core' };
  if (receipt.coreTreeSha !== currentTreeSha)
    return {
      ok: false,
      reason: `receipt is for a different packages/core tree (${receipt.coreTreeSha.slice(0, 12)}), HEAD is ${currentTreeSha.slice(0, 12)}`,
    };
  return { ok: true, reason: `valid for packages/core tree ${currentTreeSha.slice(0, 12)}` };
}

// --- self-test: prove this gate CAN go red -------------------------------
// A gate never observed rejecting is indistinguishable from a gate that cannot.
if (process.argv.includes('--self-test')) {
  const SHA = 'a'.repeat(40);
  const good = {
    schema: 'holoscript.core-baseline-receipt.v1',
    result: 'clean',
    coreTreeSha: SHA,
    capturedFromDirtyWorkingTree: false,
  };
  const cases = [
    ['accepts a clean receipt matching HEAD', good, SHA, true],
    ['rejects a missing receipt', null, SHA, false],
    ['rejects a receipt for a different core tree', good, 'b'.repeat(40), false],
    ['rejects a receipt from a dirty tree', { ...good, capturedFromDirtyWorkingTree: true }, SHA, false],
    ['rejects a receipt recording new failures', { ...good, result: 'new-failures', totals: { new: 5 }, newFailures: ['x'] }, SHA, false],
    ['rejects an unknown schema', { ...good, schema: 'nope.v9' }, SHA, false],
  ];
  let failed = 0;
  for (const [name, receipt, sha, expectOk] of cases) {
    const got = evaluateReceipt(receipt, sha).ok;
    const pass = got === expectOk;
    if (!pass) failed++;
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name} (expected ok=${expectOk}, got ok=${got})`);
  }
  console.log(
    failed === 0
      ? '\n[core-baseline-receipt] self-test PASS — the gate accepts a valid proof and rejects all five invalid ones.'
      : `\n[core-baseline-receipt] self-test FAIL — ${failed} case(s) wrong.`
  );
  process.exit(failed === 0 ? 0 : 1);
}

let receipt = null;
try {
  receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
} catch {
  receipt = null;
}

const verdict = evaluateReceipt(receipt, currentCoreTreeSha());

if (verdict.ok) {
  console.log(`[core-baseline-receipt] OK — ${verdict.reason}`);
  process.exit(0);
}

console.error(`[core-baseline-receipt] BLOCKED: ${verdict.reason}`);
console.error('');
console.error('  packages/core changed in this push, and there is no valid proof that the core');
console.error('  suite is free of NEW failures for this tree.');
console.error('');
console.error(`  Run (~15 min, once per core change):  ${RUN_CMD}`);
console.error('  Then re-push. Commit first — a run against a dirty tree does not count.');
console.error('');
console.error('  Emergency bypass (NOT for main): git push --no-verify');
process.exit(1);
