#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tmp = mkdtempSync(path.join(tmpdir(), 'holoshell-brittney-conversation-plan-'));
const turnsDir = path.join(tmp, 'turns');
const latestOutput = path.join(tmp, 'brittney-turn-latest.json');
const jsOutput = path.join(tmp, 'brittney-turn-latest.js');
const conversationPlanOutput = path.join(tmp, 'brittney-conversation-plan-latest.json');

const prompts = [
  'We need to test whether Brittney is a translator and orchestrator, not an internal brain. Start a plan and ask the needed question before action.',
  'Answer to the question: use HoloScript-native gates, local agents, Jetson, laptop, and room dispatch. No UI theatre.',
  'Plan the sequence: gather context, ask one question, prepare receipt-backed dispatch targets, then wait for my explicit start.',
  'Before execution, confirm which proposals will be staged and which actions remain blocked until receipts return.',
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

const receipts = prompts.map((prompt, index) => runTurn(prompt, index));
const firstFour = receipts.slice(0, 4);
const finalReceipt = receipts.at(-1);
const plan = finalReceipt.runtime.conversationPlan;
const proposal = finalReceipt.proposals.find((item) => item.operation === 'dispatch_conversation_plan');

for (const receipt of firstFour) {
  assert.notEqual(receipt.summary.conversationPlanStatus, 'ready_to_dispatch');
  assert.equal(receipt.summary.conversationPlanDispatchReady, false);
  assert.ok(!receipt.proposals.some((item) => item.operation === 'dispatch_conversation_plan'));
}

assert.equal(plan.schemaVersion, 'hololand.holoshell.conversation-plan.v0.1.0');
assert.equal(plan.status, 'ready_to_dispatch');
assert.equal(plan.summary.status, 'ready_to_dispatch');
assert.equal(plan.trigger.commenceAll, true);
assert.equal(plan.summary.dispatchReady, true);
assert.equal(plan.summary.dispatchOperation, 'dispatch_conversation_plan');
assert.ok(plan.summary.turnCount >= 4);
assert.ok(plan.summary.questionTurnCount >= 1);
assert.ok(plan.summary.signals.includes('orchestration'));
assert.ok(plan.summary.signals.includes('native_holoscript'));
assert.ok(plan.summary.signals.includes('anti_theatre'));
assert.ok(plan.summary.signals.includes('local_fleet'));
assert.equal(plan.dispatchBoundary.modelRole, 'voice_and_context_only');
assert.equal(plan.dispatchBoundary.dispatcherRole, 'receipt_backed_router');
assert.equal(plan.dispatchBoundary.completionClaimAllowed, false);
assert.ok(plan.turns.some((turn) => turn.promptPreview.includes('translator and orchestrator')));

assert.equal(finalReceipt.shellContext.conversationPlan.planId, plan.planId);
assert.equal(finalReceipt.shellContext.conversationPlan.status, 'ready_to_dispatch');
assert.equal(finalReceipt.shellContext.conversationPlan.dispatchReady, true);
assert.equal(finalReceipt.summary.conversationPlanStatus, 'ready_to_dispatch');
assert.equal(finalReceipt.summary.conversationPlanId, plan.planId);
assert.equal(finalReceipt.summary.conversationPlanDispatchReady, true);
assert.equal(finalReceipt.summary.conversationPlanCommenceAll, true);
assert.equal(finalReceipt.summary.conversationPlanTurnCount, plan.summary.turnCount);

assert.ok(proposal, 'commence all must create a conversation-plan dispatch proposal');
assert.equal(proposal.objectId, 'conversation-plan');
assert.equal(proposal.planId, plan.planId);
assert.equal(proposal.planReceipt, plan.output.latestPath);
assert.equal(proposal.dispatcherSource, 'apps/holoshell/source/holoshell-conversation-plan-dispatcher.hsplus');
assert.equal(proposal.dispatcherScript, 'scripts/holoshell-conversation-plan-dispatcher.mjs');
assert.equal(proposal.executionDefault, 'plan_only_until_explicit_execute_flag');
assert.equal(proposal.downstreamReceiptsRequired, true);
assert.equal(proposal.completionClaimAllowed, false);
assert.equal(proposal.mutating, false);
assert.equal(proposal.approvalRequired, false);
assert.equal(proposal.receiptRequired, true);
assert.ok(proposal.sourceTurnIds.length >= 4);
assert.ok(!finalReceipt.result.finalText.toLowerCase().includes('completed all'));
assert.ok(!finalReceipt.result.finalText.toLowerCase().includes('executed all'));

assert.ok(existsSync(conversationPlanOutput), `expected conversation plan receipt at ${conversationPlanOutput}`);
const persistedPlan = JSON.parse(readFileSync(conversationPlanOutput, 'utf8'));
assert.equal(persistedPlan.planId, plan.planId);
assert.equal(persistedPlan.summary.dispatchReady, true);

console.log('HoloShell Brittney conversation plan follow-through test passed.');
