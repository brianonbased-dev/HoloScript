/**
 * Offline node --test suite for the MV-B5 multi-process contention drill
 * (scripts/model-village-contention-drill.mjs). Spawns REAL child processes
 * that race the SAME sealed custody store and the SAME phase-0b persistence
 * store; every child is spawned by the drill (tracked pids), writes only under
 * an os.tmpdir scratch root, and the drill reaps + removes its run dir on exit.
 * No network, no providers, no git, no SIGKILL of foreign processes.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CONTENTION_DRILL_ENGINE,
  CONTENTION_DRILL_SCHEMA,
  ModelVillageContentionDrillError,
  runContentionDrill,
  verifyContentionDrillReceipt,
} from '../model-village-contention-drill.mjs';

function makeScratchRoot(t) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mv-contention-test-'));
  t.after(() => {
    rmSync(dir, { force: true, recursive: true });
  });
  return dir;
}

test('custody + persistence serialize under contention; control fork is flagged', async (t) => {
  const scratchRoot = makeScratchRoot(t);
  const workerCount = 6;
  const opsPerWorker = 3;
  const { receipt } = await runContentionDrill({
    operator: 'operator-contention-01',
    opsPerWorker,
    scratchRoot,
    workerCount,
  });

  assert.equal(receipt.schema, CONTENTION_DRILL_SCHEMA);
  assert.equal(receipt.engine, CONTENTION_DRILL_ENGINE);
  assert.equal(receipt.workerCount, workerCount);
  assert.equal(receipt.opsPerWorker, opsPerWorker);

  // Every worker committed its ops (all eventually acquired the lock in turn).
  assert.equal(receipt.opsCommitted, workerCount * opsPerWorker);

  // The final access log is one linear chain: 1 create entry + each worker's
  // (1 open + opsPerWorker seals). A fork or a dropped entry breaks this.
  assert.equal(receipt.finalChainLinear, true);
  assert.equal(receipt.finalChainLength, 1 + workerCount * (1 + opsPerWorker));
  assert.match(receipt.accessLogTailHash, /^[a-f0-9]{64}$/);

  // opsRefused counts typed CustodyLockError refusals — evidence the lock
  // actually contended (>= 0 always; with 6 racing workers it is > 0).
  assert.ok(Number.isInteger(receipt.opsRefused) && receipt.opsRefused >= 0);
  assert.equal(receipt.lockContentionObserved, receipt.opsRefused > 0);

  // Persistence store (withStoreLock): exactly one writer initialized.
  assert.equal(receipt.persistenceStoreLock.serialized, true);
  assert.equal(receipt.persistenceStoreLock.initialized, 1);
  assert.equal(receipt.persistenceStoreLock.refused, workerCount - 1);
  assert.equal(receipt.persistenceStoreLock.finalStateValid, true);
  assert.match(receipt.persistenceStoreLock.finalStateHash, /^[a-f0-9]{64}$/);
  // Every non-winner is a typed serialization refusal.
  for (const outcome of receipt.persistenceStoreLock.outcomes) {
    assert.ok(['initialized', 'locked', 'exists'].includes(outcome), `outcome ${outcome}`);
  }

  // Non-vacuity: an unsynchronized (lock-bypassing) forked chain WAS flagged.
  assert.equal(receipt.nonVacuityControl.forkInjected, true);
  assert.equal(receipt.nonVacuityControl.flaggedByChainCheck, true);
  assert.equal(receipt.nonVacuityControl.finalChainLinear, false);
  assert.match(receipt.nonVacuityControl.chainCheckDetail, /monotonic order|not valid JSON/);

  // Claim boundary is honest about what a single-host drill does NOT prove.
  assert.equal(receipt.claimBoundary.singleHostProcessSerializationProven, true);
  assert.equal(receipt.claimBoundary.distributedMultiHostConsensusClaimed, false);
  assert.equal(receipt.claimBoundary.mediaFailureDurabilityClaimed, false);
  assert.equal(receipt.claimBoundary.processCrashDurabilityClaimed, false);

  // Receipt hash recomputes and invariants hold.
  assert.equal(verifyContentionDrillReceipt(receipt), true);
});

test('a second, smaller config also serializes cleanly', async (t) => {
  const scratchRoot = makeScratchRoot(t);
  const { receipt } = await runContentionDrill({
    operator: 'operator-contention-02',
    opsPerWorker: 2,
    scratchRoot,
    workerCount: 3,
  });
  assert.equal(receipt.opsCommitted, 6);
  assert.equal(receipt.finalChainLinear, true);
  assert.equal(receipt.finalChainLength, 1 + 3 * (1 + 2));
  assert.equal(receipt.persistenceStoreLock.initialized, 1);
  assert.equal(verifyContentionDrillReceipt(receipt), true);
});

test('runContentionDrill validates inputs', async (t) => {
  const scratchRoot = makeScratchRoot(t);
  await assert.rejects(
    () => runContentionDrill({ operator: '', opsPerWorker: 2, scratchRoot, workerCount: 3 }),
    ModelVillageContentionDrillError,
  );
  await assert.rejects(
    () => runContentionDrill({
      operator: 'op', opsPerWorker: 2, scratchRoot, workerCount: 1,
    }),
    ModelVillageContentionDrillError,
    'workerCount < 2 is not contention',
  );
  await assert.rejects(
    () => runContentionDrill({
      operator: 'op', opsPerWorker: 0, scratchRoot, workerCount: 3,
    }),
    ModelVillageContentionDrillError,
  );
});

test('verifyContentionDrillReceipt rejects a tampered receipt', async (t) => {
  const scratchRoot = makeScratchRoot(t);
  const { receipt } = await runContentionDrill({
    operator: 'operator-contention-03',
    opsPerWorker: 2,
    scratchRoot,
    workerCount: 3,
  });
  const tampered = { ...receipt, opsCommitted: receipt.opsCommitted + 1 };
  assert.throws(
    () => verifyContentionDrillReceipt(tampered),
    ModelVillageContentionDrillError,
    'a mutated body must fail the receiptHash recompute',
  );
});
