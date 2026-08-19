import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildReceipt as buildDispatchReceipt, persist as persistDispatchReceipt } from '../holoshell-agent-dispatch.mjs';
import {
  LAPTOP_REASONING_BRIDGE_SCHEMA,
  processPendingDispatches,
  runSelfTest,
} from '../holoshell-laptop-reasoning-bridge.mjs';

const NODE = process.execPath;
const CREATED_AT = '2026-06-28T00:00:00.000Z';
const tmp = mkdtempSync(path.join(tmpdir(), 'holoshell-laptop-reasoning-bridge-test-'));
const goldRoot = path.join(tmp, 'GOLD');
for (const name of ['wisdom', 'patterns', 'gotchas', 'architectures', 'protocols', 'graduated']) {
  mkdirSync(path.join(goldRoot, name), { recursive: true });
}

const dispatchArgs = {
  actor: 'brittney',
  intent: 'Have the laptop reason through Jetson autonomy, GOLD, Studio, local/cloud tasks, and Vast guardrails.',
  prompt: 'Laptop reasoning bridge test: consume existing dispatches and return a receipt.',
  output: path.join(tmp, 'agent-dispatch-latest.json'),
  jsOutput: path.join(tmp, 'agent-dispatch-latest.js'),
  dispatchDir: path.join(tmp, 'agent-dispatches'),
};

const previousGoldRoot = process.env.GOLD_ROOT;
process.env.GOLD_ROOT = goldRoot.replace(/\\/g, '/');
const dispatch = buildDispatchReceipt(dispatchArgs);
const persistedDispatch = persistDispatchReceipt(dispatchArgs, dispatch);
if (previousGoldRoot === undefined) delete process.env.GOLD_ROOT;
else process.env.GOLD_ROOT = previousGoldRoot;

assert.equal(persistedDispatch.summary.capabilityId, 'laptop_reasoning_job');
assert.ok(existsSync(persistedDispatch.output.dispatchReceiptPath));

const bridge = processPendingDispatches({
  once: true,
  dispatchDir: dispatchArgs.dispatchDir,
  inboxDir: path.join(tmp, 'inbox'),
  resultDir: path.join(tmp, 'results'),
  resultOutput: path.join(tmp, 'laptop-reasoning-result-latest.json'),
  bridgeOutput: path.join(tmp, 'laptop-reasoning-bridge-latest.json'),
  statePath: path.join(tmp, 'state.json'),
  resultText: 'Bridge test result: local laptop reasoning first, Vast only behind spend guard.',
  createdAt: CREATED_AT,
});

assert.equal(bridge.schemaVersion, LAPTOP_REASONING_BRIDGE_SCHEMA);
assert.equal(bridge.summary.status, 'completed');
assert.equal(bridge.summary.processedCount, 1);
assert.equal(bridge.summary.errorCount, 0);
assert.equal(bridge.summary.latestDispatchId, persistedDispatch.dispatchId);
assert.equal(bridge.summary.latestLane, 'laptop-hardware');
assert.equal(bridge.summary.latestModelInvocationPerformed, false);
assert.equal(bridge.summary.latestBrittneyPingbackStatus, 'ready_for_brittney');
assert.ok(existsSync(bridge.processed[0].resultPath));
assert.ok(existsSync(bridge.output.bridgeOutput));

const latestResult = JSON.parse(readFileSync(path.join(tmp, 'laptop-reasoning-result-latest.json'), 'utf8'));
assert.equal(latestResult.summary.dispatchId, persistedDispatch.dispatchId);
assert.equal(latestResult.summary.lane, 'laptop-hardware');
assert.equal(latestResult.summary.modelInvocationPerformed, false);
assert.equal(latestResult.summary.brittneyPingbackStatus, 'ready_for_brittney');
assert.equal(latestResult.summary.goldUsable, true);
assert.equal(latestResult.summary.vastSpendGuardAttached, true);

const idempotent = processPendingDispatches({
  once: true,
  dispatchDir: dispatchArgs.dispatchDir,
  inboxDir: path.join(tmp, 'inbox'),
  resultDir: path.join(tmp, 'results'),
  resultOutput: path.join(tmp, 'laptop-reasoning-result-latest.json'),
  bridgeOutput: path.join(tmp, 'laptop-reasoning-bridge-second.json'),
  statePath: path.join(tmp, 'state.json'),
  createdAt: CREATED_AT,
});
assert.equal(idempotent.summary.processedCount, 0);
assert.ok(idempotent.skipped.some((item) => item.reason === 'already_processed'));

const staleDispatchDir = path.join(tmp, 'stale-dispatches');
mkdirSync(staleDispatchDir, { recursive: true });
const staleDispatch = JSON.parse(JSON.stringify(persistedDispatch));
staleDispatch.dispatchId = 'hsdispatch-stale-blocked';
staleDispatch.dispatch.body.lane = 'codex-hardware';
writeFileSync(
  path.join(staleDispatchDir, `${staleDispatch.dispatchId}.json`),
  `${JSON.stringify(staleDispatch, null, 2)}\n`,
  'utf8'
);

const staleFirst = processPendingDispatches({
  once: true,
  dispatchDir: staleDispatchDir,
  inboxDir: path.join(tmp, 'stale-inbox'),
  resultDir: path.join(tmp, 'stale-results'),
  resultOutput: path.join(tmp, 'stale-latest-result.json'),
  bridgeOutput: path.join(tmp, 'stale-bridge.json'),
  statePath: path.join(tmp, 'stale-state.json'),
  createdAt: CREATED_AT,
});
assert.equal(staleFirst.summary.processedCount, 1);
assert.equal(staleFirst.summary.blockedResultCount, 1);

const staleMigrated = processPendingDispatches({
  once: true,
  dispatchDir: staleDispatchDir,
  inboxDir: path.join(tmp, 'stale-inbox-fresh'),
  resultDir: path.join(tmp, 'stale-results'),
  resultOutput: path.join(tmp, 'stale-latest-result-fresh.json'),
  bridgeOutput: path.join(tmp, 'stale-bridge-fresh.json'),
  statePath: path.join(tmp, 'stale-fresh-state.json'),
  createdAt: CREATED_AT,
});
assert.equal(staleMigrated.summary.processedCount, 0);
assert.equal(staleMigrated.summary.migratedCount, 1);
assert.equal(staleMigrated.summary.retiredBlockedResultCount, 1);
assert.ok(staleMigrated.skipped.some((item) => item.reason === 'retired_existing_blocked_result'));
const healedState = JSON.parse(readFileSync(path.join(tmp, 'stale-fresh-state.json'), 'utf8'));
assert.equal(healedState.processedDispatchIds['hsdispatch-stale-blocked'].status, 'blocked');
assert.equal(healedState.migratedDispatchIds['hsdispatch-stale-blocked'].reason, 'retired_existing_blocked_result');

const cliReceipt = JSON.parse(execFileSync(NODE, [
  'scripts/holoshell-laptop-reasoning-bridge.mjs',
  '--once',
  '--dispatch-dir',
  dispatchArgs.dispatchDir,
  '--inbox-dir',
  path.join(tmp, 'cli-inbox'),
  '--result-dir',
  path.join(tmp, 'cli-results'),
  '--result-output',
  path.join(tmp, 'cli-latest-result.json'),
  '--bridge-output',
  path.join(tmp, 'cli-bridge.json'),
  '--state',
  path.join(tmp, 'cli-state.json'),
  '--created-at',
  CREATED_AT,
  '--result-text',
  'CLI bridge test consumed the staged dispatch.',
  '--json',
], { encoding: 'utf8' }));

assert.equal(cliReceipt.summary.processedCount, 1);
assert.equal(cliReceipt.summary.errorCount, 0);
assert.equal(cliReceipt.summary.latestDispatchId, persistedDispatch.dispatchId);

const selfTestReceipt = runSelfTest({ createdAt: CREATED_AT });
assert.equal(selfTestReceipt.summary.processedCount, 1);
assert.equal(selfTestReceipt.summary.errorCount, 0);

const cliSelfTest = JSON.parse(execFileSync(NODE, [
  'scripts/holoshell-laptop-reasoning-bridge.mjs',
  '--self-test',
  '--created-at',
  CREATED_AT,
  '--json',
], { encoding: 'utf8' }));
assert.equal(cliSelfTest.summary.processedCount, 1);
assert.equal(cliSelfTest.summary.errorCount, 0);

console.log('HoloShell laptop reasoning bridge test passed.');
