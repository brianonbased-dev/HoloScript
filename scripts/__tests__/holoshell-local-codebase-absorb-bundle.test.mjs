#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const script = join(repoRoot, 'scripts', 'holoshell-local-codebase-absorb-bundle.mjs');
const outDir = mkdtempSync(join(tmpdir(), 'holoshell-local-codebase-test-'));
const output = join(outDir, 'bundle.json');
const jsOutput = join(outDir, 'bundle.js');

const result = spawnSync(
  process.execPath,
  [script, '--self-test', '--output', output, '--js-output', jsOutput, '--json'],
  {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  }
);

assert.equal(result.status, 0, result.stderr || result.stdout);

const bundle = JSON.parse(readFileSync(output, 'utf8'));
assert.equal(bundle.schemaVersion, 'hololand.holoshell.local-codebase-absorb-bundle.v0.1.0');
assert.equal(bundle.receiptType, 'HoloShellLocalCodebaseSnapshotReceipt');
assert.equal(bundle.receipt.status, 'ready');
assert.equal(bundle.receipt.redactionStatus, 'warn');
assert.equal(bundle.summary.mutationPerformed, false);
assert.equal(bundle.mcp.tool, 'holo_absorb_repo');

const sourcePaths = bundle.mcp.arguments.sourceFiles.map((file) => file.path);
assert.deepEqual(sourcePaths, ['fixture/src/index.ts']);
assert.ok(!JSON.stringify(bundle.mcp.arguments.sourceFiles).includes('do-not-include'));
assert.ok(bundle.receipt.skippedFiles.some((file) => file.reason === 'secret-adjacent'));
assert.ok(bundle.receipt.skippedFiles.some((file) => file.reason === 'excluded-directory'));
assert.ok(bundle.receipt.hash);

const bootstrap = readFileSync(jsOutput, 'utf8');
assert.ok(bootstrap.includes('window.HOLOSHELL_LOCAL_CODEBASE_ABSORB_BUNDLE'));

console.log('PASS holoshell local codebase absorb bundle self-test');
