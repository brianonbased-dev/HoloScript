/**
 * LatentIntegrityLayer — calibration benchmark for Paper 22 measurements.
 *
 * Generates synthetic RecursiveLinkMessage histories (clean vs. corrupted)
 * and measures:
 *   - Byzantine detector: true positive rate (TPR) and false positive rate (FPR)
 *     at σ = 1.5, 2.0, 2.5, 3.0
 *   - Sycophancy probe: drift detection rate and latency (samples to first flag)
 *     at driftThreshold = 0.2, 0.3, 0.4, 0.5
 *
 * Run standalone: npx tsx packages/core/src/traits/pillar/__tests__/LatentIntegrityCalibration.bench.ts
 *
 * Outputs a JSON table to stdout for direct insertion into paper-22-two-axis-integrity-usenix.tex.
 */

import {
  LatentByzantineDetector,
  LatentSycophancyProbe,
} from '../LatentIntegrityLayer';
import type { PillarSlice } from '../SemanticCollaborationContract';
import type { RecursiveLinkMessage } from '../RecursiveLinkTrait';

// ─── synthetic data generators ────────────────────────────────────────────────

function makeSlice(pos1: number, pos2: number, domain = 'physics'): PillarSlice {
  return {
    axis_1_id: 'energy',
    axis_2_id: 'momentum',
    pos_1: pos1,
    pos_2: pos2,
    pillar_id: 'physics_conservation',
    pillar_domain: domain as PillarSlice['pillar_domain'],
  };
}

function makeMsg(slice: PillarSlice): RecursiveLinkMessage {
  return { from: 'peer', to: 'self', loop: 'inner', slice, timestamp_ms: Date.now() };
}

/** Generate N clean slices clustered tightly around (0.85, 0.15) with Gaussian noise σ=0.03 */
function cleanHistory(n: number): PillarSlice[] {
  const slices: PillarSlice[] = [];
  // Deterministic LCG for reproducibility
  let seed = 0xdeadbeef;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  for (let i = 0; i < n; i++) {
    const noise1 = (lcg() - 0.5) * 0.06;  // ±0.03 std
    const noise2 = (lcg() - 0.5) * 0.06;
    slices.push(makeSlice(Math.max(0, Math.min(1, 0.85 + noise1)), Math.max(0, Math.min(1, 0.15 + noise2))));
  }
  return slices;
}

/** Generate a Byzantine-corrupted slice (orthogonal to cluster mean — pos1≈0.1, pos2≈0.9) */
function byzantineSlice(): PillarSlice {
  return makeSlice(0.08, 0.93);
}

/** Generate a normal slice (within cluster bounds) */
function normalSlice(): PillarSlice {
  let seed = 0xc0ffee;
  const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };
  return makeSlice(0.85 + (lcg() - 0.5) * 0.06, 0.15 + (lcg() - 0.5) * 0.06);
}

// ─── Byzantine detector calibration ──────────────────────────────────────────

interface ByzantineResult {
  sigma: number;
  tpr: number;   // true positive rate (attack correctly flagged)
  fpr: number;   // false positive rate (clean incorrectly flagged)
  trials: number;
}

function calibrateByzantine(sigmas: number[], trials = 500): ByzantineResult[] {
  return sigmas.map(sigma => {
    const detector = new LatentByzantineDetector({ sigmaThreshold: sigma, minHistory: 10 });
    const history = cleanHistory(50);
    let tp = 0, fp = 0;

    for (let i = 0; i < trials; i++) {
      // Test Byzantine slice
      const bResult = detector.check(makeMsg(byzantineSlice()), history);
      if (bResult.isAnomalous) tp++;

      // Test normal slice
      const nResult = detector.check(makeMsg(normalSlice()), history);
      if (nResult.isAnomalous) fp++;
    }

    return {
      sigma,
      tpr: tp / trials,
      fpr: fp / trials,
      trials,
    };
  });
}

// ─── Sycophancy probe calibration ────────────────────────────────────────────

interface SycophancyResult {
  driftThreshold: number;
  detectionRate: number;    // fraction of drifting agents flagged within 20 observations
  latencySamples: number;   // median samples to first flag
  trials: number;
}

function calibrateSycophancy(thresholds: number[], trials = 200): SycophancyResult[] {
  return thresholds.map(driftThreshold => {
    let detected = 0;
    const latencies: number[] = [];

    for (let t = 0; t < trials; t++) {
      const probe = new LatentSycophancyProbe({ driftThreshold, minSamples: 5 });

      // Simulate a drifting agent: truth_approval slices drifting from (0.5,0.5) toward (0.1,0.9)
      let flagged = false;
      let latency = -1;
      for (let obs = 0; obs < 20; obs++) {
        const driftAmount = obs / 20;  // linear drift over 20 observations
        const pos1 = 0.5 - 0.4 * driftAmount;
        const pos2 = 0.5 + 0.4 * driftAmount;
        const driftSlice = makeSlice(pos1, pos2, 'truth_approval');
        const msg = makeMsg(driftSlice);
        probe.observe(msg);
        const result = probe.probe(msg);
        if (result.isDrifting && !flagged) {
          flagged = true;
          latency = obs;
        }
      }
      if (flagged) { detected++; latencies.push(latency); }
    }

    const medianLatency = latencies.length > 0
      ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
      : -1;

    return {
      driftThreshold,
      detectionRate: detected / trials,
      latencySamples: medianLatency,
      trials,
    };
  });
}

// ─── main ─────────────────────────────────────────────────────────────────────

const byzantineResults = calibrateByzantine([1.5, 2.0, 2.5, 3.0]);
const sycophancyResults = calibrateSycophancy([0.2, 0.3, 0.4, 0.5]);

const output = {
  generatedAt: new Date().toISOString(),
  description: 'LatentIntegrityLayer calibration — Paper 22 measurements',
  byzantine: byzantineResults,
  sycophancy: sycophancyResults,
};

console.log(JSON.stringify(output, null, 2));

// LaTeX table snippet
console.log('\n% ── Byzantine detection rates (Paper 22 Table 1) ──');
console.log('% \\sigma & TPR & FPR \\\\');
for (const r of byzantineResults) {
  console.log(`% ${r.sigma} & ${(r.tpr * 100).toFixed(1)}\\% & ${(r.fpr * 100).toFixed(1)}\\% \\\\`);
}

console.log('\n% ── Sycophancy detection rates (Paper 22 Table 2) ──');
console.log('% driftThreshold & DetectionRate & MedianLatency (samples) \\\\');
for (const r of sycophancyResults) {
  console.log(`% ${r.driftThreshold} & ${(r.detectionRate * 100).toFixed(1)}\\% & ${r.latencySamples} \\\\`);
}
