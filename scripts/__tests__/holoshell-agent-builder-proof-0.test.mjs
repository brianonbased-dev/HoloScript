#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'agent-builder-proof-0');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const HTML_PATH = path.join(OUTPUT_DIR, 'builder-proof.html');
const JS_PATH = path.join(OUTPUT_DIR, 'receipt.js');
const BROWSER_RECEIPT_PATH = path.join(OUTPUT_DIR, 'browser-receipt.json');
const BROWSER_JS_PATH = path.join(OUTPUT_DIR, 'browser-receipt.js');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
    timeout: options.timeout ?? 120_000,
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

rmSync(OUTPUT_DIR, { recursive: true, force: true });

run(process.execPath, [
  'scripts/holoshell-agent-builder-proof-0.mjs',
  '--output-dir',
  OUTPUT_DIR,
  '--receipt',
  RECEIPT_PATH,
  '--html',
  HTML_PATH,
  '--js',
  JS_PATH,
  '--json',
]);

const receipt = readJson(RECEIPT_PATH);
assert.equal(receipt.schema, 'hololand.holoshell.agent-builder-proof-0.v0.1.0');
assert.equal(receipt.status, 'pass');
assert.equal(receipt.source.path, 'apps/holoshell/source/holoshell-agent-builder-proof-0.hsplus');
assert.equal(receipt.source.format, 'hsplus');
assert.match(receipt.source.sha256, /^[a-f0-9]{64}$/);
assert.equal(receipt.validation.status, 'pass');
assert.equal(receipt.validation.local.status, 'pass');
assert.ok(receipt.validation.local.policies.includes('SourcePrecedesBridge'));
assert.ok(receipt.validation.local.policies.includes('ValidateBeforeRender'));
assert.ok(receipt.validation.local.policies.includes('RuntimeInteractionIsMandatory'));
assert.ok(receipt.validation.local.policies.includes('NotR3FCompilerTheatre'));
assert.equal(receipt.render.status, 'ready');
assert.equal(receipt.runtime.status, 'ready');
assert.equal(receipt.interaction.status, 'pending_browser_receipt');
assert.ok(existsSync(HTML_PATH), 'render HTML missing');
assert.ok(existsSync(JS_PATH), 'receipt bootstrap JS missing');

const html = readFileSync(HTML_PATH, 'utf8');
assert.match(html, /HoloShell Agent Builder Proof 0/);
assert.match(html, /builder-proof-verify/);
assert.match(html, /SourcePrecedesBridge/);
assert.match(html, /local_browser_file_runtime/);

run(process.execPath, [
  'scripts/holoshell-agent-builder-proof-browser-receipt.mjs',
  '--html',
  HTML_PATH,
  '--output-dir',
  OUTPUT_DIR,
  '--output',
  BROWSER_RECEIPT_PATH,
  '--js-output',
  BROWSER_JS_PATH,
  '--json',
], {
  timeout: 120_000,
});

const browserReceipt = readJson(BROWSER_RECEIPT_PATH);
assert.equal(browserReceipt.schema, 'hololand.holoshell.agent-builder-proof-browser-receipt.v0.1.0');
assert.equal(browserReceipt.status, 'pass');
assert.equal(browserReceipt.interaction.status, 'pass');
assert.equal(browserReceipt.state.assertions.sourceVisible, true);
assert.equal(browserReceipt.state.assertions.validationVisible, true);
assert.equal(browserReceipt.state.assertions.renderVisible, true);
assert.equal(browserReceipt.state.assertions.receiptVisible, true);
assert.equal(browserReceipt.state.assertions.interactionCaptured, true);
assert.equal(browserReceipt.state.assertions.noR3FTheatreClaim, true);
assert.match(browserReceipt.evidence.screenshotSha256, /^[a-f0-9]{64}$/);
assert.match(browserReceipt.evidence.domSha256, /^[a-f0-9]{64}$/);
assert.ok(existsSync(path.resolve(REPO_ROOT, browserReceipt.evidence.screenshot)), 'screenshot file missing');
assert.ok(existsSync(path.resolve(REPO_ROOT, browserReceipt.evidence.dom)), 'DOM file missing');
assert.ok(existsSync(BROWSER_JS_PATH), 'browser receipt bootstrap JS missing');

console.log('holoshell agent builder proof 0 test passed');
