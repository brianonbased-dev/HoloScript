#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'apartment-tiny-game-receipt.mts');
const GAME = join(
  REPO_ROOT,
  'apps',
  'quest-universal-qr-scanner',
  'worlds',
  'apartment-signal-hunt.holo'
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

test('accepts the real tiny game and simulates completion against apartment twin anchors', () => {
  const result = runReceipt(['--check']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = parseJson(result.stdout);
  assert.equal(receipt.schemaVersion, 'holoscript.tiny-game-receipt.v0.1.0');
  assert.equal(receipt.status, 'pass');
  assert.equal(receipt.game.parentTwin, 'apartment-twin');
  assert.equal(receipt.counts.beacons, 3);
  assert.equal(receipt.simulatedRun.completed, true);
  assert.equal(receipt.simulatedRun.score, 350);
  assert.deepEqual(receipt.completionReceipt.ordered_beacons, [
    'entry-signal',
    'work-signal',
    'portal-signal',
  ]);
});

test('fails closed when the game points at a missing twin anchor', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'apartment-tiny-game-'));
  try {
    const badGame = join(tempRoot, 'bad-game.holo');
    const source = readFileSync(GAME, 'utf8').replace(
      'target_anchor_id: "work-surface"',
      'target_anchor_id: "missing-anchor"'
    );
    writeFileSync(badGame, source, 'utf8');
    const result = runReceipt(['--game', badGame, '--check']);
    assert.notEqual(result.status, 0);
    const receipt = parseJson(result.stdout);
    assert.equal(receipt.status, 'fail');
    assert.ok(
      receipt.validation.failures.some((failure) => failure.rule === 'beacon_anchor_missing')
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('fails closed when the completion receipt rule is absent', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'apartment-tiny-game-'));
  try {
    const badGame = join(tempRoot, 'bad-game.holo');
    const source = readFileSync(GAME, 'utf8').replace(
      'receipt_schema: "TinyGameReceipt/v0.1.0"',
      'receipt_note: "missing schema"'
    );
    writeFileSync(badGame, source, 'utf8');
    const result = runReceipt(['--game', badGame, '--check']);
    assert.notEqual(result.status, 0);
    const receipt = parseJson(result.stdout);
    assert.equal(receipt.status, 'fail');
    assert.ok(
      receipt.validation.failures.some((failure) => failure.rule === 'completion_receipt_missing')
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
