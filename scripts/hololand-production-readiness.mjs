#!/usr/bin/env node
/* global console, process */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { scanAtlas } from './check-runtime-atlas-admission.mjs';
import { runCentralFrontierProof } from './hololand-central-frontier-proof.mjs';

const DEFAULT_GATE = 'source/proofs/central-frontier-production-readiness.hsplus';
const DEFAULT_OUTPUT = '.tmp/hololand/readiness/central-frontier-latest.json';
const DEFAULT_PROOF_OUTPUT = '.tmp/hololand/receipts/central-frontier-latest.json';

function parseArgs(argv) {
  const args = {
    root: process.cwd(),
    gate: DEFAULT_GATE,
    output: DEFAULT_OUTPUT,
    proofOutput: DEFAULT_PROOF_OUTPUT,
    actor: 'founder_player',
    surface: 'browser',
    write: true,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') {
      args.root = argv[index + 1];
      index += 1;
    } else if (arg === '--gate') {
      args.gate = argv[index + 1];
      index += 1;
    } else if (arg === '--output') {
      args.output = argv[index + 1];
      index += 1;
    } else if (arg === '--proof-output') {
      args.proofOutput = argv[index + 1];
      index += 1;
    } else if (arg === '--actor') {
      args.actor = argv[index + 1];
      index += 1;
    } else if (arg === '--surface') {
      args.surface = argv[index + 1];
      index += 1;
    } else if (arg === '--no-write') {
      args.write = false;
    } else if (arg === '--json') {
      args.json = true;
    }
  }

  return args;
}

function hashJson(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function extractString(content, field) {
  const match = content.match(new RegExp(`${field}\\s*:\\s*"([^"]+)"`));
  return match?.[1] ?? '';
}

function extractList(content, field) {
  const match = content.match(new RegExp(`${field}\\s*:\\s*\\[([^\\]]*)\\]`, 's'));
  if (!match) return [];

  return Array.from(match[1].matchAll(/"([^"]+)"/g)).map((item) => item[1]);
}

function readGateSource(root, gatePath) {
  const full = resolve(root, gatePath);
  if (!existsSync(full)) {
    return {
      status: 'fail',
      source: gatePath,
      error: `Missing production readiness source: ${gatePath}`,
    };
  }

  const content = readFileSync(full, 'utf8');
  const requiredReceipts = extractList(content, 'requiredReceipts');
  const gate = {
    status: 'pass',
    id: extractString(content, 'id'),
    source: gatePath,
    layer: extractString(content, 'layer'),
    canonicalSource: extractString(content, 'canonicalSource'),
    secondarySource: extractString(content, 'secondarySource'),
    receiptEnvelope: extractString(content, 'receiptEnvelope'),
    requiredReceipts,
    hash: hashJson({
      path: gatePath,
      content,
    }),
  };

  const missingFields = ['id', 'layer', 'canonicalSource', 'secondarySource', 'receiptEnvelope']
    .filter((field) => !gate[field]);
  if (missingFields.length > 0) {
    return {
      ...gate,
      status: 'fail',
      error: `Production readiness source is missing: ${missingFields.join(', ')}`,
    };
  }

  return gate;
}

function gateReceipt(name, status, details) {
  const base = {
    name,
    status,
    ...details,
  };

  return {
    ...base,
    hash: hashJson(base),
  };
}

export function runProductionReadiness(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const gatePath = options.gate ?? DEFAULT_GATE;
  const outputPath = options.output ?? DEFAULT_OUTPUT;
  const proofOutput = options.proofOutput ?? DEFAULT_PROOF_OUTPUT;
  const actor = options.actor ?? 'founder_player';
  const surface = options.surface ?? 'browser';
  const write = options.write ?? true;

  const gateSource = readGateSource(root, gatePath);
  const gates = [
    gateReceipt('production_readiness_source', gateSource.status, gateSource),
  ];

  const atlas = scanAtlas({ root });
  gates.push(gateReceipt('runtime_atlas_admission', atlas.status, {
    receiptKind: atlas.status === 'pass'
      ? 'runtime_atlas_admission_passed'
      : 'runtime_atlas_admission_failed',
    checkedFiles: atlas.checkedFiles,
    failureCount: atlas.failures.length,
    failures: atlas.failures.map((failure) => ({
      file: failure.file,
      findings: failure.findings,
    })),
  }));

  let centralFrontier = null;
  try {
    centralFrontier = runCentralFrontierProof({
      root,
      output: proofOutput,
      actor,
      surface,
      write,
    });
    gates.push(gateReceipt('central_frontier_proof', centralFrontier.status, {
      receiptKind: 'central_frontier_proof_passed',
      output: proofOutput,
      proof: centralFrontier.proof.id,
      receiptCount: centralFrontier.summary.receiptCount,
      firstStep: centralFrontier.summary.firstStep,
      lastStep: centralFrontier.summary.lastStep,
      proofHash: centralFrontier.hash,
    }));
  } catch (error) {
    gates.push(gateReceipt('central_frontier_proof', 'fail', {
      receiptKind: 'central_frontier_proof_failed',
      output: proofOutput,
      error: error.message,
    }));
  }

  const requiredReceiptSet = new Set(gateSource.requiredReceipts ?? []);
  const emittedReceiptKinds = new Set(gates.map((gate) => gate.receiptKind).filter(Boolean));
  emittedReceiptKinds.add('production_readiness_recorded');

  const missingRequiredReceipts = Array.from(requiredReceiptSet)
    .filter((receipt) => !emittedReceiptKinds.has(receipt));
  if (missingRequiredReceipts.length > 0) {
    gates.push(gateReceipt('production_readiness_receipt_coverage', 'fail', {
      receiptKind: 'production_readiness_receipt_coverage_failed',
      missingRequiredReceipts,
    }));
  } else {
    gates.push(gateReceipt('production_readiness_receipt_coverage', 'pass', {
      receiptKind: 'production_readiness_recorded',
      requiredReceipts: Array.from(requiredReceiptSet),
    }));
  }

  const status = gates.every((gate) => gate.status === 'pass') ? 'pass' : 'fail';
  const receipt = {
    receiptType: 'hololand.production-readiness.central-frontier.v0.1.0',
    status,
    root,
    actor,
    surface,
    output: outputPath,
    gate: gateSource,
    gates,
    summary: {
      gateCount: gates.length,
      passCount: gates.filter((gate) => gate.status === 'pass').length,
      failureCount: gates.filter((gate) => gate.status === 'fail').length,
      atlasCheckedFiles: atlas.checkedFiles,
      centralFrontierReceiptCount: centralFrontier?.summary.receiptCount ?? 0,
      readyForProductionAdmission: status === 'pass',
    },
  };

  const finalReceipt = {
    ...receipt,
    hash: hashJson(receipt),
  };

  if (write) {
    const fullOutput = resolve(root, outputPath);
    mkdirSync(dirname(fullOutput), { recursive: true });
    writeFileSync(fullOutput, `${JSON.stringify(finalReceipt, null, 2)}\n`, 'utf8');
  }

  return finalReceipt;
}

function printHuman(receipt) {
  const label = receipt.status === 'pass' ? 'PASS' : 'FAIL';
  console.log(`${label} HoloLand production readiness: ${receipt.summary.passCount}/${receipt.summary.gateCount} gates passed`);
  console.log(`Output: ${receipt.output}`);
  console.log(`Hash: ${receipt.hash}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = runProductionReadiness(args);

  if (args.json) {
    console.log(JSON.stringify(receipt, null, 2));
  } else {
    printHuman(receipt);
  }

  process.exit(receipt.status === 'pass' ? 0 : 1);
}
