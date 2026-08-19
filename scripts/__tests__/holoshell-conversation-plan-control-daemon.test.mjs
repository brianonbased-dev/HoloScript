#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const tmp = mkdtempSync(path.join(tmpdir(), 'holoshell-conversation-plan-control-'));
const turnsDir = path.join(tmp, 'turns');
const latestOutput = path.join(tmp, 'brittney-turn-latest.json');
const jsOutput = path.join(tmp, 'brittney-turn-latest.js');
const conversationPlanOutput = path.join(tmp, 'brittney-conversation-plan-latest.json');
const dispatchOutput = path.join(tmp, 'conversation-plan-dispatch-latest.json');
const dispatchJsOutput = path.join(tmp, 'conversation-plan-dispatch-latest.js');
const dispatchDir = path.join(tmp, 'conversation-plan-dispatches');
const roomTaskOutput = path.join(tmp, 'conversation-plan-room-tasks-latest.json');

const prompts = [
  'We need a receipt-backed plan for HoloShell accepting conversation-plan proposals. Ask what is missing before execution.',
  'Answer: use the local control daemon, HoloScript source contracts, room tasks, and receipts.',
  'Plan the route from Brittney proposal to dispatcher receipt and keep execution blocked by default.',
  'Confirm dry-run and execute flags must be explicit before any room mutation.',
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

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, processLabel, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${processLabel}: ${lastError?.message || 'no response'}`);
}

async function postJson(url, body, expectedStatus = 200) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  assert.equal(response.status, expectedStatus, `${url} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

function stopProcess(child) {
  if (!child.killed) child.kill();
}

const receipts = prompts.map((prompt, index) => runTurn(prompt, index));
const finalReceipt = receipts.at(-1);
const plan = JSON.parse(readFileSync(conversationPlanOutput, 'utf8'));
const proposal = finalReceipt.proposals.find((item) => item.operation === 'dispatch_conversation_plan');

assert.equal(plan.summary.dispatchReady, true);
assert.ok(proposal, 'commence all must create a conversation-plan proposal');
assert.equal(proposal.acceptanceRoute, '/workflow/conversation-plan-dispatch');
assert.equal(proposal.acceptanceMethod, 'POST');
assert.equal(proposal.acceptanceMode, 'plan_only_by_default_explicit_dry_run_or_execute');
assert.deepEqual(proposal.allowedExecutionModes, ['plan_only', 'dry_run_room_tasks', 'execute_room_tasks']);
assert.equal(proposal.dryRunFlag, '--dry-run-room-tasks');
assert.equal(proposal.executeFlag, '--execute-room-tasks');
assert.equal(proposal.defaultMutationMode, 'plan_only');
assert.equal(proposal.dispatchReceiptRequired, true);
assert.equal(proposal.downstreamReceiptsRequired, true);
assert.equal(proposal.completionClaimAllowed, false);
assert.equal(proposal.completionBlockedUntil, 'downstream_receipts');

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const daemon = spawn(process.execPath, [
  'scripts/holoshell-control-daemon.mjs',
  '--host',
  '127.0.0.1',
  '--port',
  String(port),
  '--tmp-dir',
  tmp,
], {
  cwd: REPO_ROOT,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let daemonStdout = '';
let daemonStderr = '';
daemon.stdout.on('data', (chunk) => { daemonStdout += chunk.toString(); });
daemon.stderr.on('data', (chunk) => { daemonStderr += chunk.toString(); });

try {
  await waitForServer(`${baseUrl}/health`, 'HoloShell control daemon');
  const response = await postJson(`${baseUrl}/workflow/conversation-plan-dispatch`, {
    plan: conversationPlanOutput,
    output: dispatchOutput,
    jsOutput: dispatchJsOutput,
    dispatchDir,
    roomTaskOutput,
    executionMode: 'plan_only',
  });

  assert.equal(response.ok, true);
  assert.equal(response.completionClaimAllowed, false);
  assert.equal(response.downstreamReceiptsRequired, true);
  assert.equal(response.conversationPlanDispatch.schemaVersion, 'hololand.holoshell.conversation-plan-dispatch.v0.1.0');
  assert.equal(response.conversationPlanDispatch.summary.planId, plan.planId);
  assert.equal(response.conversationPlanDispatch.summary.status, 'ready_to_route');
  assert.equal(response.conversationPlanDispatch.summary.mutationExecuted, false);
  assert.equal(response.conversationPlanDispatch.summary.completionClaimAllowed, false);
  assert.equal(response.conversationPlanDispatch.execution.roomExecution.status, 'not_requested');
  assert.equal(response.conversationPlanDispatch.downstreamReceipts.required, true);
  assert.ok(existsSync(dispatchOutput), `expected dispatch receipt at ${dispatchOutput}`);
  assert.ok(existsSync(dispatchJsOutput), `expected dispatch bootstrap at ${dispatchJsOutput}`);
  assert.ok(existsSync(roomTaskOutput), `expected room task batch at ${roomTaskOutput}`);

  const latest = await (await fetch(`${baseUrl}/workflow/conversation-plan-dispatch/latest`)).json();
  assert.equal(latest.dispatchId, response.conversationPlanDispatch.dispatchId);
  assert.equal(latest.summary.completionClaimAllowed, false);

  const conflicting = await postJson(`${baseUrl}/workflow/conversation-plan-dispatch`, {
    plan: conversationPlanOutput,
    dryRunRoomTasks: true,
    executeRoomTasks: true,
  }, 400);
  assert.match(conflicting.error, /mutually exclusive/i);

  console.log('HoloShell conversation-plan control daemon test passed.');
} catch (error) {
  error.message += `\ndaemon stdout:\n${daemonStdout}\ndaemon stderr:\n${daemonStderr}`;
  throw error;
} finally {
  stopProcess(daemon);
}
