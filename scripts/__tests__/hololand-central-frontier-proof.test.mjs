#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

import { runCentralFrontierProof } from '../hololand-central-frontier-proof.mjs';

function writeFixture(root, file, content) {
  const full = join(root, file);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

const root = mkdtempSync(join(tmpdir(), 'hololand-central-frontier-proof-'));

writeFixture(root, 'source/proofs/central-frontier-receipt-proof.hsplus', `
object "CentralFrontierReceiptProof" {
  type: "runtime_proof"
  id: "central-frontier-receipt-proof"
  layer: "vr"
  domains: ["identity", "receipts", "quests"]
  verticals: ["entertainment"]
  canonicalSource: "source/layers/vr/central/hololand-central.holo"
  secondarySource: "source/layers/vr/frontier/shard-0/frontier-shard-0.holo"
  receiptEnvelope: "source/domains/receipts/runtime-receipt-envelope.hsplus"
  requiredReceipts: ["central_entered", "portal_used", "shard_entered", "encounter_completed", "reward_earned"]
  playerLoop: ["spawn", "portal", "frontier_entry", "encounter", "reward", "return"]
  failClosedBehavior: "deny"
}
`);

writeFixture(root, 'source/layers/vr/central/hololand-central.holo', `
composition "Central" {
  state { required_receipts: ["central_entered", "portal_used"] }
}
`);

writeFixture(root, 'source/layers/vr/frontier/shard-0/frontier-shard-0.holo', `
composition "Frontier" {
  state { required_receipts: ["shard_entered", "encounter_completed", "reward_earned"] }
}
`);

writeFixture(root, 'source/domains/receipts/runtime-receipt-envelope.hsplus', `
composition "ReceiptEnvelope" {
  state {
    requiredReceipts: ["central_entered", "portal_used", "shard_entered", "encounter_completed", "reward_earned"]
  }
}
`);

const output = '.tmp/hololand/receipts/central-frontier-latest.json';
const receipt = runCentralFrontierProof({
  root,
  output,
  actor: 'test_player',
  surface: 'browser',
});

assert.equal(receipt.status, 'pass');
assert.equal(receipt.actor, 'test_player');
assert.equal(receipt.surface, 'browser');
assert.equal(receipt.summary.receiptCount, 5);
assert.deepEqual(
  receipt.steps.map((step) => step.kind),
  ['central_entered', 'portal_used', 'shard_entered', 'encounter_completed', 'reward_earned'],
);
assert.ok(receipt.hash);
assert.ok(receipt.steps.every((step) => step.hash));
assert.ok(existsSync(join(root, output)));

const written = JSON.parse(readFileSync(join(root, output), 'utf8'));
assert.equal(written.hash, receipt.hash);
assert.equal(written.proof.id, 'central-frontier-receipt-proof');

const invalidRoot = mkdtempSync(join(tmpdir(), 'hololand-central-frontier-proof-invalid-'));
writeFixture(invalidRoot, 'source/proofs/central-frontier-receipt-proof.hsplus', `
object "BrokenProof" {
  id: "broken"
  layer: "vr"
  requiredReceipts: ["central_entered"]
}
`);

assert.throws(
  () => runCentralFrontierProof({ root: invalidRoot, write: false }),
  /Proof is missing canonicalSource/,
);

console.log('PASS hololand central frontier proof runner');
