#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holoshell-cloud-drive-cleanup-adapter.mjs.
 *
 * Run via: node scripts/__tests__/holoshell-cloud-drive-cleanup-adapter.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildInventoryReceipt,
  normalizeScopeName,
  validateInventoryReceipt,
} from '../holoshell-cloud-drive-cleanup-adapter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holoshell-cloud-drive-cleanup-adapter.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
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

const input = {
  now: '2026-05-21T10:00:00.000Z',
  provider: 'google',
  accountLabel: 'private-human@example.com',
  browserProfile: 'Default',
  minimumScopes: ['drive.file'],
  neverScopes: ['*', 'drive', 'drive.readonly', 'admin', 'billing', 'delete', 'full_access'],
  apps: [
    { appLabel: 'HoloLand Builder', appId: 'app-1', scopes: ['drive.file'] },
    { appLabel: 'Old Builder', appId: 'app-2', scopes: ['drive'] },
  ],
};

console.log('Test 1: inventory redacts account labels and classifies scopes');
const receipt = buildInventoryReceipt(input);
assertEq(validateInventoryReceipt(receipt).length, 0, 'inventory validates');
assertEq(receipt.connectedApps.length, 2, 'two apps inventoried');
assertEq(receipt.connectedApps[0].state, 'minimum_required', 'minimum app state');
assertEq(receipt.connectedApps[1].state, 'overbroad', 'overbroad app state');
assertEq(receipt.overbroadGrantCount, 1, 'one overbroad grant');
assertOk(receipt.connectedApps[1].revokeCandidate, 'overbroad app is revoke candidate');
const receiptJson = JSON.stringify(receipt);
assertOk(!receiptJson.includes('private-human@example.com'), 'raw account label is absent');
assertOk(!receiptJson.includes('access_token='), 'raw token query is absent');

console.log('Test 2: helpers normalize scope names');
assertEq(normalizeScopeName(' Drive.File '), 'drive.file', 'scope normalization');

console.log('Test 3: CLI inventory writes a receipt');
const tmp = mkdtempSync(join(tmpdir(), 'cloud-drive-cleanup-adapter-test-'));
const inputPath = join(tmp, 'input.json');
const outPath = join(tmp, 'inventory.json');
writeJson(inputPath, input);
const result = spawnSync(
  process.execPath,
  [SCRIPT, 'inventory', '--input', inputPath, '--out', outPath],
  {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }
);
assertEq(result.status, 0, 'CLI inventory exits 0');
assertOk(existsSync(outPath), 'CLI inventory file exists');
const cliReceipt = JSON.parse(readFileSync(outPath, 'utf8'));
assertEq(cliReceipt.overbroadGrantCount, 1, 'CLI overbroad grant count');
rmSync(tmp, { recursive: true, force: true });

console.log('Test 4: CLI self-test runs');
const selfTest = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(selfTest.status, 0, 'CLI self-test exits 0');
assertOk(
  selfTest.stdout.includes('holoshell-cloud-drive-cleanup-adapter'),
  'self-test names adapter'
);

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
