import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, '../..');
const scriptPath = path.join(repoRoot, 'scripts/holoshell-network-reality.mjs');

const stdout = execFileSync(
  process.execPath,
  [scriptPath, '--self-test', '--owner-declared-kind', 'phone_hotspot', '--json'],
  { cwd: repoRoot, encoding: 'utf8' }
);

const manifest = JSON.parse(stdout);

assert.equal(manifest.schemaVersion, 'hololand.holoshell.network-reality.v0.1.0');
assert.equal(manifest.underlay.classification, 'metered_or_hotspot');
assert.equal(manifest.underlay.confidence, 'owner_declared');
assert.equal(manifest.policy.brittneyStance, 'protect_bandwidth');
assert.equal(manifest.schemaContract.sourcePackage, '@holoscript/framework');
assert.equal(manifest.schemaContract.validationStatus, 'pass');
assert.equal(manifest.schemaContract.errorCount, 0);
assert.equal(manifest.redaction.localOnly, true);
assert.equal(manifest.redaction.rawSsidIncluded, false);
assert.equal(manifest.redaction.remoteEndpointIncluded, false);
