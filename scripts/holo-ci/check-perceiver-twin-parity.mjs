#!/usr/bin/env node
/**
 * check-perceiver-twin-parity.mjs — .hsplus twin drift guard for the
 * cross-perceiver modules (board task h1q0, honesty-debt class W.772).
 *
 * Each perceiver module in packages/core/src/reconstruction/ carries a
 * hand-authored .hsplus native surface twin whose `@receipt { type, fields }`
 * block documents the module's receipt shape. Twins drift silently when the
 * .ts interface gains or loses fields; this gate diffs the twin's declared
 * field list against the exported interface's top-level properties and fails
 * on drift in EITHER direction (phantom twin field OR undeclared interface
 * field).
 *
 * Scope is the perceiver twin family only — the R3F trait-parity gate
 * (check-trait-parity.mjs) covers the runtime trait surface separately.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'packages', 'core', 'src', 'reconstruction');

/** twin file → its .ts implementation. The interface checked is the one the
 *  twin's @receipt `type:` names. */
const PAIRS = [
  ['perceiver_consensus_receipt.hsplus', 'PerceiverConsensusReceipt.ts'],
  ['webgpu_perceiver_derivation.hsplus', 'webgpuPerceiverDerivation.ts'],
  ['agent_inference_perceiver_derivation.hsplus', 'agentInferencePerceiverDerivation.ts'],
  ['urdf_perceiver_derivation.hsplus', 'urdfPerceiverDerivation.ts'],
];

/** The derivation modules type their receipts as PerceiverDerivation, which
 *  lives in the receipt module — resolve interfaces across the family. */
function interfaceFields(typeName) {
  for (const [, tsFile] of PAIRS) {
    const src = readFileSync(join(dir, tsFile), 'utf8');
    const start = src.indexOf(`export interface ${typeName} {`);
    if (start < 0) continue;
    const fields = [];
    let depth = 0;
    let opened = false;
    for (const line of src.slice(start).split('\n')) {
      // Match fields at the depth the LINE STARTS at — a field whose type opens
      // a brace on the same line (e.g. `perceivers: Array<{`) is still a
      // top-level field of the interface.
      const depthAtLineStart = depth;
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (opened && depthAtLineStart === 1) {
        const m = /^\s{2}(?:readonly )?([A-Za-z_$][\w$]*)\??:/.exec(line);
        if (m) fields.push(m[1]);
      }
      opened = true;
      if (opened && depth <= 0) break;
    }
    return fields;
  }
  return null;
}

let failures = 0;
for (const [twinFile] of PAIRS) {
  const twin = readFileSync(join(dir, twinFile), 'utf8');
  const receiptBlock = /@receipt\s+\w+\s*\{([\s\S]*?)\}/.exec(twin)?.[1];
  if (!receiptBlock) {
    console.error(`FAIL ${twinFile}: no @receipt block found`);
    failures++;
    continue;
  }
  const typeName = /type:\s*"([^"]+)"/.exec(receiptBlock)?.[1];
  const fieldsRaw = /fields:\s*\[([^\]]*)\]/.exec(receiptBlock)?.[1] ?? '';
  const twinFields = [...fieldsRaw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!typeName || twinFields.length === 0) {
    console.error(`FAIL ${twinFile}: @receipt block missing type or fields`);
    failures++;
    continue;
  }
  const tsFields = interfaceFields(typeName);
  if (!tsFields) {
    console.error(`FAIL ${twinFile}: interface ${typeName} not found in the perceiver family`);
    failures++;
    continue;
  }
  const phantom = twinFields.filter((f) => !tsFields.includes(f));
  const undeclared = tsFields.filter((f) => !twinFields.includes(f));
  if (phantom.length || undeclared.length) {
    failures++;
    if (phantom.length) {
      console.error(
        `FAIL ${twinFile}: phantom twin field(s) not on ${typeName}: ${phantom.join(', ')}`
      );
    }
    if (undeclared.length) {
      console.error(
        `FAIL ${twinFile}: ${typeName} field(s) missing from twin: ${undeclared.join(', ')}`
      );
    }
  } else {
    console.log(`OK   ${twinFile} ↔ ${typeName} (${tsFields.length} fields)`);
  }
}

if (failures > 0) {
  console.error(
    `\n[perceiver-twin-parity] ${failures} twin(s) drifted — update the .hsplus @receipt fields to match the interface.`
  );
  process.exit(1);
}
console.log('[perceiver-twin-parity] all perceiver twins in parity.');
