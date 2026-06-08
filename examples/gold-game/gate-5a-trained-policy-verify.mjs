// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 5a verifier: a TRAINED curation policy (REPRODUCIBLE).
//
// Sub-gate 5a: replace the hand-authored heuristic with a policy that is actually
// LEARNED from data (batch gradient descent) and PROVE it beats the heuristic on
// held-out episodes. Fully deterministic (seeded PRNG, zero-init GD) so weights +
// metrics + digest reproduce byte-for-byte.
//
// E-G5a (founder-ruled 2026-05-24, deep-ratchet honesty fix): the old contest was
// rigged twice — a LINEAR truth vs a lineage-ONLY crippled baseline — so a linear
// model trivially hit 1.00 vs 0.65. Now the truth is NON-LINEAR (an L·D keystone
// interaction) and the bar is a FAIR baseline that uses ALL features with the true
// linear weights. The learned model wins by capturing the interaction a linear
// hand-rule STRUCTURALLY cannot — a real, non-trivial advantage, not a strawman.
// The policy/ML logic lives in the pure module gold-game-curation-policy.mjs (F.077).
//
//   node_modules/.bin/tsx examples/gold-game/gate-5a-trained-policy-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-5a-trained-policy-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import {
  mulberry32,
  makeEpisodes,
  train,
  liftFeatures,
  scoreModel,
  argmaxBy,
  top1,
  fairLinearScore,
  crippledLineageScore,
  TRUE_LINEAR,
  TRUE_INTERACTION,
} from './gold-game-curation-policy.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const receiptPath = join(here, 'GATE-5A-TRAINED-POLICY-receipt.json');
const { computeStateDigest } = await import(
  pathToFileURL(join(repoRoot, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')).href
);
const HASH_MODE = 'sha256';
const r4 = (n) => Number(n.toFixed(6));
const rawFeat = (f) => [f[0], f[1], f[2]];

// ── Seeded data, split 70/30, train on train, eval on held-out test ───────────
const rng = mulberry32(20260522);
const all = makeEpisodes(rng, 400);
const split = Math.floor(all.length * 0.7);
const trainEps = all.slice(0, split);
const testEps = all.slice(split);

// Learned model WITH the interaction feature (captures the L·D keystone structure);
// plus a best pure-LINEAR fit, to show the advantage is specifically the non-linearity.
const model = train(trainEps, liftFeatures);
const linFit = train(trainEps, rawFeat);

const accTrained = top1(testEps, (pool) =>
  argmaxBy(pool, (e) => scoreModel(model, liftFeatures, e.f))
);
const accBestLinearFit = top1(testEps, (pool) =>
  argmaxBy(pool, (e) => scoreModel(linFit, rawFeat, e.f))
);
const accFair = top1(testEps, (pool) => argmaxBy(pool, (e) => fairLinearScore(e.f))); // FAIR bar: all features, true linear weights
const accCrippled = top1(testEps, (pool) => argmaxBy(pool, (e) => crippledLineageScore(e.f))); // old strawman (context only)
const accRandom = testEps.reduce((s, e) => s + 1 / e.pool.length, 0) / testEps.length;
const interactionWeight = model.w[3];
const marginOverFair = accTrained - accFair;

const policyDigest = computeStateDigest(
  {
    fieldNames: ['policy'],
    getField: () =>
      Float32Array.from([
        ...model.w.map(r4),
        r4(model.b),
        r4(accTrained),
        r4(accBestLinearFit),
        r4(accFair),
        r4(accCrippled),
        r4(accRandom),
      ]),
  },
  HASH_MODE
);

const receipt = {
  gate: '5a',
  track: 'flagship (sub-gate of Gate 5)',
  name: 'trained curation policy — learned value model beats a FAIR heuristic on a non-trivial (non-linear) task',
  verifier: 'examples/gold-game/gate-5a-trained-policy-verify.mjs',
  policyModule: 'examples/gold-game/gold-game-curation-policy.mjs',
  task: 'pick which knowledge entry to graduate next; features [lineage L, downstream-links D, tier-inverse Tinv]; TRUE value = 3L+2D+1Tinv + 4·(L·D) keystone interaction (NON-LINEAR)',
  training: {
    method:
      'batch gradient descent, linear-in-features model with an L·D interaction feature, zero-init — deterministic (seeded mulberry32, no wall-clock/Math.random)',
    seed: 20260522,
    episodes: all.length,
    trainEpisodes: trainEps.length,
    testEpisodes: testEps.length,
    learnedWeights: {
      L: r4(model.w[0]),
      D: r4(model.w[1]),
      Tinv: r4(model.w[2]),
      'L·D': r4(model.w[3]),
      bias: r4(model.b),
    },
    note: 'the model learns a positive weight on the L·D interaction feature — the keystone structure a linear hand-rule cannot express.',
  },
  evaluation: {
    metric: 'top-1 next-graduation selection accuracy on HELD-OUT episodes',
    trained_withInteraction: r4(accTrained),
    bestPureLinearFit: r4(accBestLinearFit),
    fairLinearHeuristic_allFeatures: r4(accFair),
    crippledLineageOnly_context: r4(accCrippled),
    random_baseline: r4(accRandom),
    marginOverFair: r4(marginOverFair),
    trainedBeatsFair: accTrained > accFair,
    fairIsNonTrivial: accFair < 0.95,
    fairBeatsCrippled: accFair > accCrippled,
    advantageIsNonLinearity: accTrained > accBestLinearFit,
  },
  contract: {
    spine: 'REAL computeStateDigest from packages/engine/src/simulation/hashes.ts',
    algorithm: HASH_MODE,
    policyDigest,
    reproducible:
      'run `node_modules/.bin/tsx examples/gold-game/gate-5a-trained-policy-verify.mjs` to re-derive',
  },
  honestScope:
    'A learned value model (gradient descent, with an L·D interaction feature) on SYNTHETIC curation episodes whose TRUE value is NON-LINEAR (keystone interaction). PROVEN: the learned policy beats a FAIR hand-authored heuristic — one that uses ALL THREE features with the true linear weights — by a real margin on held-out data, BECAUSE it captures the interaction the fair linear rule structurally cannot (it also beats the best pure-linear fit). The fair baseline is non-trivial (well below 1.0) and genuinely beats the old lineage-only strawman, so the win is not a rigged contest. NOT yet proven (remaining Gate 5 sub-gates): 5b a live human-operator session, 5c Quest projection via /embodied. This is a classical ML baseline on synthetic data, not a deep model on real operator traces.',
  core: JSON.parse(readFileSync(join(repoRoot, 'packages', 'core', 'package.json'), 'utf8'))
    .version,
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-5A RECEIPT EMITTED ->', receiptPath);
  console.log('  learnedWeights L/D/Tinv/L·D=' + model.w.map(r4).join('/'), 'bias=' + r4(model.b));
  console.log(
    '  top1 trained=' + r4(accTrained),
    'fair=' + r4(accFair),
    'bestLinear=' + r4(accBestLinearFit),
    'crippled=' + r4(accCrippled),
    'random=' + r4(accRandom)
  );
  console.log(
    '  marginOverFair=' + r4(marginOverFair),
    'interactionWeight=' + r4(interactionWeight)
  );
  console.log('  policyDigest=' + policyDigest);
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-5a receipt to verify. Run with --emit first.');
    process.exit(2);
  }
  const checks = [
    [
      'training is deterministic (weights reproduce)',
      r4(model.w[0]) === existing.training.learnedWeights.L &&
        r4(model.w[3]) === existing.training.learnedWeights['L·D'],
    ],
    ['trained policy beats the FAIR all-feature linear heuristic (held-out)', accTrained > accFair],
    ['the win is a REAL margin, not noise (>= 0.08)', marginOverFair >= 0.08],
    [
      'the FAIR baseline is genuinely fair: uses all features and beats the crippled lineage-only rule',
      accFair > accCrippled,
    ],
    [
      'the task is NON-TRIVIAL: a fair linear rule CANNOT solve it (< 0.95) — the interaction matters',
      accFair < 0.95,
    ],
    [
      'the advantage IS the non-linearity: trained beats even the best pure-linear fit',
      accTrained > accBestLinearFit,
    ],
    [
      'model learned the L·D keystone interaction (|w_interaction| > 0.05)',
      Math.abs(interactionWeight) > 0.05,
    ],
    ['trained policy beats the random baseline (held-out)', accTrained > accRandom],
    ['held-out test set is non-trivial (>= 50 episodes)', testEps.length >= 50],
    [
      'policy digest reproduces (real computeStateDigest)',
      policyDigest === existing.contract.policyDigest,
    ],
  ];
  let ok = true;
  console.log('GATE-5A (TRAINED POLICY) VERIFICATION (deterministic re-train, real contract fn):');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log(
    '  trained=' + r4(accTrained),
    'fair=' + r4(accFair),
    'bestLinear=' + r4(accBestLinearFit),
    'crippled=' + r4(accCrippled),
    'random=' + r4(accRandom),
    'margin=' + r4(marginOverFair)
  );
  console.log('  => GATE 5a', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
