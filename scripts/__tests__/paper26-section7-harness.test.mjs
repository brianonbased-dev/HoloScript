#!/usr/bin/env node
/**
 * Smoke tests for scripts/run-paper26-section7-harness.mjs.
 *
 * The self-test path avoids network and Vitest while still exercising table
 * parsing, artifact writing, and the coordination summary shape.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'run-paper26-section7-harness.mjs');

let testsRun = 0;
let testsFailed = 0;

const tmp = mkdtempSync(path.join(tmpdir(), 'paper26-section7-harness-'));
const jsonOut = path.join(tmp, 'summary.json');
const mdOut = path.join(tmp, 'summary.md');

try {
  const result = spawnSync(process.execPath, [
    SCRIPT,
    '--self-test',
    `--out=${jsonOut}`,
    `--markdown-out=${mdOut}`,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });

  assertEq(result.status, 0, 'self-test exits 0');

  const summary = JSON.parse(readFileSync(jsonOut, 'utf8'));
  const markdown = readFileSync(mdOut, 'utf8');

  assertEq(summary.schema, 'holoscript.paper26.section7.harness.v0.1.0', 'schema is stable');
  assertEq(summary.tables['7.3_holograph_lookup'].length, 2, 'parses HoloGraph rows');
  assertEq(summary.tables['7.4_holoembed_recall'].length, 2, 'parses HoloEmbed recall rows');
  assertEq(
    summary.tables['7.4_holoembed_recall'].find((row) => row.provider === 'holoembed').recallAt10,
    0.9,
    'parses HoloEmbed 90 percent recall'
  );
  assertEq(summary.coordination.mode, 'offline-synthetic', 'self-test uses offline coordination');
  assertContains(markdown, 'Table 7.5 - HoloMesh Team-Protocol Coordination', 'writes markdown table 7.5');
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
    console.error(`  not ok - ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
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
