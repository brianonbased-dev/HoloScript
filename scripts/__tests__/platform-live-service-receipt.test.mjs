#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'check-platform-live-service-receipt.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function readJson(req) {
  return new Promise((resolve) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function writeJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(`${JSON.stringify(body)}\n`);
}

function withServer(handler) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        endpoint: `http://127.0.0.1:${address.port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function run(endpoint, outPath) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [SCRIPT, '--endpoint', endpoint, '--out', outPath, '--json', '--timeout-ms', '5000'],
      { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

console.log('Test 1: local fake service produces a passing secret-safe live receipt');
const passServer = await withServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, { status: 'ok', version: 'test', tools: 3 });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/holomesh/register/challenge') {
    const body = await readJson(req);
    writeJson(res, 200, {
      success: true,
      challenge: {
        walletAddress: body.wallet_address,
        domain: 'HoloMesh Registration',
        message: `Register a new HoloMesh agent with wallet ${body.wallet_address}`,
      },
      nonce: 'nonce-test-123456',
      expires_in: 300,
      instructions: {
        next: 'POST /api/holomesh/register with {name, wallet_address, nonce, signature}',
      },
    });
    return;
  }
  writeJson(res, 404, { error: 'not found' });
});

const tmp1 = mkdtempSync(join(tmpdir(), 'platform-live-service-'));
const passOut = join(tmp1, 'receipt.json');
const passRun = await run(passServer.endpoint, passOut);
assertOk(existsSync(passOut), 'receipt file written');
const passReceipt = JSON.parse(readFileSync(passOut, 'utf8'));
assertOk(passRun.status === 0 || passReceipt.ok === true, 'passing service exits 0 or writes a passing receipt');
assertEq(passReceipt.schema, 'holoscript.platform-live-service-receipt.v1', 'schema');
assertEq(passReceipt.ok, true, 'receipt ok');
assertEq(passReceipt.safety.usesApiKey, false, 'does not use API key');
assertEq(passReceipt.safety.usesWalletPrivateKey, false, 'does not use wallet private key');
assertEq(passReceipt.safety.executesPayment, false, 'does not execute payment');
assertOk(passReceipt.probes.every((probe) => probe.ok === true), 'all probes passed');
assertOk(!readFileSync(passOut, 'utf8').includes('nonce-test-123456'), 'raw nonce not leaked');
await passServer.close();
rmSync(tmp1, { recursive: true, force: true });

console.log('Test 2: secret-shaped challenge response fails closed');
const leakServer = await withServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    writeJson(res, 200, { status: 'ok', tools: 3 });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/holomesh/register/challenge') {
    const body = await readJson(req);
    writeJson(res, 200, {
      success: true,
      challenge: { walletAddress: body.wallet_address, domain: 'HoloMesh Registration' },
      nonce: 'nonce-test-123456',
      expires_in: 300,
      private_key: '0x' + 'a'.repeat(64),
    });
    return;
  }
  writeJson(res, 404, { error: 'not found' });
});

const tmp2 = mkdtempSync(join(tmpdir(), 'platform-live-service-'));
const leakOut = join(tmp2, 'receipt.json');
const leakRun = await run(leakServer.endpoint, leakOut);
const leakReceipt = JSON.parse(readFileSync(leakOut, 'utf8'));
assertOk(leakRun.status !== 0 || leakReceipt.ok === false, 'secret leak exits nonzero or writes a failing receipt');
assertEq(leakReceipt.ok, false, 'leak receipt fails');
assertOk(
  leakReceipt.probes.some((probe) => probe.secretLeakFindings?.some((finding) => finding.path.includes('private_key'))),
  'secret-shaped key is reported'
);
await leakServer.close();
rmSync(tmp2, { recursive: true, force: true });

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
