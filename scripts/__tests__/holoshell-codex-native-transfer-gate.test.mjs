import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const outPath = '.tmp/holoshell/test-codex-native-transfer-gate.json';
const result = spawnSync(process.execPath, [
  'scripts/holoshell-codex-native-transfer-gate.mjs',
  '--check',
  '--json',
  '--out',
  outPath,
], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

const receipt = JSON.parse(readFileSync(resolve(outPath), 'utf8'));
assert.equal(receipt.schemaVersion, 'hololand.holoshell.codex-native-transfer-gate.v0.1.0');
assert.equal(receipt.source, 'apps/holoshell/source/holoshell-codex-native-transfer-gate.hsplus');
assert.equal(receipt.status, 'ready');
assert.equal(receipt.upstreamReceipt.schemaVersion, 'codex-native-authoring-pair/v0.1.0');
assert.equal(receipt.upstreamReceipt.status, 'ready');
assert.equal(receipt.upstreamReceipt.gateCount, 5);
assert.equal(receipt.upstreamReceipt.passedGateCount, 5);
assert.equal(receipt.summary.hololandMutationAllowed, false);
assert.equal(receipt.summary.cockpitProjectionReady, true);
assert.equal(receipt.summary.transferredAdvantageCount, 2);
assert.equal(receipt.summary.nonClaimCount, 2);
assert.equal(receipt.summary.nextNativeCommand, 'pnpm run check:codex-native-authoring-pair');
assert.ok(receipt.nonClaims.includes('not a public model-quality benchmark'));
assert.ok(receipt.nonClaims.includes('not a fresh Jetson prompt run'));
assert.ok(receipt.upstreamReceipt.hash.length >= 32);
assert.equal(receipt.destructiveActionsTaken, false);
assert.equal(receipt.desktopAutomationExecuted, false);
assert.equal(receipt.checks.every((check) => check.status === 'pass'), true);

const source = readFileSync(resolve('apps/holoshell/source/holoshell-codex-native-transfer-gate.hsplus'), 'utf8');
assert.match(source, /composition "HoloShell Codex Native Transfer Gate"/);
assert.match(source, /upstreamReceiptSchema: "codex-native-authoring-pair\/v0\.1\.0"/);
assert.match(source, /CodexNativeTransferGate/);
assert.match(source, /FrontierAdvantageMustTransfer/);
assert.match(source, /ExternalScratchIsProjectionNotSource/);
assert.match(source, /NonClaimBoundaryMustStayVisible/);
assert.match(source, /consume_authoring_pair_receipt/);

console.log('PASS holoshell-codex-native-transfer-gate');
