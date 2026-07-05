#!/usr/bin/env node
/**
 * Verifies that @holoscript/holollama's built package surface can be consumed
 * by laptop, Jetson, and Vast lanes before npm publish.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const PACKAGE_DIR = join(ROOT, 'packages', 'holollama');
const BIN = join(PACKAGE_DIR, 'bin', 'holollama.cjs');
const PACK_DIR = join(ROOT, '.scratch', 'holollama-consumption-pack');
const NODE = process.execPath;
const TAR = process.platform === 'win32' ? 'tar.exe' : 'tar';

const REQUIRED_FILES = [
  'bin/holollama.cjs',
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/brain.js',
  'dist/brain.cjs',
  'dist/brain.d.ts',
  'dist/cli.js',
];

const EXPECTED_PROFILES = ['jetson-orin', 'laptop-windows', 'vast-linux-gpu'];
const EXPECTED_CONSUMERS = new Map([
  ['jetson-orin', 'jetson'],
  ['laptop-windows', 'laptop'],
  ['vast-linux-gpu', 'vast'],
]);

function run(args) {
  return execFileSync(NODE, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runProcess(command, args, cwd = ROOT) {
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runPnpm(args, cwd = ROOT) {
  if (process.platform !== 'win32') return runProcess('corepack', ['pnpm', ...args], cwd);
  return runProcess(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', ['corepack', 'pnpm', ...args].join(' ')], cwd);
}

function parseCliJson(args) {
  return JSON.parse(run(args));
}

function fail(message) {
  console.error(`[holollama-consumption] FAIL: ${message}`);
  process.exit(1);
}

for (const file of REQUIRED_FILES) {
  if (!existsSync(join(PACKAGE_DIR, file))) fail(`required built artifact missing: ${file}`);
}

const api = await import(pathToFileURL(join(PACKAGE_DIR, 'dist', 'index.js')).href);
const doctor = api.doctorHoloLlamaProfiles({ generatedAt: '2026-07-05T00:00:00.000Z' });
if (doctor.schema !== 'holollama.doctor.v1') fail(`unexpected doctor schema: ${doctor.schema}`);
if (!doctor.ok) fail(`doctor API reported blockers: ${JSON.stringify(doctor.profiles)}`);

const profileIds = doctor.profiles.map((profile) => profile.profile);
for (const expected of EXPECTED_PROFILES) {
  if (!profileIds.includes(expected)) fail(`doctor API omitted profile ${expected}`);
}
for (const profile of doctor.profiles) {
  if (EXPECTED_CONSUMERS.get(profile.profile) !== profile.consumer) {
    fail(`${profile.profile} maps to ${profile.consumer}, expected ${EXPECTED_CONSUMERS.get(profile.profile)}`);
  }
}

const cliDoctor = parseCliJson(['doctor', '--json']);
if (!cliDoctor.ok) fail(`doctor CLI reported blockers: ${JSON.stringify(cliDoctor.profiles)}`);

const cliProfiles = parseCliJson(['profiles']);
for (const expected of EXPECTED_PROFILES) {
  if (!cliProfiles.some((profile) => profile.id === expected)) fail(`profiles CLI omitted ${expected}`);
}

const brainSelection = parseCliJson([
  'brain',
  '--task',
  'Design a multiplayer quest with dialogue and synchronization.',
  '--device',
  'vast',
  '--json',
]);
if (brainSelection.selectedConsumerProfile?.id !== 'vast-sovereign-overflow') {
  fail(`Brain CLI did not route Vast device to vast-sovereign-overflow`);
}

rmSync(PACK_DIR, { recursive: true, force: true });
mkdirSync(PACK_DIR, { recursive: true });
const packOutput = runPnpm(['pack', '--pack-destination', PACK_DIR], PACKAGE_DIR);
const tarballLine = packOutput.trim().split(/\r?\n/).filter(Boolean).at(-1);
if (!tarballLine) fail('pnpm pack did not return a tarball path');
const tarball = resolve(PACKAGE_DIR, tarballLine);
const packedManifest = JSON.parse(runProcess(TAR, ['-xOf', tarball, 'package/package.json'], PACKAGE_DIR));
const coreDependency = packedManifest.dependencies?.['@holoscript/core'];
if (typeof coreDependency !== 'string' || coreDependency.startsWith('workspace:')) {
  fail(`packed manifest has non-publishable @holoscript/core dependency: ${String(coreDependency)}`);
}

console.log('[holollama-consumption] PASS: built API and CLI are consumable by laptop, Jetson, and Vast lanes.');
