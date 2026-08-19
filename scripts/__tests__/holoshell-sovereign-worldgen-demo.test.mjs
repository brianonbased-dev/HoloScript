#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..');
const OUTPUT_DIR = path.join(REPO_ROOT, '.tmp', 'holoshell', 'self-test', 'sovereign-worldgen-demo');
const RECEIPT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const COMPILE_RECEIPT_PATH = path.join(OUTPUT_DIR, 'compile-receipt.json');
const FOUNDER_NOTE_PATH = path.join(OUTPUT_DIR, 'founder-demo-note.md');
const COMPILED_HTML_PATH = path.join(OUTPUT_DIR, 'webgpu-preview.html');

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function runNode(args, timeout = 180_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: REPO_ROOT,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out after ${timeout}ms`));
    }, timeout);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${stdout}\n${stderr}`.trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function main() {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });

  let requestCount = 0;
  let capturedCode = '';
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => {
      requestCount += 1;
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      capturedCode = parsed.code || '';
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'x-holoscript-renderer': 'sovereign-webgpu',
        'x-holoscript-compile-ms': '17',
      });
      res.end(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Sovereign Generated Navigable World — HoloScript WebGPU</title>
</head>
<body data-demo="hl-013">
  <canvas id="hs-render-surface"></canvas>
  <script>console.log("WebGPU preview");</script>
</body>
</html>`);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const compileEndpoint = `http://127.0.0.1:${address.port}/api/compile/webgpu-preview`;

  try {
    const result = await runNode([
      'scripts/holoshell-sovereign-worldgen-demo.mjs',
      '--output-dir',
      OUTPUT_DIR,
      '--compile-endpoint',
      compileEndpoint,
      '--json',
    ]);

    const summary = JSON.parse(result.stdout);
    assert.equal(summary.schema, 'hololand.holoshell.sovereign-worldgen-demo.v0.1.0');
    assert.equal(summary.status, 'pass');

    assert.equal(requestCount, 1, 'expected one compile request');
    assert.match(capturedCode, /composition "Sovereign Generated Navigable World"/);

    assert.equal(existsSync(RECEIPT_PATH), true, 'expected base pipeline receipt');
    assert.equal(existsSync(COMPILE_RECEIPT_PATH), true, 'expected compile receipt');
    assert.equal(existsSync(FOUNDER_NOTE_PATH), true, 'expected founder note');
    assert.equal(existsSync(COMPILED_HTML_PATH), true, 'expected compiled HTML');

    const pipelineReceipt = readJson(RECEIPT_PATH);
    assert.equal(pipelineReceipt.schema, 'hololand.holoshell.sovereign-worldgen-pipeline.v0.1.0');
    assert.equal(pipelineReceipt.status, 'pass');

    const compileReceipt = readJson(COMPILE_RECEIPT_PATH);
    assert.equal(compileReceipt.schema, 'hololand.holoshell.sovereign-worldgen-compile-receipt.v0.1.0');
    assert.equal(compileReceipt.status, 'pass');
    assert.equal(compileReceipt.response.statusCode, 200);
    assert.equal(compileReceipt.response.compileMs, 17);
    assert.equal(compileReceipt.validation.titlePresent, true);
    assert.equal(compileReceipt.validation.webgpuMarkerPresent, true);
    assert.equal(compileReceipt.validation.noThreeJsMarkerPresent, true);

    const founderNote = readFileSync(FOUNDER_NOTE_PATH, 'utf8');
    assert.match(founderNote, /Typed And Editable/);
    assert.match(founderNote, /Inferred World Decisions/);
    assert.match(founderNote, /Remaining Blockers/);
    assert.match(founderNote, /synthetic\/source-owned observed-fact fixture/);

    const compiledHtml = readFileSync(COMPILED_HTML_PATH, 'utf8');
    assert.match(compiledHtml, /Sovereign Generated Navigable World/);

    console.log('holoshell sovereign worldgen demo test passed');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

await main();
