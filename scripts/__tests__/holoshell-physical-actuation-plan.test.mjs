import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.tmp', 'holoshell', 'test-physical-actuation-plan');
const latest = path.join(testRoot, 'physical-actuation-plan-latest.json');
const latestJs = path.join(testRoot, 'physical-actuation-plan-latest.js');

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

rmSync(testRoot, { recursive: true, force: true });

runNode(['scripts/holoshell-physical-actuation-plan.mjs', '--self-test', '--json']);

const plan = runNode([
  'scripts/holoshell-physical-actuation-plan.mjs',
  '--actor-id',
  'robot-arm-redacted',
  '--action',
  'move_robot',
  '--device-kind',
  'robot',
  '--intent',
  'Preview a bounded robot move without touching motors.',
  '--output',
  latest,
  '--js-output',
  latestJs,
  '--json',
]);

assert.equal(plan.schemaVersion, 'hololand.holoshell.physical-actuation-plan.v0.1.0');
assert.equal(plan.request.actorId, 'robot-arm-redacted');
assert.equal(plan.request.action, 'move_robot');
assert.equal(plan.execution.executionAllowed, false);
assert.equal(plan.execution.mutationExecuted, false);
assert.equal(plan.execution.nativeCommandIssued, false);
assert.match(plan.execution.blockedReason, /fresh native approval/);
assert.equal(plan.receiptPack.schemaVersion, 'hololand.holoshell.physical-actuation.v0.1.0');
assert.equal(plan.receiptPack.workflow, 'physical-actuation-safety');
assert.equal(plan.receiptPack.status, 'blocked');
assert.equal(plan.receiptPack.simulation.status, 'passed');
assert.equal(plan.receiptPack.simulation.deterministicPreview, true);
assert.equal(plan.receiptPack.freshness.approvalFresh, false);
assert.equal(plan.receiptPack.freshness.ownerLaneFresh, false);
assert.equal(plan.receiptPack.safeStop.status, 'armed');
assert.equal(plan.receiptPack.rollbackLimit.physicalUndoGuaranteed, false);
assert.ok(plan.sourceAnchors.includes('apps/holoshell/source/holoshell-physical-actuation-safety-room.holo'));
assert.ok(plan.sourceAnchors.includes('../HoloScript/packages/framework/src/board/holoshell-physical-actuation-receipts.ts'));
assert.ok(existsSync(latest));
assert.match(readFileSync(latestJs, 'utf8'), /HOLOSHELL_PHYSICAL_ACTUATION_PLAN/);

console.log('holoshell physical actuation plan regression passed');
