#!/usr/bin/env node
/**
 * Pure Node tests for scripts/bovine-tb-phase-b-physiology-sim.mjs.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECEIPT_VERSION,
  buildBovineTbPhaseBReceipt,
  selfTest,
  simulateBovineTbPhysiology,
  validateReceipt,
} from '../bovine-tb-phase-b-physiology-sim.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'bovine-tb-phase-b-physiology-sim.mjs');
const SCRATCH = join(REPO_ROOT, '.scratch', 'bovine-tb-phase-b-test');
const OUT = join(SCRATCH, 'receipt.json');

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

console.log('Test 1: physiology simulation emits longitudinal immune markers');
const simulation = simulateBovineTbPhysiology();
assertEq(simulation.timeSeries.length, 121, 'daily samples for 120-day run');
assertOk(simulation.summary.peakIfnGamma.value > 0.12, 'IFN-gamma peak observed');
assertOk(simulation.summary.peakIl10.value > 0.12, 'IL-10 peak observed');
assertOk(
  simulation.summary.wbcKPerUlRange.max > simulation.summary.wbcKPerUlRange.min,
  'WBC moves'
);
assertOk(simulation.summary.tuberculin72hMm > 0.05, 'tuberculin 72h response observed');
assertOk(
  simulation.summary.finalMBovisLoad < simulation.summary.peakMBovisLoad,
  'candidate suppresses load below peak'
);

console.log('Test 2: CAEL receipt validates hash chain and Ed25519 signature');
const receipt = buildBovineTbPhaseBReceipt({
  generatedAt: '2026-06-21T00:00:00.000Z',
  taskId: 'task_1781757203428_t4ti',
});
assertEq(receipt.schemaVersion, RECEIPT_VERSION, 'schema version');
assertEq(receipt.status, 'pass', 'receipt status pass');
assertEq(validateReceipt(receipt).length, 0, 'receipt validates');
assertOk(receipt.hash.startsWith('sha256:'), 'receipt hash present');
assertEq(receipt.signature.algorithm, 'Ed25519', 'receipt signed with Ed25519');
assertEq(receipt.chain.stages.length, 4, 'four CAEL stages recorded');

console.log('Test 3: tampering is rejected');
const tampered = {
  ...receipt,
  timeSeries: receipt.timeSeries.slice(0, -1),
};
assertOk(validateReceipt(tampered).includes('hash mismatch'), 'time-series tamper fails hash');
const signatureTampered = {
  ...receipt,
  signature: {
    ...receipt.signature,
    value: `${receipt.signature.value[0] === 'A' ? 'B' : 'A'}${receipt.signature.value.slice(1)}`,
  },
};
assertOk(
  validateReceipt(signatureTampered).some((error) => error.includes('signature')),
  'signature tamper fails verification'
);

console.log('Test 4: exported self-test runs without hardware');
const selfTestReceipt = selfTest();
assertEq(selfTestReceipt.status, 'pass', 'exported self-test status pass');
const cliSelfTest = spawnSync(process.execPath, [SCRIPT, '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(cliSelfTest.status, 0, 'CLI self-test exits 0');
assertOk(cliSelfTest.stdout.includes('self-test PASS'), 'CLI self-test names pass');

console.log('Test 5: CLI run writes a verifiable receipt');
const run = spawnSync(
  process.execPath,
  [SCRIPT, 'run', '--out', OUT, '--now', '2026-06-21T00:00:00.000Z', '--json'],
  {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }
);
assertEq(run.status, 0, 'CLI run exits 0');
assertOk(existsSync(OUT), 'CLI receipt file written');
const verify = spawnSync(process.execPath, [SCRIPT, 'verify', '--receipt', OUT], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
});
assertEq(verify.status, 0, 'CLI verify exits 0');
assertOk(verify.stdout.includes('verify PASS'), 'CLI verify names pass');

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
