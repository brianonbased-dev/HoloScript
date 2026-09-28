#!/usr/bin/env node
/**
 * Dist smoke for the .hsplus Rust type checker.
 *
 * Builds are not run here. First:
 *   pnpm --filter @holoscript/core build
 * Then:
 *   pnpm check:hsplus-rust-checker-dist
 *
 * The check packs @holoscript/core and @holoscript/wasm the way publish does,
 * extracts those tarballs into a fresh directory, and imports the parser from
 * the packed dist (not from src). A well-typed function must pass. An
 * ill-typed function must fail with the Rust checker's HS-TYPE-RETURN-001,
 * not with HS-CHECK "could not be loaded".
 */
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..', '..');
const coreDir = join(repoRoot, 'packages', 'core');
const wasmDir = join(repoRoot, 'packages', 'compiler-wasm');
const parserDist = join(coreDir, 'dist', 'parser.js');

const WELL_TYPED = 'function add(left: i32, right: i64): i64 {\n  return left + right\n}\n';
const ILL_TYPED = 'function add(left: i32, right: i64): i64 {\n  return left\n}\n';

function fail(message) {
  console.error(`[hsplus-rust-checker-dist] FAIL: ${message}`);
  process.exit(1);
}

function pack(packageDir, destination) {
  const stdout = execFileSync('pnpm', ['pack', '--pack-destination', destination], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = stdout
    .trim()
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .pop();
  if (!line) fail(`pnpm pack in ${packageDir} printed no tarball name`);
  const tarball = line.startsWith('/') ? line : join(destination, line);
  if (!existsSync(tarball)) fail(`packed tarball is missing: ${tarball}`);
  return tarball;
}

function listTarball(tarball) {
  return execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function extractPackage(tarball, destination) {
  const staging = mkdtempSync(join(tmpdir(), 'hsplus-checker-pack-'));
  try {
    execFileSync('tar', ['-xzf', tarball, '-C', staging], { stdio: 'ignore' });
    const packedRoot = join(staging, 'package');
    if (!existsSync(packedRoot)) fail(`tarball ${tarball} has no package/ root`);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(packedRoot, destination, { recursive: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (!existsSync(parserDist)) {
  fail(
    `missing ${parserDist}. Build first: pnpm --filter @holoscript/core build`
  );
}

const work = mkdtempSync(join(tmpdir(), 'hsplus-checker-dist-'));
const packs = join(work, 'packs');
mkdirSync(packs);

let coreTarball;
let wasmTarball;
try {
  wasmTarball = pack(wasmDir, packs);
  coreTarball = pack(coreDir, packs);
} catch (error) {
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
  fail(`pnpm pack failed: ${error instanceof Error ? error.message : String(error)}\n${stderr}`);
}

const wasmEntries = listTarball(wasmTarball);
const coreEntries = listTarball(coreTarball);
const wasmGlue = 'package/pkg-node/holoscript_wasm.js';
const wasmBinary = 'package/pkg-node/holoscript_wasm_bg.wasm';
const coreParser = 'package/dist/parser.js';
for (const required of [wasmGlue, wasmBinary]) {
  if (!wasmEntries.includes(required)) {
    fail(`${wasmTarball} does not publish ${required}`);
  }
}
if (!coreEntries.includes(coreParser)) {
  fail(`${coreTarball} does not publish ${coreParser}`);
}

const consumer = join(work, 'consumer');
const consumerModules = join(consumer, 'node_modules');
const installedCore = join(consumerModules, '@holoscript', 'core');
const installedWasm = join(consumerModules, '@holoscript', 'wasm');
// The packed core bundle externalizes other workspace packages. Link those
// from this checkout so the consumer can import the parser. core and wasm
// themselves are the packed tarballs, not links back into the source tree.
const repoModules = join(repoRoot, 'node_modules');
mkdirSync(join(consumerModules, '@holoscript'), { recursive: true });
for (const name of readdirSync(repoModules)) {
  if (name === '.bin' || name === '@holoscript') continue;
  symlinkSync(join(repoModules, name), join(consumerModules, name));
}
const repoScoped = join(repoModules, '@holoscript');
if (existsSync(repoScoped)) {
  for (const name of readdirSync(repoScoped)) {
    if (name === 'core' || name === 'wasm') continue;
    symlinkSync(join(repoScoped, name), join(consumerModules, '@holoscript', name));
  }
}
extractPackage(coreTarball, installedCore);
extractPackage(wasmTarball, installedWasm);

const packedCore = JSON.parse(readFileSync(join(installedCore, 'package.json'), 'utf8'));
const wasmDep = packedCore.dependencies?.['@holoscript/wasm'];
if (typeof wasmDep !== 'string' || wasmDep.startsWith('workspace:') || wasmDep.startsWith('file:')) {
  fail(`packed @holoscript/core dependency on @holoscript/wasm is ${JSON.stringify(wasmDep)}`);
}

const smokePath = join(consumer, 'smoke.mjs');
writeFileSync(
  smokePath,
  `import { createRequire } from 'node:module';
import { parse } from '@holoscript/core/parser';

const wellTyped = ${JSON.stringify(WELL_TYPED)};
const illTyped = ${JSON.stringify(ILL_TYPED)};
const require = createRequire(import.meta.resolve('@holoscript/core/parser'));
const wasmPath = require.resolve(['@holoscript', 'wasm', 'node'].join('/'));
const good = parse(wellTyped);
const bad = parse(illTyped);
const goodMessage = (good.errors ?? []).map((error) => error.message).join('\\n');
const badMessage = (bad.errors ?? []).map((error) => error.message).join('\\n');
const proof = {
  wasmPath,
  wellTypedSuccess: good.success === true,
  wellTypedMessage: goodMessage,
  illTypedSuccess: bad.success === true,
  illTypedMessage: badMessage,
};
process.stdout.write(JSON.stringify(proof) + '\\n');
`
);

let proof;
try {
  const stdout = execFileSync(process.execPath, [smokePath], {
    cwd: consumer,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const line = stdout
    .trim()
    .split('\n')
    .filter((entry) => entry.startsWith('{'))
    .pop();
  proof = JSON.parse(line ?? '');
} catch (error) {
  const stderr = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : '';
  const stdout = error && typeof error === 'object' && 'stdout' in error ? String(error.stdout) : '';
  fail(`consumer import failed\n${stdout}\n${stderr}`);
}

const consumerWasm = realpathSync(join(installedWasm, 'pkg-node', 'holoscript_wasm.js'));
if (realpathSync(proof.wasmPath) !== consumerWasm) {
  fail(`checker resolved ${proof.wasmPath}, expected the packed copy ${consumerWasm}`);
}
if (!proof.wellTypedSuccess) {
  fail(`well-typed function was rejected: ${proof.wellTypedMessage}`);
}
if (proof.wellTypedMessage.includes('could not be loaded')) {
  fail(`well-typed function could not load the checker: ${proof.wellTypedMessage}`);
}
if (proof.illTypedSuccess) {
  fail('ill-typed function was accepted');
}
if (!proof.illTypedMessage.includes('HS-TYPE-RETURN-001')) {
  fail(`ill-typed function did not get the Rust checker error: ${proof.illTypedMessage}`);
}
if (proof.illTypedMessage.includes('could not be loaded')) {
  fail(`ill-typed function could not load the checker: ${proof.illTypedMessage}`);
}

console.log('[hsplus-rust-checker-dist] PASS');
console.log(`consumer: ${consumer}`);
console.log(`wasm: ${proof.wasmPath}`);
console.log(`well-typed: success`);
console.log(`ill-typed: ${proof.illTypedMessage.split('\n')[0]}`);
rmSync(work, { recursive: true, force: true });
