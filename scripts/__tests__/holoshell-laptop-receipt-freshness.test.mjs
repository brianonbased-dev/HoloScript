import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const tempDir = mkdtempSync(join(tmpdir(), 'holoshell-receipt-freshness-'));
const clientTmp = join(tempDir, 'client');
const outputPath = join(tempDir, 'freshness.json');
const operatorTerminalReceipt = join(tempDir, 'server-operator-terminal.json');
const receiptsDir = join(tempDir, 'receipts');
const port = 9490 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;

const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOLOSHELL_SERVE_HOST: '127.0.0.1',
    HOLOSHELL_SERVE_PORT: String(port),
    HOLOSHELL_SESSION_ID: 'test-laptop-receipt-freshness',
    HOLOSHELL_TMP_DIR: tempDir,
    HOLOSHELL_OPERATOR_TERMINAL_RECEIPT: operatorTerminalReceipt,
    HOLOSHELL_RECEIPTS_DIR: receiptsDir,
    HOLOSCRIPT_API_KEY: '',
    HOLOSCRIPT_MCP_API_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let stdout = '';
let stderr = '';
server.stdout.on('data', (chunk) => { stdout += chunk; });
server.stderr.on('data', (chunk) => { stderr += chunk; });

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (stdout.includes('HoloShell Operate Room:')) {
      await delay(100);
      return;
    }
    try {
      const response = await fetch(`${baseUrl}/api/live-status`, {
        signal: AbortSignal.timeout(5000),
      });
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`server did not start\nstdout=${stdout}\nstderr=${stderr}`);
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

try {
  await waitForServer();

  const result = spawnSync(process.execPath, [
    'scripts/holoshell-laptop-receipt-freshness.mjs',
    '--base-url',
    baseUrl,
    '--tmp-dir',
    clientTmp,
    '--output',
    outputPath,
    '--fixture',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const report = JSON.parse(result.stdout);
  assert.equal(report.schemaVersion, 'hololand.holoshell.laptop-receipt-freshness.v0.1.0');
  assert.equal(report.status, 'ready');
  assert.equal(report.mode, 'fixture');
  assert.equal(report.summary.refreshedCount, 4);
  assert.equal(report.summary.failedCount, 0);
  assert.equal(report.summary.attentionSignalCount, 0);
  assert.equal(report.summary.modelInvocationPerformed, false);
  assert.deepEqual(report.attentionSignals, []);
  assert.equal(report.safety.destructiveActionsTaken, false);
  assert.equal(report.safety.desktopAutomationExecuted, false);
  assert.equal(existsSync(outputPath), true);

  const ids = report.endpoints.map((endpoint) => endpoint.id).sort();
  assert.deepEqual(ids, ['desktop_bridge', 'laptop_reasoning', 'operator_terminal', 'window_awareness']);
  assert.equal(report.endpoints.every((endpoint) => endpoint.status && endpoint.status !== 'failed'), true);
  assert.equal(report.endpoints.find((endpoint) => endpoint.id === 'laptop_reasoning').modelInvocationPerformed, false);

  const capsule = await getJson('/api/cockpit/capsule');
  assert.equal(capsule.status, 'ready');
  assert.equal(capsule.destructiveActionsTaken, false);
  assert.equal(capsule.desktopAutomationExecuted, false);

  const session = await getJson('/api/operator-terminal/session');
  assert.equal(session.status, 'coupled');
  assert.equal(session.terminal.receiptStatus, 'fresh');
  assert.equal(session.safety.endpointMayExecuteTerminalCommand, false);
  assert.equal(session.safety.destructiveActionsTaken, false);

  const saved = JSON.parse(readFileSync(outputPath, 'utf8'));
  assert.equal(saved.status, 'ready');

  const dryRunTmp = join(tempDir, 'client-dry-run');
  const dryRunOutputPath = join(tempDir, 'freshness-dry-run.json');
  const dryRunResult = spawnSync(process.execPath, [
    'scripts/holoshell-laptop-receipt-freshness.mjs',
    '--base-url',
    baseUrl,
    '--tmp-dir',
    dryRunTmp,
    '--output',
    dryRunOutputPath,
    '--dry-run',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });

  assert.equal(dryRunResult.status, 0, `${dryRunResult.stdout}\n${dryRunResult.stderr}`);
  const dryRunReport = JSON.parse(dryRunResult.stdout);
  assert.equal(dryRunReport.endpoints.find((endpoint) => endpoint.id === 'laptop_reasoning').status, 'completed');
  const dispatch = JSON.parse(readFileSync(join(dryRunTmp, 'laptop-receipt-freshness-dispatch.json'), 'utf8'));
  assert.equal(dispatch.dispatch.body.canonicalSurfaces.sovereignPeerContext.id, 'workflow.laptop-reasoning-job');
  assert.equal(dispatch.dispatch.body.canonicalSurfaces.sovereignPeerContext.route, '/workflow/laptop-reasoning-job');

  const watchTmp = join(tempDir, 'client-watch');
  const watchOutputPath = join(tempDir, 'freshness-watch.json');
  const watchPidPath = join(watchTmp, 'laptop-receipt-freshness-watch.pid');
  const watchResult = spawnSync(process.execPath, [
    'scripts/holoshell-laptop-receipt-freshness.mjs',
    '--base-url',
    baseUrl,
    '--tmp-dir',
    watchTmp,
    '--output',
    watchOutputPath,
    '--fixture',
    '--watch',
    '--interval-ms',
    '1000',
    '--max-runs',
    '2',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    timeout: 120_000,
    windowsHide: true,
  });

  assert.equal(watchResult.status, 0, `${watchResult.stdout}\n${watchResult.stderr}`);
  const watchReports = watchResult.stdout.trim().split(/\r?\n/u).map((line) => JSON.parse(line));
  assert.equal(watchReports.length, 2);
  assert.equal(watchReports.every((watchReport) => watchReport.status === 'ready'), true);
  assert.equal(watchReports.every((watchReport) => watchReport.summary.attentionSignalCount === 0), true);
  assert.equal(existsSync(watchOutputPath), true);
  assert.equal(existsSync(watchPidPath), false);
} finally {
  server.kill();
  await delay(200);
  rmSync(tempDir, { recursive: true, force: true });
}
