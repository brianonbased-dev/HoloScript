#!/usr/bin/env node
/**
 * Starts an ephemeral Verdaccio mirror and proves the registry cold-start gate
 * can parse, validate, and compile using only that mirror URL.
 */

import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const packageIdx = args.indexOf('--package');
const outIdx = args.indexOf('--out');
const portIdx = args.indexOf('--port');
const verdaccioIdx = args.indexOf('--verdaccio-version');
const JSON_OUT = args.includes('--json');
const KEEP_TEMP = args.includes('--keep-temp');
const PACKAGE_SPEC = packageIdx >= 0 ? args[packageIdx + 1] : '@holoscript/core@latest';
const OUT_PATH = outIdx >= 0 ? resolve(args[outIdx + 1]) : null;
const REQUESTED_PORT = portIdx >= 0 ? Number(args[portIdx + 1]) : 0;
const VERDACCIO_VERSION = verdaccioIdx >= 0 ? args[verdaccioIdx + 1] : '6';
const NPX_BIN = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const here = dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = join(here, 'check-registry-cold-start.mjs');

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function freePort() {
  if (REQUESTED_PORT > 0) return Promise.resolve(REQUESTED_PORT);
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => (port ? resolvePort(port) : reject(new Error('No free port'))));
    });
  });
}

function ping(url) {
  return new Promise((resolvePing) => {
    const req = get(`${url}/-/ping`, (res) => {
      res.resume();
      resolvePing(res.statusCode && res.statusCode < 500);
    });
    req.on('error', () => resolvePing(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolvePing(false);
    });
  });
}

async function waitForRegistry(url, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`verdaccio exited early with code ${child.exitCode}`);
    }
    if (await ping(url)) return;
    await sleep(750);
  }
  throw new Error(`timed out waiting for ${url}`);
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      return;
    } catch {
      // Fall through to direct kill.
    }
  }
  child.kill('SIGTERM');
}

function writeVerdaccioConfig(path, storage) {
  writeFileSync(
    path,
    `storage: ${storage}
uplinks:
  npmjs:
    url: https://registry.npmjs.org/
packages:
  '@holoscript/*':
    access: $all
    publish: $authenticated
    proxy: npmjs
  '@*/*':
    access: $all
    publish: $authenticated
    proxy: npmjs
  '**':
    access: $all
    publish: $authenticated
    proxy: npmjs
logs:
  - {type: stdout, format: pretty, level: http}
`
  );
}

function augmentReceipt(path, details) {
  if (!path || !existsSync(path)) return null;
  const receipt = JSON.parse(readFileSync(path, 'utf8'));
  receipt.mirrorProof = {
    schema: 'holoscript.registry-mirror-proof.v1',
    generatedAt: new Date().toISOString(),
    registryUrl: details.registryUrl,
    verdaccioVersionSpec: details.verdaccioVersionSpec,
    publicFallbackDisabled: true,
    clientPolicy: 'npm --registry mirror-url; no client public fallback',
  };
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function main() {
  const temp = mkdtempSync(join(tmpdir(), 'hs-registry-mirror-proof-'));
  const storage = join(temp, 'storage');
  const config = join(temp, 'verdaccio.yaml');
  const logs = [];
  let child = null;

  try {
    mkdirSync(storage, { recursive: true });
    writeVerdaccioConfig(config, storage);
    const port = await freePort();
    const registryUrl = `http://127.0.0.1:${port}`;
    const verdaccioArgs = [
      '-y',
      `verdaccio@${VERDACCIO_VERSION}`,
      '--config',
      config,
      '--listen',
      `127.0.0.1:${port}`,
    ];
    child =
      process.platform === 'win32'
        ? spawn(
            process.env.ComSpec || 'cmd.exe',
            [
              '/d',
              '/s',
              '/c',
              `${NPX_BIN} -y verdaccio@${VERDACCIO_VERSION} --config ${config.replace(/\\/gu, '/')} --listen 127.0.0.1:${port}`,
            ],
            { stdio: ['ignore', 'pipe', 'pipe'] }
          )
        : spawn(NPX_BIN, verdaccioArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk) => logs.push(String(chunk)));
    child.stderr.on('data', (chunk) => logs.push(String(chunk)));

    await waitForRegistry(registryUrl, child);

    const checkArgs = [
      CHECK_SCRIPT,
      '--package',
      PACKAGE_SPEC,
      '--registry',
      registryUrl,
      '--disable-public-fallback',
    ];
    if (OUT_PATH) checkArgs.push('--out', OUT_PATH);
    if (JSON_OUT) checkArgs.push('--json');

    const output = execFileSync(process.execPath, checkArgs, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        npm_config_registry: registryUrl,
        NPM_CONFIG_REGISTRY: registryUrl,
        HOLOSCRIPT_PACKAGE_PUBLIC_FALLBACK: '0',
      },
      timeout: 240_000,
    });

    const receipt = augmentReceipt(OUT_PATH, {
      registryUrl,
      verdaccioVersionSpec: `verdaccio@${VERDACCIO_VERSION}`,
    });

    if (JSON_OUT && receipt) {
      console.log(JSON.stringify(receipt, null, 2));
    } else if (output.trim()) {
      console.log(output.trimEnd());
    }
  } catch (error) {
    const detail = logs.join('').slice(-4000);
    console.error(`[registry-mirror-proof] FAIL: ${error.message}`);
    if (detail) console.error(detail);
    process.exitCode = 1;
  } finally {
    killTree(child);
    if (!KEEP_TEMP) rmSync(temp, { recursive: true, force: true });
  }
}

main();
