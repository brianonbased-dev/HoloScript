#!/usr/bin/env node
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'receipt-control', 'receipt-control-latest.json');
const JS_OUTPUT = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'receipt-control', 'receipt-control-latest.js');
const SOURCE_PATH = path.join(REPO_ROOT, 'apps', 'holoshell', 'source', 'holoshell-receipt-control.hsplus');

const result = spawnSync(process.execPath, ['scripts/holoshell-receipt-control.mjs', '--self-test'], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  windowsHide: true,
});

assert.equal(result.status, 0, result.stderr || result.stdout);
assert.equal(existsSync(OUTPUT), true, 'receipt-control JSON should be written');
assert.equal(existsSync(JS_OUTPUT), true, 'receipt-control bootstrap should be written');

const receipt = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const source = readFileSync(SOURCE_PATH, 'utf8');

assert.equal(receipt.schemaVersion, 'hololand.holoshell.receipt-control.v0.1.0');
assert.equal(receipt.summary.status, 'ready');
assert.equal(receipt.summary.replayRequiresFreshApproval, true);
assert.equal(receipt.summary.rollbackExecutable, false);
assert.equal(receipt.summary.exactTargetIdentityStatus, 'not_proved');
assert.equal(receipt.replayIntent.route, '/action');
assert.equal(receipt.replayIntent.body.action, 'open_url');
assert.equal(receipt.rollbackIntent.blockReason, 'exact_browser_tab_identity_not_proved');
assert.equal(receipt.taskPacket.category, 'deterministic UX/receipt gap');
assert.equal(receipt.controls.length, 4);
assert.ok(receipt.controls.some((control) => control.id === 'replay_with_approval'));
assert.ok(receipt.controls.some((control) => control.id === 'file_task_packet'));
assert.match(source, /ReplayRequiresFreshApproval/);
assert.match(source, /RollbackRequiresExactIdentity/);
assert.match(source, /ReceiptControlReceipt/);

console.log('HoloShell receipt control test passed.');
