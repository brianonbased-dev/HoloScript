#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildReceipt,
  classifyTask,
  fixtureQueue,
  parseArgs,
} from '../holoshell-sovereign-room-marathon.mjs';

const fixtureResult = { status: 'fixture', queue: fixtureQueue(), command: 'fixture' };
const tmpDir = mkdtempSync(join(tmpdir(), 'holoshell-sovereign-room-'));
const executionReceiptPath = join(tmpDir, 'execution-receipt.json');
writeFileSync(executionReceiptPath, `${JSON.stringify({
  schemaVersion: 'hololand.test.execution-receipt.v0.1.0',
  status: 'completed',
  verification: {
    command: 'node scripts/__tests__/holoshell-sovereign-room-marathon.test.mjs',
  },
  summary: {
    status: 'pass',
  },
}, null, 2)}\n`, 'utf8');

assert.equal(classifyTask({ title: '[local] sovereign task', tags: [] }), 'local');
assert.equal(classifyTask({ title: 'cloud-tagged receipt', tags: [] }), 'cloud');
assert.equal(classifyTask({ title: 'harvest native capability', tags: ['native-first'] }), 'local');
assert.equal(classifyTask({ title: 'Jetson HoloShell receipt task', tags: ['jetson', 'holoshell'] }), 'local');
assert.equal(classifyTask({ title: '[repo-harvest][Hololand] Promote harvested repo work into board-ready slice', tags: [] }), 'local');
assert.equal(classifyTask({ title: 'plain task', tags: [] }), 'unknown');

const localReceipt = buildReceipt({ ...parseArgs([]), taskLane: 'local', taskTag: 'local' }, fixtureResult);
assert.equal(localReceipt.summary.status, 'ready_to_claim');
assert.equal(localReceipt.summary.selectedTaskId, 'task_local_mid');
assert.equal(localReceipt.summary.claimAttempted, false);
assert.equal(localReceipt.summary.sovereignConsumptionDefault, true);

const cloudBlocked = buildReceipt({ ...parseArgs([]), taskLane: 'cloud', taskTag: 'cloud' }, fixtureResult);
assert.equal(cloudBlocked.summary.status, 'blocked_cloud_escalation_receipt_required');
assert.equal(cloudBlocked.summary.selectedTaskId, '');

const claimed = buildReceipt(
  { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true, claimTaskId: 'task_local_mid' },
  fixtureResult,
  () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
);
assert.equal(claimed.summary.status, 'claimed');
assert.equal(claimed.summary.claimSucceeded, true);
assert.equal(claimed.summary.completionClaimAllowed, false);

const blockedClaim = buildReceipt(
  { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true },
  fixtureResult,
  () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
);
assert.equal(blockedClaim.summary.status, 'blocked_claim_guard_required');
assert.equal(blockedClaim.summary.claimAttempted, false);
assert.equal(blockedClaim.summary.claimBlockedReason, 'local_room_claim_requires_confirmClaim_true');

const blockedMissingClaimTarget = buildReceipt(
  { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true },
  fixtureResult,
  () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
);
assert.equal(blockedMissingClaimTarget.summary.status, 'blocked_claim_guard_required');
assert.equal(blockedMissingClaimTarget.summary.claimAttempted, false);
assert.equal(blockedMissingClaimTarget.summary.selectedTaskId, '');
assert.equal(blockedMissingClaimTarget.summary.claimBlockedReason, 'local_room_claim_requires_claim_task_id');

const blockedUnknownClaimTarget = buildReceipt(
  { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true, claimTaskId: 'task_missing' },
  fixtureResult,
  () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
);
assert.equal(blockedUnknownClaimTarget.summary.status, 'blocked_claim_guard_required');
assert.equal(blockedUnknownClaimTarget.summary.claimAttempted, false);
assert.equal(blockedUnknownClaimTarget.summary.selectedTaskId, '');
assert.equal(blockedUnknownClaimTarget.summary.claimBlockedReason, 'local_room_claim_task_not_found');

const blockedCloudClaimTarget = buildReceipt(
  { ...parseArgs([]), taskLane: 'local', taskTag: 'local', claim: true, confirmClaim: true, claimTaskId: 'task_cloud_high' },
  fixtureResult,
  () => ({ status: 'claimed', attempted: true, succeeded: true, stdout: 'claimed', stderr: '' }),
);
assert.equal(blockedCloudClaimTarget.summary.status, 'blocked_claim_guard_required');
assert.equal(blockedCloudClaimTarget.summary.claimAttempted, false);
assert.equal(blockedCloudClaimTarget.summary.selectedTaskId, 'task_cloud_high');
assert.equal(blockedCloudClaimTarget.summary.claimBlockedReason, 'local_room_claim_only_supports_local_tasks');

const blockedDone = buildReceipt(
  {
    ...parseArgs([]),
    taskLane: 'local',
    taskTag: 'local',
    done: true,
    doneTaskId: 'task_claimed',
    doneCommit: 'abc1234',
    doneEvidence: 'node scripts/__tests__/holoshell-sovereign-room-marathon.test.mjs',
    doneSummary: 'Closed claimed local fixture task with test evidence.',
    executionReceipt: executionReceiptPath,
  },
  fixtureResult,
);
assert.equal(blockedDone.summary.status, 'blocked_done_guard_required');
assert.equal(blockedDone.summary.doneAttempted, false);
assert.equal(blockedDone.summary.doneSucceeded, false);
assert.equal(blockedDone.summary.completionClaimAllowed, false);
assert.equal(blockedDone.summary.doneBlockedReason, 'local_room_done_requires_confirmDone_true');

const done = buildReceipt(
  {
    ...parseArgs([]),
    taskLane: 'local',
    taskTag: 'local',
    done: true,
    doneTaskId: 'task_claimed',
    doneCommit: 'abc1234',
    doneEvidence: 'node scripts/__tests__/holoshell-sovereign-room-marathon.test.mjs',
    doneSummary: 'Closed claimed local fixture task with test evidence.',
    donePaths: 'scripts/holoshell-sovereign-room-marathon.mjs',
    executionReceipt: executionReceiptPath,
    confirmDone: true,
  },
  fixtureResult,
  undefined,
  () => ({ status: 'done', attempted: true, succeeded: true, stdout: 'done', stderr: '' }),
);
assert.equal(done.summary.status, 'done');
assert.equal(done.summary.selectedTaskId, 'task_claimed');
assert.equal(done.summary.doneRequested, true);
assert.equal(done.summary.doneAttempted, true);
assert.equal(done.summary.doneSucceeded, true);
assert.equal(done.summary.executionReceiptObserved, true);
assert.equal(done.summary.completionClaimAllowed, true);
assert.equal(done.done.executionReceipt.parseStatus, 'json');

execFileSync(process.execPath, ['scripts/holoshell-sovereign-room-marathon.mjs', '--self-test'], {
  cwd: fileURLToPath(new URL('../..', import.meta.url)),
  stdio: 'pipe',
  encoding: 'utf8',
});

console.log('holoshell-sovereign-room-marathon tests passed.');
