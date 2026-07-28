#!/usr/bin/env node
/**
 * Pure Node regression test for scripts/bovine_tb_phase_a_vqe.py.
 *
 * This keeps the BTA-QA1 runner honest on machines without PySCF: fixture mode
 * must emit a hash-verifiable CAEL quantum receipt, satisfy the variational
 * floor, and verify the generated receipt from disk.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'bovine_tb_phase_a_vqe.py');
const PYTHON = process.env.QISKIT_PYTHON || process.env.PYTHON || 'python';
const SCRATCH = join(REPO_ROOT, '.scratch', 'bovine-tb-phase-a-test');
const OUT = join(SCRATCH, 'inha-inh-vqe-receipt.json');
const COMPAT_OUT = join(SCRATCH, 'inha-inh-vqe-dossier-command-receipt.json');

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function run(args, timeout = 45000) {
  return spawnSync(PYTHON, [SCRIPT, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout,
  });
}

rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

console.log('bovine-tb-phase-a-vqe.test.mjs');

const selfTest = run(['--self-test']);
assertEq(selfTest.status, 0, 'self-test exits 0');
assertOk(selfTest.stdout.includes('self-test PASS'), 'self-test reports PASS');

const generatedAt = '2026-06-21T00:00:00+00:00';
const runResult = run([
  'run',
  '--reference-backend',
  'fixture',
  '--out',
  OUT,
  '--now',
  generatedAt,
  '--json',
]);
assertEq(runResult.status, 0, 'fixture run exits 0');
assertOk(existsSync(OUT), 'fixture run writes receipt');

let summary = {};
try {
  summary = JSON.parse(runResult.stdout);
} catch (error) {
  testsFailed += 1;
  console.error(`  FAIL run stdout parses as JSON: ${error.message}`);
}
assertEq(summary.schema, 'cael-quantum-v1.bovine-tb.phase-a', 'receipt schema summary');
assertEq(summary.referenceBackend, 'fixture-exact-diagonalization', 'fixture reference named');
assertEq(summary.variationalPrincipleOk, true, 'variational principle passes');
assertEq(summary.withinChemicalAccuracy, true, 'fixture reaches chemical accuracy');

const verify = run(['verify', '--receipt', OUT]);
assertEq(verify.status, 0, 'verify exits 0');
assertOk(verify.stdout.includes('verify PASS'), 'verify reports PASS');

const dossierShape = run([
  '--target',
  'InhA',
  '--ligand',
  'isoniazid',
  '--fragment',
  'active-site-v0',
  '--basis',
  'sto-3g',
  '--active-space',
  'auto-small',
  '--backend',
  'aer',
  '--ansatz',
  'uccsd',
  '--reference-backend',
  'fixture',
  '--write-receipt',
  COMPAT_OUT,
  '--now',
  generatedAt,
  '--json',
]);
assertEq(dossierShape.status, 0, 'dossier-shaped command exits 0');
assertOk(existsSync(COMPAT_OUT), 'dossier-shaped command writes receipt');

const compatReceipt = JSON.parse(readFileSync(COMPAT_OUT, 'utf8'));
assertEq(compatReceipt.vqe.ansatzRequested, 'uccsd', 'records requested ansatz');
assertOk(
  compatReceipt.vqe.ansatzImplemented.includes('ry-cnot'),
  'records implemented local ansatz'
);

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
