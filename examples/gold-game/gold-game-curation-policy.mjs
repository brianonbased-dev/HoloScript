// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — curation-policy engine (Gate 5a / E-G5a). Pure, deterministic.
//
// Built module-first (F.077): the gate-5a verifier composes this; it does not inline
// the ML. Separately unit-testable, seeded (no wall-clock / Math.random).
//
// THE TASK: pick which knowledge entry to graduate next from a pool. Each entry has
// features [lineage L, downstream-links D, tier-inverse Tinv].
//
// E-G5a honesty fix (founder-ruled 2026-05-24): the truth is NON-LINEAR — a keystone
// entry that is strong in BOTH lineage AND downstream is disproportionately valuable
// (an L·D interaction term), on top of the linear rewards. This matters because:
//   • a FAIR linear hand-weighting (using ALL features, even the true linear weights)
//     STRUCTURALLY cannot capture the interaction → it is non-trivial, capped below 1.0;
//   • a learned model GIVEN the interaction feature can capture it → it beats the fair
//     baseline by a real margin because it learns structure no hand-rule can express.
// This replaces the old rigged contest (linear truth + lineage-ONLY crippled baseline).
// ═══════════════════════════════════════════════════════════════════════════

// Deterministic PRNG (mulberry32).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hidden TRUE curation value: linear (3L + 2D + 1·Tinv) PLUS a non-linear keystone
// interaction (4·L·D). Max = 3+2+1+4 = 10. The agent never sees this; it learns.
export const TRUE_LINEAR = [3, 2, 1]; // [L, D, Tinv]
export const TRUE_INTERACTION = 4;    // weight on L·D
export const TRUE_MAX = TRUE_LINEAR[0] + TRUE_LINEAR[1] + TRUE_LINEAR[2] + TRUE_INTERACTION;
export const trueVal = (f) =>
  (TRUE_LINEAR[0] * f[0] + TRUE_LINEAR[1] * f[1] + TRUE_LINEAR[2] * f[2] + TRUE_INTERACTION * f[0] * f[1]) / TRUE_MAX;

// Feature lift: the learned model sees the raw 3 features PLUS the interaction L·D.
// A linear hand-rule only ever sees the raw 3 — that asymmetry is the whole point.
export const liftFeatures = (f) => [f[0], f[1], f[2], f[0] * f[1]];

// Generate curation episodes (a pool of entries; the target is the true-best to graduate).
export function makeEpisodes(rng, n) {
  const eps = [];
  for (let i = 0; i < n; i++) {
    const k = 3 + Math.floor(rng() * 4); // pool of 3..6 entries
    const pool = [];
    for (let j = 0; j < k; j++) {
      const L = rng();
      const D = rng();
      const Tinv = [1, 2 / 3, 1 / 3, 0][Math.floor(rng() * 4)];
      pool.push({ f: [L, D, Tinv], v: 0 });
    }
    for (const e of pool) e.v = trueVal(e.f);
    const best = pool.reduce((bi, e, idx, arr) => (e.v > arr[bi].v ? idx : bi), 0);
    eps.push({ pool, best });
  }
  return eps;
}

// Batch gradient descent, linear-in-its-features value model, zero init (deterministic).
// `featureFn` maps a raw feature vector to the model's feature space (raw vs lifted).
export function train(episodes, featureFn, epochs = 800, lr = 0.4) {
  const rows = episodes.flatMap((e) => e.pool.map((p) => ({ x: featureFn(p.f), y: p.v })));
  const dim = rows.length ? rows[0].x.length : 0;
  let w = new Array(dim).fill(0), b = 0;
  for (let ep = 0; ep < epochs; ep++) {
    const gw = new Array(dim).fill(0); let gb = 0;
    for (const { x, y } of rows) {
      let pred = b;
      for (let d = 0; d < dim; d++) pred += w[d] * x[d];
      const err = pred - y;
      for (let d = 0; d < dim; d++) gw[d] += err * x[d];
      gb += err;
    }
    const m = rows.length;
    for (let d = 0; d < dim; d++) w[d] -= (lr * gw[d]) / m;
    b -= (lr * gb) / m;
  }
  return { w, b };
}

export const scoreModel = (model, featureFn, f) => {
  const x = featureFn(f);
  let s = model.b;
  for (let d = 0; d < x.length; d++) s += model.w[d] * x[d];
  return s;
};

export const argmaxBy = (pool, fn) =>
  pool.reduce((bi, e, idx, arr) => (fn(arr[idx]) > fn(arr[bi]) ? idx : bi), 0);

// Top-1 next-graduation selection accuracy on held-out episodes.
export function top1(episodes, pick) {
  let hit = 0;
  for (const e of episodes) if (pick(e.pool) === e.best) hit++;
  return episodes.length ? hit / episodes.length : 0;
}

// ── Baselines ────────────────────────────────────────────────────────────────
// FAIR hand-authored heuristic: uses ALL THREE raw features with the true LINEAR
// weights (the best a knowledgeable human could hand-write) — but it is linear, so it
// cannot express the L·D keystone interaction. This is the honest bar to beat.
export const fairLinearScore = (f) => TRUE_LINEAR[0] * f[0] + TRUE_LINEAR[1] * f[1] + TRUE_LINEAR[2] * f[2];
// CRIPPLED heuristic (kept only to show the progression): lineage-only.
export const crippledLineageScore = (f) => f[0];
