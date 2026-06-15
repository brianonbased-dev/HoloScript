// gold-game-vault-ops.mjs — the two vault operations beyond LINKING (which lives in
// gold-game-constellation.mjs). Pure, Node-testable, grounded in the committed coords.
//
//   GRADUATE (Shepherd's Climb) — graduate.py: an entry that has EARNED a higher tier (cited
//     enough) is shepherded UP a tier. The most-cited non-diamond entries are "ready to rise".
//   RESOLVE  (Vault Keeper)     — vault_collision_guard: near-duplicate entries competing for
//     the same conceptual SLOT (same-domain pairs in crowded domains) are conflicts to resolve.
//
// Together with LINKING these are the three real vault ops the Curator performs over one world.

export const TIER_RANK = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };
export const NEXT_TIER = {
  bronze: 'silver',
  silver: 'gold',
  gold: 'platinum',
  platinum: 'diamond',
};

export function pairKey(a, b) {
  return a < b ? a + '|' + b : b + '|' + a;
}

/**
 * Build the graduate + resolve op-state from the coords artifact.
 * @param {object} coords parsed knowledge-mountain-coords.json
 */
export function initVaultOps(coords, opts = {}) {
  if (!coords || !Array.isArray(coords.coords))
    throw new Error('initVaultOps: coords missing .coords');
  const nodes = new Map();
  for (const c of coords.coords) {
    nodes.set(c.id, {
      id: c.id,
      tier: c.tier,
      domain: c.domain || 'uncategorized',
      lineageIn: c.lineage_in || 0,
    });
  }

  // GRADUATE-READY: the entries that have earned a rise — most-cited, non-diamond. Deterministic
  // ordering (citations desc, lower tier first, id) so the same set every load.
  const readyCount = opts.readyCount || 24;
  const ready = [...nodes.values()]
    .filter((n) => n.tier !== 'diamond')
    .sort(
      (a, b) =>
        b.lineageIn - a.lineageIn || TIER_RANK[a.tier] - TIER_RANK[b.tier] || (a.id < b.id ? -1 : 1)
    )
    .slice(0, readyCount);
  const readyIds = new Set(ready.map((n) => n.id));

  // CONFLICTS: near-duplicate entries competing for the same slot = same-domain adjacency in the
  // most-crowded domains. Deterministic (domains by size, ids sorted), capped.
  const conflictCount = opts.conflictCount || 20;
  const byDomain = new Map();
  for (const n of nodes.values()) {
    if (!byDomain.has(n.domain)) byDomain.set(n.domain, []);
    byDomain.get(n.domain).push(n.id);
  }
  const conflicts = new Set();
  const domains = [...byDomain.entries()]
    .filter(([, a]) => a.length >= 2)
    .sort((x, y) => y[1].length - x[1].length || (x[0] < y[0] ? -1 : 1));
  for (const [, ids] of domains) {
    ids.sort();
    for (let i = 0; i < ids.length - 1; i++) {
      conflicts.add(pairKey(ids[i], ids[i + 1]));
      if (conflicts.size >= conflictCount) break;
    }
    if (conflicts.size >= conflictCount) break;
  }

  return {
    nodes,
    readyIds,
    readyTotal: readyIds.size,
    conflicts,
    conflictTotal: conflicts.size,
    graduated: new Set(),
    resolved: new Set(),
    score: 0,
  };
}

/** is this entry currently shepherd-able (ready to rise, not yet graduated)? */
export function isReady(state, id) {
  return state.readyIds.has(id) && !state.graduated.has(id);
}

/**
 * Shepherd a ready entry UP a tier. Caller enforces the CLIMB (the entry only graduates once
 * carried higher); this validates readiness and records the graduation (a real graduate.py op).
 */
export function attemptGraduate(state, id) {
  const n = state.nodes.get(id);
  if (!n) return { ok: false, reason: 'unknown-entry', gained: 0 };
  if (state.graduated.has(id)) return { ok: false, reason: 'already-graduated', gained: 0 };
  if (!state.readyIds.has(id)) return { ok: false, reason: 'not-ready', gained: 0 };
  state.graduated.add(id);
  const to = NEXT_TIER[n.tier] || n.tier;
  const gained = 50;
  state.score += gained;
  return { ok: true, reason: 'graduated', from: n.tier, to, gained };
}

/** entries this one conflicts with (unresolved) — for highlighting + auto-resolve */
export function conflictPartners(state, id) {
  const out = [];
  for (const k of state.conflicts) {
    if (state.resolved.has(k)) continue;
    const [a, b] = k.split('|');
    if (a === id) out.push(b);
    else if (b === id) out.push(a);
  }
  return out;
}

/** is this entry part of any unresolved conflict? (for the red pulse) */
export function inConflict(state, id) {
  return conflictPartners(state, id).length > 0;
}

/** resolve a conflict pair (a real collision_guard de-dupe). */
export function attemptResolve(state, a, b) {
  const k = pairKey(a, b);
  if (!state.conflicts.has(k)) return { ok: false, reason: 'not-a-conflict', gained: 0 };
  if (state.resolved.has(k)) return { ok: false, reason: 'already-resolved', gained: 0 };
  state.resolved.add(k);
  const gained = 40;
  state.score += gained;
  return { ok: true, reason: 'resolved', gained, pair: [a, b] };
}

/** the three-verb tallies for the unified Vault Health HUD */
export function vaultProgress(state) {
  return {
    graduated: state.graduated.size,
    graduateTotal: state.readyTotal,
    resolved: state.resolved.size,
    resolveTotal: state.conflictTotal,
    score: state.score,
    complete:
      state.graduated.size === state.readyTotal && state.resolved.size === state.conflictTotal,
  };
}
