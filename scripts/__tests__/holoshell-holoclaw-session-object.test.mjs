import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const tempDir = mkdtempSync(join(tmpdir(), 'holoshell-holoclaw-session-'));
const port = 9470 + Math.floor(Math.random() * 200);
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['packages/holoshell/serve.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    HOLOSHELL_SERVE_HOST: '127.0.0.1',
    HOLOSHELL_SERVE_PORT: String(port),
    HOLOSHELL_TMP_DIR: tempDir,
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
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`HoloShell server exited early (${server.exitCode})\n${stdout}\n${stderr}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/substrate-pressure`, {
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`Timed out waiting for HoloShell server\n${stdout}\n${stderr}`);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

async function postJson(path, payload) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return body;
}

try {
  await waitForServer();

  const liveStatus = await getJson('/api/live-status');
  assert.equal(liveStatus.route.holoclawSessionObjectEndpoint, 'GET /api/holoclaw/session-object?sessionId=:sessionId');
  assert.ok(liveStatus.capabilities.includes('holoclaw_session_object'));

  const initialSession = await getJson('/api/holoclaw/session-object');
  assert.equal(initialSession.schemaVersion, 'hololand.holoshell.holoclaw-session-object.v0.1.0');
  assert.equal(initialSession.source, 'apps/holoshell/source/holoshell-holoclaw-production-frontier.hsplus');
  assert.equal(initialSession.sessionScoped, false);
  assert.equal(initialSession.status, 'session_bound');
  assert.equal(initialSession.activeWorkspaceId, 'brittney');
  assert.equal(initialSession.workspaceSessionCount, 5);
  assert.equal(initialSession.route.endpoint, 'GET /api/holoclaw/session-object?sessionId=:sessionId');
  assert.equal(initialSession.safety.directExecutionAllowed, false);
  assert.equal(initialSession.safety.endpointExecutesRuntime, false);
  assert.equal(initialSession.bindings.runtimeTargetPerWorkspaceRequired, true);
  assert.equal(initialSession.bindings.replayBundlePerWorkspaceRequired, true);

  const holoclawWorkspace = initialSession.workspaceSessions.find((workspace) => workspace.workspaceId === 'holoclaw');
  assert.ok(holoclawWorkspace);
  assert.equal(holoclawWorkspace.route, 'POST /workflow/holoclaw-runtime-bridge');
  assert.equal(holoclawWorkspace.permissionEnvelope, 'guarded_execute');
  assert.match(holoclawWorkspace.runtimeTargetId, /^holoclaw:.*:holoclaw:runtime$/);
  assert.match(holoclawWorkspace.browserTargetId, /^holoclaw:.*:holoclaw:browser-target$/);
  assert.match(holoclawWorkspace.terminalStreamId, /^holoclaw:.*:holoclaw:terminal-stream$/);
  assert.match(holoclawWorkspace.approvalQueueId, /^holoclaw:.*:holoclaw:approval-queue$/);
  assert.match(holoclawWorkspace.replayBundleId, /^holoclaw:.*:holoclaw:replay-bundle$/);
  assert.equal(holoclawWorkspace.mayExecuteWithoutConsent, false);

  await postJson('/api/browser-session/state?sessionId=holoclaw-alpha', {
    schemaVersion: 'hololand.holoshell.browser-session-state.v0.1.0',
    source: 'browser_cockpit_snapshot',
    sessionId: 'holoclaw-alpha',
    activeChatId: 'holoclaw',
    expandedChatIds: ['holoclaw', 'terminal'],
    transcriptByChat: {
      holoclaw: [
        {
          type: 'message',
          who: 'HoloClaw',
          text: 'session object binds this workspace',
          color: '#bc8cff',
        },
      ],
    },
    evidenceLedger: [
      {
        kind: 'operator_terminal_session',
        chatId: 'holoclaw',
        status: 'ready',
        receiptHash: 'session-object-hash',
        summary: 'workspace evidence',
      },
    ],
    drafts: {
      chatInputs: {
        holoclaw: 'session bound draft',
      },
    },
    updatedAt: new Date().toISOString(),
  });

  const scopedSession = await getJson('/api/holoclaw/session-object?sessionId=holoclaw-alpha');
  assert.equal(scopedSession.sessionId, 'holoclaw-alpha');
  assert.equal(scopedSession.sessionScoped, true);
  assert.equal(scopedSession.storageKey, 'holoshell:brittney:browser-session:v1:holoclaw-alpha');
  assert.equal(scopedSession.activeWorkspaceId, 'holoclaw');
  assert.equal(scopedSession.browserSession.snapshotStatus, 'available');
  assert.equal(scopedSession.browserSession.transcriptEntryCount, 1);
  assert.equal(scopedSession.browserSession.evidenceLedgerCount, 1);
  assert.equal(scopedSession.bindings.activeWorkspace.workspaceId, 'holoclaw');
  assert.equal(scopedSession.bindings.activeWorkspace.transcriptEntryCount, 1);
  assert.equal(scopedSession.bindings.activeWorkspace.evidenceEntryCount, 1);
  assert.equal(scopedSession.bindings.activeWorkspace.draftPresent, true);
  assert.equal(scopedSession.bindings.holoclawWorkspace.approvalQueueId, 'holoclaw:holoclaw-alpha:holoclaw:approval-queue');
} finally {
  if (server.exitCode === null) {
    server.kill();
  }
  rmSync(tempDir, { recursive: true, force: true });
}
