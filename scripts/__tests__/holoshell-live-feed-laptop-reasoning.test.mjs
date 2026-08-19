import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const NODE = process.execPath;
const tmp = mkdtempSync(join(tmpdir(), 'holoshell-live-feed-laptop-reasoning-'));
mkdirSync(tmp, { recursive: true });

const bridge = {
  schemaVersion: 'hololand.holoshell.laptop-reasoning-bridge.v0.1.0',
  bridgeId: 'laptop_reasoning_bridge_fixture',
  generatedAt: '2026-06-28T00:00:00.000Z',
  sourceAnchors: {
    bridgeScript: 'scripts/holoshell-laptop-reasoning-bridge.mjs',
  },
  summary: {
    status: 'completed',
    pulledCount: 1,
    processedCount: 1,
    pushedCount: 1,
    errorCount: 0,
    latestLane: 'laptop-hardware',
    latestLaptopGpuStatus: 'reported',
    latestBrittneyPingbackStatus: 'ready_for_brittney',
    latestModelInvocationPerformed: false,
  },
};

const result = {
  schemaVersion: 'hololand.holoshell.laptop-reasoning-result.v0.1.0',
  resultId: 'laptop_reasoning_result_fixture',
  generatedAt: '2026-06-28T00:00:01.000Z',
  sourceAnchors: {
    workerScript: 'scripts/holoshell-laptop-reasoning-worker.mjs',
  },
  summary: {
    status: 'completed',
    resultId: 'laptop_reasoning_result_fixture',
    dispatchId: 'hsdispatch-fixture',
    lane: 'laptop-hardware',
    reasoningExecutionMode: 'receipt_consumption_only',
    modelInvocationPerformed: false,
    deterministicReceiptOnly: true,
    laptopGpuStatus: 'reported',
    laptopGpuSummary: 'Fixture RTX: 0% GPU, 256/6144 MiB, no compute process reported',
    laptopGpuProcessCount: 0,
    brittneyPingbackStatus: 'ready_for_brittney',
    goldRootStatus: 'mounted_on_laptop',
    goldUsable: true,
    vastSpendGuardAttached: true,
    localFocusCount: 3,
    cloudFocusCount: 1,
  },
};

writeFileSync(join(tmp, 'laptop-reasoning-bridge-latest.json'), `${JSON.stringify(bridge, null, 2)}\n`, 'utf8');
writeFileSync(join(tmp, 'laptop-reasoning-result-latest.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8');

const liveFeed = JSON.parse(execFileSync(NODE, [
  resolve('scripts/holoshell-live-feed.mjs'),
  '--tmp-dir',
  tmp,
  '--output',
  join(tmp, 'live-feed.json'),
  '--js-output',
  join(tmp, 'live-feed.js'),
  '--json',
], { encoding: 'utf8' }));

assert.equal(liveFeed.summary.laptopReasoningBridgeStatus, 'completed');
assert.equal(liveFeed.summary.laptopReasoningBridgeProcessedCount, 1);
assert.equal(liveFeed.summary.laptopReasoningBridgePulledCount, 1);
assert.equal(liveFeed.summary.laptopReasoningBridgePushedCount, 1);
assert.equal(liveFeed.summary.laptopReasoningBridgeErrorCount, 0);
assert.equal(liveFeed.summary.laptopReasoningBridgeLatestLane, 'laptop-hardware');
assert.equal(liveFeed.summary.laptopReasoningBridgeLatestGpuStatus, 'reported');
assert.equal(liveFeed.summary.laptopReasoningBridgeLatestPingbackStatus, 'ready_for_brittney');
assert.equal(liveFeed.summary.laptopReasoningResultStatus, 'completed');
assert.equal(liveFeed.summary.laptopReasoningResultId, 'laptop_reasoning_result_fixture');
assert.equal(liveFeed.summary.laptopReasoningResultDispatchId, 'hsdispatch-fixture');
assert.equal(liveFeed.summary.laptopReasoningResultLane, 'laptop-hardware');
assert.equal(liveFeed.summary.laptopReasoningResultMode, 'receipt_consumption_only');
assert.equal(liveFeed.summary.laptopReasoningResultModelInvocationPerformed, false);
assert.equal(liveFeed.summary.laptopReasoningResultGpuStatus, 'reported');
assert.equal(liveFeed.summary.laptopReasoningResultBrittneyPingbackStatus, 'ready_for_brittney');
assert.equal(liveFeed.summary.laptopReasoningResultGoldRootStatus, 'mounted_on_laptop');
assert.equal(liveFeed.summary.laptopReasoningResultGoldUsable, true);
assert.equal(liveFeed.summary.laptopReasoningResultVastSpendGuardAttached, true);
assert.equal(liveFeed.summary.laptopReasoningResultLocalFocusCount, 3);
assert.equal(liveFeed.summary.laptopReasoningResultCloudFocusCount, 1);
assert.equal(liveFeed.feeds.laptopReasoningBridge.bridgeId, bridge.bridgeId);
assert.equal(liveFeed.feeds.laptopReasoningResult.resultId, result.resultId);
assert.ok(liveFeed.timeline.some((item) => item.kind === 'laptop_reasoning_bridge'));
assert.ok(liveFeed.timeline.some((item) => item.kind === 'laptop_reasoning_result'));

console.log('HoloShell live feed laptop reasoning test passed.');
