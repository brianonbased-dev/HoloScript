// Standalone unit test for the curation-SHARPENING module (E-G11, F.077 module-first).
//   node examples/gold-game/gold-game-curation-sharpen.test.mjs
import assert from 'node:assert/strict';
import {
  mulberry32, makeCohort, simKernel, sharpen, rawDecision, accuracy, flips,
  runSharpeningExperiment, runAggregate,
} from './gold-game-curation-sharpen.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  PASS  ' + name); };

t('mulberry32 + makeCohort are deterministic for a fixed seed', () => {
  for (let i = 0, a = mulberry32(7), b = mulberry32(7); i < 5; i++) assert.equal(a(), b());
  assert.deepEqual(makeCohort(mulberry32(7), 12), makeCohort(mulberry32(7), 12));
});

t('simKernel is 1 at identity and decays with distance', () => {
  assert.equal(simKernel([0.5, 0.5], [0.5, 0.5]), 1);
  assert.ok(simKernel([0, 0], [0.4, 0.4]) < simKernel([0, 0], [0.1, 0.1]));
});

t('NEGATIVE CONTROL: beta=0,gamma=0 collapses EXACTLY to the raw 0.5 threshold (no sharpening)', () => {
  const items = makeCohort(mulberry32(99), 24);
  const raw = items.map(rawDecision);
  const { decision } = sharpen(items, { beta: 0, gamma: 0 });
  assert.deepEqual(decision, raw, 'with no evidence fusion and no coupling the layer must be a no-op vs raw');
  assert.equal(flips(raw, decision).length, 0);
});

t('ANTI-TAUTOLOGY: the sharpening layer flips >= 1 decision vs the raw 0.5 threshold', () => {
  const agg = runAggregate();
  assert.ok(agg.totalFlips >= 1, `expected >=1 flip, got ${agg.totalFlips}`);
});

t('QUALITY: sharpened curation beats the raw 0.5 threshold ON AVERAGE by a real margin', () => {
  const agg = runAggregate();
  assert.ok(agg.meanAccSharp > agg.meanAccRaw, `sharp ${agg.meanAccSharp} must beat raw ${agg.meanAccRaw}`);
  assert.ok(agg.meanGain >= 0.03, `mean gain ${agg.meanGain} must be a real margin (>=0.03)`);
});

t('CONTROL has ZERO net effect: meanAccControl === meanAccRaw (gain comes from the mechanism, not annealing luck)', () => {
  const agg = runAggregate();
  assert.equal(agg.controlFlips, 0);
  assert.equal(agg.meanAccControl, agg.meanAccRaw);
});

t('flips are CORRECTIONS: a majority move TOWARD ground truth', () => {
  const agg = runAggregate();
  assert.ok(agg.fracFlipTowardTruth >= 0.6, `${(agg.fracFlipTowardTruth * 100).toFixed(1)}% toward truth must exceed 60%`);
});

t('confident items stay LOCKED: the overwhelming majority of flips are near the 0.5 boundary', () => {
  const agg = runAggregate();
  assert.ok(agg.fracFlipNearBoundary >= 0.80, `${(agg.fracFlipNearBoundary * 100).toFixed(1)}% of flips must be near-boundary (<0.20)`);
});

t('the whole experiment is deterministic (re-run reproduces every aggregate metric)', () => {
  assert.deepEqual(runAggregate(), runAggregate());
  const a = runSharpeningExperiment(1, 24), b = runSharpeningExperiment(1, 24);
  assert.deepEqual(a.sharp, b.sharp);
  assert.deepEqual(a.m, b.m);
});

console.log(`\n  ${n}/${n} curation-sharpen unit tests pass\n`);
