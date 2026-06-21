#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holo-ci/check-trait-test-tautologies.mjs.
 *
 * Run via: node scripts/__tests__/trait-test-tautology-canary.test.mjs
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'check-trait-test-tautologies.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(text, expected, name) {
  testsRun += 1;
  if (text.includes(expected)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected output to include ${JSON.stringify(expected)}\n${text}`);
  }
}

function makeWorkspace(source) {
  const root = mkdtempSync(join(tmpdir(), 'trait-tautology-canary-'));
  const testDir = join(root, 'packages', 'core', 'src', 'traits', '__tests__');
  mkdirSync(testDir, { recursive: true });
  writeFileSync(join(testDir, 'EchoTrait.test.ts'), source, 'utf8');
  return root;
}

function run(root, extraArgs = []) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root, '--json', ...extraArgs], {
    encoding: 'utf8',
  });
}

const TAUTOLOGICAL_TEST = `
import { describe, it, expect } from 'vitest';

describe('EchoTrait', () => {
  it('flags an output echo of the fed input', () => {
    const fedInput = 500;
    fire(node, { type: 'nav:build', polygonCount: fedInput });
    const built = lastEmit(node, 'nav:built');
    expect(built?.polygonCount).toBe(fedInput);
  });
});
`;

const FIXED_TEST = `
import { describe, it, expect } from 'vitest';

describe('EchoTrait', () => {
  it('passes when the assertion proves derived output', () => {
    const fedInput = 500;
    fire(node, { type: 'nav:build', polygonCount: fedInput });
    const built = lastEmit(node, 'nav:built');
    expect(built?.nodes).toBeGreaterThan(0);
  });
});
`;

const LITERAL_POLYGON_COUNT_TEST = `
import { describe, it, expect } from 'vitest';

describe('EchoTrait', () => {
  it('flags the old polygonCount literal echo pattern', () => {
    fire(node, { type: 'nav:build', polygonCount: 500 });
    const built = lastEmit(node, 'nav:built');
    expect(built?.polygonCount).toBe(500);
  });
});
`;

console.log('trait-test-tautology-canary.test.mjs');

{
  const root = makeWorkspace(TAUTOLOGICAL_TEST);
  const result = run(root);
  assertEq(result.status, 1, 'known echo tautology exits 1');
  assertIncludes(result.stdout, '"tautologies": 1', 'report records one tautology');
  assertIncludes(result.stdout, '"bucket": "TAUTOLOGY"', 'report places finding in TAUTOLOGY bucket');
  assertIncludes(result.stdout, '"field": "polygonCount"', 'report names the echoed field');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = makeWorkspace(FIXED_TEST);
  const result = run(root);
  assertEq(result.status, 0, 'derived-output assertion exits 0');
  assertIncludes(result.stdout, '"tautologies": 0', 'green report has zero tautologies');
  rmSync(root, { recursive: true, force: true });
}

{
  const root = makeWorkspace(LITERAL_POLYGON_COUNT_TEST);
  const result = run(root);
  assertEq(result.status, 1, 'literal polygonCount echo exits 1');
  assertIncludes(result.stdout, '"value": "500"', 'report preserves literal echo value');
  rmSync(root, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
