// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — curation SHARPENING layer (Gate 11 / E-G11). Pure, deterministic.
//
// Built module-first (F.077): the gate-11 verifier composes this; it does not inline
// the algorithm. Separately unit-testable, seeded (no wall-clock / Math.random).
//
// WHY THIS EXISTS (deep-ratchet 2026-05-24, E-G11): Gate 11's CPU path runs the real
// QuantumInspiredTrait's `CpuFallbackAccelerator` — a 0.5-centered monotonic sigmoid.
// That squash is decision-NEUTRAL: it can never change which entries cross a 0.5
// graduate/defer threshold, so it does not "sharpen" anything. The genuine
// annealing-analogue (SnnAccelerator) is GPU-only and not exercised CPU-side.
//
// Founder-ruled path (E-G11, NON-shared): build a gold-game-LOCAL sharpening layer
// that genuinely moves NEAR-BOUNDARY (ambiguous) items off the fence using cohort
// context — changing decisions a plain 0.5 threshold would NOT, in a way that
// improves curation quality against ground truth. This file is that layer.
//
// THE MECHANISM (a real quantum-annealing analogue — mean-field / deterministic
// annealing, the classical cousin of a coherent-Ising-machine / D-Wave anneal):
//   Treat each candidate's decision as a spin m_i ∈ (-1,+1)  (graduate>0 / defer<0).
//   Energy  E(m) = -Σ_i h_i m_i  -  Σ_{i<j} J_ij m_i m_j     (an Ising Hamiltonian)
//     • local field  h_i  = (priority_i-0.5) + β·(evidence_i-0.5)
//         → FUSES two independent noisy views of the hidden quality (sensor fusion).
//     • coupling     J_ij = γ·simKernel(i,j)
//         → similar entries are ferromagnetically coupled: a cohort of near-duplicate
//           entries should reach a CONSISTENT graduate/defer decision (smoothness prior).
//   Anneal T from hot→cold; at each T relax m_i ← tanh((h_i + Σ_j J_ij m_j)/T).
//   CONFIDENT items (large |h_i|) saturate to sign(h_i)=raw decision → never flip.
//   FENCE-SITTERS (small |h_i|) are decided by the coupling + fused-evidence terms →
//   the cohort sharpens them. That is the whole point.
//
// HONEST SCOPE: this is a gold-game-LOCAL annealing analogue, NOT the shared trait's
// GPU SnnAccelerator and NOT real QPU hardware. The shared QuantumInspiredTrait CPU
// fallback is deliberately left untouched (coupling one gate's needs into shared
// curation infra is the wrong move — E-G11 RISK/OWNER, Four Refusals). The scenario is
// synthetic with a known hidden quality (like Gate 5a); real operator traces are a
// future deepening, not blocking.
// ═══════════════════════════════════════════════════════════════════════════

// Deterministic PRNG (mulberry32) — identical to the curation-policy module.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
// Box–Muller (deterministic given the rng) for gaussian observation noise.
function gauss(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Scenario ───────────────────────────────────────────────────────────────
// A cohort of candidate vault entries. Each carries:
//   q        hidden TRUE curation quality in [0,1]  (the agent never sees this)
//   label    ground truth: graduate iff q > 0.5
//   priority NOISY proxy #1  = q + noiseA   (what the OLD gate thresholds at 0.5)
//   evidence NOISY proxy #2  = q + noiseB   (independent second view; e.g. downstream-link signal)
//   feat     2-D cohort coordinate correlated with q → similar entries share labels
// Entries are intentionally generated with several q near 0.5 so the noisy priority
// proxy misclassifies fence-sitters that cohort context can rescue.
export function makeCohort(rng, n = 24, { noiseA = 0.16, noiseB = 0.16 } = {}) {
  const items = [];
  for (let i = 0; i < n; i++) {
    // bias q toward the 0.5 boundary so the task is non-trivial (many fence-sitters)
    const base = rng();
    const q = clamp01(0.5 + (base - 0.5) * 0.9); // squeezed toward 0.5
    const priority = clamp01(q + gauss(rng) * noiseA);
    const evidence = clamp01(q + gauss(rng) * noiseB);
    // cohort coordinate: primarily q, plus mild scatter → neighbors tend to agree
    const feat = [q + gauss(rng) * 0.08, rng()];
    items.push({ id: `C.${String(i + 1).padStart(3, '0')}`, q, label: q > 0.5, priority, evidence, feat });
  }
  return items;
}

// Gaussian similarity kernel over cohort coordinates (0..1; 1 = identical).
export function simKernel(a, b, lengthScale = 0.18) {
  let d2 = 0;
  for (let k = 0; k < a.length; k++) d2 += (a[k] - b[k]) ** 2;
  return Math.exp(-d2 / (2 * lengthScale * lengthScale));
}

// Raw 0.5-threshold baseline decision on the noisy priority proxy (the OLD gate).
export const rawDecision = (item) => item.priority > 0.5;

// ── The sharpening layer: mean-field (deterministic) annealing ───────────────
// Returns { m, decision } where m_i ∈ (-1,1) is the relaxed spin and decision_i its sign.
// β=0,γ=0 reduces EXACTLY to thresholding priority (the negative control).
export function sharpen(items, { beta = 1.0, gamma = 0.2, lengthScale = 0.10, T0 = 2.0, Tmin = 0.05, sweeps = 60 } = {}) {
  const n = items.length;
  // local field: fused evidence (priority + β·evidence), both recentred on the 0.5 boundary
  const h = items.map((it) => (it.priority - 0.5) + beta * (it.evidence - 0.5));
  // symmetric coupling matrix from cohort similarity (no self-coupling)
  const J = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = gamma * simKernel(items[i].feat, items[j].feat, lengthScale);
      J[i][j] = c; J[j][i] = c;
    }
  }
  // init at the field-only fixed point so the control (γ=0) is a pure squash of h
  let m = h.map((hi) => Math.tanh(hi / T0));
  // geometric cooling schedule
  const ratio = Math.pow(Tmin / T0, 1 / Math.max(1, sweeps - 1));
  let T = T0;
  for (let s = 0; s < sweeps; s++) {
    const next = new Array(n);
    for (let i = 0; i < n; i++) {
      let field = h[i];
      for (let j = 0; j < n; j++) if (j !== i) field += J[i][j] * m[j];
      next[i] = Math.tanh(field / T);
    }
    m = next;
    T *= ratio;
  }
  return { m, decision: m.map((v) => v > 0) };
}

// Accuracy of a boolean decision array against ground-truth labels.
export const accuracy = (items, decisions) => {
  let hit = 0;
  for (let i = 0; i < items.length; i++) if (decisions[i] === items[i].label) hit++;
  return items.length ? hit / items.length : 0;
};

// Indices where two decision arrays disagree (the "flips").
export const flips = (a, b) => {
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) out.push(i);
  return out;
};

// Convenience: run the full E-G11 experiment on ONE cohort and return everything the
// gate asserts on. `flipTowardTruth` counts flips that land on the correct label.
export function runSharpeningExperiment(seed = 20260524, n = 24, opts = {}) {
  const items = makeCohort(mulberry32(seed >>> 0), n);
  const raw = items.map(rawDecision);
  const { m, decision: sharp } = sharpen(items, opts);
  // negative control: no evidence fusion, no cohort coupling → must collapse to raw
  const { decision: control } = sharpen(items, { ...opts, beta: 0, gamma: 0 });
  const flipIdx = flips(raw, sharp);
  const flipTowardTruth = flipIdx.filter((i) => sharp[i] === items[i].label).length;
  const flipNearBoundary = flipIdx.filter((i) => Math.abs(items[i].priority - 0.5) < 0.20).length;
  return {
    items, raw, sharp, control, m, flipIdx,
    flipCount: flipIdx.length, flipTowardTruth, flipNearBoundary,
    accRaw: accuracy(items, raw),
    accSharp: accuracy(items, sharp),
    accControl: accuracy(items, control),
    controlFlips: flips(raw, control).length,
  };
}

// AGGREGATE over many independent cohorts — the statistically honest claim (cf. Gate
// 5a's held-out set). A single cohort can win or lose by luck; the gate asserts the
// mechanism improves curation quality ON AVERAGE, with the negative control proving
// the gain comes from evidence-fusion + cohort-coupling, not annealing dynamics.
export function runAggregate({ cohorts = 200, n = 24, seed0 = 1, opts = {} } = {}) {
  let sumRaw = 0, sumSharp = 0, sumControl = 0;
  let totalFlips = 0, controlFlips = 0, flipsTowardTruth = 0, flipsNearBoundary = 0;
  let maxConfidenceFlip = 0;
  for (let s = seed0; s < seed0 + cohorts; s++) {
    const r = runSharpeningExperiment(s, n, opts);
    sumRaw += r.accRaw; sumSharp += r.accSharp; sumControl += r.accControl;
    totalFlips += r.flipCount; controlFlips += r.controlFlips;
    flipsTowardTruth += r.flipTowardTruth; flipsNearBoundary += r.flipNearBoundary;
    for (const i of r.flipIdx) maxConfidenceFlip = Math.max(maxConfidenceFlip, Math.abs(r.items[i].priority - 0.5));
  }
  return {
    cohorts, n,
    meanAccRaw: sumRaw / cohorts,
    meanAccSharp: sumSharp / cohorts,
    meanAccControl: sumControl / cohorts,
    meanGain: (sumSharp - sumRaw) / cohorts,
    totalFlips, controlFlips,
    fracFlipTowardTruth: totalFlips ? flipsTowardTruth / totalFlips : 0,
    fracFlipNearBoundary: totalFlips ? flipsNearBoundary / totalFlips : 0,
    maxConfidenceFlip,
  };
}
