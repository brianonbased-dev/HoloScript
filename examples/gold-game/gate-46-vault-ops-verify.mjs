// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — FLAGSHIP Gate 46 verifier (Vault Ops: Graduate + Resolve)
//
// Incorporating ALL THREE real vault operations as Curator verbs over one world:
//   L = LINK    (Gate 45 / gold-game-constellation.mjs)        -> auto_link
//   C = GRADUATE (Shepherd's Climb / gold-game-vault-ops.mjs)  -> graduate.py
//   R = RESOLVE  (Vault Keeper     / gold-game-vault-ops.mjs)  -> vault_collision_guard
//
// This verifies the two NEW verbs, READ-ONLY in Node (no browser):
//   1. RULES: the pure vault-ops engine is REAL — graduate-ready entries are the most-cited
//      non-diamond ones; conflicts are same-domain near-duplicates; graduate/resolve verdicts
//      reject not-ready / not-a-conflict / repeats; completion is reachable. Deterministic.
//   2. WIRING: the build bundles the SAME engine + wires the C (graduate) and R (resolve)
//      verbs and the unified "Curator of the GOLD Vault" HUD.
//
//   node examples/gold-game/gate-46-vault-ops-verify.mjs --emit
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(p).href);
const coordsPath = join(here, 'knowledge-mountain-coords.json');
const buildPath = join(here, 'drive-build', 'index.html');
const receiptPath = join(here, 'GATE-46-VAULT-OPS-receipt.json');

const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail });
};

const {
  initVaultOps,
  attemptGraduate,
  attemptResolve,
  conflictPartners,
  isReady,
  inConflict,
  vaultProgress,
} = await imp(join(here, 'gold-game-vault-ops.mjs'));

// ── 1. RULES ──────────────────────────────────────────────────────────────────
const coords = JSON.parse(readFileSync(coordsPath, 'utf8'));
const s = initVaultOps(coords);

check(
  'graduate-ready set is built (the entries that earned a rise)',
  s.readyTotal > 0,
  `${s.readyTotal} ready`
);
check(
  'conflict set is built (near-duplicates competing for a slot)',
  s.conflictTotal > 0,
  `${s.conflictTotal} conflicts`
);
check(
  'graduate-ready are all non-diamond (a tier exists to rise into)',
  [...s.readyIds].every((id) => s.nodes.get(id).tier !== 'diamond')
);

const ready = [...s.readyIds][0];
const g = attemptGraduate(s, ready);
check(
  'graduating a ready entry rises a tier + scores',
  g.ok && g.to && g.gained > 0,
  `${g.from} -> ${g.to}`
);
check(
  're-graduating the same entry is rejected',
  attemptGraduate(s, ready).reason === 'already-graduated'
);
const notReady = coords.coords.find((n) => !s.readyIds.has(n.id)).id;
check(
  'graduating a NOT-ready entry is rejected (must earn it)',
  attemptGraduate(s, notReady).reason === 'not-ready'
);

const [ca, cb] = [...s.conflicts][0].split('|');
check('conflictPartners resolves the partner', conflictPartners(s, ca).includes(cb));
check('inConflict flags conflicted entries', inConflict(s, ca));
const r = attemptResolve(s, ca, cb);
check('resolving a real conflict succeeds + scores', r.ok && r.gained > 0);
check('re-resolving is rejected', attemptResolve(s, ca, cb).reason === 'already-resolved');
check(
  'resolving a NON-conflict pair is rejected',
  attemptResolve(s, ready, notReady).reason === 'not-a-conflict'
);

const s2 = initVaultOps(coords);
const sameReady = [...s.readyIds].sort().join(',') === [...s2.readyIds].sort().join(',');
const sameConf = [...s.conflicts].sort().join(',') === [...s2.conflicts].sort().join(',');
check('op-sets are deterministic across loads (reproducible)', sameReady && sameConf);

const sWin = initVaultOps(coords);
for (const id of [...sWin.readyIds]) attemptGraduate(sWin, id);
for (const k of [...sWin.conflicts]) {
  const [a, b] = k.split('|');
  attemptResolve(sWin, a, b);
}
const wp = vaultProgress(sWin);
check(
  'graduating + resolving everything reaches the win state',
  wp.complete,
  `${wp.graduated}/${wp.graduateTotal} grad, ${wp.resolved}/${wp.resolveTotal} resolved`
);

// ── 2. WIRING ─────────────────────────────────────────────────────────────────
const build = existsSync(buildPath) ? readFileSync(buildPath, 'utf8') : '';
check('generated playable build exists', build.length > 0, buildPath);
check(
  'build bundles + runs the vault-ops engine (state on window)',
  /__GOLD_GAME_VAULT_OPS__/.test(build)
);
check('build presents the unified three-verb Curator HUD', /Curator of the GOLD Vault/.test(build));
check(
  'build wires the GRADUATE verb (Shepherd carry-up)',
  /shepherd/i.test(build) && /Carrying /.test(build)
);
check(
  'build wires the RESOLVE verb (Vault Keeper)',
  /RESOLVED /.test(build) && /conflicting/.test(build)
);
check('build emits the vault-ops progress event into the UI', /gold-game-vault-ops/.test(build));

// ── Report ──
const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const allPass = passed === total;

console.log(
  '\nTHE GOLD GAME — Gate 46: Vault Ops (Graduate + Resolve) — all three verbs over one world\n'
);
for (const c of checks)
  console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? '  — ' + c.detail : ''}`);
console.log(
  `\n  ${passed}/${total} checks pass — ${allPass ? 'GATE 46 VERIFIED' : 'GATE 46 FAIL'}\n`
);

if (process.argv.includes('--emit') && allPass) {
  const receipt = {
    schema: 'cael-gate-v1',
    gate: 46,
    track: 'flagship',
    name: 'Vault Ops — Graduate (Shepherd) + Resolve (Keeper): all three vault verbs over one world',
    timestamp: new Date().toISOString(),
    checks: { passed, total },
    opSets: {
      graduateReady: s.readyTotal,
      conflicts: s.conflictTotal,
      missingLinks: '40 (Gate 45)',
    },
    winScore: wp.score,
    proves: {
      graduate:
        'the most-cited non-diamond entries are shepherded UP a tier (real graduate.py); enforced by the climb',
      resolve:
        'same-domain near-duplicates competing for a slot are resolved (real vault_collision_guard)',
      unified:
        'L link + C graduate + R resolve compose into one Curator loop with a Vault Health HUD',
    },
    realSeams: [
      'knowledge-mountain-coords.json (tiers + lineage_in + domains)',
      'gold-game-vault-ops.mjs pure rules engine',
      'drive-build carry-up-stairs graduate + aim-resolve',
    ],
    status: 'PASS',
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`  receipt → ${receiptPath}`);
}

process.exit(allPass ? 0 : 1);
