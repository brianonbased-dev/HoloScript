#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const outDir = path.join('.tmp', 'holoshell', 'self-test', 'laptop-reasoning');
const latestOutput = path.join(outDir, 'brittney-turn-latest.json');
const jsOutput = path.join(outDir, 'brittney-turn-latest.js');
const turnsDir = path.join(outDir, 'turns');

const prompt = [
  'Brittney, this is a large reasoning ask.',
  'Have the Jetson keep serving the app, but send a read-only reasoning job to the laptop hardware lane.',
  'The laptop should inspect repo/autonomy/backend seams, separate cloud and local focus, and return a receipt before any mutation.',
  'We need the dispatch to happen autonomously based on the prompt shape, not because a human manually opened Codex.',
].join(' ');

const result = spawnSync(process.execPath, [
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
], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024,
});

assert.equal(result.status, 0, `brittney turn failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
const firstBrace = result.stdout.indexOf('{');
assert.ok(firstBrace >= 0, 'turn stdout must contain JSON receipt');
const receipt = JSON.parse(result.stdout.slice(firstBrace));
const delegation = receipt.runtime.laptopReasoningDelegation;

assert.equal(receipt.selectedBrain.id, 'gamedev');
assert.equal(receipt.selectedCompatibilitySkill.id, 'gamedev');
assert.equal(receipt.runtime.brainSelector.packageName, '@holoscript/holollama');
assert.equal(receipt.runtime.brainSelection.schema, 'holollama-brain-router.selection.v1');
assert.equal(receipt.summary.selectedBrainId, 'gamedev');
assert.equal(receipt.summary.selectedCompatibilitySkillId, 'gamedev');
assert.ok(['jetson-edge', 'laptop-owned-metal'].includes(receipt.summary.selectedBrainConsumerProfileId));
assert.equal(delegation.status, 'delegated');
assert.equal(delegation.capabilityId, 'laptop_reasoning_job');
assert.equal(delegation.dispatchKind, 'reasoning_job');
assert.equal(delegation.permissionEnvelope, 'read_only');
assert.equal(delegation.approvalRequired, false);
assert.equal(delegation.targetHost, 'laptop_windows');
assert.equal(delegation.lane, 'laptop-hardware');
assert.equal(delegation.agentLane, 'local');
assert.equal(delegation.canonicalProviderId, 'laptop-sovereign');
assert.equal(delegation.workload, 'heavy_reasoning');
assert.equal(delegation.reuseBeforeBuild, true);
assert.equal(delegation.goldRoot, 'D:/GOLD');
assert.equal(delegation.sovereignPeerContextRoute, '/workflow/laptop-reasoning-job');
assert.equal(delegation.studioOrchestrator, 'packages/brittney/service/src/orchestrator.ts');
assert.equal(delegation.vastSpendRail, 'purchased_compute');
assert.equal(delegation.destructiveActionsTaken, false);
assert.equal(delegation.desktopAutomationExecuted, false);
assert.ok(delegation.reasonCodes.includes('explicit_laptop_reasoning_request'));
assert.ok(existsSync(delegation.latestPath), `expected dispatch latest at ${delegation.latestPath}`);
assert.ok(existsSync(delegation.dispatchReceiptPath), `expected dispatch receipt at ${delegation.dispatchReceiptPath}`);

const dispatchReceipt = JSON.parse(readFileSync(delegation.dispatchReceiptPath, 'utf8'));
assert.equal(dispatchReceipt.summary.capabilityId, 'laptop_reasoning_job');
assert.equal(dispatchReceipt.dispatch.body.targetHost, 'laptop_windows');
assert.equal(dispatchReceipt.dispatch.body.lane, 'laptop-hardware');
assert.equal(dispatchReceipt.dispatch.body.agentLane, 'local');
assert.equal(dispatchReceipt.dispatch.body.canonicalProviderId, 'laptop-sovereign');
assert.equal(dispatchReceipt.dispatch.body.reuseBeforeBuild, true);
assert.equal(dispatchReceipt.dispatch.body.permissionEnvelope, 'read_only');
assert.equal(dispatchReceipt.dispatch.body.receiptRequired, true);
assert.equal(dispatchReceipt.dispatch.body.canonicalSurfaces.goldDrive.root, 'D:/GOLD');
assert.equal(dispatchReceipt.dispatch.body.canonicalSurfaces.sovereignPeerContext.route, '/workflow/laptop-reasoning-job');
assert.equal(dispatchReceipt.dispatch.body.canonicalSurfaces.studioBrittney.serviceOrchestrator, 'packages/brittney/service/src/orchestrator.ts');
assert.equal(dispatchReceipt.dispatch.body.canonicalSurfaces.vastFleet.spendRail, 'purchased_compute');
assert.ok(dispatchReceipt.dispatch.body.canonicalSurfaces.vastFleet.requires.includes('active_lane_manifest'));
assert.ok(dispatchReceipt.dispatch.body.budgetPolicy.capRaiseRequiresApprovalRef);

assert.equal(receipt.shellContext.laptopReasoningDelegation.dispatchId, delegation.dispatchId);
assert.equal(receipt.shellContext.laptopReasoningDelegation.canonicalProviderId, 'laptop-sovereign');
assert.equal(receipt.shellContext.laptopReasoningDelegation.goldRoot, 'D:/GOLD');
assert.equal(receipt.summary.laptopReasoningDelegationStatus, 'delegated');
assert.equal(receipt.summary.laptopReasoningTargetHost, 'laptop_windows');
assert.equal(receipt.summary.laptopReasoningAgentLane, 'local');
assert.equal(receipt.summary.laptopReasoningCanonicalProviderId, 'laptop-sovereign');
assert.equal(receipt.summary.laptopReasoningReuseBeforeBuild, true);
assert.equal(receipt.summary.laptopReasoningGoldRoot, 'D:/GOLD');
assert.equal(receipt.summary.laptopReasoningVastSpendRail, 'purchased_compute');
assert.ok(receipt.proposals.some((proposal) =>
  proposal.operation === 'dispatch_laptop_reasoning_job' &&
  proposal.objectId === 'laptop-reasoning' &&
  proposal.receiptRequired === true &&
  proposal.approvalRequired === false &&
  proposal.canonicalProviderId === 'laptop-sovereign' &&
  proposal.reuseBeforeBuild === true
));

const unsupportedOutDir = path.join('.tmp', 'holoshell', 'self-test', 'laptop-reasoning-unsupported');
const unsupportedTurnsDir = path.join(unsupportedOutDir, 'turns');
const unsupportedLatestOutput = path.join(unsupportedOutDir, 'brittney-turn-latest.json');
const unsupportedJsOutput = path.join(unsupportedOutDir, 'brittney-turn-latest.js');
const unsupportedResult = spawnSync(process.execPath, [
  'scripts/holoshell-brittney-turn.mjs',
  '--prompt',
  'hello',
  '--json',
  '--self-test',
  '--turns-dir',
  unsupportedTurnsDir,
  '--latest-output',
  unsupportedLatestOutput,
  '--js-output',
  unsupportedJsOutput,
], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024,
});

assert.equal(unsupportedResult.status, 0, `unsupported Brittney turn failed:\nSTDOUT:\n${unsupportedResult.stdout}\nSTDERR:\n${unsupportedResult.stderr}`);
const unsupportedFirstBrace = unsupportedResult.stdout.indexOf('{');
assert.ok(unsupportedFirstBrace >= 0, 'unsupported turn stdout must contain JSON receipt');
const unsupportedReceipt = JSON.parse(unsupportedResult.stdout.slice(unsupportedFirstBrace));
const unsupportedDelegation = unsupportedReceipt.runtime.laptopReasoningDelegation;

assert.equal(unsupportedReceipt.selectedBrain.id, 'gamedev');
assert.equal(unsupportedReceipt.selectedCompatibilitySkill.id, 'gamedev');
assert.equal(unsupportedReceipt.summary.brainSelectionSchema, 'holollama-brain-router.selection.v1');
assert.equal(unsupportedDelegation.status, 'not_needed');
assert.equal(unsupportedDelegation.capabilityId, '');
assert.equal(unsupportedDelegation.confidence, 0);
assert.equal(unsupportedDelegation.receiptRequired, false);
assert.equal(unsupportedReceipt.summary.laptopReasoningDelegationStatus, 'not_needed');
assert.equal(unsupportedReceipt.summary.laptopReasoningDispatchId, '');
assert.equal(unsupportedReceipt.shellContext.laptopReasoningDelegation, undefined);
assert.ok(!unsupportedReceipt.proposals.some((proposal) => proposal.operation === 'dispatch_laptop_reasoning_job'));
assert.ok(!unsupportedReceipt.result.finalText.includes('I staged a read-only laptop reasoning job'));

console.log('HoloShell Brittney laptop reasoning delegation test passed.');
