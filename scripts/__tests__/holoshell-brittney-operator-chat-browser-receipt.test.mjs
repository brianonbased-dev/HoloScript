#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'brittney-operator-chat-browser');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const JS_PATH = path.join(OUTPUT_DIR, 'receipt.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
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

function stopProcess(child) {
  if (!child.killed) child.kill();
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });

run(process.execPath, ['packages/holoshell/compile.mjs'], { timeout: 60_000 });

const port = await freePort();
const serverEnv = {
  ...process.env,
  HOLOSHELL_SERVE_HOST: '127.0.0.1',
  HOLOSHELL_SERVE_PORT: String(port),
  HOLOSHELL_TMP_DIR: path.join(OUTPUT_DIR, 'server-tmp'),
  HOLOSHELL_RECEIPTS_DIR: path.join(OUTPUT_DIR, 'receipts'),
  HOLOTUNE_TRACE_DISABLED: '1',
};
const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: REPO_ROOT,
  env: serverEnv,
  windowsHide: true,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverStdout = '';
let serverStderr = '';
server.stdout.on('data', (chunk) => { serverStdout += chunk.toString(); });
server.stderr.on('data', (chunk) => { serverStderr += chunk.toString(); });

try {
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url, 'HoloShell local server');

  run(process.execPath, [
    'scripts/holoshell-brittney-operator-chat-browser-receipt.mjs',
    '--url',
    url,
    '--chat-self-test',
    '--output-dir',
    OUTPUT_DIR,
    '--output',
    RECEIPT_PATH,
    '--js-output',
    JS_PATH,
    '--timeout-ms',
    '90000',
    '--json',
  ], {
    timeout: 120_000,
  });

  const receipt = readJson(RECEIPT_PATH);
  assert.equal(receipt.schema, 'hololand.holoshell.brittney-operator-chat-browser-receipt.v0.1.0');
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.chatSelfTest, true);
  assert.equal(receipt.state.assertions.laneTruthVisible, true);
  assert.equal(receipt.state.assertions.sourceOwnedVisible, true);
  assert.equal(receipt.state.assertions.contextCapsuleVisible, true);
  assert.equal(receipt.state.assertions.browserSelfTestVisible, true);
  assert.equal(receipt.state.assertions.nativeWindowVisible, true);
  assert.equal(receipt.state.assertions.holoServicesVisible, true);
  assert.equal(receipt.state.assertions.sourceEnvelopeVisible, true);
  assert.equal(receipt.state.assertions.terminalEventsVisible, true);
  assert.equal(receipt.state.assertions.proposalCardsVisible, true);
  assert.equal(receipt.state.assertions.receiptNarrationVisible, true);
  assert.equal(receipt.state.assertions.runtimeTruthVisible, true);
  assert.equal(receipt.state.assertions.messageInputVisible, true);
  assert.equal(receipt.state.assertions.chatResponseCaptured, true);
  assert.ok(receipt.state.counts.operatorPills >= 4, 'operator rail should render lane truth pills');
  assert.ok(receipt.state.counts.proposalCards > 0, 'proposal cards should render');
  assert.ok(receipt.state.counts.receiptNarrationCards > 0, 'receipt narration card should render');
  assert.ok(receipt.state.counts.runtimeTruthCards > 0, 'runtime truth card should render');
  assert.ok(receipt.state.counts.messages >= 2, 'message stream should include user and Brittney messages');
  assert.doesNotMatch(JSON.stringify(receipt.state.samples), /turn completed; receipt metadata not reported/i);
  assert.doesNotMatch(JSON.stringify(receipt.state.samples), /initiated and is awaiting result/i);
  assert.equal(receipt.state.chat.ok, true);
  assert.equal(receipt.state.chat.selfTest, true);
  assert.equal(receipt.state.chat.selectedBrainId, 'gamedev');
  assert.equal(receipt.state.chat.selectedCompatibilitySkillId, 'gamedev');
  assert.ok(receipt.state.chat.selectedBrainConsumerProfileId);
  assert.ok(receipt.state.chat.proposalCount > 0, 'chat response should include proposals');
  assert.equal(receipt.state.chat.modelInvocationPerformed, false);
  assert.ok(receipt.evidence.screenshotSha256, 'missing screenshot hash');
  assert.ok(receipt.evidence.domSha256, 'missing DOM hash');
  assert.ok(existsSync(path.resolve(REPO_ROOT, receipt.evidence.screenshot)), 'screenshot file missing');
  assert.ok(existsSync(path.resolve(REPO_ROOT, receipt.evidence.dom)), 'DOM file missing');
  assert.ok(existsSync(JS_PATH), 'receipt bootstrap JS missing');

  console.log('holoshell Brittney operator chat browser receipt test passed');
} catch (error) {
  error.message += `\nserver stdout:\n${serverStdout}\nserver stderr:\n${serverStderr}`;
  throw error;
} finally {
  stopProcess(server);
}
