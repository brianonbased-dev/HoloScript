import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'scripts', 'holoshell-holotunnel-access.mjs');
const testRoot = path.join(tmpdir(), `holoshell-holotunnel-access-${process.pid}`);

function runNode(args, options = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (options.expectFailure) {
    assert.notEqual(result.status, 0, `${args.join(' ')} should fail`);
    return result;
  }
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

rmSync(testRoot, { recursive: true, force: true });

const latest = path.join(testRoot, 'holotunnel-access.json');
const latestJs = path.join(testRoot, 'holotunnel-access.js');
const receiptDir = path.join(testRoot, 'receipts');

const selfTestReceipt = runNode([
  script,
  '--self-test',
  '--output',
  latest,
  '--js-output',
  latestJs,
  '--receipt-dir',
  receiptDir,
  '--json',
]);

assert.equal(selfTestReceipt.receiptVersion, 'hololand.holotunnel-access.v1');
assert.equal(selfTestReceipt.workflow, 'holotunnel-nondeveloper-access');
assert.equal(selfTestReceipt.status, 'live');
assert.equal(selfTestReceipt.accessCard.title, 'Open This HoloLand World');
assert.equal(selfTestReceipt.accessCard.qr.payloadUrl, selfTestReceipt.stableUrl);
assert.equal(selfTestReceipt.advancedDiagnostics.visibleByDefault, false);
assert.equal(selfTestReceipt.advancedDiagnostics.tunnelIdRedacted, true);
assert.equal(selfTestReceipt.advancedDiagnostics.localTargetRedacted, true);
assert.match(selfTestReceipt.advancedDiagnostics.operatorDirectUrl, /\/t\/tunnel_fixture_123/);
assert.doesNotMatch(JSON.stringify(selfTestReceipt.accessCard), /\/t\/tunnel_fixture_123/);
assert.doesNotMatch(JSON.stringify(selfTestReceipt.accessCard), /127\.0\.0\.1|localhost/);
assert.doesNotMatch(JSON.stringify(selfTestReceipt), /fixture-token-must-not-leak/);
assert.ok(existsSync(latest));
assert.ok(existsSync(latestJs));
assert.match(readFileSync(latestJs, 'utf8'), /HOLOSHELL_HOLOTUNNEL_ACCESS/);

const expiredPacketPath = path.join(testRoot, 'expired-share-packet.json');
writeFileSync(
  expiredPacketPath,
  `${JSON.stringify({
    schemaVersion: 'holoscript.holotunnel.share-packet.v1',
    worldId: 'world_expired',
    sessionName: 'Expired Review World',
    stableUrl: 'https://hololand.example/live/expired-review-world',
    directUrl: 'https://holotunnel.holoscript.dev/t/expired_review_world',
    sourceRef: 'apps/holoshell/source/holoshell-holotunnel-access-card.holo',
    createdBy: 'studio',
    expiresAt: '2000-01-01T00:00:00.000Z',
  }, null, 2)}\n`
);

const expiredReceipt = runNode([
  script,
  '--share-packet',
  expiredPacketPath,
  '--output',
  path.join(testRoot, 'expired.json'),
  '--js-output',
  path.join(testRoot, 'expired.js'),
  '--receipt-dir',
  path.join(testRoot, 'expired-receipts'),
  '--json',
]);

assert.equal(expiredReceipt.status, 'expired');
assert.equal(expiredReceipt.accessCard.status.recipientFacingCopy, 'This invite expired.');
assert.equal(expiredReceipt.accessCard.firstScreenActions.every((action) => action.enabled === false), true);

const secretPacketPath = path.join(testRoot, 'secret-share-packet.json');
writeFileSync(
  secretPacketPath,
  `${JSON.stringify({
    schemaVersion: 'holoscript.holotunnel.share-packet.v1',
    worldId: 'world_secret',
    sessionName: 'Secret URL World',
    stableUrl: 'https://hololand.example/live/secret?access_token=do-not-leak',
    sourceRef: 'apps/holoshell/source/holoshell-holotunnel-access-card.holo',
    createdBy: 'studio',
  }, null, 2)}\n`
);

const rejected = runNode([script, '--share-packet', secretPacketPath, '--json'], { expectFailure: true });
assert.match(rejected.stderr, /stableUrl must not contain secret-bearing query parameters/);

console.log('holoshell holotunnel access regression passed');
