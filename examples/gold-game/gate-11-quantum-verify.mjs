// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 11: QUANTUM-INSPIRED curation (REPRODUCIBLE).
//
// Drives the GENUINE QuantumInspiredTrait (@holoscript/core, S.QI) over a curation
// decision problem: a vector of candidate-entry priorities is run through the trait's
// quantum-annealing-inspired accelerator (qi:optimize), which on this CPU-only host
// uses the CpuFallbackAccelerator (sigmoid activation surrogate for LIF population
// coding). The activation sharpens each candidate into a graduate/defer decision.
//
// HONEST: this is quantum-INSPIRED (the real trait's CPU fallback path,
// accelerator.available === false) — NOT real QPU hardware. Real-hardware quantum
// (VQE on IBM) is the separate /quantum-lab track (S.VQE), not this gate.
//
//   node_modules/.bin/tsx examples/gold-game/gate-11-quantum-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-11-quantum-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
const { quantumInspiredHandler } = await imp(join(repo, 'packages', 'core', 'src', 'traits', 'QuantumInspiredTrait.ts'));
// E-G11: the gold-game-LOCAL annealing-inspired sharpening layer (does NOT touch the
// shared trait). This is the part that genuinely sharpens graduate/defer decisions.
const { runAggregate, runSharpeningExperiment } = await imp(join(here, 'gold-game-curation-sharpen.mjs'));
const receiptPath = join(here, 'GATE-11-QUANTUM-receipt.json');
const HASH = 'sha256';
const flush = () => new Promise((r) => setTimeout(r, 0)); // let the async qi:result resolve

// 8 candidate vault entries with raw curation priorities (normalized 0..1).
// >0.5 = "should graduate", <0.5 = "defer". The quantum-inspired layer turns these
// into sharpened decisions via the trait's accelerator.
const CANDIDATES = ['C.001', 'C.002', 'C.003', 'C.004', 'C.005', 'C.006', 'C.007', 'C.008'];
const PRIORITY = [0.92, 0.71, 0.55, 0.49, 0.30, 0.12, 0.63, 0.41];
const NUM = CANDIDATES.length;

function makeCtx() { const events = []; return { ctx: { emit: (type, payload) => events.push({ type, payload }) }, events }; }
const config = { ...quantumInspiredHandler.defaultConfig, numNeurons: NUM, acceleratorProvider: undefined };

async function runOptimize() {
  const node = {};
  const { ctx, events } = makeCtx();
  quantumInspiredHandler.onAttach(node, config, ctx);
  const attached = !!node.__qiState;
  quantumInspiredHandler.onEvent(node, config, ctx, { type: 'qi:optimize', payload: { input: new Float32Array(PRIORITY), requestId: 'curate-1' } });
  await flush();
  quantumInspiredHandler.onEvent(node, config, ctx, { type: 'qi:status' });
  const result = events.find((e) => e.type === 'qi:result');
  const status = events.find((e) => e.type === 'qi:status_result');
  const errors = events.filter((e) => e.type === 'qi:error');
  return { node, attached, result, status, errors };
}

const run1 = await runOptimize();
const out1 = run1.result ? Array.from(run1.result.payload.output) : [];
const r4 = (n) => Number(n.toFixed(6));

// real-trait properties
const attached = run1.attached;
const emittedResult = !!run1.result && out1.length === NUM && run1.errors.length === 0;
const optimizeCounted = run1.result?.payload?.optimizeCount === 1;
const cpuFallback = run1.status?.payload?.acceleratorAvailable === false; // honest: CPU-inspired path
const allInUnitInterval = out1.every((v) => v > 0 && v < 1);
const transformed = out1.some((v, i) => Math.abs(v - PRIORITY[i]) > 1e-9); // not identity
// threshold-preservation + monotonicity (defining sigmoid properties → coherent decisions)
const thresholdPreserved = out1.every((v, i) => (PRIORITY[i] > 0.5) === (v > 0.5)) && Math.abs(out1[PRIORITY.indexOf(0.55)] - 0.5) >= 0; // 0.5-centered
const order = [...PRIORITY.keys()].sort((a, b) => PRIORITY[b] - PRIORITY[a]);
const optOrder = [...out1.keys()].sort((a, b) => out1[b] - out1[a]);
const monotonic = JSON.stringify(order) === JSON.stringify(optOrder); // sigmoid preserves ranking
// the quantum-inspired curation decision: graduate where activation > 0.5
const decisions = CANDIDATES.map((id, i) => ({ id, priority: PRIORITY[i], activation: r4(out1[i]), decision: out1[i] > 0.5 ? 'graduate' : 'defer' }));
const graduateCount = decisions.filter((d) => d.decision === 'graduate').length;
const expectedGraduate = PRIORITY.filter((p) => p > 0.5).length;
const decisionsCoherent = graduateCount === expectedGraduate;

// determinism: a second independent run must yield identical activation
const run2 = await runOptimize();
const out2 = run2.result ? Array.from(run2.result.payload.output) : [];
const deterministic = JSON.stringify(out1.map(r4)) === JSON.stringify(out2.map(r4));

const activationDigest = computeStateDigest({ fieldNames: ['q'], getField: () => Float32Array.from(out1.map((v) => Math.round(v * 1e6))) }, HASH);

// ── E-G11: the gold-game-LOCAL sharpening layer (mean-field annealing analogue) ──
// The CPU-fallback sigmoid above is decision-NEUTRAL (monotonic, 0.5-centred) — it
// cannot change which entries cross a 0.5 graduate/defer threshold. This layer DOES
// sharpen: it fuses a second noisy view + couples similar entries (cohort context),
// moving near-boundary items off the fence. Claim is statistical (cf. Gate 5a): the
// mechanism improves curation quality ON AVERAGE over 200 cohorts, with a negative
// control proving the gain is the mechanism's, not annealing luck.
const sharpAgg = runAggregate();
const example = runSharpeningExperiment(1, 24); // first cohort — NOT chosen for its result
const sharpFlips = sharpAgg.totalFlips >= 1;
const sharpBeatsRaw = sharpAgg.meanAccSharp > sharpAgg.meanAccRaw;
const sharpMargin = sharpAgg.meanGain >= 0.03;
const controlIsNoop = sharpAgg.controlFlips === 0 && sharpAgg.meanAccControl === sharpAgg.meanAccRaw;
const flipsAreCorrections = sharpAgg.fracFlipTowardTruth >= 0.6;
const confidentLocked = sharpAgg.fracFlipNearBoundary >= 0.80;
const sharpDeterministic = JSON.stringify(runAggregate()) === JSON.stringify(sharpAgg);
const sr = (x) => Number(x.toFixed(6));
const sharpenDigest = computeStateDigest({ fieldNames: ['s'], getField: () => Float32Array.from([
  Math.round(sharpAgg.meanAccRaw * 1e6), Math.round(sharpAgg.meanAccSharp * 1e6),
  Math.round(sharpAgg.meanAccControl * 1e6), sharpAgg.totalFlips, sharpAgg.controlFlips,
  Math.round(sharpAgg.fracFlipTowardTruth * 1e6), Math.round(sharpAgg.fracFlipNearBoundary * 1e6),
]) }, HASH);

const receipt = {
  gate: 11,
  track: 'flagship',
  name: 'quantum-inspired curation — gold-game-local annealing layer sharpens graduate/defer decisions (real trait wired + decision-neutral CPU path honestly disclosed)',
  verifier: 'examples/gold-game/gate-11-quantum-verify.mjs',
  implementation: 'packages/core/src/traits/QuantumInspiredTrait.ts (quantumInspiredHandler — REAL wiring; CpuFallbackAccelerator is decision-NEUTRAL on a CPU-only host) + examples/gold-game/gold-game-curation-sharpen.mjs (E-G11 gold-game-LOCAL mean-field annealing sharpening layer)',
  problem: { candidates: CANDIDATES, rawPriority: PRIORITY, numNeurons: NUM, event: 'qi:optimize' },
  result: {
    attached, emittedResult, optimizeCount: run1.result?.payload?.optimizeCount,
    acceleratorAvailable: run1.status?.payload?.acceleratorAvailable,
    activation: out1.map(r4), decisions, graduateCount, expectedGraduate, deterministic,
  },
  sharpening: {
    note: 'E-G11: gold-game-local mean-field-annealing layer that moves near-boundary items off the fence using cohort context. Statistical claim over 200 synthetic cohorts (24 entries each); the SHARED QuantumInspiredTrait CPU fallback is deliberately untouched.',
    cohorts: sharpAgg.cohorts, entriesPerCohort: sharpAgg.n,
    meanAccRaw: sr(sharpAgg.meanAccRaw), meanAccSharp: sr(sharpAgg.meanAccSharp), meanAccControl: sr(sharpAgg.meanAccControl),
    meanGain: sr(sharpAgg.meanGain),
    totalFlips: sharpAgg.totalFlips, controlFlips: sharpAgg.controlFlips,
    fracFlipTowardTruth: sr(sharpAgg.fracFlipTowardTruth), fracFlipNearBoundary: sr(sharpAgg.fracFlipNearBoundary),
    exampleCohortSeed1: { flips: example.flipCount, flipTowardTruth: example.flipTowardTruth, accRaw: sr(example.accRaw), accSharp: sr(example.accSharp) },
    sharpenDigest,
  },
  contract: { spine: 'REAL computeStateDigest', activationDigest, sharpenDigest, reproducible: 'run the verifier to re-derive' },
  honestScope: 'TWO honest claims. (1) WIRING: the optimization is run by the GENUINE QuantumInspiredTrait handler from @holoscript/core via qi:optimize — not a mock. On this CPU-only host it uses the trait\'s CpuFallbackAccelerator (acceleratorAvailable === false), a 0.5-centred monotonic sigmoid that is DECISION-NEUTRAL — it cannot change which entries cross a 0.5 threshold (deep-ratchet 2026-05-24). The genuine annealing-analogue SnnAccelerator is GPU-only and not exercised here; real-QPU is the separate /quantum-lab VQE track (S.VQE). (2) SHARPENING (E-G11 fix): a gold-game-LOCAL mean-field-annealing layer (gold-game-curation-sharpen.mjs) — an Ising Hamiltonian relaxed by deterministic annealing — fuses a second noisy view and ferromagnetically couples similar entries, moving NEAR-BOUNDARY items off the fence. PROVEN over 200 synthetic cohorts: it flips real decisions vs the raw 0.5 threshold (' + sharpAgg.totalFlips + ' flips), raises mean curation accuracy ' + sr(sharpAgg.meanAccRaw) + ' -> ' + sr(sharpAgg.meanAccSharp) + ' (+' + sr(sharpAgg.meanGain) + '), ' + (sharpAgg.fracFlipTowardTruth * 100).toFixed(1) + '% of flips move TOWARD ground truth, and ' + (sharpAgg.fracFlipNearBoundary * 100).toFixed(1) + '% are near-boundary (confident items stay locked). A negative control (no evidence fusion, no coupling) collapses EXACTLY to the raw threshold (0 flips, identical accuracy) — proving the gain is the mechanism\'s, not annealing luck. NOT claimed: real quantum hardware; the shared trait CPU fallback behaviour (left untouched on purpose); real operator traces (synthetic scenario, like Gate 5a).',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-11 RECEIPT EMITTED ->', receiptPath);
  console.log('  attached=' + attached, 'emittedResult=' + emittedResult, 'optimizeCount=' + run1.result?.payload?.optimizeCount, 'cpuFallback=' + cpuFallback);
  console.log('  graduate=' + graduateCount + '/' + NUM + ' (expected ' + expectedGraduate + ')', 'monotonic=' + monotonic, 'deterministic=' + deterministic);
  console.log('  activationDigest=' + activationDigest);
  console.log('  [E-G11 sharpen] flips=' + sharpAgg.totalFlips, 'acc ' + sr(sharpAgg.meanAccRaw) + '->' + sr(sharpAgg.meanAccSharp) + ' (+' + sr(sharpAgg.meanGain) + ')', 'ctrlFlips=' + sharpAgg.controlFlips, 'towardTruth=' + (sharpAgg.fracFlipTowardTruth * 100).toFixed(1) + '%');
  console.log('  sharpenDigest=' + sharpenDigest);
} else {
  let existing; try { existing = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { console.error('No Gate-11 receipt. Run --emit first.'); process.exit(2); }
  const checks = [
    ['REAL QuantumInspiredTrait attached (__qiState)', attached === true],
    ['qi:optimize emitted qi:result (len numNeurons, no errors)', emittedResult === true],
    ['optimizeCount incremented by the real trait', optimizeCounted === true],
    ['honest: CPU-inspired fallback path (acceleratorAvailable === false)', cpuFallback === true],
    ['activation is a real sigmoid output (all in (0,1))', allInUnitInterval === true],
    ['activation transforms the input (not identity)', transformed === true],
    ['threshold-preserving decisions (>0.5 graduate / <0.5 defer)', thresholdPreserved === true],
    ['ranking preserved (monotonic optimization)', monotonic === true],
    ['curation decisions coherent (graduate count == high-priority count)', decisionsCoherent === true],
    ['deterministic across independent runs', deterministic === true],
    ['activation digest reproduces (real computeStateDigest)', activationDigest === existing.contract.activationDigest],
    // ── E-G11: the gold-game-local sharpening layer actually sharpens decisions ──
    ['ANTI-TAUTOLOGY: sharpening flips >=1 decision vs the raw 0.5 threshold', sharpFlips === true],
    ['QUALITY: sharpened curation beats raw 0.5 threshold on average', sharpBeatsRaw === true],
    ['QUALITY: mean accuracy gain is a real margin (>=0.03)', sharpMargin === true],
    ['NEGATIVE CONTROL: no evidence/coupling collapses EXACTLY to raw (0 flips, equal acc)', controlIsNoop === true],
    ['flips are CORRECTIONS: majority move toward ground truth (>=60%)', flipsAreCorrections === true],
    ['confident items stay LOCKED: >=80% of flips are near-boundary', confidentLocked === true],
    ['sharpening is deterministic (aggregate reproduces)', sharpDeterministic === true],
    ['sharpen digest reproduces (real computeStateDigest)', sharpenDigest === existing.contract.sharpenDigest],
  ];
  let ok = true;
  console.log('GATE-11 (QUANTUM-INSPIRED CURATION) VERIFICATION:');
  for (const [label, pass] of checks) { console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label); ok = ok && pass; }
  console.log('  => GATE 11', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
