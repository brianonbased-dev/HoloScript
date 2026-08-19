#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'founder-evidence-demo-latest.json');
const JS_OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'founder-evidence-demo-latest.js');

const result = spawnSync(process.execPath, ['scripts/holoshell-founder-evidence-demo.mjs', '--', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(result.status || 1);
}

assert.equal(existsSync(OUTPUT), true, 'expected founder evidence demo output');
assert.equal(existsSync(JS_OUTPUT), true, 'expected founder evidence demo browser bootstrap');

const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));
assert.equal(receipt.schemaVersion, 'hololand.holoshell.founder-evidence-demo.v0.1.0');
assert.equal(receipt.summary.status, 'pending_user_approval');
assert.equal(receipt.summary.evidenceRung, 'visible_shell_ux');
assert.equal(receipt.summary.approvalRequired, true);
assert.equal(receipt.summary.executionAllowed, true);
assert.equal(receipt.summary.executionPerformed, false);
assert.equal(receipt.evidenceLadder.sourceSpec, true);
assert.equal(receipt.evidenceLadder.receipt, true);
assert.equal(receipt.evidenceLadder.visibleShellUx, true);
assert.equal(receipt.evidenceLadder.approvedExecution, false);
assert.equal(receipt.evidenceLadder.trustedExecution, false);
assert.equal(receipt.approval.nonceBound, true);
assert.equal(receipt.receipt.localMutationPerformed, false);
assert.equal(receipt.receipt.secretsCaptured, false);
assert.match(readFileSync(JS_OUTPUT, 'utf8'), /HOLOSHELL_FOUNDER_EVIDENCE_DEMO/);

console.log('HoloShell founder evidence demo test passed.');
