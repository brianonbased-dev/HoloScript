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
  // v2 ONLY, AND v1 IS NOT GRANDFATHERED.
  //
  // Every v1 receipt came from a gate that read the suite's FAIL lines and never
  // its exit status, so it could not tell "all tests passed" from "a worker
  // crashed and those tests never ran" -- a crashed run wrote result "clean" and
  // this check waved it through, because `result` was the only field it read.
  // Rejecting v1 retires every proof produced under that blindness instead of
  // trusting proofs that were never sound. The cost is one forced re-run per
  // checkout; the alternative is honouring evidence we know is unverified.
  if (receipt.schema !== 'holoscript.core-baseline-receipt.v2')
    return {
      ok: false,
      reason:
        receipt.schema === 'holoscript.core-baseline-receipt.v1'
          ? 'receipt is v1, produced by the gate that could not detect a crashed run. Re-run the baseline.'
          : `unrecognized receipt schema: ${receipt.schema}`,
    };

  // THE RUN MUST HAVE FINISHED, AND THE RECEIPT MUST SAY SO.
  // These mirror the gate's own refusals. Duplicated on purpose: this half is
  // what pre-push actually consults, and a check that delegates its whole
  // judgement to one boolean written by another process is the shape that let a
  // crash through in the first place.
  const run = receipt.runCompleted;
  if (!run) return { ok: false, reason: 'receipt records no runCompleted block -- it cannot show the suite finished' };
  if (!run.exitStatusKnown)
    return {
      ok: false,
      reason: "receipt was captured from a log with no exit status, so the run's outcome is unknown",
    };
  if (!(run.summaries > 0))
    return { ok: false, reason: 'receipt records no vitest summary lines -- the suite did not report' };
  if (run.filesReported !== run.filesCollected)
    return {
      ok: false,
      reason: `receipt records ${run.filesCollected - run.filesReported} test file(s) collected but never reported -- that run crashed`,
    };
  if (!Array.isArray(run.passes) || run.passes.length === 0)
    return { ok: false, reason: 'receipt records no passes, so it describes no run' };

  // THE SAME RULE THE GATE APPLIES, APPLIED AGAIN HERE.
  // The first version of this check tested only `signal || status === null`. It
  // had no arm for a pass that exited NON-ZERO, which is the one crash shape
  // that actually reaches a written receipt: a crashed shard whose non-zero exit
  // was excused, at the time, by a forgiven failure in a different pass. Review
  // confirmed it accepted `passes: [{status: 1, signal: null}]` outright.
  //
  // Non-zero is legitimate only when that pass produced failures of its OWN --
  // the baseline exists to forgive known failures, and vitest exits 1 for them.
  // `failures` is per-pass for exactly this reason.
  // A SKIPPED PASS RAN NOTHING, so bound what one is allowed to excuse.
  // The gate refuses an envelope where a shard claims skipped; this refuses a
  // receipt that records one, because a full-suite token minted from a single
  // executed pass is the same defect whichever half fails to notice it. Only
  // the sequential pass has a legitimate reason to be skipped.
  const badSkip = run.passes.find((x) => x.skipped && x.label !== 'sequential');
  if (badSkip)
    return {
      ok: false,
      reason: `receipt records pass "${badSkip.label}" as skipped; only the sequential pass may be`,
    };

  const badPass = run.passes.find(
    (x) => x.signal || x.status === null || (x.status !== 0 && !(x.failures > 0))
  );
  if (badPass)
    return {
      ok: false,
      reason:
        `receipt records pass "${badPass.label}" ending status=${badPass.status} ` +
        `signal=${badPass.signal} with ${badPass.failures ?? 0} failures of its own`,
    };

  // A LOG THAT WAS NOT ABOUT THIS TREE PROVES NOTHING ABOUT IT.
  // --from-log takes any file. Before the runner stamped the tree it tested into
  // its envelope, replaying yesterday's log minted a clean receipt for today's
  // code in about a second -- a quieter bypass than the --no-verify this file
  // documents. The gate refuses a mismatch; this refuses a receipt that records
  // one, and a receipt that records no stamp at all.
  // WHAT THE RECEIPT IS A RECEIPT FOR.
  //
  // Binding the run to a TREE is not binding it to a SUITE. A five-second
  // `run-vitest.mjs <one test file> > single.log`, replayed through --from-log,
  // used to mint a receipt this function accepted for the whole package --
  // reproduced in independent review. The gate refuses a non-full run now; this
  // refuses a receipt that records one, because a checker that delegates its
  // whole judgement to the writer is the shape that let a crash through before.
  // AND NO SCHEMA BUMP FOR THIS FIELD, deliberately. A receipt is a claim about
  // a tree and this function is its only consumer, so an old receipt failing
  // here with "records no scope" is both stricter and more legible than a
  // version fence -- a bump would invite the argument that an old receipt was
  // "valid under v2". The refusal IS the migration. (Settled with the reviewer,
  // 2026-09-22; written down so it is not reopened.)
  const scope = receipt.runCompleted.scope;
  if (!scope) return { ok: false, reason: 'receipt records no scope, so it cannot say what was run' };
  if (scope.mode !== 'full')
    return {
      ok: false,
      reason:
        `receipt was minted from a "${scope.mode ?? 'unknown'}" run` +
        (scope.targets?.length ? ` of ${scope.targets.join(', ')}` : '') +
        ' -- only a full suite run can certify packages/core',
    };

  if (!receipt.runCompleted.envelopeTreeSha)
    return {
      ok: false,
      reason: 'receipt records no envelopeTreeSha, so its run was never tied to a tree',
    };
  if (receipt.runCompleted.envelopeTreeSha !== receipt.coreTreeSha)
    return {
      ok: false,
      reason:
        `the run tested packages/core ${String(receipt.runCompleted.envelopeTreeSha).slice(0, 12)} ` +
        `but the receipt claims ${String(receipt.coreTreeSha).slice(0, 12)}`,
    };
  if (receipt.capturedFromDirtyWorkingTree)
    return {
      ok: false,
      reason: 'receipt was captured against a dirty working tree — it did not test what HEAD contains',
    };
  // Same failure in a different disguise: the tree was clean, but its
  // dependencies belonged to another checkout. A HoloRepo candidate worktree
  // has no node_modules of its own, so running the suite there means junctioning
  // another checkout's — and pnpm's workspace links then resolve
  // `@holoscript/core/*` back to THAT tree. Module identity in such a run is the
  // other checkout's, so the receipt attests to code this HEAD does not contain.
  // Produce it in the checkout that owns its node_modules instead.
  if (receipt.nodeModulesBorrowedFrom)
    return {
      ok: false,
      reason:
        'receipt was captured with node_modules borrowed from '
        + `${receipt.nodeModulesBorrowedFrom} — module identity in that run belonged to `
        + 'that checkout, not this tree. Run the baseline in the checkout that owns its '
        + 'dependencies.',
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
    schema: 'holoscript.core-baseline-receipt.v2',
    result: 'clean',
    coreTreeSha: SHA,
    capturedFromDirtyWorkingTree: false,
    nodeModulesBorrowedFrom: null,
    runCompleted: {
      summaries: 5,
      filesCollected: 120,
      filesReported: 120,
      exitStatusKnown: true,
      passes: [{ label: 'sequential', status: 0, signal: null, failures: 0 }],
      envelopeTreeSha: SHA,
      scope: { mode: 'full', runId: 'selftest', targets: [] },
    },
  };
  const cases = [
    ['accepts a clean receipt matching HEAD', good, SHA, true],
    ['rejects a missing receipt', null, SHA, false],
    ['rejects a receipt for a different core tree', good, 'b'.repeat(40), false],
    ['rejects a receipt from a dirty tree', { ...good, capturedFromDirtyWorkingTree: true }, SHA, false],
    [
      'rejects a receipt whose node_modules came from another checkout',
      { ...good, nodeModulesBorrowedFrom: 'C:/holo-dev/HoloRepo/HoloScript/packages/core/node_modules' },
      SHA,
      false,
    ],
    ['rejects a receipt recording new failures', { ...good, result: 'new-failures', totals: { new: 5 }, newFailures: ['x'] }, SHA, false],
    ['rejects an unknown schema', { ...good, schema: 'nope.v9' }, SHA, false],
    // The crash cases. Each is a receipt that the OLD checker accepted, because
    // each carries result:'clean' and a matching tree sha. They are the whole
    // reason this file changed; a gate never observed rejecting them is
    // indistinguishable from one that cannot.
    [
      'rejects a v1 receipt from the crash-blind gate',
      { ...good, schema: 'holoscript.core-baseline-receipt.v1' },
      SHA,
      false,
    ],
    ['rejects a receipt with no runCompleted block', { ...good, runCompleted: undefined }, SHA, false],
    [
      'rejects a run whose exit status was never known',
      { ...good, runCompleted: { ...good.runCompleted, exitStatusKnown: false } },
      SHA,
      false,
    ],
    [
      'rejects a run where collected test files never reported (the worker crash)',
      { ...good, runCompleted: { ...good.runCompleted, filesCollected: 11, filesReported: 10 } },
      SHA,
      false,
    ],
    [
      'rejects a run with no vitest summary at all',
      { ...good, runCompleted: { ...good.runCompleted, summaries: 0 } },
      SHA,
      false,
    ],
    [
      'rejects a pass killed by a signal',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          passes: [{ label: 'shard-2/4', status: null, signal: 'SIGKILL', failures: 0 }],
        },
      },
      SHA,
      false,
    ],
    // The signal case above SHORT-CIRCUITS the status===null arm, so that arm
    // was unproven: review deleted it and the self-test still reported 13/13.
    // spawnSync can return a null status with no signal, so it needs its own case.
    [
      'rejects a pass that ended with no exit status and no signal',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          passes: [{ label: 'shard-2/4', status: null, signal: null, failures: 0 }],
        },
      },
      SHA,
      false,
    ],
    // THE CRASH SHAPE THAT ACTUALLY REACHED A WRITTEN RECEIPT. A shard exits
    // non-zero having produced no failure of its own; before the per-pass fix a
    // forgiven failure in another pass excused it, the gate said OK and wrote
    // result 'clean', and this checker accepted it.
    [
      'rejects a pass that exited non-zero with no failures of its own',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          passes: [{ label: 'shard-3/4', status: 1, signal: null, failures: 0 }],
        },
      },
      SHA,
      false,
    ],
    // And the legitimate counterpart, which must stay ACCEPTED: the baseline
    // forgives known failures, so a pass with failures of its own exiting 1 is
    // the normal state of a green baseline run.
    [
      'accepts a pass that exited non-zero with failures of its own',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          passes: [{ label: 'shard-3/4', status: 1, signal: null, failures: 2 }],
        },
      },
      SHA,
      true,
    ],
    [
      'rejects a receipt whose shards claim to have been skipped',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          passes: [
            { label: 'sequential', status: 0, signal: null, failures: 0 },
            { label: 'shard-1/4', status: 0, signal: null, failures: 0, skipped: true },
          ],
        },
      },
      SHA,
      false,
    ],
    [
      'accepts a receipt where only the sequential pass was skipped',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          passes: [{ label: 'sequential', status: 0, signal: null, failures: 0, skipped: true }],
        },
      },
      SHA,
      true,
    ],
    [
      'rejects a receipt recording no passes at all',
      { ...good, runCompleted: { ...good.runCompleted, passes: [] } },
      SHA,
      false,
    ],
    [
      'rejects a run that was never tied to a tree',
      { ...good, runCompleted: { ...good.runCompleted, envelopeTreeSha: null } },
      SHA,
      false,
    ],
    [
      'rejects a log captured against a different core tree',
      { ...good, runCompleted: { ...good.runCompleted, envelopeTreeSha: 'c'.repeat(40) } },
      SHA,
      false,
    ],
    // Neither of these two guards had a case; both are reachable.
    // THE FIVE-SECOND TOKEN. A one-file run is a legitimate thing to do and a
    // useless thing to certify the package with.
    [
      'rejects a receipt minted from a single-file run',
      {
        ...good,
        runCompleted: {
          ...good.runCompleted,
          scope: { mode: 'single', runId: 'x', targets: ['src/__tests__/One.test.ts'] },
        },
      },
      SHA,
      false,
    ],
    [
      'rejects a receipt that records no scope at all',
      { ...good, runCompleted: { ...good.runCompleted, scope: undefined } },
      SHA,
      false,
    ],
    ['rejects a receipt with no coreTreeSha', { ...good, coreTreeSha: null }, SHA, false],
    ['rejects an unresolvable HEAD:packages/core', good, null, false],
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
      ? `\n[core-baseline-receipt] self-test PASS — the gate accepts a valid proof and rejects all ${cases.length - 1} invalid ones.`
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
