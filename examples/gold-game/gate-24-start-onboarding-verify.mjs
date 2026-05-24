#!/usr/bin/env node
// THE GOLD GAME — Gate 24: start-of-game onboarding.
//
// Proves the player-facing build has a real beginning: a founder-supplied art
// vista, visible first objective, retry path, and JS events that drop the player
// into the first-person run.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const asset = join(here, 'assets', 'gold-vault-vista-wlNgg.jpg');
const build = join(here, 'drive-build', 'index.html');
const receiptPath = join(here, 'GOLD-VAULT-gate1-receipt.json');
const source = join(here, 'drive-build.mjs');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });
const read = (path) => existsSync(path) ? readFileSync(path) : null;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

const assetBytes = read(asset);
const htmlBytes = read(build);
const receiptBytes = read(receiptPath);
const sourceBytes = read(source);
const html = htmlBytes ? htmlBytes.toString('utf8') : '';
const sourceText = sourceBytes ? sourceBytes.toString('utf8') : '';
const receipt = receiptBytes ? JSON.parse(receiptBytes.toString('utf8')) : {};
const assetHash = assetBytes ? hash(assetBytes) : '';

ok('concept art asset exists', assetBytes && assetBytes.length > 250000, asset);
ok('concept art hash recorded', receipt.startOnboarding?.openingVista?.sha256 === assetHash, assetHash);
ok('offline HTML embeds the concept art data URL', html.includes('window.__GOLD_GAME_CONCEPT_ART__="data:image/jpeg;base64,'), 'embedded, not loose-linked');
ok('start screen exists', html.includes('id="startScreen"') && html.includes('data-gate24="start-onboarding"'));
ok('first objective visible in game UI', html.includes('First objective:') && html.includes('Graduate one glowing entry'));
ok('retry path visible in game UI', html.includes('id="retryStart"') && html.includes('Return to Overlook'));
ok('begin event enters the game', html.includes("new CustomEvent('gold-game-start')") && sourceText.includes("window.addEventListener('gold-game-start'"));
ok('retry event resets the player', html.includes("new CustomEvent('gold-game-reset-to-overlook')") && sourceText.includes('resetToOverlook()'));
ok('receipt records Gate 24', receipt.startOnboarding?.enabled === true && receipt.startOnboarding?.gate === 24);

const failed = checks.filter((c) => !c.pass);
for (const c of checks) {
  console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
}
if (failed.length) {
  console.error('\nGate 24 failed: ' + failed.map((c) => c.name).join(', '));
  process.exit(1);
}
console.log('\nGate 24 PASS — opening art vista, first objective, and retry path are in the playable build.');
