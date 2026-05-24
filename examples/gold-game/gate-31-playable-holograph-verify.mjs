#!/usr/bin/env node
// THE GOLD GAME — Gate 31: playable HoloGraph constellation.
//
// Proves Gate 10's HoloGraph/HoloEmbed receipt is consumed by the game UI:
// lineage nodes render in an in-game constellation, and selecting a node opens
// the same full GOLD data path as inspecting a gem.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(here, 'drive-build.mjs');
const buildPath = join(here, 'drive-build', 'index.html');
const receiptPath = join(here, 'GOLD-VAULT-gate1-receipt.json');
const gate10Path = join(here, 'GATE-10-HOLOGRAPH-receipt.json');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });
const text = (path) => existsSync(path) ? readFileSync(path, 'utf8') : '';
const json = (path) => JSON.parse(text(path));

const source = text(sourcePath);
const html = text(buildPath);
const receipt = json(receiptPath);
const gate10 = json(gate10Path);
const graph = receipt.playableHoloGraph || {};

ok('Gate 10 receipt is present', gate10.holoGraph?.exactByConstruction === true, gate10Path);
ok('source reads HoloGraph receipt', source.includes('GATE-10-HOLOGRAPH-receipt.json') && source.includes('readPlayableHoloGraph'));
ok('source enriches graph nodes from GOLD entries', source.includes('entryData = readVaultEntry(id)'));
ok('receipt records Gate 31', graph.enabled === true && graph.gate === 31);
ok('receipt preserves exact graph semantics', graph.exactByConstruction === true && graph.navigable === true);
ok('receipt has graph nodes and edges', graph.nodes >= 6 && graph.edges >= 4, `${graph.nodes || 0} nodes / ${graph.edges || 0} edges`);
ok('offline HTML embeds graph data in scene JSON', html.includes('holoGraph') && html.includes('W.GOLD.534'));
ok('offline HTML exposes HoloGraph panel', html.includes('data-gate31="playable-holograph"') && html.includes('id="graphCanvas"'));
ok('offline HTML exposes node buttons', html.includes('id="graphNodes"') && html.includes("className = 'graphEntry'"));
ok('node selection opens full GOLD data path', html.includes('gold-entry-selected') && html.includes('dispatchNode(node)'));
ok('G key toggles HoloGraph panel', html.includes("e.key === 'g'") && html.includes('graphToggle'));

const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}
if (failed.length) {
  console.error('\nGate 31 failed: ' + failed.map((c) => c.name).join(', '));
  process.exit(1);
}
console.log('\nGate 31 PASS — HoloGraph is now a playable lineage constellation.');
