// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 8: multi-agent MESH + ECONOMY (REPRODUCIBLE).
//
// The HoloLand-like deepening of Gate 3 (2-actor co-session) + Gate 6 (HoloGate):
// THREE real AI curators + a human curate the SAME vault in one shared session,
// and the D.040 SOVEREIGN TRAITS do real work — driven through the GENUINE
// handlers from @holoscript/core (not mocks):
//   • EconomyPrimitivesTrait — each graduation pays the curator (economy:earn);
//     balances are real account state on the trait node.
//   • ReputationLedgerTrait — each graduation is an observed action raising the
//     curator's trust in the real ledger.
//   • AutonomousAgendaTrait — each agent runs an agenda under the real
//     $0.50/day cost ceiling (daily_budget_usd); the ceiling genuinely fires.
// Mesh coordination is reputation-ordered (highest-trust curator picks first),
// so multi-way contention on the shared pool causes real denial + re-plan.
// All under the real graduate() verb + computeStateDigest receipt spine.
//
//   node_modules/.bin/tsx examples/gold-game/gate-8-mesh-economy-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-8-mesh-economy-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);

const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const { economyPrimitivesHandler } = await imp(
  join(repo, 'packages', 'core', 'src', 'traits', 'EconomyPrimitivesTrait.ts')
);
const { reputationLedgerHandler } = await imp(
  join(repo, 'packages', 'core', 'src', 'traits', 'ReputationLedgerTrait.ts')
);
const { autonomousAgendaHandler } = await imp(
  join(repo, 'packages', 'core', 'src', 'traits', 'AutonomousAgendaTrait.ts')
);
const V = require('./vault-ops.cjs');

const receiptPath = join(here, 'GATE-8-MESH-ECONOMY-receipt.json');
const sandboxDir = join(here, 'vault-sandbox-g8');
const HASH = 'sha256';
const REWARD = 25; // tokens per graduation
const TRUST_DELTA = 5; // reputation per graduation
const AGENTS = ['agent-archivist', 'agent-curator', 'agent-scout']; // 3 real AI curators
const HUMAN = 'human-curator';

// ── minimal TraitContext (captures emitted events, like the real runtime) ─────
function makeCtx() {
  const events = [];
  return { ctx: { emit: (type, payload) => events.push({ type, payload }) }, events };
}
const lastEvent = (events, type) => [...events].reverse().find((e) => e.type === type);

// ── Build the shared bronze pool (a multi-way curation contest) ───────────────
const CONTEST = [
  { id: 'C.CURATE.001', title: 'cross-domain-synthesis', tier: 'bronze', lineage_links: 6 },
  { id: 'C.CURATE.002', title: 'receipt-with-solver', tier: 'bronze', lineage_links: 5 },
  { id: 'C.CURATE.003', title: 'survey-before-gap', tier: 'bronze', lineage_links: 4 },
  { id: 'C.CURATE.004', title: 'import-array-gate', tier: 'bronze', lineage_links: 3 },
  { id: 'C.CURATE.005', title: 'apply-four-refusals', tier: 'bronze', lineage_links: 2 },
];
V.buildSandbox(sandboxDir);
for (const e of CONTEST)
  writeFileSync(join(sandboxDir, e.tier, e.id + '.json'), JSON.stringify(e, null, 2));

function graduatable() {
  const st = V.readState(sandboxDir);
  return st.tiers.bronze
    .map((id) => ({ id, value: V.findEntry(sandboxDir, id)?.entry.lineage_links || 0 }))
    .filter((x) => x.value >= 1)
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
}

// ── Attach the REAL sovereign traits ──────────────────────────────────────────
const economyNode = {};
const econ = makeCtx();
economyPrimitivesHandler.onAttach(economyNode, economyPrimitivesHandler.defaultConfig, econ.ctx);
const ECON_CFG = economyPrimitivesHandler.defaultConfig;

const repNode = {};
const rep = makeCtx();
const REP_CFG = { ...reputationLedgerHandler.defaultConfig };
reputationLedgerHandler.onAttach(repNode, REP_CFG, rep.ctx);

const agendaNodes = {}; // per-agent agenda nodes
const AGENDA_CFG = { agent_class: 'teammate', daily_budget_usd: 0.5, tick_interval_ms: 0 }; // tick every update so the ceiling check runs deterministically
for (const a of AGENTS) {
  agendaNodes[a] = { node: {}, ...makeCtx() };
  autonomousAgendaHandler.onAttach(agendaNodes[a].node, AGENDA_CFG, agendaNodes[a].ctx);
}

const earn = (agentId) =>
  economyPrimitivesHandler.onEvent(economyNode, ECON_CFG, econ.ctx, {
    type: 'economy:earn',
    payload: { agentId, amount: REWARD, reason: 'graduation' },
  });
const observe = (curator, entryId) =>
  reputationLedgerHandler.onEvent(repNode, REP_CFG, rep.ctx, {
    type: 'reputation_observe_action',
    observerId: curator,
    action: 'graduated:' + entryId,
    trustDelta: TRUST_DELTA,
  });
const agendaItem = (agent, entryId, i) => {
  const an = agendaNodes[agent];
  autonomousAgendaHandler.onEvent(an.node, AGENDA_CFG, an.ctx, {
    type: 'agenda_add_item',
    id: agent + '-' + i,
    title: 'graduate ' + entryId,
    estimatedCostUsd: 0.1,
  });
  autonomousAgendaHandler.onEvent(an.node, AGENDA_CFG, an.ctx, {
    type: 'agenda_complete_item',
    itemId: agent + '-' + i,
  });
};

// ── The shared multi-agent session (reputation-ordered picking = A2A coord) ───
const trustOf = (curator) => {
  reputationLedgerHandler.onEvent(repNode, REP_CFG, rep.ctx, {
    type: 'reputation_query',
    observerId: curator,
  });
  const snap = lastEvent(rep.events, 'reputation_ledger_snapshot');
  // deep-ratchet 2026-05-24: snapshot observers are keyed by `observerId` (not `id`); the
  // old `o.id` lookup always missed and fell back to observers[0], so reputation-ordered
  // picking did not actually key on real trust. Match observerId so trustOf reads the right row.
  const obs =
    snap?.payload?.observers?.find?.((o) => o.observerId === curator || o.id === curator) ||
    snap?.payload?.observers?.[0];
  return obs?.trust ?? REP_CFG.initial_trust ?? 50;
};
const HUMAN_TRACE = ['C.CURATE.002', 'C.CURATE.005']; // idiosyncratic human picks (not value-sorted)
const wmr = [];
const grads = { [HUMAN]: 0 };
AGENTS.forEach((a) => (grads[a] = 0));
let denialReplans = 0;
let agentItemCount = {};
AGENTS.forEach((a) => (agentItemCount[a] = 0));

for (let round = 0; round < 4; round++) {
  const poolStart = graduatable();
  if (!poolStart.length) break;
  const topPrize = poolStart[0].id; // the high-value entry every value-agent intends this round
  // human acts first (scripted, idiosyncratic picks — its own priorities)
  const hPick = HUMAN_TRACE[round];
  if (hPick && graduatable().some((x) => x.id === hPick)) {
    const r = V.graduate(sandboxDir, hPick, HUMAN);
    if (r.ok) {
      grads[HUMAN]++;
      wmr.push({ round, curator: HUMAN, action: 'graduate', target: hPick });
    }
  }
  // AI curators act in REPUTATION order (A2A-style mesh coordination). Each WANTS the
  // round's top prize; only the first to act gets it — the rest are DENIED and re-plan.
  const order = [...AGENTS].sort((a, b) => trustOf(b) - trustOf(a) || (a < b ? -1 : 1));
  for (const a of order) {
    const pool = graduatable();
    if (!pool.length) {
      wmr.push({ round, curator: a, action: 'pass', target: null });
      continue;
    }
    const intended = topPrize; // intent fixed at round start (the shared prize)
    const target = pool[0].id; // best STILL available now (re-plan if topPrize was taken)
    const r = V.graduate(sandboxDir, target, a);
    if (r.ok) {
      grads[a]++;
      earn(a);
      observe(a, target);
      agendaItem(a, target, agentItemCount[a]++);
      autonomousAgendaHandler.onUpdate(agendaNodes[a].node, AGENDA_CFG, agendaNodes[a].ctx, 1.0); // tick the agenda (ceiling check)
      wmr.push({ round, curator: a, action: 'graduate', target, intended });
    } else {
      wmr.push({ round, curator: a, action: 'pass', target: null });
    }
  }
}
// a genuine denial-driven re-plan = a curator that wanted the round's top prize but,
// because a peer took it first, graduated a different (best-available) entry instead.
denialReplans = wmr.filter(
  (w) => w.action === 'graduate' && w.intended && w.intended !== w.target
).length;

// ── Read GENUINE trait state ──────────────────────────────────────────────────
const accounts = economyNode.__economyState?.accounts;
const balanceOf = (a) => accounts?.get?.(a)?.balance;
const baseBalance = (() => {
  const a = AGENTS.find((x) => grads[x] > 0);
  return a != null ? balanceOf(a) - REWARD * grads[a] : ECON_CFG.initial_balance;
})();
const totalEarned = AGENTS.reduce((s, a) => s + ((balanceOf(a) ?? baseBalance) - baseBalance), 0);
const trustTally = Object.fromEntries(AGENTS.map((a) => [a, trustOf(a)]));

// ── Probe the REAL $0.50/day ceiling: overspend an agenda → breach must fire ──
const probe = { node: {}, ...makeCtx() };
autonomousAgendaHandler.onAttach(probe.node, AGENDA_CFG, probe.ctx);
for (let i = 0; i < 7; i++) {
  autonomousAgendaHandler.onEvent(probe.node, AGENDA_CFG, probe.ctx, {
    type: 'agenda_add_item',
    id: 'p' + i,
    title: 'x',
    estimatedCostUsd: 0.1,
  });
  autonomousAgendaHandler.onEvent(probe.node, AGENDA_CFG, probe.ctx, {
    type: 'agenda_complete_item',
    itemId: 'p' + i,
  });
}
autonomousAgendaHandler.onUpdate(probe.node, AGENDA_CFG, probe.ctx, 1.0);
const ceilingFired = probe.events.some((e) => e.type === 'agenda_cost_ceiling_breach');
const inBudgetNoBreach = AGENTS.every(
  (a) => !agendaNodes[a].events.some((e) => e.type === 'agenda_cost_ceiling_breach')
);

// ── Digests via the REAL contract fn (deterministic state only) ───────────────
const idI = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 2147483647;
  return h;
};
const finalState = V.readState(sandboxDir);
const vaultDigest = computeStateDigest(
  {
    fieldNames: ['v'],
    getField: () =>
      Float32Array.from(
        [...V.ALL_TIERS.flatMap((t, ti) => finalState.tiers[t].map((id) => [idI(id), ti]))]
          .sort((a, b) => a[0] - b[0])
          .flat()
      ),
  },
  HASH
);
const economyDigest = computeStateDigest(
  {
    fieldNames: ['e'],
    getField: () =>
      Float32Array.from(
        AGENTS.map((a) => [idI(a), balanceOf(a) ?? 0])
          .sort((a, b) => a[0] - b[0])
          .flat()
      ),
  },
  HASH
);
const wmrDigest = computeStateDigest(
  {
    fieldNames: ['w'],
    getField: () =>
      Float32Array.from(
        wmr.flatMap((w) => [
          w.round,
          idI(w.curator),
          w.action === 'graduate' ? 1 : 0,
          w.target ? idI(w.target) : 0,
        ])
      ),
  },
  HASH
);

const totalGrads = Object.values(grads).reduce((a, b) => a + b, 0);
const agentGrads = AGENTS.reduce((s, a) => s + grads[a], 0);

const receipt = {
  gate: 8,
  track: 'flagship',
  name: 'multi-agent mesh + economy — 3 real AI curators + human, D.040 sovereign traits doing real work',
  verifier: 'examples/gold-game/gate-8-mesh-economy-verify.mjs',
  traits: {
    economy: 'packages/core/src/traits/EconomyPrimitivesTrait.ts (economyPrimitivesHandler — REAL)',
    reputation:
      'packages/core/src/traits/ReputationLedgerTrait.ts (reputationLedgerHandler — REAL)',
    agenda: 'packages/core/src/traits/AutonomousAgendaTrait.ts (autonomousAgendaHandler — REAL)',
  },
  session: {
    curators: [HUMAN, ...AGENTS],
    coordination: 'reputation-ordered picking (A2A-style mesh)',
    rounds: 4,
    deterministic: true,
  },
  results: {
    graduations: grads,
    totalGraduations: totalGrads,
    agentGraduations: agentGrads,
    denialReplans,
    economy: {
      initialBalance: baseBalance,
      rewardPerGraduation: REWARD,
      balances: Object.fromEntries(AGENTS.map((a) => [a, balanceOf(a)])),
      totalEarned,
      conserved: totalEarned === REWARD * agentGrads,
    },
    reputation: { trustDelta: TRUST_DELTA, trust: trustTally, initialTrust: REP_CFG.initial_trust },
    agenda: {
      dailyBudgetUsd: AGENDA_CFG.daily_budget_usd,
      ceilingFiresWhenOverspent: ceilingFired,
      inBudgetNoBreach,
    },
  },
  contract: {
    spine: 'REAL computeStateDigest',
    vaultDigest,
    economyDigest,
    wmrDigest,
    reproducible: 'run the verifier to re-derive',
  },
  honestScope:
    'The economy balances, reputation trust, and $0.50/day agenda ceiling are produced by the GENUINE @holoscript/core sovereign-trait handlers (economyPrimitivesHandler / reputationLedgerHandler / autonomousAgendaHandler) driven over a real session — NOT inline mocks. Graduations are real file moves via vault-ops graduate() on a SANDBOX vault. PROVEN: a 3-agent + human mesh curating one vault, with real token economy, real reputation accrual, real cost-ceiling enforcement, and reputation-ordered coordination. Hand-authored agent policies + scripted human (not trained / not a live operator); A2A coordination is modeled as reputation-ordered picking rather than the full network handshake — those deepen in later gates.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-8 RECEIPT EMITTED ->', receiptPath);
  console.log(
    '  graduations:',
    JSON.stringify(grads),
    '| agentGrads=' + agentGrads,
    '| replans=' + denialReplans
  );
  console.log(
    '  balances:',
    JSON.stringify(Object.fromEntries(AGENTS.map((a) => [a, balanceOf(a)]))),
    '| totalEarned=' + totalEarned,
    'conserved=' + (totalEarned === REWARD * agentGrads)
  );
  console.log(
    '  trust:',
    JSON.stringify(trustTally),
    '| ceilingFires=' + ceilingFired,
    'inBudgetNoBreach=' + inBudgetNoBreach
  );
  console.log(
    '  vaultDigest=' + vaultDigest.slice(0, 16),
    'economyDigest=' + economyDigest.slice(0, 16),
    'wmrDigest=' + wmrDigest.slice(0, 16)
  );
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-8 receipt. Run --emit first.');
    process.exit(2);
  }
  const checks = [
    [
      '3 AI curators + human acted in one shared session',
      AGENTS.length === 3 && grads[HUMAN] >= 1 && agentGrads >= 1,
    ],
    ['real graduate() moved entries (multi-way mesh)', finalState.tiers.gold.length >= 5],
    [
      'EconomyPrimitivesTrait REAL: balances are real account state',
      AGENTS.every((a) => typeof balanceOf(a) === 'number'),
    ],
    [
      'economy conserved: total earned == reward x agent graduations',
      totalEarned === REWARD * agentGrads && agentGrads > 0,
    ],
    [
      'ReputationLedgerTrait REAL: graduating agents gained trust',
      AGENTS.filter((a) => grads[a] > 0).every(
        (a) => trustTally[a] > (REP_CFG.initial_trust ?? 50)
      ),
    ],
    [
      'AutonomousAgendaTrait REAL: $0.50/day ceiling actually fires when overspent',
      ceilingFired === true,
    ],
    ['in-budget agents did NOT breach the ceiling', inBudgetNoBreach === true],
    ['multi-way mutual effect: at least one denial-driven re-plan', denialReplans >= 1],
    [
      'vault digest reproduces (real computeStateDigest)',
      vaultDigest === existing.contract.vaultDigest,
    ],
    ['economy digest reproduces', economyDigest === existing.contract.economyDigest],
    ['WMR-stream digest reproduces', wmrDigest === existing.contract.wmrDigest],
  ];
  let ok = true;
  console.log('GATE-8 (MULTI-AGENT MESH + ECONOMY) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 8', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
