#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const HTML_PATH = path.join(REPO_ROOT, 'apps', 'holoshell', 'prototype', 'local-capability-room.html');
const RECEIPT_PATH = path.join(REPO_ROOT, '.tmp', 'holoshell', 'founder-evidence-demo-latest.json');
const RECEIPT_CONTROL_PATH = path.join(REPO_ROOT, '.tmp', 'holoshell', 'receipt-control-latest.json');
const LIVE_FEED_PATH = path.join(REPO_ROOT, '.tmp', 'holoshell', 'live-feed.json');
const SHELL_OBJECTS_PATH = path.join(REPO_ROOT, '.tmp', 'holoshell', 'shell-objects.json');

const html = readFileSync(HTML_PATH, 'utf8');
const receipt = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8'));
const receiptControl = JSON.parse(readFileSync(RECEIPT_CONTROL_PATH, 'utf8'));
const liveFeed = JSON.parse(readFileSync(LIVE_FEED_PATH, 'utf8'));
const shellObjects = JSON.parse(readFileSync(SHELL_OBJECTS_PATH, 'utf8'));

assert.match(html, /founder-evidence-demo-latest\.js/, 'prototype must load Founder evidence bootstrap');
assert.match(html, /receipt-control-latest\.js/, 'prototype must load receipt-control bootstrap');
assert.match(html, /id="founderEvidenceCard"/, 'prototype must expose Founder evidence card');
assert.match(html, /\.os-world\s*\{\s*order:\s*-2;/, 'single-column layout must show operating world before Brittney');
assert.match(html, /\.brittney\s*\{\s*order:\s*-1;/, 'single-column layout must keep Brittney after operating evidence');
assert.match(html, /\.founder-evidence-card\s*\{[^}]*top:\s*150px;/s, 'Founder evidence card must sit above the operating turn');
assert.match(html, /\.operating-turn\s*\{[^}]*top:\s*252px;/s, 'operating turn must sit below the approved receipt card');
assert.match(html, /function founderEvidenceDemoFeed\(\)/, 'prototype must read Founder evidence feed');
assert.match(html, /function replayFounderEvidenceReceipt\(\)/, 'prototype must expose replay action for Founder evidence');
assert.match(html, /function receiptControlFeed\(\)/, 'prototype must read receipt-control feed');
assert.match(html, /function inspectFounderEvidenceReceipt\(\)/, 'prototype must expose inspect action for Founder evidence');
assert.match(html, /function showFounderEvidenceRollback\(\)/, 'prototype must expose rollback guidance for Founder evidence');
assert.match(html, /function prepareFounderEvidenceTask\(\)/, 'prototype must prepare task packets from Founder evidence gaps');
assert.match(html, /function renderFounderEvidenceCard\(\)/, 'prototype must render Founder evidence card');
assert.match(html, /renderFounderEvidenceCard\(\)/, 'prototype must invoke Founder evidence renderer');
assert.match(html, /Approved Receipt/, 'approved execution should be labeled as a receipt, not just a plan');
assert.match(html, /Replay with approval/, 'selected receipt actions must include replay with fresh approval');
assert.match(html, /File task packet/, 'selected receipt actions must include task packet generation');
assert.match(html, /Founder evidence:/, 'shell memory must include Founder evidence row');

assert.equal(receipt.schemaVersion, 'hololand.holoshell.founder-evidence-demo.v0.1.0');
assert.equal(receipt.summary.status, 'approved_execution_receipted');
assert.equal(receipt.summary.visibleShellChange, true);
assert.equal(receipt.summary.visibleWitnessKind, 'browser_navigation_dispatched');
assert.equal(receipt.execution.afterState.targetUrlHost, 'example.com');
assert.equal(receipt.execution.afterState.browserNavigation.targetHost, 'example.com');

assert.equal(receiptControl.schemaVersion, 'hololand.holoshell.receipt-control.v0.1.0');
assert.equal(receiptControl.summary.status, 'ready');
assert.equal(receiptControl.summary.replayRequiresFreshApproval, true);
assert.equal(receiptControl.summary.rollbackExecutable, false);
assert.equal(receiptControl.summary.taskPacketReady, true);

assert.equal(liveFeed.summary.founderEvidenceDemoStatus, 'approved_execution_receipted');
assert.equal(liveFeed.summary.founderEvidenceDemoVisibleShellChange, true);
assert.equal(liveFeed.summary.founderEvidenceDemoVisibleWitnessKind, 'browser_navigation_dispatched');
assert.equal(liveFeed.summary.receiptControlStatus, 'ready');
assert.equal(liveFeed.summary.receiptControlReplayAvailable, true);
assert.equal(liveFeed.summary.receiptControlRollbackExecutable, false);

assert.equal(shellObjects.summary.founderEvidenceDemoStatus, 'approved_execution_receipted');
assert.equal(shellObjects.summary.founderEvidenceDemoVisibleShellChange, true);
assert.equal(shellObjects.summary.founderEvidenceDemoVisibleWitnessKind, 'browser_navigation_dispatched');
assert.equal(shellObjects.summary.receiptControlStatus, 'ready');
assert.equal(shellObjects.summary.receiptControlReplayAvailable, true);
assert.equal(shellObjects.objects.some((object) => object.displayName === 'Founder Evidence Demo'), true);
assert.equal(shellObjects.objects.some((object) => object.displayName === 'Receipt Controls'), true);

console.log('HoloShell founder evidence card test passed.');
