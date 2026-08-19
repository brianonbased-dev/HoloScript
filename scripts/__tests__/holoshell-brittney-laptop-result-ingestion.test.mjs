#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tmp = mkdtempSync(path.join(tmpdir(), 'holoshell-brittney-laptop-result-ingestion-'));
const goldRoot = path.join(tmp, 'GOLD');
for (const name of ['wisdom', 'patterns', 'gotchas', 'architectures', 'protocols', 'graduated']) {
  mkdirSync(path.join(goldRoot, name), { recursive: true });
}

const env = {
  ...process.env,
  GOLD_ROOT: goldRoot.replace(/\\/g, '/'),
};
const prompt = [
  `Laptop result ingestion fixture ${process.pid}-${Date.now()}.`,
  'Have the Jetson send this large reasoning ask to the laptop hardware lane.',
  'Use GOLD, Studio, sovereign peer context, local/cloud focus, and Vast spend guardrails.',
].join(' ');

function parseReceipt(result, label) {
  assert.equal(result.status, 0, `${label} failed:\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  const firstBrace = result.stdout.indexOf('{');
  assert.ok(firstBrace >= 0, `${label} stdout must contain JSON`);
  return JSON.parse(result.stdout.slice(firstBrace));
}

function runTurn(label, outputStem) {
  return parseReceipt(spawnSync(process.execPath, [
    'scripts/holoshell-brittney-turn.mjs',
    '--prompt',
    prompt,
    '--json',
    '--self-test',
    '--turns-dir',
    path.join(tmp, `${outputStem}-turns`),
    '--latest-output',
    path.join(tmp, `${outputStem}-latest.json`),
    '--js-output',
    path.join(tmp, `${outputStem}-latest.js`),
  ], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }), label);
}

const firstTurn = runTurn('first Brittney turn', 'first');
assert.equal(firstTurn.runtime.laptopReasoningDelegation.status, 'delegated');
assert.equal(firstTurn.summary.laptopReasoningResultStatus, 'waiting');
assert.ok(existsSync(firstTurn.runtime.laptopReasoningDelegation.dispatchReceiptPath));

const workerReceipt = parseReceipt(spawnSync(process.execPath, [
  'scripts/holoshell-laptop-reasoning-worker.mjs',
  '--dispatch',
  firstTurn.runtime.laptopReasoningDelegation.dispatchReceiptPath,
  '--output',
  path.join('.tmp', 'holoshell', 'laptop-reasoning-result-latest.json'),
  '--result-dir',
  path.join('.tmp', 'holoshell', 'laptop-reasoning-results'),
  '--created-at',
  '2026-06-28T00:00:00.000Z',
  '--result-text',
  'Fixture laptop result: reuse GOLD and Studio first; Vast stays spend-guarded overflow.',
  '--json',
], {
  cwd: REPO_ROOT,
  env,
  encoding: 'utf8',
  windowsHide: true,
  maxBuffer: 16 * 1024 * 1024,
}), 'laptop reasoning worker');

assert.equal(workerReceipt.summary.status, 'completed');
assert.equal(workerReceipt.summary.dispatchId, firstTurn.runtime.laptopReasoningDelegation.dispatchId);
assert.equal(workerReceipt.summary.lane, 'laptop-hardware');
assert.equal(workerReceipt.summary.modelInvocationPerformed, false);
assert.equal(workerReceipt.summary.brittneyPingbackStatus, 'ready_for_brittney');
assert.equal(workerReceipt.brittneyPingback.target, 'brittney_holoshell_turn');
assert.equal(workerReceipt.summary.goldUsable, true);
assert.equal(workerReceipt.summary.vastSpendGuardAttached, true);

const secondTurn = runTurn('second Brittney turn', 'second');
assert.equal(secondTurn.runtime.laptopReasoningDelegation.status, 'delegated');
assert.equal(secondTurn.runtime.laptopReasoningResult.status, 'completed');
assert.equal(secondTurn.runtime.laptopReasoningResult.resultId, workerReceipt.resultId);
assert.equal(secondTurn.runtime.laptopReasoningResult.dispatchId, workerReceipt.summary.dispatchId);
assert.equal(secondTurn.runtime.laptopReasoningResult.matchKind, 'prompt_hash');
assert.equal(secondTurn.shellContext.laptopReasoningResult.resultId, workerReceipt.resultId);
assert.equal(secondTurn.summary.laptopReasoningResultStatus, 'completed');
assert.equal(secondTurn.summary.laptopReasoningResultMatchKind, 'prompt_hash');
assert.equal(secondTurn.summary.laptopReasoningResultLane, 'laptop-hardware');
assert.equal(secondTurn.summary.laptopReasoningResultModelInvocationPerformed, false);
assert.equal(secondTurn.summary.laptopReasoningResultBrittneyPingbackStatus, 'ready_for_brittney');
assert.equal(secondTurn.summary.laptopReasoningResultGoldRootStatus, 'mounted_on_laptop');
assert.equal(secondTurn.summary.laptopReasoningResultGoldUsable, true);
assert.equal(secondTurn.summary.laptopReasoningResultVastSpendGuardAttached, true);
assert.equal(secondTurn.summary.laptopReasoningResultLocalFocusCount, 3);
assert.equal(secondTurn.summary.laptopReasoningResultCloudFocusCount, 1);

console.log('HoloShell Brittney laptop result ingestion test passed.');
