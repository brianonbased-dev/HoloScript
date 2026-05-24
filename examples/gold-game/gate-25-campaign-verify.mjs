#!/usr/bin/env node
// THE GOLD GAME — Gate 25: continuous campaign.
//
// Proves the game does not dead-end at one graduation: a persistent campaign with
// a quest log, a win condition (One Climb), post-win continuation that surfaces the
// next ratchet, and save/resume across reload.
//
// Anti-F.069: this does NOT grep the build for strings and call it done. It IMPORTS
// the SAME pure state machine the build bundles (`gold-game-campaign.mjs`) and asserts
// observable STATE DELTAS — a graduation that did not happen produces no progress, a
// save round-trips, a corrupt save degrades cleanly. The build-embedding checks only
// confirm the proven state machine is actually wired into the artifact + receipt.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as C from './gold-game-campaign.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const build = join(here, 'drive-build', 'index.html');
const source = join(here, 'drive-build.mjs');
const receiptPath = join(here, 'GOLD-VAULT-gate1-receipt.json');

const checks = [];
const ok = (name, pass, detail = '') => checks.push({ name, pass: Boolean(pass), detail });
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

// ── A. STATE-MACHINE DELTAS (the real proof — exercise the same module the build uses) ──

// A1. Fresh campaign starts with zero progress.
const s = C.initCampaign();
ok('fresh campaign: nothing graduated', s.graduatedIds.length === 0 && !s.oneClimbComplete && !s.campaignComplete);
ok('fresh campaign: 4 open quests', s.questLog.length === 4 && s.questLog.every((q) => !q.done));
ok('fresh objective is One Climb', C.currentObjective(s)?.id === 'one-climb');

// A2. A real graduation flips One Climb (an observable delta), not before.
const r1 = C.recordGraduation(s, 'W.GOLD.001');
ok('first graduation counts as new', r1.countedNew === true && r1.graduated === 1);
ok('first graduation wins One Climb (delta)', r1.oneClimbJustWon === true && s.oneClimbComplete === true);
ok('one-climb quest now done', s.questLog.find((q) => q.id === 'one-climb').done === true);
ok('objective advanced off One Climb', C.currentObjective(s)?.id !== 'one-climb');

// A3. Idempotency — re-graduating the same id is NOT new progress.
const rDup = C.recordGraduation(s, 'W.GOLD.001');
ok('re-graduate same id: no double-count', rDup.countedNew === false && s.graduatedIds.length === 1);

// A4. Three Summits only after three DISTINCT real graduations.
ok('three-summits NOT done at 1', s.questLog.find((q) => q.id === 'three-summits').done === false);
C.recordGraduation(s, 'W.GOLD.002');
C.recordGraduation(s, 'W.GOLD.003');
ok('three-summits done at 3 distinct', s.questLog.find((q) => q.id === 'three-summits').done === true && s.graduatedIds.length === 3);

// A5. Read-record + lineage-walk are real-action quests; campaign completes only when ALL done.
ok('campaign NOT complete before all quests', s.campaignComplete === false);
ok('read-record flips on first inspect', C.setQuestDone(s, 'read-record') === true && C.setQuestDone(s, 'read-record') === false);
const lineageJustCompleted = C.setQuestDone(s, 'lineage-walk');
ok('lineage-walk completes the campaign (delta)', lineageJustCompleted === true && s.campaignComplete === true);
ok('post-win surfaces the next ratchet', s.nextRatchet === C.NEXT_RATCHET && /Gate 26/.test(s.nextRatchet));
ok('objective null once complete', C.currentObjective(s) === null);

// A6. SAVE / RESUME — serialize then deserialize reproduces progress exactly.
const saved = C.serialize(s);
const resumed = C.deserialize(saved);
ok('resume restores graduated ids', resumed.graduatedIds.length === 3 && resumed.graduatedIds.includes('W.GOLD.002'));
ok('resume restores quest completion', resumed.questLog.every((q) => q.done) && resumed.campaignComplete === true);
ok('resume marks resumable progress', C.hasResumableProgress(resumed) === true);
ok('a never-played campaign is NOT resumable', C.hasResumableProgress(C.initCampaign()) === false);

// A7. Resilience — corrupt / wrong-version saves degrade to a clean campaign, never throw.
ok('corrupt save -> clean init', C.deserialize('{not json').graduatedIds.length === 0);
ok('wrong-version save -> clean init', C.deserialize(JSON.stringify({ version: 99, graduatedIds: ['x'] })).graduatedIds.length === 0);
ok('blank save -> clean init', C.deserialize('').oneClimbComplete === false);

// ── B. BUILD WIRING (confirm the proven machine is actually IN the artifact) ──
const html = read(build);
const src = read(source);
ok('build imports the SAME pure campaign module', src.includes("from '../gold-game-campaign.mjs'"));
ok('bundle embeds campaign quest ids', html.includes('one-climb') && html.includes('three-summits') && html.includes('lineage-walk'));
ok('build exposes a quest log panel', html.includes('id="questPanel"') && html.includes('data-gate25="quest-log"'));
ok('build exposes save/resume affordance', html.includes('id="continueRun"') && html.includes('gold-game-resume'));
ok('build exposes post-win continuation', html.includes('id="winBanner"') && html.includes('data-gate25="post-win"'));
ok('build wires real graduation -> campaign', src.includes('recordGraduation(g.userData.entryId') && src.includes('Campaign.recordGraduation'));
ok('build emits live campaign state to UI', html.includes('gold-game-state') && src.includes("CustomEvent('gold-game-state'"));

// ── C. RECEIPT ──
const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : {};
const cc = receipt.continuousCampaign || {};
ok('receipt records Gate 25', cc.enabled === true && cc.gate === 25);
ok('receipt names the save key', cc.saveKey === C.CAMPAIGN_KEY);
ok('receipt names the next ratchet', /Gate 26/.test(cc.nextRatchet || ''));

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log((c.pass ? 'PASS ' : 'FAIL ') + c.name + (c.detail ? ' — ' + c.detail : ''));
console.log('\n' + (checks.length - failed.length) + '/' + checks.length + ' checks passed');
if (failed.length) {
  console.error('Gate 25 FAILED: ' + failed.map((c) => c.name).join(', '));
  process.exit(1);
}
console.log('Gate 25 PASS — continuous campaign: quest log + One Climb win + post-win next-ratchet + save/resume, all proven by state deltas on the same module the build runs.');
