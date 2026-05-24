// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 25: continuous-campaign state machine (PURE).
//
// A pure, deterministic state machine for the ongoing campaign that sits ON TOP
// of the real curation verb. It does NOT graduate anything itself — the game's
// real graduate op (Gate 2 verb, HoloGate-gated) calls `recordGraduation(state, id)`
// and this module turns that real event into progression: quest log, the One Climb
// win, and a persistent next-ratchet pointer. Same shared-module pattern as
// gold-game-controls.mjs (Gate 15) and gold-game-loop.mjs (Gate 19):
//   - imported by drive-build.mjs so the build and the proof run the SAME code,
//   - exercised by gate-25-campaign-verify.mjs which asserts STATE DELTAS (anti-F.069).
//
// Anti-F.069 contract: every transition here is an observable delta on a returned
// state object, not a string the build happens to contain. A graduation that did
// not happen produces no progress; a corrupt/blocked store degrades to in-memory.
// ═══════════════════════════════════════════════════════════════════════════

export const CAMPAIGN_KEY = 'goldGame.campaign.v1';

// The canonical quest definitions. Ids are stable across saves (used for merge).
export const QUEST_DEFS = [
  { id: 'one-climb', title: 'One Climb', desc: 'Graduate your first glowing GOLD entry' },
  { id: 'read-record', title: 'Read the Record', desc: 'Open a full GOLD record (F / inspect)' },
  { id: 'three-summits', title: 'Three Summits', desc: 'Graduate three entries — the campaign deepens' },
  { id: 'lineage-walk', title: 'Lineage Walk', desc: 'Open the HoloGraph constellation (G) and follow a link' },
];

export const NEXT_RATCHET = 'Gate 26 — prove the shared-world shape before claiming MMO';

export function initCampaign() {
  return {
    version: 1,
    questLog: QUEST_DEFS.map((q) => ({ id: q.id, title: q.title, desc: q.desc, done: false })),
    graduatedIds: [],
    oneClimbComplete: false,
    campaignComplete: false,
    nextRatchet: NEXT_RATCHET,
    lastPlayedAt: null,
  };
}

function refreshComplete(state) {
  state.campaignComplete = state.questLog.every((q) => q.done);
  return state;
}

// Mark a quest done. Returns true only if it FLIPPED from open→done (a real delta).
export function setQuestDone(state, id) {
  const q = state.questLog.find((x) => x.id === id);
  if (q && !q.done) { q.done = true; refreshComplete(state); return true; }
  return false;
}

// The ONLY entry point for progress. Called when a REAL graduation lands (any path:
// VR grab / first-person E / keyboard). Idempotent per entry id. Returns the deltas
// it produced so callers (and the verifier) can assert exactly what changed.
export function recordGraduation(state, entryId) {
  const before = {
    graduated: state.graduatedIds.length,
    oneClimb: state.oneClimbComplete,
    complete: state.campaignComplete,
  };
  const isNew = entryId != null && state.graduatedIds.indexOf(entryId) === -1;
  if (isNew) state.graduatedIds.push(entryId);
  if (!state.oneClimbComplete && state.graduatedIds.length >= 1) {
    state.oneClimbComplete = true;
    setQuestDone(state, 'one-climb');
  }
  if (state.graduatedIds.length >= 3) setQuestDone(state, 'three-summits');
  refreshComplete(state);
  return {
    countedNew: isNew,
    graduated: state.graduatedIds.length,
    oneClimbJustWon: !before.oneClimb && state.oneClimbComplete,
    campaignJustComplete: !before.complete && state.campaignComplete,
  };
}

// The current live objective: the first still-open quest, or null when complete.
export function currentObjective(state) {
  const next = state.questLog.find((q) => !q.done);
  return next ? { id: next.id, title: next.title, desc: next.desc } : null;
}

// Serialize for persistence (localStorage). Pure — no I/O here.
export function serialize(state) {
  return JSON.stringify({
    version: 1,
    questLog: state.questLog.map((q) => ({ id: q.id, done: q.done })),
    graduatedIds: state.graduatedIds.slice(0, 256),
    oneClimbComplete: state.oneClimbComplete,
    campaignComplete: state.campaignComplete,
    lastPlayedAt: state.lastPlayedAt,
  });
}

// Restore from a serialized string onto a FRESH state. Corrupt/old/blank input
// returns a clean init (never throws) — resilience is part of the contract.
export function deserialize(raw) {
  const state = initCampaign();
  if (!raw) return state;
  let saved;
  try { saved = JSON.parse(raw); } catch (_) { return state; }
  if (!saved || saved.version !== 1) return state;
  state.graduatedIds = Array.isArray(saved.graduatedIds) ? saved.graduatedIds.slice(0, 256) : [];
  state.oneClimbComplete = Boolean(saved.oneClimbComplete);
  if (Array.isArray(saved.questLog)) {
    for (const sq of saved.questLog) {
      const q = state.questLog.find((x) => x.id === sq.id);
      if (q) q.done = Boolean(sq.done);
    }
  }
  state.lastPlayedAt = saved.lastPlayedAt || null;
  refreshComplete(state);
  return state;
}

// Does a saved campaign represent real prior progress worth a "Continue" button?
export function hasResumableProgress(state) {
  return Boolean(state && (state.oneClimbComplete || (state.graduatedIds && state.graduatedIds.length > 0)));
}
