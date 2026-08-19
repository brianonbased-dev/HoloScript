import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildReceipt as buildDispatchReceipt } from '../holoshell-agent-dispatch.mjs';
import {
  buildResultReceipt,
  LAPTOP_REASONING_RESULT_SCHEMA,
  persistResultReceipt,
  runSelfTest,
} from '../holoshell-laptop-reasoning-worker.mjs';

const NODE = process.execPath;
const CREATED_AT = '2026-06-28T00:00:00.000Z';
const tmp = mkdtempSync(path.join(tmpdir(), 'holoshell-laptop-reasoning-worker-test-'));
const goldRoot = path.join(tmp, 'GOLD');
for (const name of ['wisdom', 'patterns', 'gotchas', 'architectures', 'protocols', 'graduated']) {
  mkdirSync(path.join(goldRoot, name), { recursive: true });
}
writeFileSync(path.join(goldRoot, 'credential-registry.json'), '{}\n', 'utf8');

const previousGoldRoot = process.env.GOLD_ROOT;
process.env.GOLD_ROOT = goldRoot.replace(/\\/g, '/');
const dispatch = buildDispatchReceipt({
  actor: 'brittney',
  intent: 'Have the laptop use Codex reasoning to inspect Jetson autonomy, local/cloud focus, GOLD, sovereign peer context, Studio, and Vast guardrails.',
  prompt: 'Hydrate cloud and local tasks, reuse GOLD and Studio surfaces, and do not double-build the backend.',
  output: path.join(tmp, 'agent-dispatch-latest.json'),
  jsOutput: path.join(tmp, 'agent-dispatch-latest.js'),
  dispatchDir: path.join(tmp, 'agent-dispatches'),
});
if (previousGoldRoot === undefined) delete process.env.GOLD_ROOT;
else process.env.GOLD_ROOT = previousGoldRoot;

assert.equal(dispatch.summary.capabilityId, 'laptop_reasoning_job');
assert.equal(dispatch.dispatch.body.canonicalSurfaces.goldDrive.root, goldRoot.replace(/\\/g, '/'));

const receipt = buildResultReceipt(dispatch, {
  createdAt: CREATED_AT,
  dispatchPath: path.join(tmp, 'agent-dispatches', `${dispatch.dispatchId}.json`),
  resultText: 'Fixture reasoning result: laptop owns repo-bearing reasoning first; Vast remains guarded overflow.',
});

assert.equal(receipt.schemaVersion, LAPTOP_REASONING_RESULT_SCHEMA);
assert.equal(receipt.status, 'completed');
assert.equal(receipt.sourceAnchors.source, 'apps/holoshell/source/holoshell-laptop-reasoning-worker.hsplus');
assert.equal(receipt.sourceAnchors.workerScript, 'scripts/holoshell-laptop-reasoning-worker.mjs');
assert.equal(receipt.inputDispatch.dispatchId, dispatch.dispatchId);
assert.equal(receipt.inputDispatch.capabilityId, 'laptop_reasoning_job');
assert.equal(receipt.inputDispatch.dispatchKind, 'reasoning_job');
assert.equal(receipt.inputDispatch.permissionEnvelope, 'read_only');
assert.equal(receipt.inputDispatch.targetHost, 'laptop_windows');
assert.equal(receipt.inputDispatch.lane, 'laptop-hardware');
assert.equal(receipt.inputDispatch.agentLane, 'local');
assert.equal(receipt.inputDispatch.canonicalProviderId, 'laptop-sovereign');
assert.equal(receipt.consumedResourcePlan.reuseBeforeBuild, true);
assert.equal(receipt.consumedResourcePlan.canonicalSurfaces.goldDrive.laptopRuntimeStatus, 'mounted_on_laptop');
assert.equal(receipt.consumedResourcePlan.canonicalSurfaces.goldDrive.usableOnLaptop, true);
assert.ok(receipt.consumedResourcePlan.canonicalSurfaces.goldDrive.sampledTopLevelEntries.some((entry) => entry.redacted === true));
assert.ok(!receipt.consumedResourcePlan.canonicalSurfaces.goldDrive.sampledTopLevelEntries.some((entry) => entry.name === 'credential-registry.json'));
assert.equal(receipt.consumedResourcePlan.canonicalSurfaces.sovereignPeerContext.route, '/workflow/laptop-reasoning-job');
assert.equal(receipt.consumedResourcePlan.canonicalSurfaces.studioBrittney.serviceOrchestrator, 'packages/brittney/service/src/orchestrator.ts');
assert.equal(receipt.consumedResourcePlan.canonicalSurfaces.vastFleet.spendRail, 'purchased_compute');
assert.ok(receipt.consumedResourcePlan.canonicalSurfaces.vastFleet.requires.includes('daily_current_job_budget_fields'));
assert.equal(receipt.validation.status, 'passed');
assert.equal(receipt.validation.failedChecks.length, 0);
assert.equal(receipt.routingVerdict.useLocalLaptopFirst, true);
assert.equal(receipt.routingVerdict.goldUsable, true);
assert.equal(receipt.routingVerdict.useSovereignPeerContextWhenNeeded, true);
assert.equal(receipt.routingVerdict.reuseStudioBrittneyRouter, true);
assert.equal(receipt.routingVerdict.useVastOnlyWithSpendGuard, true);
assert.equal(receipt.routingVerdict.managedCloudReservedForCoordination, true);
assert.equal(receipt.routingVerdict.localFocusCount, 3);
assert.equal(receipt.routingVerdict.cloudFocusCount, 1);
assert.equal(receipt.routingVerdict.reasoningExecutionMode, 'receipt_consumption_only');
assert.equal(receipt.result.modelInvocationPerformed, false);
assert.equal(receipt.result.deterministicReceiptOnly, true);
assert.equal(receipt.result.reasoningExecutionMode, 'receipt_consumption_only');
assert.ok(['reported', 'not_reported'].includes(receipt.result.gpuTelemetry.status));
assert.equal(receipt.brittneyPingback.status, 'ready_for_brittney');
assert.equal(receipt.brittneyPingback.lane, 'laptop-hardware');
assert.match(receipt.result.text, /Fixture reasoning result/);
assert.equal(receipt.summary.status, 'completed');
assert.equal(receipt.summary.lane, 'laptop-hardware');
assert.equal(receipt.summary.reasoningExecutionMode, 'receipt_consumption_only');
assert.equal(receipt.summary.modelInvocationPerformed, false);
assert.equal(receipt.summary.brittneyPingbackStatus, 'ready_for_brittney');
assert.ok(['reported', 'not_reported'].includes(receipt.summary.laptopGpuStatus));
assert.equal(receipt.summary.goldRootStatus, 'mounted_on_laptop');
assert.equal(receipt.summary.goldUsable, true);
assert.equal(receipt.summary.vastSpendGuardAttached, true);
assert.equal(receipt.summary.destructiveActionsTaken, false);
assert.equal(receipt.summary.desktopAutomationExecuted, false);

const freshnessDispatch = JSON.parse(JSON.stringify(dispatch));
freshnessDispatch.dispatchId = 'hsdispatch-laptop-receipt-freshness-test';
freshnessDispatch.summary.capabilityId = 'laptop_reasoning_receipt_freshness';
freshnessDispatch.summary.reasonCodes = ['scheduled_receipt_freshness'];
freshnessDispatch.dispatch.body.sourceHost = 'holoshell_team_automation';
freshnessDispatch.dispatch.body.workload = 'receipt_freshness_check';
freshnessDispatch.dispatch.body.reasonCodes = ['scheduled_receipt_freshness'];
freshnessDispatch.dispatch.body.requestedReturn = 'receipt_freshness_status';
const freshnessReceipt = buildResultReceipt(freshnessDispatch, {
  createdAt: CREATED_AT,
  dispatchPath: path.join(tmp, 'laptop-receipt-freshness-dispatch.json'),
  resultText: 'Scheduled freshness check consumed the laptop reasoning receipt contract.',
});
assert.equal(freshnessReceipt.status, 'completed');
assert.equal(freshnessReceipt.summary.capabilityId, 'laptop_reasoning_receipt_freshness');
assert.equal(freshnessReceipt.summary.brittneyPingbackStatus, 'ready_for_brittney');
assert.equal(freshnessReceipt.summary.failedCheckCount, 0);
assert.equal(freshnessReceipt.brittneyPingback.status, 'ready_for_brittney');

const persisted = persistResultReceipt(receipt, {
  output: path.join(tmp, 'laptop-reasoning-result-latest.json'),
  resultDir: path.join(tmp, 'laptop-reasoning-results'),
});
assert.ok(existsSync(persisted.output.latestPath), 'latest result receipt must be written');
assert.ok(existsSync(persisted.output.archivePath), 'archive result receipt must be written');
const persistedLatest = JSON.parse(readFileSync(persisted.output.latestPath, 'utf8'));
assert.equal(persistedLatest.output.latestPath, persisted.output.latestPath);
assert.equal(persistedLatest.output.archivePath, persisted.output.archivePath);

const dispatchPath = path.join(tmp, 'dispatch-for-cli.json');
writeFileSync(dispatchPath, `${JSON.stringify(dispatch, null, 2)}\n`, 'utf8');
const cliReceipt = JSON.parse(execFileSync(NODE, [
  'scripts/holoshell-laptop-reasoning-worker.mjs',
  '--dispatch',
  dispatchPath,
  '--output',
  path.join(tmp, 'cli-latest.json'),
  '--result-dir',
  path.join(tmp, 'cli-results'),
  '--created-at',
  CREATED_AT,
  '--result-text',
  'CLI fixture result consumed the laptop resource plan.',
  '--json',
], { encoding: 'utf8' }));
assert.equal(cliReceipt.status, 'completed');
assert.equal(cliReceipt.summary.dispatchId, dispatch.dispatchId);
assert.equal(cliReceipt.summary.goldRootStatus, 'mounted_on_laptop');
assert.ok(existsSync(cliReceipt.output.latestPath));
assert.ok(existsSync(cliReceipt.output.archivePath));

const selfTestReceipt = runSelfTest({ createdAt: CREATED_AT });
assert.equal(selfTestReceipt.status, 'completed');
assert.equal(selfTestReceipt.summary.goldUsable, true);

const cliSelfTest = JSON.parse(execFileSync(NODE, [
  'scripts/holoshell-laptop-reasoning-worker.mjs',
  '--self-test',
  '--created-at',
  CREATED_AT,
  '--json',
], { encoding: 'utf8' }));
assert.equal(cliSelfTest.status, 'completed');
assert.equal(cliSelfTest.summary.goldUsable, true);

const sourceContract = readFileSync(path.resolve('apps/holoshell/source/holoshell-laptop-reasoning-worker.hsplus'), 'utf8');
assert.match(sourceContract, /LaptopReasoningWorkerIsReadOnly/);
assert.match(sourceContract, /ConsumeCanonicalResourcePlanBeforeAnswer/);
assert.match(sourceContract, /VastFleetIsOverflowOnly/);

console.log('HoloShell laptop reasoning worker test passed.');
