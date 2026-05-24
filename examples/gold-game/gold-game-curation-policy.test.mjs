// Standalone unit test for the curation-policy module (E-G5a, F.077 module-first).
//   node examples/gold-game/gold-game-curation-policy.test.mjs
import assert from 'node:assert/strict';
import {
  mulberry32, makeEpisodes, train, liftFeatures, scoreModel, argmaxBy, top1,
  trueVal, fairLinearScore, crippledLineageScore, TRUE_INTERACTION,
} from './gold-game-curation-policy.mjs';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('  PASS  ' + name); };

t('truth is NON-LINEAR: L·D interaction makes a both-high entry beat the linear sum', () => {
  assert.ok(TRUE_INTERACTION > 0);
  const both = trueVal([0.9, 0.9, 0]);      // high L AND high D → keystone
  const lopsided = trueVal([1.0, 0.2, 0]);  // higher L alone, low D
  assert.ok(both > lopsided, `keystone ${both} should beat lopsided ${lopsided}`);
});

t('mulberry32 is deterministic', () => {
  const a = mulberry32(42), b = mulberry32(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

t('makeEpisodes is deterministic for a fixed seed', () => {
  const e1 = makeEpisodes(mulberry32(7), 20);
  const e2 = makeEpisodes(mulberry32(7), 20);
  assert.deepEqual(e1, e2);
});

t('a learned interaction model beats the FAIR all-feature linear heuristic on held-out data', () => {
  const all = makeEpisodes(mulberry32(20260522), 400);
  const sp = Math.floor(all.length * 0.7);
  const tr = all.slice(0, sp), te = all.slice(sp);
  const model = train(tr, liftFeatures);
  const accTrained = top1(te, (p) => argmaxBy(p, (e) => scoreModel(model, liftFeatures, e.f)));
  const accFair = top1(te, (p) => argmaxBy(p, (e) => fairLinearScore(e.f)));
  assert.ok(accTrained > accFair, `trained ${accTrained} must beat fair ${accFair}`);
  assert.ok(accTrained - accFair >= 0.08, `margin ${accTrained - accFair} must be real`);
});

t('NEGATIVE/NON-TRIVIAL CONTROL: the fair linear baseline cannot solve the task (< 0.95) but beats the crippled one', () => {
  const all = makeEpisodes(mulberry32(20260522), 400);
  const te = all.slice(Math.floor(all.length * 0.7));
  const accFair = top1(te, (p) => argmaxBy(p, (e) => fairLinearScore(e.f)));
  const accCrip = top1(te, (p) => argmaxBy(p, (e) => crippledLineageScore(e.f)));
  assert.ok(accFair < 0.95, `fair ${accFair} must be non-trivial (<0.95)`);
  assert.ok(accFair > accCrip, `fair ${accFair} must genuinely beat crippled ${accCrip}`);
});

t('the model learns a positive L·D interaction weight', () => {
  const all = makeEpisodes(mulberry32(20260522), 400);
  const model = train(all.slice(0, 280), liftFeatures);
  assert.ok(Math.abs(model.w[3]) > 0.05, `interaction weight ${model.w[3]} should be learned`);
});

console.log(`\n  ${n}/${n} curation-policy unit tests pass\n`);
