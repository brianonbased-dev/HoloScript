#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-permission-gate-adapter.mjs.
 *
 * Run via: node scripts/__tests__/holoshell-permission-gate-adapter.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildPlanPack,
  buildRevokedPack,
  buildVerifiedPack,
  parseScopeSpec,
  validatePack,
} from '../holoshell-permission-gate-adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-permission-gate-adapter.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

const driveScope = {
  scope: 'drive.file',
  purpose: 'Read and update only HoloLand-created world files.',
  required: true,
  riskLevel: 'medium',
  providerLabel: 'Google Drive per-file access',
};

const request = {
  now: '2026-05-20T00:00:00.000Z',
  subjectKind: 'provider_account',
  provider: 'google',
  subjectLabel: 'joseph@example.com',
  requestedScopes: [driveScope],
  minimumRequiredScopes: [driveScope],
  neverScopes: ['*', 'drive', 'admin', 'billing', 'delete', 'full_access'],
  purpose: 'Build a HoloLand world from an approved Drive file.',
  commandOrUrlPreview: 'node C:/Users/private/oauth-helper.js?access_token=secret&scope=drive.file',
};

console.log('Test 1: plan receipts redact subject labels and previews');
const plan = buildPlanPack(request);
assertEq(plan.status, 'planned', 'plan status');
assertEq(validatePack(plan).length, 0, 'plan validates');
const planJson = JSON.stringify(plan);
assertOk(!planJson.includes('joseph@example.com'), 'raw subject label is absent');
assertOk(!planJson.includes('access_token=secret'), 'raw access token is absent');
assertOk(plan.request.commandOrUrlPreview.includes('<absolute-path-redacted>'), 'absolute path preview redacted');
assertOk(plan.request.commandOrUrlPreview.includes('access_token=<redacted>'), 'token preview redacted');

console.log('Test 2: verify receipts store token hash only and become ready');
const verified = buildVerifiedPack(plan, {
  now: '2026-05-20T00:01:00.000Z',
  grantedScopes: [driveScope],
  tokenReference: 'raw-token-never-written',
  verificationMethod: 'oauth_tokeninfo',
  revocationInstruction: 'Open Google account app permissions and revoke HoloLand Builder.',
});
assertEq(verified.status, 'verified', 'verified status');
assertEq(verified.verification.readyForHoloLand, true, 'verified ready for HoloLand');
assertEq(validatePack(verified).length, 0, 'verified pack validates');
const verifiedJson = JSON.stringify(verified);
assertOk(verified.grant.tokenReferenceHash.startsWith('sha256:'), 'token hash is present');
assertOk(!verifiedJson.includes('raw-token-never-written'), 'raw token reference is absent');

console.log('Test 3: revoke receipts preserve grant and record verified revocation');
const revoked = buildRevokedPack(verified, {
  now: '2026-05-20T00:02:00.000Z',
  revokeVerified: true,
  revocationMethod: 'provider_settings',
});
assertEq(revoked.status, 'revoked', 'revoked status');
assertEq(revoked.revocation.revokeVerified, true, 'revoke verified');
assertEq(revoked.replay.readyForHoloLand, false, 'revoked replay is not ready');
assertEq(validatePack(revoked).length, 0, 'revoked pack validates');

console.log('Test 4: overbroad grants are refused');
try {
  buildVerifiedPack(plan, {
    now: '2026-05-20T00:03:00.000Z',
    grantedScopes: [driveScope, { ...driveScope, scope: 'drive.readonly', required: false }],
  });
  assertOk(false, 'overbroad grant should throw');
} catch (error) {
  assertOk(String(error.message).includes('Grant rejected by minimum-scope policy'), 'overbroad grant throws policy error');
}

console.log('Test 5: CLI plan -> verify -> revoke round trip writes receipts');
const tmp = mkdtempSync(join(tmpdir(), 'permission-gate-adapter-test-'));
const requestPath = join(tmp, 'request.json');
const planPath = join(tmp, 'plan.json');
const verifyPath = join(tmp, 'verify.json');
const verifiedPath = join(tmp, 'verified.json');
const revokePath = join(tmp, 'revoke.json');
const revokedPath = join(tmp, 'revoked.json');
writeJson(requestPath, request);
writeJson(verifyPath, {
  now: '2026-05-20T00:01:00.000Z',
  grantedScopes: ['drive.file|Read and update only HoloLand-created world files.|medium|true|Google Drive per-file access'],
  tokenReferenceHash: 'sha256:prehashed-token-ref',
});
writeJson(revokePath, {
  now: '2026-05-20T00:02:00.000Z',
  revokeVerified: true,
});

const planResult = spawnSync(process.execPath, [SCRIPT, 'plan', '--input', requestPath, '--out', planPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(planResult.status, 0, 'CLI plan exits 0');
assertOk(existsSync(planPath), 'CLI plan file exists');

const verifyResult = spawnSync(process.execPath, [SCRIPT, 'verify', '--pack', planPath, '--input', verifyPath, '--out', verifiedPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(verifyResult.status, 0, 'CLI verify exits 0');
const cliVerified = JSON.parse(readFileSync(verifiedPath, 'utf8'));
assertEq(cliVerified.grant.tokenReferenceHash, 'sha256:prehashed-token-ref', 'CLI verify preserves token hash');

const revokeResult = spawnSync(process.execPath, [SCRIPT, 'revoke', '--pack', verifiedPath, '--input', revokePath, '--out', revokedPath], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(revokeResult.status, 0, 'CLI revoke exits 0');
const cliRevoked = JSON.parse(readFileSync(revokedPath, 'utf8'));
assertEq(cliRevoked.status, 'revoked', 'CLI revoked status');
assertEq(validatePack(cliRevoked).length, 0, 'CLI revoked pack validates');
rmSync(tmp, { recursive: true, force: true });

console.log('Test 6: CLI self-test runs the full adapter path');
const selfTest = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(selfTest.status, 0, 'CLI self-test exits 0');
assertOk(selfTest.stdout.includes('holoshell-permission-gate-adapter'), 'self-test names adapter');

console.log('Test 7: scope flag parser supports provider label');
const parsed = parseScopeSpec('camera|Use headset camera for scan|high|true|Quest camera');
assertEq(parsed.scope, 'camera', 'parsed scope');
assertEq(parsed.providerLabel, 'Quest camera', 'parsed provider label');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
