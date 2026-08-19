import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import {
  buildBridgeStatus,
  buildConsentToken,
  buildDesktopControlPreflight,
  buildDesktopControlExecution,
  buildExecutionRefusal,
  createLaptopDesktopBridgeServer,
  DESKTOP_CONTROL_CONSENT_TOKEN_SCHEMA,
  DESKTOP_CONTROL_EXECUTION_SCHEMA,
  DESKTOP_CONTROL_PREFLIGHT_SCHEMA,
  LAPTOP_DESKTOP_BRIDGE_SCHEMA,
  runSelfTest,
} from '../holoshell-laptop-desktop-bridge.mjs';
import {
  CONSENT_GESTURE_SCHEMA,
  signProof as signGestureProof,
} from '../holoshell-consent-gesture.mjs';

const NODE = process.execPath;
const SCRIPT = resolve('scripts/holoshell-laptop-desktop-bridge.mjs');
const CREATED_AT = '2026-06-23T00:00:00.000Z';

function gestureProofFor(preflight, overrides = {}) {
  const fields = {
    schemaVersion: CONSENT_GESTURE_SCHEMA,
    challenge: overrides.challenge || preflight.consentChallenge,
    preflightReceiptHash: preflight.preflightReceiptHash,
    key: overrides.key || 'F8',
    pressedAt: overrides.pressedAt || CREATED_AT,
    observedGesture: overrides.observedGesture !== false,
    ttlMs: overrides.ttlMs || 30000,
  };
  return { ...fields, signature: signGestureProof(fields) };
}

const status = buildBridgeStatus({ host: '127.0.0.1', port: 8751, createdAt: CREATED_AT });
assert.equal(status.schemaVersion, LAPTOP_DESKTOP_BRIDGE_SCHEMA);
assert.equal(status.status, 'ready');
assert.equal(status.hostRole, 'laptop_desktop_bridge');
assert.equal(status.modelPolicy.lane, 'fara_gui_grounding');
assert.equal(status.modelPolicy.mayExecute, false);
assert.equal(status.modelPolicy.mayStageApprovedExecution, true);
assert.deepEqual(status.modelPolicy.admittedExecutorActions, ['open_url']);
assert.ok(status.capabilities.includes('consent_token_issue'));
assert.ok(status.capabilities.includes('admitted_open_url_executor'));
assert.ok(status.capabilities.includes('approved_execution_staging'));
assert.ok(status.capabilities.includes('execution_refusal'));
assert.ok(status.capabilities.includes('receipt_write'));
assert.equal(status.endpoints.consentToken, '/api/desktop-control/consent-token');
assert.equal(status.destructiveActionsTaken, false);
assert.equal(status.desktopAutomationExecuted, false);

const preflight = buildDesktopControlPreflight({
  intent: 'Use Fara to inspect the screen and click the Save button.',
}, { host: '127.0.0.1', port: 8751, createdAt: CREATED_AT });
assert.equal(preflight.schemaVersion, DESKTOP_CONTROL_PREFLIGHT_SCHEMA);
assert.equal(preflight.status, 'preflight_ready');
assert.equal(preflight.modelLane, 'fara_gui_grounding');
assert.equal(preflight.permissionEnvelope, 'guarded_execute');
assert.equal(preflight.consentRequired, true);
assert.equal(preflight.executionAllowed, false);
assert.ok(preflight.consentChallenge);
assert.equal(preflight.consentGesture.challenge, preflight.consentChallenge);
assert.equal(preflight.consentGesture.key, 'F8');
assert.ok(preflight.preflightReceiptHash);
assert.equal(preflight.destructiveActionsTaken, false);
assert.equal(preflight.desktopAutomationExecuted, false);

const readOnlyPreflight = buildDesktopControlPreflight({
  intent: 'Inspect the current desktop and describe the active window.',
}, { createdAt: CREATED_AT });
assert.equal(readOnlyPreflight.status, 'read_only_ready');
assert.equal(readOnlyPreflight.consentRequired, false);
assert.equal(readOnlyPreflight.executionAllowed, false);

const consentToken = buildConsentToken({
  preflight,
  operation: preflight.intent.primaryAction,
  gestureProof: gestureProofFor(preflight),
}, { createdAt: CREATED_AT, token: 'fixture-token' });
assert.equal(consentToken.schemaVersion, DESKTOP_CONTROL_CONSENT_TOKEN_SCHEMA);
assert.equal(consentToken.status, 'issued');
assert.equal(consentToken.executionAllowed, true);
assert.equal(consentToken.preflightId, preflight.preflightId);
assert.equal(consentToken.consentChallenge, preflight.consentChallenge);
assert.equal(consentToken.challengeBound, true);
assert.equal(consentToken.gestureVerified, true);
assert.equal(consentToken.destructiveActionsTaken, false);
assert.equal(consentToken.desktopAutomationExecuted, false);

const blockedConsentToken = buildConsentToken({
  preflight,
  operation: preflight.intent.primaryAction,
}, { createdAt: CREATED_AT, token: 'fixture-token' });
assert.equal(blockedConsentToken.status, 'blocked');
assert.equal(blockedConsentToken.executionAllowed, false);
assert.match(blockedConsentToken.blockedReason, /fresh_user_gesture/);

const wrongChallengeConsentToken = buildConsentToken({
  preflight,
  operation: preflight.intent.primaryAction,
  gestureProof: gestureProofFor(preflight, { challenge: 'wrong-challenge' }),
}, { createdAt: CREATED_AT, token: 'fixture-wrong-challenge-token' });
assert.equal(wrongChallengeConsentToken.status, 'blocked');
assert.equal(wrongChallengeConsentToken.executionAllowed, false);
assert.match(wrongChallengeConsentToken.blockedReason, /challenge_mismatch/);

const futureGestureConsentToken = buildConsentToken({
  preflight,
  operation: preflight.intent.primaryAction,
  gestureProof: gestureProofFor(preflight, { pressedAt: '2026-06-23T00:10:30.000Z' }),
}, { createdAt: CREATED_AT, token: 'fixture-future-gesture-token' });
assert.equal(futureGestureConsentToken.status, 'blocked');
assert.equal(futureGestureConsentToken.executionAllowed, false);
assert.equal(futureGestureConsentToken.gestureVerified, false);
assert.match(futureGestureConsentToken.blockedReason, /future/);

const excessiveTtlConsentToken = buildConsentToken({
  preflight,
  operation: preflight.intent.primaryAction,
  gestureProof: gestureProofFor(preflight, { ttlMs: 600000 }),
}, { createdAt: CREATED_AT, token: 'fixture-excessive-ttl-token' });
assert.equal(excessiveTtlConsentToken.status, 'blocked');
assert.equal(excessiveTtlConsentToken.executionAllowed, false);
assert.equal(excessiveTtlConsentToken.gestureVerified, false);
assert.equal(excessiveTtlConsentToken.maxGestureProofTtlMs, 30000);
assert.match(excessiveTtlConsentToken.blockedReason, /ttl_exceeds_limit/);

const execution = buildDesktopControlExecution({
  preflight,
  operation: preflight.intent.primaryAction,
  consentToken,
}, { createdAt: CREATED_AT });
assert.equal(execution.schemaVersion, DESKTOP_CONTROL_EXECUTION_SCHEMA);
assert.equal(execution.status, 'approved_execution_staged');
assert.equal(execution.executionAllowed, true);
assert.equal(execution.destructiveActionsTaken, false);
assert.equal(execution.desktopAutomationExecuted, false);

const openUrlPreflight = buildDesktopControlPreflight({
  intent: 'Open URL https://example.com/status in the default browser.',
}, { createdAt: CREATED_AT });
assert.equal(openUrlPreflight.intent.primaryAction, 'open_url');
assert.equal(openUrlPreflight.target.url, 'https://example.com/status');
assert.equal(openUrlPreflight.requiresExactExecutionTarget, true);
assert.ok(openUrlPreflight.targetFingerprint);

const openUrlConsentToken = buildConsentToken({
  preflight: openUrlPreflight,
  operation: 'open_url',
  gestureProof: gestureProofFor(openUrlPreflight),
}, { createdAt: CREATED_AT, token: 'fixture-open-url-token' });
assert.equal(openUrlConsentToken.targetFingerprint, openUrlPreflight.targetFingerprint);
assert.equal(openUrlConsentToken.tokenBoundToTargetFingerprint, true);

const openUrlExecution = buildDesktopControlExecution({
  preflight: openUrlPreflight,
  operation: 'open_url',
  consentToken: openUrlConsentToken,
  url: 'https://example.com/status',
  executeApprovedAction: true,
  executorMode: 'simulated',
}, { createdAt: CREATED_AT, executorMode: 'simulated' });
assert.equal(openUrlExecution.status, 'completed_open_url');
assert.equal(openUrlExecution.executionMode, 'admitted_open_url_executor');
assert.equal(openUrlExecution.desktopAutomationExecuted, true);
assert.equal(openUrlExecution.destructiveActionsTaken, false);
assert.equal(openUrlExecution.hardwareAction.status, 'completed');
assert.equal(openUrlExecution.hardwareAction.targetUrlHost, 'example.com');
assert.equal(openUrlExecution.executionTargetMatchVerified, true);

assert.throws(() => buildDesktopControlExecution({
  preflight: openUrlPreflight,
  operation: 'open_url',
  consentToken: openUrlConsentToken,
  url: 'https://example.org/status',
  executeApprovedAction: true,
  executorMode: 'simulated',
}, { createdAt: CREATED_AT, executorMode: 'simulated' }), /target_mismatch/);

const credentialAdjacentPreflight = buildDesktopControlPreflight({
  intent: 'Open URL https://example.com/account/settings in the default browser.',
}, { createdAt: CREATED_AT });
const credentialAdjacentConsentToken = buildConsentToken({
  preflight: credentialAdjacentPreflight,
  operation: 'open_url',
  gestureProof: gestureProofFor(credentialAdjacentPreflight),
}, { createdAt: CREATED_AT, token: 'fixture-credential-adjacent-open-url-token' });
assert.throws(() => buildDesktopControlExecution({
  preflight: credentialAdjacentPreflight,
  operation: 'open_url',
  consentToken: credentialAdjacentConsentToken,
  url: 'https://example.com/account/settings',
  executeApprovedAction: true,
  executorMode: 'simulated',
}, { createdAt: CREATED_AT, executorMode: 'simulated' }), /credential_adjacent/);

assert.throws(() => buildDesktopControlExecution({
  preflight,
  operation: preflight.intent.primaryAction,
  consentToken,
  executeApprovedAction: true,
  executorMode: 'simulated',
}, { createdAt: CREATED_AT, executorMode: 'simulated' }), /executor_lane_not_admitted/);

const refusal = buildExecutionRefusal({ preflightId: preflight.preflightId }, { createdAt: CREATED_AT });
assert.equal(refusal.status, 'refused');
assert.equal(refusal.executionAllowed, false);
assert.equal(refusal.destructiveActionsTaken, false);
assert.equal(refusal.desktopAutomationExecuted, false);
assert.match(refusal.reason, /consent_token/);

assert.equal(runSelfTest({ createdAt: CREATED_AT }).refusal.status, 'refused');

const statusTmp = mkdtempSync(join(tmpdir(), 'holoshell-laptop-bridge-status-'));
const cliStatus = JSON.parse(execFileSync(NODE, [
  SCRIPT,
  '--status',
  '--port',
  '65534',
  '--receipt-dir',
  statusTmp,
  '--created-at',
  CREATED_AT,
  '--json',
], { encoding: 'utf8' }));
assert.equal(cliStatus.status, 'offline');
assert.equal(cliStatus.loopbackReachable, false);
assert.equal(cliStatus.statusProbe.ok, false);
assert.equal(cliStatus.destructiveActionsTaken, false);
assert.match(cliStatus.receiptPath, /latest-status\.json$/);
assert.equal(existsSync(cliStatus.receiptPath), true);

const cliSelfTest = JSON.parse(execFileSync(NODE, [
  SCRIPT,
  '--self-test',
  '--created-at',
  CREATED_AT,
  '--json',
], { encoding: 'utf8' }));
assert.equal(cliSelfTest.preflight.executionAllowed, false);
assert.equal(cliSelfTest.consentToken.status, 'issued');
assert.equal(cliSelfTest.refusal.status, 'refused');
assert.equal(cliSelfTest.execution.status, 'approved_execution_staged');
assert.equal(cliSelfTest.openUrlExecution.status, 'completed_open_url');
assert.equal(cliSelfTest.openUrlExecution.desktopAutomationExecuted, true);

const tmp = mkdtempSync(join(tmpdir(), 'holoshell-laptop-bridge-'));
const server = createLaptopDesktopBridgeServer({
  host: '127.0.0.1',
  port: 8751,
  receiptDir: tmp,
  createdAt: CREATED_AT,
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  const statusResponse = await fetch(`${baseUrl}/api/desktop-control/bridge`);
  assert.equal(statusResponse.status, 200);
  const statusBody = await statusResponse.json();
  assert.equal(statusBody.status, 'ready');
  assert.equal(statusBody.destructiveActionsTaken, false);
  assert.match(statusBody.receiptPath, /latest-status\.json$/);
  assert.equal(existsSync(statusBody.receiptPath), true);

  const preflightResponse = await fetch(`${baseUrl}/api/desktop-control/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'Click the Save button after Fara identifies it.' }),
  });
  assert.equal(preflightResponse.status, 200);
  const preflightBody = await preflightResponse.json();
  assert.equal(preflightBody.executionAllowed, false);
  assert.equal(preflightBody.destructiveActionsTaken, false);
  assert.ok(existsSync(preflightBody.receiptPath));
  assert.match(readFileSync(preflightBody.receiptPath, 'utf8'), /desktop-control-preflight/);

  const consentResponse = await fetch(`${baseUrl}/api/desktop-control/consent-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: preflightBody,
      operation: preflightBody.intent.primaryAction,
      gestureProof: gestureProofFor(preflightBody),
    }),
  });
  assert.equal(consentResponse.status, 200);
  const consentBody = await consentResponse.json();
  assert.equal(consentBody.status, 'issued');
  assert.equal(consentBody.executionAllowed, true);
  assert.ok(consentBody.token);
  assert.ok(existsSync(consentBody.receiptPath));
  const storedConsent = readFileSync(consentBody.receiptPath, 'utf8');
  assert.match(storedConsent, /"token": "\[redacted\]"/);
  assert.doesNotMatch(storedConsent, new RegExp(consentBody.token));

  const executeResponse = await fetch(`${baseUrl}/api/desktop-control/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preflightId: preflightBody.preflightId }),
  });
  assert.equal(executeResponse.status, 403);
  const executeBody = await executeResponse.json();
  assert.equal(executeBody.status, 'refused');
  assert.equal(executeBody.executionAllowed, false);
  assert.equal(executeBody.destructiveActionsTaken, false);
  assert.equal(executeBody.desktopAutomationExecuted, false);
  assert.ok(existsSync(executeBody.receiptPath));

  const stagedExecutionResponse = await fetch(`${baseUrl}/api/desktop-control/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: preflightBody,
      operation: preflightBody.intent.primaryAction,
      consentToken: consentBody,
    }),
  });
  assert.equal(stagedExecutionResponse.status, 200);
  const stagedExecutionBody = await stagedExecutionResponse.json();
  assert.equal(stagedExecutionBody.status, 'approved_execution_staged');
  assert.equal(stagedExecutionBody.executionAllowed, true);
  assert.equal(stagedExecutionBody.destructiveActionsTaken, false);
  assert.equal(stagedExecutionBody.desktopAutomationExecuted, false);
  assert.ok(existsSync(stagedExecutionBody.receiptPath));

  const openUrlPreflightResponse = await fetch(`${baseUrl}/api/desktop-control/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'Open URL https://example.com/status in the default browser.' }),
  });
  assert.equal(openUrlPreflightResponse.status, 200);
  const openUrlPreflightBody = await openUrlPreflightResponse.json();
  assert.equal(openUrlPreflightBody.intent.primaryAction, 'open_url');
  assert.equal(openUrlPreflightBody.target.url, 'https://example.com/status');
  assert.ok(openUrlPreflightBody.targetFingerprint);

  const openUrlConsentResponse = await fetch(`${baseUrl}/api/desktop-control/consent-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: openUrlPreflightBody,
      operation: 'open_url',
      gestureProof: gestureProofFor(openUrlPreflightBody),
    }),
  });
  assert.equal(openUrlConsentResponse.status, 200);
  const openUrlConsentBody = await openUrlConsentResponse.json();

  const openUrlExecuteResponse = await fetch(`${baseUrl}/api/desktop-control/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: openUrlPreflightBody,
      operation: 'open_url',
      consentToken: openUrlConsentBody,
      url: 'https://example.com/status',
      executeApprovedAction: true,
      executorMode: 'simulated',
    }),
  });
  assert.equal(openUrlExecuteResponse.status, 200);
  const openUrlExecuteBody = await openUrlExecuteResponse.json();
  assert.equal(openUrlExecuteBody.status, 'completed_open_url');
  assert.equal(openUrlExecuteBody.executionMode, 'admitted_open_url_executor');
  assert.equal(openUrlExecuteBody.desktopAutomationExecuted, true);
  assert.equal(openUrlExecuteBody.destructiveActionsTaken, false);
  assert.equal(openUrlExecuteBody.executionTargetMatchVerified, true);

  const blockedMismatchedUrlResponse = await fetch(`${baseUrl}/api/desktop-control/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: openUrlPreflightBody,
      operation: 'open_url',
      consentToken: openUrlConsentBody,
      url: 'https://example.org/status',
      executeApprovedAction: true,
      executorMode: 'simulated',
    }),
  });
  assert.equal(blockedMismatchedUrlResponse.status, 403);
  const blockedMismatchedUrlBody = await blockedMismatchedUrlResponse.json();
  assert.equal(blockedMismatchedUrlBody.status, 'refused');
  assert.match(blockedMismatchedUrlBody.reason, /target_mismatch/);

  const credentialAdjacentPreflightResponse = await fetch(`${baseUrl}/api/desktop-control/preflight`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intent: 'Open URL https://example.com/account/settings in the default browser.' }),
  });
  assert.equal(credentialAdjacentPreflightResponse.status, 200);
  const credentialAdjacentPreflightBody = await credentialAdjacentPreflightResponse.json();
  assert.equal(credentialAdjacentPreflightBody.targetUrlClassification, 'credential_adjacent');

  const credentialAdjacentConsentResponse = await fetch(`${baseUrl}/api/desktop-control/consent-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: credentialAdjacentPreflightBody,
      operation: 'open_url',
      gestureProof: gestureProofFor(credentialAdjacentPreflightBody),
    }),
  });
  assert.equal(credentialAdjacentConsentResponse.status, 200);
  const credentialAdjacentConsentBody = await credentialAdjacentConsentResponse.json();

  const blockedAccountUrlResponse = await fetch(`${baseUrl}/api/desktop-control/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      preflight: credentialAdjacentPreflightBody,
      operation: 'open_url',
      consentToken: credentialAdjacentConsentBody,
      url: 'https://example.com/account/settings',
      executeApprovedAction: true,
      executorMode: 'simulated',
    }),
  });
  assert.equal(blockedAccountUrlResponse.status, 403);
  const blockedAccountUrlBody = await blockedAccountUrlResponse.json();
  assert.equal(blockedAccountUrlBody.status, 'refused');
  assert.match(blockedAccountUrlBody.reason, /credential_adjacent/);
} finally {
  await new Promise((resolve) => server.close(resolve));
}

const serveSource = readFileSync(resolve('packages/holoshell/serve.mjs'), 'utf8');
assert.match(serveSource, /\/api\/desktop-control\/bridge/);

const compileSource = readFileSync(resolve('packages/holoshell/compile.mjs'), 'utf8');
assert.match(compileSource, /desktop-bridge-status/);
assert.match(compileSource, /desktop-control\/gesture-proof/);
assert.doesNotMatch(compileSource, /freshUserGesture: true/);
