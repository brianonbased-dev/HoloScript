#!/usr/bin/env node
/* global console */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runProductionReadiness } from '../hololand-production-readiness.mjs';

function writeFixture(root, file, content) {
  const full = join(root, file);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function writeValidRuntimeAtlas(root) {
  writeFixture(root, 'source/runtime-atlas.holo', `
composition "Atlas" {
  state {
    layers: ["vr"]
    domains: ["identity", "agents", "receipts", "quests", "economy", "safety"]
    verticals: ["entertainment"]
    surfaces: ["browser"]
  }
  object "RuntimeAdmissionGate" {
    requiredFields: ["layer", "place", "domains", "verticals", "receipts"]
  }
}
`);

  writeFixture(root, 'source/layers/vr/central/hololand-central.holo', `
composition "Central" {
  metadata { layer: "vr" }
  state {
    place_id: "hololand-central"
    domains: ["identity", "agents", "receipts", "quests", "economy", "safety"]
    verticals: ["entertainment"]
    required_receipts: ["central_entered", "portal_used"]
  }
  logic {
    action write_receipt() {
      emit("receipt_written")
      source: "source/layers/vr/central/hololand-central.holo"
    }
  }
}
`);

  writeFixture(root, 'source/layers/vr/frontier/shard-0/frontier-shard-0.holo', `
composition "Frontier" {
  metadata { layer: "vr" }
  state {
    place_id: "frontier-shard-0"
    domains: ["identity", "agents", "receipts", "quests", "economy", "safety"]
    verticals: ["entertainment"]
    required_receipts: ["shard_entered", "encounter_completed", "reward_earned"]
  }
  logic {
    action write_receipt() {
      emit("receipt_written")
      source: "source/layers/vr/frontier/shard-0/frontier-shard-0.holo"
    }
  }
}
`);

  writeFixture(root, 'source/domains/receipts/runtime-receipt-envelope.hsplus', `
composition "ReceiptEnvelope" {
  config { domain: "receipts" }
  state {
    requiredReceipts: [
      "central_entered",
      "portal_used",
      "shard_entered",
      "encounter_completed",
      "reward_earned",
      "runtime_atlas_admission_passed",
      "central_frontier_proof_passed",
      "production_readiness_recorded"
    ]
  }
  template "Envelope" { receiptType: "test" }
}
`);

  writeFixture(root, 'source/verticals/entertainment/entertainment.hsplus', `
object "Entertainment" {
  type: "runtime_vertical"
  layers: ["vr"]
  domains: ["identity", "agents", "receipts", "quests", "economy", "safety"]
  requiredReceipts: ["central_entered", "portal_used", "reward_earned"]
  failClosedBehavior: "deny"
}
`);

  writeFixture(root, 'source/proofs/central-frontier-receipt-proof.hsplus', `
object "CentralFrontierReceiptProof" {
  type: "runtime_proof"
  id: "central-frontier-receipt-proof"
  layer: "vr"
  domains: ["identity", "agents", "receipts", "quests", "economy", "safety"]
  verticals: ["entertainment"]
  canonicalSource: "source/layers/vr/central/hololand-central.holo"
  secondarySource: "source/layers/vr/frontier/shard-0/frontier-shard-0.holo"
  receiptEnvelope: "source/domains/receipts/runtime-receipt-envelope.hsplus"
  requiredReceipts: ["central_entered", "portal_used", "shard_entered", "encounter_completed", "reward_earned"]
  playerLoop: ["spawn", "portal", "frontier_entry", "encounter", "reward", "return"]
  failClosedBehavior: "deny"
}
`);

  writeFixture(root, 'source/proofs/central-frontier-production-readiness.hsplus', `
object "CentralFrontierProductionReadinessGate" {
  type: "runtime_proof"
  id: "central-frontier-production-readiness"
  layer: "vr"
  domains: ["identity", "agents", "receipts", "quests", "economy", "safety"]
  verticals: ["entertainment"]
  canonicalSource: "source/proofs/central-frontier-receipt-proof.hsplus"
  secondarySource: "source/runtime-atlas.holo"
  receiptEnvelope: "source/domains/receipts/runtime-receipt-envelope.hsplus"
  requiredReceipts: ["runtime_atlas_admission_passed", "central_frontier_proof_passed", "production_readiness_recorded"]
  failClosedBehavior: "deny"
}
`);
}

const root = mkdtempSync(join(tmpdir(), 'hololand-production-readiness-'));
writeValidRuntimeAtlas(root);

const output = '.tmp/hololand/readiness/central-frontier-latest.json';
const proofOutput = '.tmp/hololand/receipts/central-frontier-latest.json';
const receipt = runProductionReadiness({
  root,
  output,
  proofOutput,
  actor: 'test_player',
  surface: 'browser',
});

assert.equal(receipt.status, 'pass', JSON.stringify(receipt.gates, null, 2));
assert.equal(receipt.actor, 'test_player');
assert.equal(receipt.surface, 'browser');
assert.equal(receipt.summary.gateCount, 4);
assert.equal(receipt.summary.failureCount, 0);
assert.equal(receipt.summary.centralFrontierReceiptCount, 5);
assert.equal(receipt.summary.readyForProductionAdmission, true);
assert.ok(receipt.hash);
assert.ok(existsSync(join(root, output)));
assert.ok(existsSync(join(root, proofOutput)));
assert.ok(receipt.gates.every((gate) => gate.hash));
assert.ok(receipt.gates.some((gate) => gate.receiptKind === 'runtime_atlas_admission_passed'));
assert.ok(receipt.gates.some((gate) => gate.receiptKind === 'central_frontier_proof_passed'));
assert.ok(receipt.gates.some((gate) => gate.receiptKind === 'production_readiness_recorded'));

const written = JSON.parse(readFileSync(join(root, output), 'utf8'));
assert.equal(written.hash, receipt.hash);
assert.equal(written.gate.id, 'central-frontier-production-readiness');

const invalidRoot = mkdtempSync(join(tmpdir(), 'hololand-production-readiness-invalid-'));
mkdirSync(join(invalidRoot, 'source'), { recursive: true });
writeFixture(invalidRoot, 'source/proofs/central-frontier-production-readiness.hsplus', `
object "BrokenReadinessGate" {
  type: "runtime_proof"
  id: "broken"
  layer: "vr"
  domains: ["receipts"]
  verticals: ["entertainment"]
  canonicalSource: "source/proofs/missing.hsplus"
  requiredReceipts: ["runtime_atlas_admission_passed"]
  failClosedBehavior: "deny"
}
`);

const invalidReceipt = runProductionReadiness({
  root: invalidRoot,
  write: false,
});

assert.equal(invalidReceipt.status, 'fail');
assert.ok(invalidReceipt.summary.failureCount >= 1);
assert.ok(invalidReceipt.gates.some((gate) => gate.status === 'fail'));

console.log('PASS hololand production readiness gate');
