// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — "One Climb" played-slice engine (Gate 19).
//
// The PURE, deterministic played loop that WIRES the proven pieces into one
// coherent 3-minute climb — reused by both the Gate-19 verifier and (server-side)
// live play. Nothing new is invented; it INTEGRATES real, gate-passed code:
//   • graduate() real bronze→gold file move + sealed receipt (Gate 2, vault-ops.cjs)
//   • economyPrimitivesHandler / reputationLedgerHandler / autonomousAgendaHandler
//     drive the AgentCompanion as a visible co-curator (Gate 8)
//   • dialogueHandler + reputationLedger ratify the human at the peak (Gate 14)
//
// Server-side (real fs file moves); the browser build calls /api/graduate for live
// play. The verifier runs this exact engine and asserts the T0–T6 observable trace.
// ═══════════════════════════════════════════════════════════════════════════

import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);

export const GOAL_GRADUATIONS = 3; // fill the Gold terrace
export const RATIFY_THRESHOLD = 0.55; // Gate-14 reputation threshold
export const REWARD = 25;
const PLAYER = 'human-curator';
const COMPANION = 'agent-companion';

function makeCtx() {
  const events = [];
  return { ctx: { emit: (t, p) => events.push({ type: t, payload: p }) }, events };
}
const last = (events, t) => [...events].reverse().find((e) => e.type === t);

// One coherent climb. Returns the full observable trace (T0–T6 state deltas).
export async function runPlayedSlice(sandboxDir) {
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
  const { dialogueHandler } = await imp(
    join(repo, 'packages', 'core', 'src', 'traits', 'DialogueTrait.ts')
  );
  const V = require('./vault-ops.cjs');
  const fs = require('node:fs');

  // ── Seed the climb: clean bronze entries (graduatable) + a COLLISION-guarded one ──
  V.buildSandbox(sandboxDir);
  const CLEAN = [
    { id: 'C.CLIMB.001', title: 'cited-clean-scar', tier: 'bronze', lineage_links: 4 },
    { id: 'C.CLIMB.002', title: 'survey-before-gap', tier: 'bronze', lineage_links: 3 },
    { id: 'C.CLIMB.003', title: 'receipt-with-solver', tier: 'bronze', lineage_links: 5 },
    { id: 'C.CLIMB.004', title: 'companion-pick-a', tier: 'bronze', lineage_links: 2 },
  ];
  const COLLISION = {
    id: 'C.COLLIDE.001',
    title: 'same-slot-conflict',
    tier: 'bronze',
    lineage_links: 0,
  }; // the "monster": lineage 0 → graduate refuses
  for (const e of [...CLEAN, COLLISION])
    fs.writeFileSync(join(sandboxDir, 'bronze', e.id + '.json'), JSON.stringify(e, null, 2));

  const goldCount = () => V.readState(sandboxDir).tiers.gold.length;
  const goldHas = (id) => V.readState(sandboxDir).tiers.gold.includes(id);
  const baseGold = goldCount();
  const vaultDigestOf = () => {
    const st = V.readState(sandboxDir);
    const idI = (s) => {
      let h = 0;
      for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 2147483647;
      return h;
    };
    const ti = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };
    const pairs = [];
    for (const t of V.ALL_TIERS) for (const id of st.tiers[t]) pairs.push([idI(id), ti[t]]);
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return computeStateDigest(
      { fieldNames: ['v'], getField: () => Float32Array.from(pairs.flat()) },
      'sha256'
    );
  };

  // ── Real sovereign-trait instances (the companion's economy + the shared reputation) ──
  const econNode = {};
  const econ = makeCtx();
  economyPrimitivesHandler.onAttach(econNode, economyPrimitivesHandler.defaultConfig, econ.ctx);
  const ECON = economyPrimitivesHandler.defaultConfig;
  const repNode = {};
  const rep = makeCtx();
  const REP = { ...reputationLedgerHandler.defaultConfig };
  reputationLedgerHandler.onAttach(repNode, REP, rep.ctx);
  const agNode = {};
  const ag = makeCtx();
  const AG = { agent_class: 'npc', daily_budget_usd: 0.5, tick_interval_ms: 0 };
  autonomousAgendaHandler.onAttach(agNode, AG, ag.ctx);
  const earn = (id) =>
    economyPrimitivesHandler.onEvent(econNode, ECON, econ.ctx, {
      type: 'economy:earn',
      payload: { agentId: id, amount: REWARD, reason: 'graduation' },
    });
  const observe = (id, action, delta) =>
    reputationLedgerHandler.onEvent(repNode, REP, rep.ctx, {
      type: 'reputation_observe_action',
      observerId: id,
      action,
      trustDelta: delta,
    });
  const trustOf = (id) => {
    reputationLedgerHandler.onEvent(repNode, REP, rep.ctx, {
      type: 'reputation_query',
      observerId: id,
    });
    const s = last(rep.events, 'reputation_ledger_snapshot');
    const o = s?.payload?.observers?.find?.((x) => x.id === id) || s?.payload?.observers?.[0];
    return o?.trust ?? REP.initial_trust ?? 50;
  };
  const balanceOf = (id) => econNode.__economyState?.accounts?.get?.(id)?.balance;

  const trace = { T0: {}, T1: {}, T2: {}, T3: {}, T4: {}, T5: {}, T6: {} };

  // ── T0: baseline ──
  const vd0 = vaultDigestOf();
  trace.T0 = { vaultDigest: vd0, baseGold };

  // ── The climb: human graduates CLEAN entries (real verb); reputation accrues (+2 each, scars valued) ──
  const humanGrads = [];
  const trustArc = [];
  let firstCrossIdx = -1;
  const HUMAN_QUALITY = 2; // trustDelta per clean graduation (50 → 52 → 54 → 56 crosses 55 on the 3rd)
  let vdPrev = vd0;
  for (let i = 0; i < GOAL_GRADUATIONS; i++) {
    const id = CLEAN[i].id;
    // T3 (collision) injected before the 2nd graduation: the monster blocks
    if (i === 1) {
      const tierBefore = V.findEntry(sandboxDir, COLLISION.id)?.tier;
      const blocked = V.graduate(sandboxDir, COLLISION.id, PLAYER);
      const tierAfter = V.findEntry(sandboxDir, COLLISION.id)?.tier;
      trace.T3 = {
        attempted: COLLISION.id,
        ok: blocked.ok,
        error: blocked.error,
        tierBefore,
        tierAfter,
        blockedAndUnchanged: !blocked.ok && tierBefore === tierAfter,
      };
    }
    const r = V.graduate(sandboxDir, id, PLAYER);
    observe(PLAYER, 'graduated:' + id, HUMAN_QUALITY);
    const trust = trustOf(PLAYER);
    trustArc.push(trust);
    if (firstCrossIdx < 0 && trust / 100 > RATIFY_THRESHOLD) firstCrossIdx = i;
    const vdNow = vaultDigestOf();
    humanGrads.push({
      id,
      ok: r.ok,
      by: r.receipt?.by,
      schema: r.receipt?.schema,
      toTier: r.receipt?.toTier,
      trust,
      vaultChanged: vdNow !== vdPrev,
    });
    vdPrev = vdNow;
    if (i === 0)
      trace.T1 = {
        entry: id,
        ok: r.ok,
        by: r.receipt?.by,
        schema: r.receipt?.schema,
        vaultChanged: humanGrads[0].vaultChanged,
        vaultDigest: vdNow,
      };
  }
  trace.T4 = {
    initialTrust: REP.initial_trust ?? 50,
    quality: HUMAN_QUALITY,
    trustArc,
    finalTrust: trustArc[trustArc.length - 1],
    firstCrossIdx,
    accumulationDriven:
      trustArc[trustArc.length - 1] ===
      (REP.initial_trust ?? 50) + HUMAN_QUALITY * GOAL_GRADUATIONS,
  };

  // ── T2: the AI companion VISIBLY co-curates — picks a DIFFERENT entry, real verb + real economy/reputation ──
  const remaining = V.readState(sandboxDir).tiers.bronze.filter((id) => id !== COLLISION.id);
  const compPick = remaining.sort()[0]; // a clean entry the human didn't take (C.CLIMB.004 etc.)
  const compBalBefore = balanceOf(COMPANION) ?? ECON.initial_balance;
  const cr = V.graduate(sandboxDir, compPick, COMPANION);
  earn(COMPANION);
  observe(COMPANION, 'graduated:' + compPick, 3);
  autonomousAgendaHandler.onEvent(agNode, AG, ag.ctx, {
    type: 'agenda_add_item',
    id: 'c1',
    title: 'graduate ' + compPick,
    estimatedCostUsd: 0.1,
  });
  autonomousAgendaHandler.onEvent(agNode, AG, ag.ctx, {
    type: 'agenda_complete_item',
    itemId: 'c1',
  });
  autonomousAgendaHandler.onUpdate(agNode, AG, ag.ctx, 1.0);
  const compReceiptOnDisk = fs.readdirSync(join(sandboxDir, 'receipts')).some((f) => {
    try {
      return JSON.parse(fs.readFileSync(join(sandboxDir, 'receipts', f), 'utf8')).by === COMPANION;
    } catch {
      return false;
    }
  });
  trace.T2 = {
    companion: COMPANION,
    pick: compPick,
    differentFromHuman: !humanGrads.some((g) => g.id === compPick),
    ok: cr.ok,
    by: cr.receipt?.by,
    receiptOnDisk: compReceiptOnDisk,
    balanceBefore: compBalBefore,
    balanceAfter: balanceOf(COMPANION),
    earnedReward: (balanceOf(COMPANION) ?? 0) - compBalBefore === REWARD,
    trust: trustOf(COMPANION),
    trustAboveInitial: trustOf(COMPANION) > (REP.initial_trust ?? 50),
    ceilingOk: !ag.events.some((e) => e.type === 'agenda_cost_ceiling_breach'),
  };

  // ── T5: the Archivist ratifies (real DialogueTrait decides via filterOptions) ──
  const DLG = {
    ...dialogueHandler.defaultConfig,
    speaker_name: 'Maren Vael',
    start_node: 'verdict',
    llm_dynamic: false,
    dialogue_tree: {
      verdict: {
        id: 'verdict',
        speaker: 'Maren Vael',
        text: 'I have read it. The ledger remembers.',
        options: [
          {
            text: '(she ratifies it)',
            condition: 'reputation > 0.55',
            action: 'ratify',
            nextNode: 'quest_open',
          },
          { text: '(she sends it back)', action: 'send_back', nextNode: 'farewell' },
        ],
      },
      quest_open: {
        id: 'quest_open',
        speaker: 'Maren Vael',
        text: 'It earns its place. Now — recover the Drowned Index.',
        options: [],
      },
      farewell: {
        id: 'farewell',
        speaker: 'Maren Vael',
        text: 'It decays in a week.',
        options: [],
      },
    },
  };
  const verdictAt = (reputation) => {
    const n = {};
    const c = makeCtx();
    dialogueHandler.onAttach(n, DLG, c.ctx);
    dialogueHandler.onEvent(n, DLG, c.ctx, {
      type: 'start_dialogue',
      startNode: 'verdict',
      context: { reputation },
    });
    dialogueHandler.onEvent(n, DLG, c.ctx, { type: 'select_option', index: 0 });
    return {
      action: last(c.events, 'dialogue_action')?.payload?.action,
      node: n.__dialogueState?.currentNodeId,
    };
  };
  const atPeak = verdictAt(trace.T4.finalTrust / 100);
  const negControl = verdictAt(0.5); // below threshold → send_back, ratify option absent
  const QUEST = {
    id: 'recover-the-drowned-index',
    giver: 'npc.maren-archivist',
    questType: 'discover',
    reward: { reputation: 10, unlocks: 'sealed-reading-room' },
  };
  trace.T5 = {
    reputationAtPeak: trace.T4.finalTrust / 100,
    action: atPeak.action,
    node: atPeak.node,
    ratified: atPeak.action === 'ratify' && atPeak.node === 'quest_open',
    questOpened: atPeak.action === 'ratify',
    quest: atPeak.action === 'ratify' ? QUEST : null,
    negativeControl: negControl.action,
  };

  // ── T6: goal met + reproducible win digest ──
  const goldFilled = goldCount() - baseGold >= GOAL_GRADUATIONS; // human's 3 + companion's pick all reached gold
  const win = goldFilled && trace.T5.ratified;
  const econDigest = computeStateDigest(
    {
      fieldNames: ['e'],
      getField: () => Float32Array.from([balanceOf(PLAYER) ?? 100, balanceOf(COMPANION) ?? 100]),
    },
    'sha256'
  );
  const verdictDigest = computeStateDigest(
    {
      fieldNames: ['d'],
      getField: () =>
        Float32Array.from([
          Math.round(trace.T4.finalTrust),
          trace.T5.ratified ? 1 : 0,
          win ? 1 : 0,
        ]),
    },
    'sha256'
  );
  trace.T6 = {
    goldNow: goldCount(),
    goldDelta: goldCount() - baseGold,
    goalGraduations: GOAL_GRADUATIONS,
    goldFilled,
    ratified: trace.T5.ratified,
    win,
    vaultDigestFinal: vaultDigestOf(),
    econDigest,
    verdictDigest,
  };
  return trace;
}
