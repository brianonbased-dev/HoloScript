import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.tmp', 'holoshell', 'test-permission-gate');
const latest = path.join(testRoot, 'permission-gate-latest.json');
const latestJs = path.join(testRoot, 'permission-gate-latest.js');
const receiptDir = path.join(testRoot, 'receipts');

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

rmSync(testRoot, { recursive: true, force: true });

runNode(['scripts/holoshell-permission-gate.mjs', '--self-test', '--json']);

const receipt = runNode([
  'scripts/holoshell-permission-gate.mjs',
  'verify',
  '--provider',
  'google',
  '--subject-kind',
  'provider_account',
  '--subject-label',
  'joseph@example.com',
  '--browser-profile',
  'profile:work-redacted',
  '--scope',
  'drive.file',
  '--minimum-scope',
  'drive.file',
  '--never-scope',
  'drive,admin,billing,delete,full_access',
  '--purpose',
  'Let HoloLand read and update only files it creates for a world build.',
  '--verification-method',
  'oauth_tokeninfo',
  '--revocation-instruction',
  'Open Google Account app permissions and remove HoloLand Builder access.',
  '--command-preview',
  'node C:/Users/private/oauth-helper.js --url https://accounts.google.com/o/oauth2/v2/auth?scope=drive.file&access_token=secret',
  '--output',
  latest,
  '--js-output',
  latestJs,
  '--receipt-dir',
  receiptDir,
  '--json',
]);

assert.equal(receipt.workflow, 'provider-app-device-permission-gate');
assert.equal(receipt.status, 'verified');
assert.equal(receipt.subject.redactedSubjectLabel, 'j***@example.com');
assert.equal(receipt.subject.credentialExtrusionAllowed, false);
assert.equal(receipt.request.requestedScopes[0].scope, 'drive.file');
assert.equal(receipt.request.minimumRequiredScopes[0].scope, 'drive.file');
assert.ok(receipt.request.neverScopes.includes('admin'));
assert.match(receipt.request.commandOrUrlPreview, /<absolute-path-redacted>/);
assert.match(receipt.request.commandOrUrlPreview, /access_token=<redacted>/);
assert.equal(receipt.grant.rawCredentialCaptured, false);
assert.equal(receipt.grant.hiddenAutomationUsed, false);
assert.equal(receipt.grant.extraScopes.length, 0);
assert.equal(receipt.verification.minimumScopeSatisfied, true);
assert.equal(receipt.verification.excessScopesAbsent, true);
assert.equal(receipt.replay.readyForHoloLand, true);
assert.equal(receipt.replay.overbroadScopeAccepted, false);
assert.ok(receipt.output.latestPath);
assert.ok(existsSync(latest));
assert.match(readFileSync(latestJs, 'utf8'), /HOLOSHELL_PERMISSION_GATE/);
assert.ok(existsSync(path.join(repoRoot, receipt.output.receiptPath)));

console.log('holoshell permission gate regression passed');
