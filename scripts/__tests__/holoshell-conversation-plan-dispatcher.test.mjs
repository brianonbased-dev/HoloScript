#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tmp = mkdtempSync(path.join(tmpdir(), 'holoshell-conversation-plan-dispatcher-'));
const turnsDir = path.join(tmp, 'turns');
const latestOutput = path.join(tmp, 'brittney-turn-latest.json');
const jsOutput = path.join(tmp, 'brittney-turn-latest.js');
const conversationPlanOutput = path.join(tmp, 'brittney-conversation-plan-latest.json');
const dispatchOutput = path.join(tmp, 'conversation-plan-dispatch-latest.json');
const dispatchJsOutput = path.join(tmp, 'conversation-plan-dispatch-latest.js');
const dispatchDir = path.join(tmp, 'conversation-plan-dispatches');
const roomTaskOutput = path.join(tmp, 'conversation-plan-room-tasks-latest.json');

const prompts = [
  'We need to test whether Brittney is a translator and orchestrator, not an internal brain. Start a plan and ask the needed question before action.',
  'Answer: use native HoloScript source gates, local Jetson and laptop agents, HoloMesh room dispatch, and no UI theatre.',
  'Plan the sequence: gather context, ask one question, prepare receipt-backed dispatch targets, and wait.',
  'Confirm the proposals and blocked actions before execution.',
  'commence all',
];

function parseReceipt(result, label) {
  assert.equal(result.status, 0, `${label} failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const firstBrace = result.stdout.indexOf('{');
  assert.ok(firstBrace >= 0, `${label} stdout must contain JSON`);
  return JSON.parse(result.stdout.slice(firstBrace));
}

function runTurn(prompt, index) {
  return parseReceipt(spawnSync(process.execPath, [
    'scripts/holoshell-brittney-turn.mjs',
    '--prompt',
    prompt,
    '--json',
    '--self-test',
    '--turns-dir',
    turnsDir,
    '--latest-output',
    latestOutput,
    '--js-output',
    jsOutput,
    '--conversation-plan-output',
    conversationPlanOutput,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }), `turn ${index + 1}`);
}

for (const [index, prompt] of prompts.entries()) runTurn(prompt, index);
const plan = JSON.parse(readFileSync(conversationPlanOutput, 'utf8'));
assert.equal(plan.summary.dispatchReady, true);

const dispatch = parseReceipt(spawnSync(process.execPath, [
  'scripts/holoshell-conversation-plan-dispatcher.mjs',
  '--plan',
  conversationPlanOutput,
  '--output',
  dispatchOutput,
  '--js-output',
  dispatchJsOutput,
  '--dispatch-dir',
  dispatchDir,
  '--room-task-output',
  roomTaskOutput,
  '--json',
], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024,
}), 'conversation-plan dispatcher');

assert.equal(dispatch.schemaVersion, 'hololand.holoshell.conversation-plan-dispatch.v0.1.0');
assert.equal(dispatch.summary.status, 'ready_to_route');
assert.equal(dispatch.summary.planId, plan.planId);
assert.equal(dispatch.summary.planValidationStatus, 'passed');
assert.equal(dispatch.summary.mutationExecuted, false);
assert.equal(dispatch.summary.destructiveActionsTaken, false);
assert.equal(dispatch.summary.desktopAutomationExecuted, false);
assert.equal(dispatch.summary.completionClaimAllowed, false);
assert.equal(dispatch.summary.downstreamReceiptsRequired, true);
assert.equal(dispatch.validation.status, 'passed');
assert.equal(dispatch.execution.roomExecution.status, 'not_requested');
assert.equal(dispatch.execution.claimExecution.status, 'not_requested');
assert.equal(dispatch.downstreamReceipts.required, true);
assert.equal(dispatch.downstreamReceipts.completionClaimAllowed, false);

for (const id of ['holomesh_room', 'receipt_gate', 'holoscript_source_gate', 'owned_metal_fleet', 'local_agent_router', 'anti_theatre_gate', 'plan_review_gate']) {
  assert.ok(dispatch.summary.targetIds.includes(id), `expected target ${id}`);
}

assert.ok(existsSync(dispatchOutput), `expected dispatch receipt at ${dispatchOutput}`);
assert.ok(existsSync(dispatchJsOutput), `expected dispatch bootstrap at ${dispatchJsOutput}`);
assert.ok(existsSync(roomTaskOutput), `expected room task batch at ${roomTaskOutput}`);
const roomBatch = JSON.parse(readFileSync(roomTaskOutput, 'utf8'));
assert.ok(Array.isArray(roomBatch.tasks));
assert.ok(roomBatch.tasks.length >= 3);
assert.ok(roomBatch.tasks.some((task) => task.title.includes('[conversation-plan][native]')));
assert.ok(roomBatch.tasks.some((task) => task.description.includes('do not claim completion')));

const blockedPlanPath = path.join(tmp, 'blocked-plan.json');
const blockedOutput = path.join(tmp, 'blocked-dispatch.json');
writeFileSync(blockedPlanPath, `${JSON.stringify({
  ...plan,
  status: 'collecting',
  trigger: { ...plan.trigger, commenceAll: false },
  summary: {
    ...plan.summary,
    status: 'collecting',
    dispatchReady: false,
    dispatchOperation: '',
  },
}, null, 2)}\n`, 'utf8');
const blocked = spawnSync(process.execPath, [
  'scripts/holoshell-conversation-plan-dispatcher.mjs',
  '--plan',
  blockedPlanPath,
  '--output',
  blockedOutput,
  '--room-task-output',
  path.join(tmp, 'blocked-room-tasks.json'),
  '--json',
], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024,
});
assert.notEqual(blocked.status, 0, 'blocked plan should fail validation');
const blockedReceipt = JSON.parse(blocked.stdout.slice(blocked.stdout.indexOf('{')));
assert.equal(blockedReceipt.summary.status, 'blocked_invalid_plan');
assert.equal(blockedReceipt.validation.status, 'failed');
assert.ok(blockedReceipt.validation.failedChecks.some((check) => check.id === 'dispatch_ready'));
assert.equal(blockedReceipt.summary.mutationExecuted, false);
assert.equal(blockedReceipt.summary.completionClaimAllowed, false);

console.log('HoloShell conversation-plan dispatcher test passed.');
