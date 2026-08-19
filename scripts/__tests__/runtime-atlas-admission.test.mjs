#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

import { scanAtlas } from '../check-runtime-atlas-admission.mjs';

function writeFixture(root, file, content) {
  const full = join(root, file);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

const validRoot = mkdtempSync(join(tmpdir(), 'runtime-atlas-valid-'));
mkdirSync(join(validRoot, 'source'), { recursive: true });

writeFixture(validRoot, 'source/runtime-atlas.holo', `
composition "Atlas" {
  state {
    layers: ["vr"]
    domains: ["receipts"]
    verticals: ["entertainment"]
    surfaces: ["browser"]
  }
  object "RuntimeAdmissionGate" {
    requiredFields: ["layer"]
  }
}
`);

writeFixture(validRoot, 'source/layers/vr/central/central.holo', `
composition "Central" {
  metadata { layer: "vr" }
  state {
    place_id: "central"
    domains: ["receipts"]
    verticals: ["entertainment"]
    required_receipts: ["central_entered"]
  }
  logic {
    action write_receipt() {
      emit("receipt_written")
      source: "source/layers/vr/central/central.holo"
    }
  }
}
`);

writeFixture(validRoot, 'source/domains/receipts/receipt.hsplus', `
composition "Receipts" {
  config { domain: "receipts" }
  state { requiredReceipts: ["central_entered"] }
  template "Envelope" { receiptType: "test" }
}
`);

writeFixture(validRoot, 'source/verticals/entertainment/entertainment.hsplus', `
object "Entertainment" {
  type: "runtime_vertical"
  layers: ["vr"]
  domains: ["receipts"]
  requiredReceipts: ["central_entered"]
  failClosedBehavior: "deny"
}
`);

writeFixture(validRoot, 'source/proofs/central-proof.hsplus', `
object "CentralProof" {
  type: "runtime_proof"
  layer: "vr"
  domains: ["receipts"]
  verticals: ["entertainment"]
  requiredReceipts: ["central_entered"]
  canonicalSource: "source/layers/vr/central/central.holo"
  failClosedBehavior: "deny"
}
`);

const validReport = scanAtlas({ root: validRoot });
assert.equal(validReport.status, 'pass', JSON.stringify(validReport.failures, null, 2));
assert.equal(validReport.checkedFiles, 5);

const invalidRoot = mkdtempSync(join(tmpdir(), 'runtime-atlas-invalid-'));
mkdirSync(join(invalidRoot, 'source', 'verticals', 'entertainment'), { recursive: true });
writeFixture(invalidRoot, 'source/verticals/entertainment/broken.hsplus', `
object "Broken" {
  type: "runtime_vertical"
}
`);

const invalidReport = scanAtlas({ root: invalidRoot });
assert.equal(invalidReport.status, 'fail');
assert.equal(invalidReport.failures.length, 1);
assert.ok(invalidReport.failures[0].findings.some((finding) => finding.includes('layers:')));

console.log('PASS runtime atlas admission checker fixtures');
