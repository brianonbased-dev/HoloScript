#!/usr/bin/env node
// THE GOLD GAME — Gate 36: HoloScript package toolset consumption.
//
// Proves the game build consumes HoloScript packages as named game systems,
// sourced from package.json metadata and visible in the offline HTML.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(
  process.env.HOLOSCRIPT_REPO || process.env.HOLOSCRIPT_ROOT || join(here, '..', '..')
);
const build = join(here, 'drive-build', 'index.html');
const receiptPath = join(here, 'GOLD-VAULT-gate1-receipt.json');
const sourcePath = join(here, 'drive-build.mjs');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });
const text = (path) => (existsSync(path) ? readFileSync(path, 'utf8') : '');
const json = (path) => JSON.parse(text(path));

const html = text(build);
const source = text(sourcePath);
const receipt = json(receiptPath);
const toolset = receipt.holoscriptToolset || {};
const systems = toolset.systems || [];
const requiredDirs = [
  'core',
  'engine',
  'mcp-server',
  'mesh',
  'crdt',
  'crdt-spatial',
  'holoembed',
  'absorb-service',
  'holomap',
  'hologram-worker',
  'r3f-renderer',
  'spatial-index',
  'snn-webgpu',
  'security-sandbox',
  'secrets-broker',
  'studio',
  'compiler-wasm',
  'holo-vm',
  'runtime',
  'agent-protocol',
];

ok('receipt records Gate 36', toolset.enabled === true && toolset.gate === 36);
ok(
  'enough package systems are mapped',
  systems.length >= requiredDirs.length,
  String(systems.length)
);
ok(
  'all required package dirs are present in receipt',
  requiredDirs.every((dir) => systems.some((s) => s.dir === dir))
);
ok(
  'no selected package is missing',
  Array.isArray(toolset.missing) && toolset.missing.length === 0
);
for (const dir of requiredDirs) {
  ok(`package.json exists for ${dir}`, existsSync(join(repo, 'packages', dir, 'package.json')));
}
ok('offline HTML embeds toolset JSON', html.includes('window.__GOLD_GAME_TOOLSET__='));
ok(
  'offline HTML exposes toolset panel',
  html.includes('data-gate36="holoscript-toolset"') && html.includes('id="toolsetList"')
);
ok(
  'source reads package.json metadata',
  source.includes("join(repo, 'packages', dir, 'package.json')")
);
ok(
  'source maps HoloGram and HoloMap to the corrected roles',
  source.includes('HoloGram render') && source.includes('Scanned spaces')
);
ok(
  'toolset includes kitchen-sink roles',
  [
    'HoloGate',
    'Shared state',
    'HoloGraph recall',
    'Scanned spaces',
    'HoloGram render',
    'Agent cognition',
    'Capabilities',
  ].every((role) => systems.some((s) => s.role === role))
);

const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}
if (failed.length) {
  console.error('\nGate 36 failed: ' + failed.map((c) => c.name).join(', '));
  process.exit(1);
}
console.log('\nGate 36 PASS — HoloScript packages are consumed as visible GOLD game systems.');
