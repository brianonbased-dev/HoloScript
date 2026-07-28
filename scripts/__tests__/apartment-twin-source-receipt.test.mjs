#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'apartment-twin-source-receipt.mts');
const SOURCE = join(
  REPO_ROOT,
  'apps',
  'quest-universal-qr-scanner',
  'worlds',
  'apartment-twin.holo'
);

let testsRun = 0;
let testsFailed = 0;

function test(name, fn) {
  testsRun += 1;
  try {
    fn();
    console.log(`  PASS ${name}`);
  } catch (error) {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
    console.error(error);
  }
}

function runReceipt(args) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'corepack';
  const commandArgs =
    process.platform === 'win32'
      ? ['/c', 'corepack', 'pnpm', 'exec', 'tsx', SCRIPT, '--json', ...args]
      : ['pnpm', 'exec', 'tsx', SCRIPT, '--json', ...args];
  return spawnSync(command, commandArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  assert.notEqual(start, -1, `stdout did not contain JSON: ${stdout}`);
  return JSON.parse(stdout.slice(start));
}

test('accepts the real apartment twin source and records the required contract evidence', () => {
  const result = runReceipt(['--check']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = parseJson(result.stdout);
  assert.equal(receipt.schemaVersion, 'holoscript.apartment-twin-source-receipt.v0.1.0');
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.validation.parser.success, true);
  assert.equal(receipt.contract.coordinateFrame, 'apartment-local-floor-v0');
  assert.ok(receipt.counts.zones >= 3);
  assert.ok(receipt.counts.anchors >= 3);
  assert.ok(receipt.counts.surfaces >= 4);
  assert.ok(receipt.counts.reconstructionRefs >= 1);
  assert.ok(receipt.counts.fallbacks >= 1);
  assert.equal(receipt.questWorld.uri, 'holoscript://world/apartment-twin');
});

test('fails closed when a source omits the reconstruction asset reference', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'apartment-twin-receipt-'));
  try {
    const badSource = join(tempRoot, 'missing-reconstruction.holo');
    const source = readFileSync(SOURCE, 'utf8').replace(
      'reconstruction_asset: "holomap://captures/apartment-redacted/v0/apartment-room.spz"',
      'reconstruction_note: "missing asset on purpose"'
    );
    writeFileSync(badSource, source, 'utf8');
    const result = runReceipt(['--source', badSource, '--check']);
    assert.notEqual(result.status, 0);
    const receipt = parseJson(result.stdout);
    assert.equal(receipt.status, 'fail');
    assert.ok(
      receipt.validation.failures.some((failure) => failure.rule === 'reconstruction_asset_missing')
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('fails closed on invalid HoloScript syntax', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'apartment-twin-receipt-'));
  try {
    const badSource = join(tempRoot, 'broken.holo');
    writeFileSync(badSource, 'composition "ApartmentTwin" { object "Broken" {', 'utf8');
    const result = runReceipt(['--source', badSource, '--check']);
    assert.notEqual(result.status, 0);
    const receipt = parseJson(result.stdout);
    assert.equal(receipt.status, 'fail');
    assert.ok(receipt.validation.failures.some((failure) => failure.rule === 'holo_parse_failed'));
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
