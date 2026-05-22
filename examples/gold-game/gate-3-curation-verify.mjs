// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — FLAGSHIP Gate 3 verifier (REPRODUCIBLE; committed so digests re-run)
//
// This is the CANONICAL flagship's Gate 3 (gold-vault-game line), distinct from the
// abstract Oasis compass Gate 3 (gate-3-verify.mjs). It re-grounds the proven AI<->human
// CONNECTION mechanics onto the REAL curation verb: graduate() (a genuine bronze->gold
// file move + cael-graduation-v1 sha256-sealed receipt) on a WRITABLE SANDBOX vault.
// Promotion to the governed D:/GOLD stays founder-gated — never touched here.
//
// THE PROOF: an AI agent and a human, in ONE shared deterministic session, both CURATING
// the SAME vault (graduating entries from one shared bronze pool), with GENUINELY DIFFERENT
// selection policies, AFFECTING EACH OTHER — the human graduates the agent's highest-value
// target first, DENYING it, and the agent RE-PLANS to the next-best entry. AI actions emit
// WorldModelReceipts. Both the shared-vault-state digest and the WMR-stream digest reproduce
// byte-for-byte via the REAL computeStateDigest from packages/engine/src/simulation/hashes.ts.
//
//   - HUMAN curator (scripted trace): a fixed, idiosyncratic order of entry IDs to graduate
//     (NOT value-optimal — a human's own priorities). Deterministic stand-in for live input.
//   - AGENT curator (value selection): no script. Each round it SENSES the live vault (which
//     entries remain graduatable in bronze) and selects the HIGHEST-lineage entry (curation
//     value, mirroring farm.py lineage-detection promotion).
//
// MUTUAL EFFECT (load-bearing): one SHARED bronze pool. The human acts first each round; a
// graduation removes the entry from bronze, so the human's choice CHANGES the agent's
// available value. The agent's pre-session intended top target (the highest-value entry) is
// taken by the human in round 0 -> the agent is DENIED and re-plans to the next-best entry.
// The re-plan is VISIBLE in the agent's WorldModelReceipt target stream (intended vs actual).
//
// Run (requires tsx for the real .ts contract import):
//   node_modules/.bin/tsx examples/gold-game/gate-3-curation-verify.mjs --emit   # (re)write receipt
//   node_modules/.bin/tsx examples/gold-game/gate-3-curation-verify.mjs          # verify (exit 0/1)
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, writeFileSync as wf } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const holoPath = join(here, 'gold-vault-game.holo');
const receiptPath = join(here, 'GATE-3-CURATION-cosession-receipt.json');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);

// ── REAL contract spine: computeStateDigest from the engine source ───────────
const { computeStateDigest } = await imp(
  join(repoRoot, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'),
);

// ── Core: parse the flagship .holo (the world the curation happens in) ────────
const core = await imp(join(repoRoot, 'packages', 'core', 'dist', 'index.js'));
const { parseHolo } = core;
const coreVersion = JSON.parse(
  readFileSync(join(repoRoot, 'packages', 'core', 'package.json'), 'utf8'),
).version;

// ── The REAL curation verb (same primitive Gate 2 + server.cjs use) ───────────
const V = require('./vault-ops.cjs');

const HASH_MODE = 'sha256';
const sandboxDir = join(here, 'vault-sandbox');

const src = readFileSync(holoPath, 'utf8');
const parsed = parseHolo(src);
if ((parsed.errors || []).length !== 0) {
  console.error('Gate 3 (curation) BLOCKED: gold-vault-game.holo no longer parses clean.');
  process.exit(2);
}

// ── Build the SHARED bronze pool (a deterministic curation contest) ───────────
// vault-ops.SEED is left untouched (preserves Gate 2 reproducibility). We add the
// curation-contest entries on top of the fresh sandbox so there is genuine contention.
// lineage_links = curation value (higher = more valuable to graduate first).
const CONTEST = [
  { id: 'C.CURATE.001', title: 'cross-domain-synthesis', tier: 'bronze', lineage_links: 5 },
  { id: 'C.CURATE.002', title: 'receipt-with-solver', tier: 'bronze', lineage_links: 4 },
  { id: 'C.CURATE.003', title: 'survey-before-gap', tier: 'bronze', lineage_links: 3 },
  { id: 'C.CURATE.004', title: 'import-array-regex-gate', tier: 'bronze', lineage_links: 2 },
  // B.GRADUATE.001 (lineage 1) already seeded by buildSandbox -> the 5th pool entry.
];

function setupPool() {
  V.buildSandbox(sandboxDir); // fresh, deterministic; seeds B.GRADUATE.001 in bronze
  for (const e of CONTEST) {
    wf(join(sandboxDir, e.tier, e.id + '.json'), JSON.stringify(e, null, 2));
  }
}

// graduatable = in bronze with lineage >= 1 (the verb's own gate)
function graduatableBronze() {
  const st = V.readState(sandboxDir);
  // value = lineage_links read from disk; descending value, id tiebreak (deterministic)
  const ids = st.tiers.bronze.slice();
  const withVal = ids.map((id) => {
    const f = V.findEntry(sandboxDir, id);
    return { id, value: (f && f.entry.lineage_links) || 0 };
  }).filter((x) => x.value >= 1);
  withVal.sort((a, b) => (b.value - a.value) || (a.id < b.id ? -1 : 1));
  return withVal;
}

// ── HUMAN curator: a SCRIPTED, idiosyncratic graduation order (NOT value-sorted) ──
// The human's own priorities: grabs the "famous" top entry first, then a couple of
// its personal picks. Acts first each round; a human graduation denies the agent.
const HUMAN_TRACE = ['C.CURATE.001', 'C.CURATE.003', 'B.GRADUATE.001'];

// ── AGENT curator: value selection over the SENSED live pool. No script. ──────
function agentSelectTarget() {
  const pool = graduatableBronze();
  return pool.length ? pool[0].id : null; // highest value available right now
}

const ROUNDS = 5;

// Snapshot the agent's pre-session INTENDED top target (full initial pool) — the
// thing it would graduate first if the human did not exist.
setupPool();
const intendedTopTarget = agentSelectTarget(); // C.CURATE.001 (lineage 5)
const seedVaultDigest = computeStateDigest(vaultToSolver(), HASH_MODE);

// ── Encode the vault tier-state as a solver the REAL computeStateDigest consumes ──
// (id->tier) pairs, order-independent, numeric — deterministic across runs (ignores
// the wall-clock timestamps inside the receipts, exactly like vault-ops.stateDigest).
function idToInt(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) % 2147483647;
  return h;
}
function vaultToSolver() {
  const st = V.readState(sandboxDir);
  const pairs = [];
  for (let ti = 0; ti < V.ALL_TIERS.length; ti++) {
    for (const id of st.tiers[V.ALL_TIERS[ti]]) pairs.push([idToInt(id), ti]);
  }
  pairs.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1])); // order-independent
  return { fieldNames: ['vault'], getField: () => Float32Array.from(pairs.flat()) };
}

// ── ONE shared session: rounds over the SAME pool; human acts first, then agent ──
const wmr = []; // agent WorldModelReceipts (sensed pool -> chosen action -> result)
const humanGraduations = [];
const agentGraduations = [];
let humanTookTopTargetRound = -1;  // round the human graduated the agent's intended top
let agentDeniedTopTarget = false;  // agent could not get its intended top target
let firstAgentTarget = null;       // what the agent actually graduated first (the re-plan)
let agentReplanned = false;        // intended top != first actual target (denied -> re-plan)
let mutualEffectRound = -1;        // a round where a human grad reduced the agent's pool

for (let r = 0; r < ROUNDS; r++) {
  // --- HUMAN acts first (scripted) ---
  const poolBeforeHuman = graduatableBronze().map((x) => x.id);
  const hTarget = HUMAN_TRACE[r];
  if (hTarget && poolBeforeHuman.includes(hTarget)) {
    const hr = V.graduate(sandboxDir, hTarget, 'human-curator');
    if (hr.ok) {
      humanGraduations.push({ round: r, id: hTarget, fromTier: hr.receipt.fromTier, toTier: hr.receipt.toTier });
      if (hTarget === intendedTopTarget && humanTookTopTargetRound < 0) humanTookTopTargetRound = r;
    }
  }

  // --- AGENT senses the NOW-updated shared pool and selects highest value ---
  const poolAfterHuman = graduatableBronze().map((x) => x.id);
  const aTarget = agentSelectTarget(); // reacts to what the human just did
  // mutual effect: the human's action this round shrank the agent's options
  if (mutualEffectRound < 0 && poolBeforeHuman.length > poolAfterHuman.length) mutualEffectRound = r;

  let action;
  if (aTarget) {
    const ar = V.graduate(sandboxDir, aTarget, 'ai-agent-curator');
    if (ar.ok) {
      agentGraduations.push({ round: r, id: aTarget, fromTier: ar.receipt.fromTier, toTier: ar.receipt.toTier });
      if (firstAgentTarget === null) {
        firstAgentTarget = aTarget;
        if (firstAgentTarget !== intendedTopTarget) { agentReplanned = true; agentDeniedTopTarget = true; }
      }
      action = { type: 'graduate', target: aTarget };
    } else {
      action = { type: 'pass', target: null };
    }
  } else {
    action = { type: 'pass', target: null }; // pool exhausted — nothing to curate
  }

  // --- agent WorldModelReceipt (its genuine curation decision record this round) ─
  wmr.push({
    round: r,
    sensed: {
      poolSize: poolAfterHuman.length,
      topAvailable: poolAfterHuman.length ? agentSelectTargetSnapshot(poolAfterHuman) : null,
      intendedTop: intendedTopTarget,
      intendedTopAvailable: poolAfterHuman.includes(intendedTopTarget),
    },
    action,
    result: { graduated: action.type === 'graduate' ? action.target : null },
  });
}

// helper: the top of an already-sensed pool snapshot (no re-read; deterministic)
function agentSelectTargetSnapshot(poolIds) {
  let best = null, bestVal = -1;
  for (const id of poolIds) {
    const f = V.findEntry(sandboxDir, id);
    const v = (f && f.entry.lineage_links) || 0;
    if (v > bestVal || (v === bestVal && best && id < best)) { best = id; bestVal = v; }
  }
  return best;
}

// ── Digests via the REAL contract fn ──────────────────────────────────────────
// (1) the whole SHARED vault's final tier-state (both curators' effects baked in).
const sharedVaultDigest = computeStateDigest(vaultToSolver(), HASH_MODE);
// (2) the agent's WorldModelReceipt stream (its genuine curation decision record).
const wmrDigest = computeStateDigest(
  {
    fieldNames: ['wmr'],
    getField: () =>
      Float32Array.from(
        wmr.flatMap((w) => [
          w.round,
          w.action.type === 'graduate' ? 1 : 0,
          w.action.target ? idToInt(w.action.target) : 0,
          w.sensed.poolSize,
          w.sensed.intendedTopAvailable ? 1 : 0,
        ]),
      ),
  },
  HASH_MODE,
);

const actionTypes = [...new Set(wmr.map((w) => w.action.type))];
const finalState = V.readState(sandboxDir);
const allContestGraduated = [...CONTEST.map((e) => e.id), 'B.GRADUATE.001']
  .every((id) => finalState.tiers.gold.includes(id));

// false case (variational gate of curation): the verb refuses an ungraduatable entry
const diamondRefused = (() => { const r = V.graduate(sandboxDir, 'P.GOLD.001'); return !r.ok && /top tier/.test(r.error); })();
const unknownRefused = (() => { const r = V.graduate(sandboxDir, 'NOPE.999'); return !r.ok; })();

const receipt = {
  gate: 3,
  track: 'flagship (gold-vault-game) — curation co-session on the REAL graduate verb',
  name: 'AI<->human connection — shared-vault curation co-session, mutual effect, genuine policy divergence',
  artifact: 'examples/gold-game/gold-vault-game.holo',
  verb: 'examples/gold-game/vault-ops.cjs graduate() — real bronze->gold file move + cael-graduation-v1 sealed receipt (SANDBOX vault)',
  verifier: 'examples/gold-game/gate-3-curation-verify.mjs',
  target: 'r3f',
  session: {
    kind: 'single shared deterministic session — rounds over ONE shared bronze pool',
    rounds: ROUNDS,
    deterministic: true,
    note: 'no RNG; the only wall-clock is inside receipt timestamps, which the tier-state digest ignores (same as vault-ops.stateDigest) -> reproduces byte-for-byte',
  },
  pool: {
    seedVaultDigest,
    contest: [...CONTEST.map((e) => ({ id: e.id, value: e.lineage_links })), { id: 'B.GRADUATE.001', value: 1 }],
    valueSignal: 'lineage_links (mirrors farm.py lineage-detection promotion)',
  },
  policies: {
    human: { driver: 'scripted curation trace (recorded human picks), idiosyncratic order — NOT value-sorted', trace: HUMAN_TRACE },
    agent: { driver: 'value selection — no script; senses live bronze pool each round, graduates highest-lineage entry', intendedTopTarget },
    genuinelyDifferent: true,
  },
  mutualEffect: {
    sharedPool: 'one bronze pool; the human acts first each round and a graduation removes the entry, shrinking the agent value set',
    humanTookAgentTopTarget: humanTookTopTargetRound >= 0,
    humanTookTopTargetRound,
    mutualEffectRound,
    humanGraduations,
    proof: "the agent's pre-session intended top target (highest-value entry) was graduated by the human first, denying it; the agent then graduated the next-best available entry — its choice set is causally reduced by the human on the REAL curation verb.",
  },
  agentReplan: {
    replanned: agentReplanned,
    deniedTopTarget: agentDeniedTopTarget,
    intendedTopTarget,
    firstActualTarget: firstAgentTarget,
    agentGraduations,
    actionTypesObserved: actionTypes,
    note: "intendedTopTarget != firstActualTarget proves the agent re-planned BECAUSE the shared entry was taken — the curation analog of the compass denial+re-plan, on graduate().",
  },
  contract: {
    spine: 'REAL computeStateDigest from packages/engine/src/simulation/hashes.ts (imported via tsx) — same fn SimulationContract pushes on solve()',
    function: 'computeStateDigest(solver, hashMode)',
    algorithm: HASH_MODE,
    sharedVaultDigest,
    finalTiers: { gold: finalState.tiers.gold, bronze: finalState.tiers.bronze },
    reproducible: 'run `node_modules/.bin/tsx examples/gold-game/gate-3-curation-verify.mjs` to re-derive',
  },
  worldModelReceipts: {
    count: wmr.length,
    digest: wmrDigest,
    schema: 'cael-curation-wmr-v1 (round, sensed{poolSize,topAvailable,intendedTop,intendedTopAvailable}, action{type,target}, result{graduated})',
    note: 'one WorldModelReceipt per agent curation decision; the AI population emits provenance the human population does not — both hashed by the contract fn.',
  },
  aiHumanConnection: {
    sameSession: true,
    sameVault: true,
    sameVerb: true,
    sameReceiptSpine: true,
    genuinePolicyDivergence: true,
    mutualEffect: true,
    proof: 'one shared session: human (scripted curation trace) and agent (value selection) graduate from ONE shared bronze pool via the real graduate() verb; the human takes the agent’s top-value entry first, denying it; the agent re-plans to the next-best. Real file moves + sealed receipts; both digests via the real contract fn.',
    honestScope: 'The human picks are a RECORDED/scripted trace (deterministic stand-in for live curation input) and the agent value-model is a hand-authored lineage-descending policy — NOT a learned model or a live operator session. Graduations write to a SANDBOX vault; promotion to the governed D:/GOLD stays founder-gated. What is PROVEN: two genuinely different curation policies, in one shared deterministic session, affecting each other through a shared pool on the REAL graduate verb, with the agent re-planning in response and emitting WorldModelReceipts under the real contract digest. What is NOT yet proven: a live human operator session and a trained curation policy (Gate 5 scope via /embodied). This re-grounds the connection mechanics (proven generically on the Oasis compass, commit 7cf8ef3eb) onto the flagship’s real curation verb.',
  },
  core: coreVersion,
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-3 (CURATION) RECEIPT EMITTED →', receiptPath);
  console.log('  intendedTop=' + intendedTopTarget, 'firstActual=' + firstAgentTarget, 'replanned=' + agentReplanned);
  console.log('  humanTookTopRound=' + humanTookTopTargetRound, 'mutualEffectRound=' + mutualEffectRound);
  console.log('  humanGrads=' + humanGraduations.length, 'agentGrads=' + agentGraduations.length, 'allGraduated=' + allContestGraduated);
  console.log('  sharedVaultDigest=' + sharedVaultDigest);
  console.log('  wmrCount=' + wmr.length, 'wmrDigest=' + wmrDigest);
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-3 curation receipt to verify. Run with --emit first.');
    process.exit(2);
  }
  const checks = [
    ['flagship .holo parses (0 errors)', (parsed.errors || []).length === 0],
    ['single shared session ran all rounds', wmr.length === ROUNDS],
    ['human took the agent’s intended top target first (mutual effect: denied the agent)', humanTookTopTargetRound >= 0],
    ['agent did NOT get its intended top target (was denied)', agentDeniedTopTarget === true],
    ['agent re-planned (intendedTop != first actual target)', agentReplanned === true],
    ['agent first actual target is the next-best available (real value re-plan)', firstAgentTarget === 'C.CURATE.002'],
    ['mutual effect: a human graduation shrank the agent value set', mutualEffectRound >= 0],
    ['real curation happened: >=2 agent graduations (bronze->gold)', agentGraduations.length >= 2],
    ['every contest entry ended in gold on disk (real file moves)', allContestGraduated === true],
    ['two distinct agent action types observed (graduate, pass)', new Set(wmr.map((w) => w.action.type)).size === 2],
    ['variational gate: verb refuses a top-tier (Diamond) entry', diamondRefused === true],
    ['variational gate: verb refuses an unknown entry', unknownRefused === true],
    ['shared-vault digest reproduces', sharedVaultDigest === existing.contract.sharedVaultDigest],
    ['agent WorldModelReceipt-stream digest reproduces', wmrDigest === existing.worldModelReceipts.digest],
    ['real computeStateDigest produced non-empty digests', sharedVaultDigest.length > 0 && wmrDigest.length > 0],
  ];
  let ok = true;
  console.log('GATE-3 (FLAGSHIP CURATION) RECEIPT VERIFICATION (independent re-derive, REAL contract fn):');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 3 (curation)', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
