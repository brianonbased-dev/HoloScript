#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'exp5-stabilizer-fleet', 'surface', 'toric.mts');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');

let testsRun = 0;
let testsFailed = 0;

const tmp = mkdtempSync(path.join(tmpdir(), 'exp5-stabilizer-toric-'));
const jsonOut = path.join(tmp, 'receipt.json');

try {
  const result = spawnSync(
    process.execPath,
    [TSX_CLI, SCRIPT, '--self-test', `--out=${jsonOut}`, '--trials=24'],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    }
  );

  if (result.error) {
    console.error(result.error);
  }
  if (result.stderr) {
    console.error(result.stderr);
  }

  assertEq(result.status, 0, 'self-test exits 0');
  assertContains(result.stdout ?? '', 'schema=holoscript.exp5.surface.real-cael-toric.v1', 'prints schema');
  if (result.status !== 0) {
    throw new Error('self-test command failed before writing receipt');
  }

  const receipt = JSON.parse(readFileSync(jsonOut, 'utf8'));
  assertEq(receipt.schema, 'holoscript.exp5.surface.real-cael-toric.v1', 'schema is stable');
  assertEq(receipt.mode, 'self-test', 'self-test mode recorded');
  assertEq(receipt.acceptance.totalTrialsPerPoint, 24, 'trial override applied');
  assertEq(receipt.zSyndromeObservable.importedAs, 'verifyCaelRecord', 'uses verifier alias');
  assertEq(
    receipt.zSyndromeObservable.cleanAndTamperChecks.every(
      (check) => check.cleanVerified === check.sites && check.tamperedRejected === check.sites
    ),
    true,
    'clean records verify and tampered records reject'
  );
  assertEq(receipt.curve.length, 4, 'self-test emits p x distance rows');
  assertEq(
    receipt.curve.every((row) => row.caelRecordsObserved === row.tamperedRecordsRejected),
    true,
    'observed syndrome records are CAEL verifier rejections'
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`FAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}

console.log(`PASS ${testsRun} assertions`);

function assertEq(actual, expected, name) {
  testsRun++;
  if (actual === expected) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed++;
    console.error(
      `  not ok - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertContains(haystack, needle, name) {
  testsRun++;
  if (haystack.includes(needle)) {
    console.log(`  ok - ${name}`);
  } else {
    testsFailed++;
    console.error(`  not ok - ${name}: missing ${JSON.stringify(needle)}`);
  }
}
