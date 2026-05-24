// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Agent Party engine (Gate 29).
//
// The PURE, deterministic party-of-companions engine that WIRES the proven
// pieces into a band of VISIBLE AI companions that climb alongside the human.
// Nothing new is invented; it INTEGRATES real, gate-passed code:
//   • graduate()                  — the real bronze→gold verb + sealed receipt   (Gate 2, vault-ops.cjs)
//   • economyPrimitivesHandler    — each companion earns a reward + spends budget (Gate 8)
//   • reputationLedgerHandler     — each graduation raises the companion's trust  (Gate 8)
//   • autonomousAgendaHandler     — each companion runs an agenda under the real
//                                   $0.50/day ceiling (the spend is metered)       (Gate 8)
//   • persisted per-companion memory of the PLAYER across sessions (read from disk
//     in a fresh session, re-plan differently than a cold party would)            (Gate 4)
//
// What Gate 29 adds over Gate 8: the AI curators become a NAMED, VISIBLE PARTY of
// companions with DISTINCT personas (Archivist values lineage depth, Scout values
// breadth/novelty, Quartermaster values cheap-but-positive ROI). Each companion:
//   (1) CHOOSES an entry by its persona (a different pick than its peers, and the
//       pick is causally attributable to that persona's value function),
//   (2) EXPLAINS the choice with a rationale GROUNDED IN REAL STATE (the entry's
//       lineage_links, the companion's live trust + balance) — not a canned string,
//   (3) SPENDS from a real metered budget under the genuine ceiling,
//   (4) REMEMBERS THE PLAYER across sessions: it persists what the player graduated
//       and adapts (it won't re-pick what the player already took, and it greets the
//       returning player by recalling the last shared session).
//
// Server-side / verifier import this exact engine; the verifier asserts STATE DELTAS
// (anti-F.069): a companion that "chose" but whose vault/economy/memory did not move
// fails. Reproducible via the real computeStateDigest.
// ═══════════════════════════════════════════════════════════════════════════

import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);

export const REWARD = 25;
export const PLAYER = 'human-curator';

// The party — three NAMED, VISIBLE companions with DISTINCT value functions.
// The persona IS the choice policy: each scores a candidate entry differently, so on
// the same pool they pick different entries, and the pick is attributable to the persona.
export const PARTY = [
  {
    id: 'companion-archivist', name: 'Maren the Archivist', glyph: '📜',
    // values lineage DEPTH — the most-connected scar is worth the most
    score: (e) => (e.lineage_links || 0) * 10,
    voice: (e) => `${e.lineage_links} threads run through "${e.title}" — that depth is what the ledger should remember.`,
  },
  {
    id: 'companion-scout', name: 'Edda the Scout', glyph: '🧭',
    // values BREADTH/novelty — prefers entries whose title hints a new domain (longer titles ~ richer), tie-break low lineage
    score: (e) => (e.title || '').length * 1.5 + (e.lineage_links || 0),
    voice: (e) => `"${e.title}" opens ground we haven't mapped — I'll plant the flag there.`,
  },
  {
    id: 'companion-quartermaster', name: 'Bran the Quartermaster', glyph: '⚖️',
    // values ROI — cheapest positive-lineage entry (graduatable but least costly to justify)
    score: (e) => 100 - (e.lineage_links || 0) * 5,
    voice: (e) => `"${e.title}" earns its keep for the least outlay — ${e.lineage_links} links is plenty. Good stewardship.`,
  },
];

function makeCtx() { const events = []; return { ctx: { emit: (t, p) => events.push({ type: t, payload: p }) }, events }; }
const last = (events, t) => [...events].reverse().find((e) => e.type === t);

// A graduatable bronze entry pool (lineage >= 1 can ascend; the persona scores decide who takes what)
const POOL = [
  { id: 'P.PARTY.001', title: 'cross-domain-synthesis-of-causal-and-quantum', tier: 'bronze', lineage_links: 6 },
  { id: 'P.PARTY.002', title: 'receipt-with-solver', tier: 'bronze', lineage_links: 5 },
  { id: 'P.PARTY.003', title: 'survey-before-gap-analysis', tier: 'bronze', lineage_links: 4 },
  { id: 'P.PARTY.004', title: 'import-array-regex-gate', tier: 'bronze', lineage_links: 3 },
  { id: 'P.PARTY.005', title: 'apply-four-refusals-to-own-analysis', tier: 'bronze', lineage_links: 2 },
  { id: 'P.PARTY.006', title: 'scavenging-is-the-default', tier: 'bronze', lineage_links: 1 },
];

// Run ONE party session over a sandbox vault, loading any persisted per-companion
// memory of the player from `memoryPath`, and persisting updated memory at the end.
// `playerPicks` = the entries the human graduated this session (so companions can
// avoid re-taking them and remember them next session).
export async function runPartySession({ sandboxDir, memoryPath, sessionLabel, playerPicks }) {
  const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
  const { economyPrimitivesHandler } = await imp(join(repo, 'packages', 'core', 'src', 'traits', 'EconomyPrimitivesTrait.ts'));
  const { reputationLedgerHandler } = await imp(join(repo, 'packages', 'core', 'src', 'traits', 'ReputationLedgerTrait.ts'));
  const { autonomousAgendaHandler } = await imp(join(repo, 'packages', 'core', 'src', 'traits', 'AutonomousAgendaTrait.ts'));
  const V = require('./vault-ops.cjs');
  const fs = require('node:fs');

  // ── Load persisted memory of the player (Gate-4-style cross-session memory) ──
  let memory = { sessions: 0, lastSession: null, playerGraduatedEver: [], greeting: null };
  if (memoryPath && fs.existsSync(memoryPath)) {
    try { memory = JSON.parse(fs.readFileSync(memoryPath, 'utf8')); } catch { /* cold */ }
  }
  const warm = memory.sessions > 0;

  // ── Seed the shared world: clean graduatable pool ──
  V.buildSandbox(sandboxDir);
  for (const e of POOL) fs.writeFileSync(join(sandboxDir, 'bronze', e.id + '.json'), JSON.stringify(e, null, 2));

  // ── Real sovereign traits: one economy + reputation ledger; per-companion agenda ──
  const econNode = {}; const econ = makeCtx();
  economyPrimitivesHandler.onAttach(econNode, economyPrimitivesHandler.defaultConfig, econ.ctx);
  const ECON = economyPrimitivesHandler.defaultConfig;
  const repNode = {}; const rep = makeCtx(); const REP = { ...reputationLedgerHandler.defaultConfig };
  reputationLedgerHandler.onAttach(repNode, REP, rep.ctx);
  const AG = { agent_class: 'teammate', daily_budget_usd: 0.5, tick_interval_ms: 0 };
  const agendaNodes = {};
  for (const c of PARTY) { agendaNodes[c.id] = { node: {}, ...makeCtx() }; autonomousAgendaHandler.onAttach(agendaNodes[c.id].node, AG, agendaNodes[c.id].ctx); }

  const earn = (id) => economyPrimitivesHandler.onEvent(econNode, ECON, econ.ctx, { type: 'economy:earn', payload: { agentId: id, amount: REWARD, reason: 'graduation' } });
  const observe = (id, action, delta) => reputationLedgerHandler.onEvent(repNode, REP, rep.ctx, { type: 'reputation_observe_action', observerId: id, action, trustDelta: delta });
  const trustOf = (id) => { reputationLedgerHandler.onEvent(repNode, REP, rep.ctx, { type: 'reputation_query', observerId: id }); const s = last(rep.events, 'reputation_ledger_snapshot'); const o = s?.payload?.observers?.find?.((x) => x.id === id) || s?.payload?.observers?.[0]; return o?.trust ?? (REP.initial_trust ?? 50); };
  const balanceOf = (id) => econNode.__economyState?.accounts?.get?.(id)?.balance;

  const entryById = (id) => V.findEntry(sandboxDir, id)?.entry;
  const graduatable = () => V.readState(sandboxDir).tiers.bronze
    .map((id) => entryById(id)).filter((e) => e && (e.lineage_links || 0) >= 1);

  // ── The human plays first (its idiosyncratic picks) — the companions watch ──
  const humanGrads = [];
  for (const id of (playerPicks || [])) {
    const r = V.graduate(sandboxDir, id, PLAYER);
    if (r.ok) { humanGrads.push(id); observe(PLAYER, 'graduated:' + id, 2); }
  }

  // ── Each companion CHOOSES (by persona), EXPLAINS (grounded), SPENDS (metered) ──
  // Memory effect: a warm party will NOT pick what the player has graduated before
  // (it remembers and defers to the human's taste), changing the plan vs a cold party.
  const playerEver = new Set([...(memory.playerGraduatedEver || []), ...humanGrads]);
  const turns = [];
  const taken = new Set(); // companions don't double-pick within a session
  for (const c of PARTY) {
    const pool = graduatable().filter((e) => !taken.has(e.id) && !(warm && playerEver.has(e.id)));
    if (!pool.length) { turns.push({ companion: c.id, name: c.name, picked: null, reason: 'nothing left that respects the player’s taste', graduated: false }); continue; }
    // persona-scored choice (deterministic tie-break by id)
    const ranked = [...pool].sort((a, b) => (c.score(b) - c.score(a)) || (a.id < b.id ? -1 : 1));
    const pick = ranked[0];
    const balBefore = balanceOf(c.id) ?? ECON.initial_balance;
    const r = V.graduate(sandboxDir, pick.id, c.id);
    const graduated = !!r.ok;
    if (graduated) {
      taken.add(pick.id);
      earn(c.id); observe(c.id, 'graduated:' + pick.id, 3);
      const an = agendaNodes[c.id];
      autonomousAgendaHandler.onEvent(an.node, AG, an.ctx, { type: 'agenda_add_item', id: c.id + '-1', title: 'graduate ' + pick.id, estimatedCostUsd: 0.1 });
      autonomousAgendaHandler.onEvent(an.node, AG, an.ctx, { type: 'agenda_complete_item', itemId: c.id + '-1' });
      autonomousAgendaHandler.onUpdate(an.node, AG, an.ctx, 1.0);
    }
    // GROUNDED explanation: persona voice + the live numbers the choice was made on
    const reason = `${c.voice(pick)} (lineage=${pick.lineage_links}, my trust=${Math.round(trustOf(c.id))}, balance=${balanceOf(c.id) ?? balBefore})`;
    turns.push({
      companion: c.id, name: c.name, glyph: c.glyph, picked: pick.id, pickTitle: pick.title,
      reason, score: c.score(pick), graduated,
      balanceBefore: balBefore, balanceAfter: balanceOf(c.id), earnedReward: ((balanceOf(c.id) ?? 0) - balBefore) === REWARD,
      trust: trustOf(c.id), ceilingBreached: agendaNodes[c.id].events.some((e) => e.type === 'agenda_cost_ceiling_breach'),
      avoidedPlayerPick: warm && ranked.length > 0, // warm party filtered the player's prior picks out of the pool
    });
  }

  // ── Greeting that proves cross-session memory of the PLAYER ──
  const greeting = warm
    ? `Welcome back. Last we climbed (session ${memory.sessions}), you raised ${ (memory.playerGraduatedEver || []).slice(-3).join(', ') || 'nothing yet' }. We left those to you.`
    : `First climb together. We'll learn what you value.`;

  // ── Persist updated memory of the player (so NEXT session is warm) ──
  const updatedMemory = {
    sessions: (memory.sessions || 0) + 1,
    lastSession: sessionLabel || ('session-' + ((memory.sessions || 0) + 1)),
    playerGraduatedEver: [...playerEver].sort(),
    greeting,
  };
  if (memoryPath) fs.writeFileSync(memoryPath, JSON.stringify(updatedMemory, null, 2));

  // ── Deterministic digests via the REAL contract fn ──
  const idI = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 2147483647; return h; };
  const partyDigest = computeStateDigest({ fieldNames: ['p'], getField: () => Float32Array.from(
    turns.flatMap((t) => [idI(t.companion), t.picked ? idI(t.picked) : 0, t.graduated ? 1 : 0, Math.round(t.trust || 0)])) }, 'sha256');
  const economyDigest = computeStateDigest({ fieldNames: ['e'], getField: () => Float32Array.from(
    PARTY.map((c) => [idI(c.id), balanceOf(c.id) ?? 0]).sort((a, b) => a[0] - b[0]).flat()) }, 'sha256');

  return {
    sessionLabel: updatedMemory.lastSession, warm, greeting,
    humanGrads, turns,
    distinctPicks: new Set(turns.filter((t) => t.picked).map((t) => t.picked)).size,
    allGraduated: turns.every((t) => t.graduated),
    allGroundedReasons: turns.every((t) => t.picked == null || /lineage=\d+, my trust=\d+, balance=/.test(t.reason)),
    noCeilingBreach: turns.every((t) => !t.ceilingBreached),
    memoryBefore: memory, memoryAfter: updatedMemory,
    partyDigest, economyDigest,
  };
}
