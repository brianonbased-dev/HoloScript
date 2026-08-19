import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.tmp', 'holoshell', 'test-hardware-action-boundary');
const latestAction = path.join(testRoot, 'action-latest.json');
const latestActionJs = path.join(testRoot, 'action-latest.js');
const receiptDir = path.join(testRoot, 'action-receipts');
const latestApproval = path.join(testRoot, 'approval-latest.json');
const latestApprovalJs = path.join(testRoot, 'approval-latest.js');
const bundleDir = path.join(testRoot, 'approval-bundles');
const trustLedger = path.join(testRoot, 'trust-ledger.json');

function resetTestRoot() {
  rmSync(testRoot, { recursive: true, force: true });
  mkdirSync(testRoot, { recursive: true });
}

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    ...options,
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

function runNodeAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${args.join(' ')} failed with ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      resolve(stdout.trim() ? JSON.parse(stdout) : null);
    });
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function receiptFiles() {
  if (!existsSync(receiptDir)) return [];
  return readdirSync(receiptDir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => path.join(receiptDir, entry));
}

resetTestRoot();

const sharedArgs = [
  'scripts/holoshell-action-executor.mjs',
  '--output',
  latestAction,
  '--js-output',
  latestActionJs,
  '--receipt-dir',
  receiptDir,
  '--json',
];

const raceResults = await Promise.all([
  runNodeAsync([...sharedArgs, '--action', 'list_programs']),
  runNodeAsync([...sharedArgs, '--action', 'open_url', '--url', 'https://mcp.holoscript.net/health']),
  runNodeAsync([...sharedArgs, '--action', 'list_programs']),
  runNodeAsync([...sharedArgs, '--action', 'open_url', '--url', 'https://example.com/status']),
]);

assert.equal(raceResults.length, 4);
const latest = readJson(latestAction);
assert.match(latest.actionId, /^hwa-/);
assert.ok(['list_programs', 'open_url'].includes(latest.summary.actionKind));
assert.equal(latest.output.latestWriteMode, 'locked_atomic_same_directory_rename');
assert.match(readFileSync(latestActionJs, 'utf8'), /HOLOSHELL_HARDWARE_ACTION/);

const publicBrowserReceiptPath = receiptFiles().find((filePath) => {
  const receipt = readJson(filePath);
  return receipt.browserBoundary?.urlClassification === 'public_web';
});
assert.ok(publicBrowserReceiptPath, 'expected archived public browser boundary receipt');

const approval = runNode([
  'scripts/holoshell-approval-bundle.mjs',
  '--action-receipt',
  publicBrowserReceiptPath,
  '--output',
  latestApproval,
  '--js-output',
  latestApprovalJs,
  '--bundle-dir',
  bundleDir,
  '--trust-ledger',
  trustLedger,
  '--json',
]);

assert.equal(approval.browserBoundary.urlClassification, 'public_web');
assert.equal(approval.approval.browserBoundaryRequired, true);
assert.equal(approval.summary.browserBoundaryStatus, 'public_web');
assert.equal(approval.summary.browserProfileBoundary, 'system_default_public_ok');
assert.match(readFileSync(latestApprovalJs, 'utf8'), /HOLOSHELL_HARDWARE_APPROVAL/);

const accountReceipt = runNode([
  ...sharedArgs,
  '--action',
  'open_url',
  '--url',
  'https://example.com/account/settings',
  '--browser-profile',
  'holoshell-test-profile',
  '--browser-session',
  'ephemeral-account-review',
]);

assert.equal(accountReceipt.browserBoundary.urlClassification, 'credential_adjacent');
assert.equal(accountReceipt.browserBoundary.cookiePolicy, 'profile_cookies_visible_to_browser_only');
assert.equal(accountReceipt.browserBoundary.sessionBoundary, 'ephemeral-account-review');
assert.equal(accountReceipt.summary.browserProfileBoundary, 'holoshell-test-profile');

console.log('holoshell hardware action boundary regression passed');
