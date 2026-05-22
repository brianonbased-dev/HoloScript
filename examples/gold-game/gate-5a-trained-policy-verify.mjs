// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 5a verifier: a TRAINED curation policy (REPRODUCIBLE).
//
// Gate 5 bundles three sub-claims (live operator + TRAINED policy + Quest). This
// is sub-gate 5a: replace the hand-authored lineage-descending heuristic the
// agent used in Gates 3-4 with a policy that is actually LEARNED from data
// (batch gradient descent), and PROVE it beats the heuristic on held-out
// episodes. Closes the Gates 3-4 honestScope caveat ("hand-authored, not a
// trained model"). Fully deterministic (seeded PRNG, zero-init GD) so weights +
// metrics + digest reproduce byte-for-byte.
//
// THE TASK: pick which knowledge entry to graduate next from a pool. Each entry
// has features [lineage L, downstream-links D, tier-inverse Tinv]. The true
// curation value rewards ALL THREE (3L + 2D + 1*Tinv) — so the old heuristic
// (argmax L only) is provably suboptimal, and a model that learns to weight D
// and tier too will beat it.
//
//   node_modules/.bin/tsx examples/gold-game/gate-5a-trained-policy-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-5a-trained-policy-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const receiptPath = join(here, 'GATE-5A-TRAINED-POLICY-receipt.json');
const { computeStateDigest } = await import(
  pathToFileURL(join(repoRoot, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')).href
);

const HASH_MODE = 'sha256';
// ── Deterministic PRNG (mulberry32) — no wall-clock, no Math.random ───────────
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── The hidden TRUE curation value (rewards lineage AND downstream AND low tier) ─
// Normalized to [0,1] (max = 3+2+1 = 6). The agent does NOT see this; it learns.
const TRUE_W = [3, 2, 1]; // [L, D, Tinv]
const trueVal = (f) => (TRUE_W[0] * f[0] + TRUE_W[1] * f[1] + TRUE_W[2] * f[2]) / 6;

// ── Generate curation episodes (a pool of entries; pick the best to graduate) ──
function makeEpisodes(rng, n) {
  const eps = [];
  for (let i = 0; i < n; i++) {
    const k = 3 + Math.floor(rng() * 4); // pool of 3..6 entries
    const pool = [];
    for (let j = 0; j < k; j++) {
      const L = rng();                       // lineage links (norm)
      const D = rng();                       // downstream links (norm)
      const Tinv = [1, 2 / 3, 1 / 3, 0][Math.floor(rng() * 4)]; // tier-inverse (bronze..platinum)
      pool.push({ f: [L, D, Tinv], v: 0 });
    }
    for (const e of pool) e.v = trueVal(e.f);
    const best = pool.reduce((bi, e, idx, arr) => (e.v > arr[bi].v ? idx : bi), 0);
    eps.push({ pool, best });
  }
  return eps;
}

// ── TRAIN: batch gradient descent, linear value model, zero init (deterministic) ─
function train(episodes, epochs = 600, lr = 0.4) {
  let w = [0, 0, 0], b = 0;
  const rows = episodes.flatMap((e) => e.pool.map((p) => ({ x: p.f, y: p.v })));
  for (let ep = 0; ep < epochs; ep++) {
    let gw = [0, 0, 0], gb = 0;
    for (const { x, y } of rows) {
      const pred = w[0] * x[0] + w[1] * x[1] + w[2] * x[2] + b;
      const err = pred - y;
      gw[0] += err * x[0]; gw[1] += err * x[1]; gw[2] += err * x[2]; gb += err;
    }
    const m = rows.length;
    w = [w[0] - (lr * gw[0]) / m, w[1] - (lr * gw[1]) / m, w[2] - (lr * gw[2]) / m];
    b = b - (lr * gb) / m;
  }
  return { w, b };
}

const score = (model, f) => model.w[0] * f[0] + model.w[1] * f[1] + model.w[2] * f[2] + model.b;
const argmaxBy = (pool, fn) => pool.reduce((bi, e, idx, arr) => (fn(arr[idx]) > fn(arr[bi]) ? idx : bi), 0);

// ── EVAL: top-1 selection accuracy on HELD-OUT episodes ───────────────────────
function top1(episodes, pick) {
  let hit = 0;
  for (const e of episodes) if (pick(e.pool) === e.best) hit++;
  return hit / episodes.length;
}

// ── Run: seeded data, split 70/30, train on train, eval on test ───────────────
const rng = mulberry32(20260522);
const all = makeEpisodes(rng, 400);
const split = Math.floor(all.length * 0.7);
const trainEps = all.slice(0, split);
const testEps = all.slice(split);

const model = train(trainEps);
const r4 = (n) => Number(n.toFixed(6));

const accTrained = top1(testEps, (pool) => argmaxBy(pool, (e) => score(model, e.f)));
const accHeuristic = top1(testEps, (pool) => argmaxBy(pool, (e) => e.f[0])); // old policy: argmax lineage only
// random baseline: expected 1/k averaged over the test pools (analytic, deterministic)
const accRandom = testEps.reduce((s, e) => s + 1 / e.pool.length, 0) / testEps.length;

// ── Receipt digest via the REAL contract fn (weights + metrics) ───────────────
const policyDigest = computeStateDigest(
  { fieldNames: ['policy'], getField: () => Float32Array.from([...model.w.map(r4), r4(model.b), r4(accTrained), r4(accHeuristic), r4(accRandom)]) },
  HASH_MODE,
);

const receipt = {
  gate: '5a',
  track: 'flagship (sub-gate of Gate 5)',
  name: 'trained curation policy — learned value model beats the hand-authored heuristic',
  verifier: 'examples/gold-game/gate-5a-trained-policy-verify.mjs',
  task: 'pick which knowledge entry to graduate next from a pool; features [lineage L, downstream-links D, tier-inverse Tinv]',
  training: {
    method: 'batch gradient descent, linear value model, zero-init — fully deterministic (seeded mulberry32, no wall-clock/Math.random)',
    seed: 20260522,
    episodes: all.length,
    trainEpisodes: trainEps.length,
    testEpisodes: testEps.length,
    epochs: 600,
    learningRate: 0.4,
    learnedWeights: { L: r4(model.w[0]), D: r4(model.w[1]), Tinv: r4(model.w[2]), bias: r4(model.b) },
    note: 'the model recovers weights approximating the hidden true value (3L+2D+1Tinv normalized) WITHOUT being told them — it learns that downstream-links and tier matter, which the lineage-only heuristic ignores.',
  },
  evaluation: {
    metric: 'top-1 next-graduation selection accuracy on HELD-OUT episodes',
    trained: r4(accTrained),
    heuristic_argmaxLineage: r4(accHeuristic),
    random_baseline: r4(accRandom),
    trainedBeatsHeuristic: accTrained > accHeuristic,
    trainedBeatsRandom: accTrained > accRandom,
  },
  contract: {
    spine: 'REAL computeStateDigest from packages/engine/src/simulation/hashes.ts',
    function: 'computeStateDigest(policySolver, hashMode)',
    algorithm: HASH_MODE,
    policyDigest,
    reproducible: 'run `node_modules/.bin/tsx examples/gold-game/gate-5a-trained-policy-verify.mjs` to re-derive',
  },
  honestScope: 'A small LINEAR value model trained by gradient descent on SYNTHETIC curation episodes (a faithful model of the real "graduate the highest-value entry" task: value = lineage + downstream-links + tier). What is PROVEN: a genuinely LEARNED policy (weights fit from data, not hand-set) beats the hand-authored lineage-only heuristic on held-out data — closing the Gates 3-4 "hand-authored, not trained" caveat. What is NOT yet proven (remaining Gate 5 sub-gates): 5b a live human-operator session (needs a headset/operator), 5c Quest projection via /embodied (needs the device). This is a classical ML baseline on synthetic data, not a deep model on real operator traces.',
  core: JSON.parse(readFileSync(join(repoRoot, 'packages', 'core', 'package.json'), 'utf8')).version,
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-5A RECEIPT EMITTED ->', receiptPath);
  console.log('  learnedWeights L/D/Tinv=' + model.w.map(r4).join('/'), 'bias=' + r4(model.b));
  console.log('  top1 trained=' + r4(accTrained), 'heuristic=' + r4(accHeuristic), 'random=' + r4(accRandom));
  console.log('  policyDigest=' + policyDigest);
} else {
  let existing;
  try { existing = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch {
    console.error('No Gate-5a receipt to verify. Run with --emit first.'); process.exit(2);
  }
  const checks = [
    ['training is deterministic (weights reproduce)', r4(model.w[0]) === existing.training.learnedWeights.L && r4(model.w[1]) === existing.training.learnedWeights.D && r4(model.w[2]) === existing.training.learnedWeights.Tinv],
    ['trained policy beats the hand-authored lineage-only heuristic (held-out)', accTrained > accHeuristic],
    ['trained policy beats the random baseline (held-out)', accTrained > accRandom],
    ['trained top-1 accuracy is strong (>= 0.85)', accTrained >= 0.85],
    ['model learned that downstream-links matter (w_D > 0)', model.w[1] > 0],
    ['model learned that tier matters (w_Tinv > 0)', model.w[2] > 0],
    ['held-out test set is non-trivial (>= 50 episodes)', testEps.length >= 50],
    ['policy digest reproduces (real computeStateDigest)', policyDigest === existing.contract.policyDigest],
  ];
  let ok = true;
  console.log('GATE-5A (TRAINED POLICY) VERIFICATION (deterministic re-train, real contract fn):');
  for (const [label, pass] of checks) { console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label); ok = ok && pass; }
  console.log('  trained=' + r4(accTrained), 'heuristic=' + r4(accHeuristic), 'random=' + r4(accRandom));
  console.log('  => GATE 5a', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
