/**
 * Neuroscience solver tests — neuroscience-plugin
 *
 * Reference values verified against:
 *  - Hodgkin & Huxley (1952) J.Physiol 117:500-544
 *  - Wilson & Cowan (1972) Biophys.J 12:1-24
 *  - Koch C (1998) Biophysics of Computation — standard HH parameter set
 */

import { describe, it, expect } from 'vitest';
import {
  hodgkinHuxley,
  wilsonCowan,
  lifNeuron,
  eegBandPower,
  connectivityMetrics,
  buildNeuroReceipt,
  type HHParams,
  type WilsonCowanParams,
} from '../neurosolver';

// ─── Hodgkin-Huxley ───────────────────────────────────────────────────────────

describe('hodgkinHuxley', () => {
  /**
   * Standard HH parameters, Iapp = 10 µA/cm².
   * The classical HH model fires repetitively above ~7 µA/cm².
   */
  const baseParams: HHParams = { Iapp: 10, durationMs: 100, dtMs: 0.01 };

  it('produces at least 1 spike at Iapp = 10 µA/cm²', () => {
    const r = hodgkinHuxley(baseParams);
    expect(r.spikeTimes.length).toBeGreaterThan(0);
  });

  it('peak voltage > 0 mV (action potential overshoots)', () => {
    const r = hodgkinHuxley(baseParams);
    expect(r.peakVoltageMv).toBeGreaterThan(0);
  });

  it('resting potential near −65 mV', () => {
    const r = hodgkinHuxley(baseParams);
    expect(r.restingPotentialMv).toBeCloseTo(-65, 0);
  });

  it('sub-threshold stimulus (Iapp = 2) produces no spikes', () => {
    const r = hodgkinHuxley({ Iapp: 2, durationMs: 50, dtMs: 0.01 });
    expect(r.spikeTimes.length).toBe(0);
  });

  it('firing rate increases with stronger current', () => {
    const r5 = hodgkinHuxley({ Iapp: 8, durationMs: 100, dtMs: 0.01 });
    const r20 = hodgkinHuxley({ Iapp: 20, durationMs: 100, dtMs: 0.01 });
    expect(r20.firingRateHz).toBeGreaterThan(r5.firingRateHz);
  });

  it('gating variables m, h, n stay in [0, 1]', () => {
    const r = hodgkinHuxley(baseParams);
    for (const v of r.m) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    for (const v of r.h) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    for (const v of r.n) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });

  it('output arrays have same length', () => {
    const r = hodgkinHuxley({ Iapp: 10, durationMs: 10, dtMs: 0.01 });
    const N = r.timeMs.length;
    expect(r.voltagesMv).toHaveLength(N);
    expect(r.m).toHaveLength(N);
    expect(r.h).toHaveLength(N);
    expect(r.n).toHaveLength(N);
  });

  it('throws for non-positive Cm', () => {
    expect(() => hodgkinHuxley({ Iapp: 10, Cm: 0 })).toThrow();
  });

  it('throws for invalid dtMs', () => {
    expect(() => hodgkinHuxley({ Iapp: 10, dtMs: -1 })).toThrow();
  });

  it('firing rate at Iapp=10 is between 50 and 150 Hz (HH classical range)', () => {
    const r = hodgkinHuxley(baseParams);
    expect(r.firingRateHz).toBeGreaterThan(50);
    expect(r.firingRateHz).toBeLessThan(150);
  });
});

// ─── Wilson-Cowan ─────────────────────────────────────────────────────────────

describe('wilsonCowan', () => {
  const baseParams: WilsonCowanParams = { durationMs: 1000, dtMs: 0.5 };

  it('E and I activities stay in [0, 1]', () => {
    const r = wilsonCowan(baseParams);
    for (const v of r.E) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
    for (const v of r.I) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(1);
  });

  it('output arrays have same length', () => {
    const r = wilsonCowan(baseParams);
    expect(r.E).toHaveLength(r.timeMs.length);
    expect(r.I).toHaveLength(r.timeMs.length);
  });

  it('converges for standard (excitation-dominant) parameters', () => {
    const r = wilsonCowan({ ...baseParams, durationMs: 2000 });
    expect(r.converged).toBe(true);
  });

  it('steady-state E > 0 with positive external input pE', () => {
    const r = wilsonCowan({ ...baseParams, pE: 1.25, pI: 0 });
    expect(r.steadyStateE).toBeGreaterThan(0);
  });

  it('steady-state I > 0 when E is active (feedback from E)', () => {
    const r = wilsonCowan({ ...baseParams, durationMs: 2000 });
    expect(r.steadyStateI).toBeGreaterThan(0);
  });

  it('zero external input still finds a fixed point (recurrent excitation bootstraps)', () => {
    // With default wEE=16 the strong recurrent coupling drives E and I to a non-trivial
    // fixed point even from zero initial conditions — correct Wilson-Cowan behaviour.
    const r = wilsonCowan({ pE: 0, pI: 0, E0: 0, I0: 0, durationMs: 2000, dtMs: 0.5 });
    // System should converge (reach a steady state)
    expect(r.converged).toBe(true);
    // Both E and I should be in [0, 1]
    expect(r.steadyStateE).toBeGreaterThanOrEqual(0);
    expect(r.steadyStateE).toBeLessThanOrEqual(1);
    expect(r.steadyStateI).toBeGreaterThanOrEqual(0);
    expect(r.steadyStateI).toBeLessThanOrEqual(1);
  });

  it('throws for non-positive tauE', () => {
    expect(() => wilsonCowan({ tauE: 0 })).toThrow();
  });
});

// ─── Leaky Integrate-and-Fire ─────────────────────────────────────────────────

describe('lifNeuron', () => {
  it('fires repetitively above threshold current', () => {
    const r = lifNeuron({ Iapp: 2.0, durationMs: 200, dtMs: 0.1 });
    expect(r.spikeTimes.length).toBeGreaterThan(0);
  });

  it('does not fire when Iapp < threshold', () => {
    // Threshold current ≈ (Vthresh - Vrest) / tauM = (-50 - (-65)) / 20 = 0.75
    const r = lifNeuron({ Iapp: 0.5, durationMs: 200, dtMs: 0.1 });
    expect(r.spikeTimes.length).toBe(0);
    expect(r.theoreticalRateHz).toBeNull();
  });

  it('voltage stays below threshold between spikes', () => {
    const r = lifNeuron({ Iapp: 2.0, durationMs: 100, dtMs: 0.1, Vthresh: -50 });
    // After reset, voltage should not exceed threshold except at spike
    const maxBetween = Math.max(...r.voltagesMv);
    expect(maxBetween).toBeLessThanOrEqual(-50 + 0.1); // within one step
  });

  it('firing rate close to theoretical rate', () => {
    const r = lifNeuron({ Iapp: 2.0, durationMs: 1000, dtMs: 0.05 });
    if (r.theoreticalRateHz !== null) {
      const relErr = Math.abs(r.firingRateHz - r.theoreticalRateHz) / r.theoreticalRateHz;
      expect(relErr).toBeLessThan(0.15); // within 15%
    }
  });

  it('refractory period reduces firing rate vs no refractoriness', () => {
    const rRef  = lifNeuron({ Iapp: 3.0, tauRef: 5, durationMs: 500, dtMs: 0.1 });
    const rNoRef = lifNeuron({ Iapp: 3.0, tauRef: 0.01, durationMs: 500, dtMs: 0.1 });
    expect(rRef.firingRateHz).toBeLessThan(rNoRef.firingRateHz);
  });

  it('throws for Vthresh ≤ Vreset', () => {
    expect(() => lifNeuron({ Vthresh: -70, Vreset: -65 })).toThrow();
  });
});

// ─── EEG band power ───────────────────────────────────────────────────────────

describe('eegBandPower', () => {
  const fs = 256; // Hz

  it('throws for signal with < 2 samples', () => {
    expect(() => eegBandPower([1.0], fs)).toThrow();
  });

  it('throws for non-positive samplingRateHz', () => {
    expect(() => eegBandPower([1, 2, 3], 0)).toThrow();
  });

  it('pure 10 Hz sine wave → dominant band is alpha', () => {
    const N = 512;
    const signal = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 10 * i / fs));
    const r = eegBandPower(signal, fs);
    expect(r.dominantBand).toBe('alpha');
    expect(r.alpha).toBeGreaterThan(r.delta);
    expect(r.alpha).toBeGreaterThan(r.theta);
    expect(r.alpha).toBeGreaterThan(r.beta);
  });

  it('pure 2 Hz sine wave → dominant band is delta', () => {
    const N = 512;
    const signal = Array.from({ length: N }, (_, i) => Math.sin(2 * Math.PI * 2 * i / fs));
    const r = eegBandPower(signal, fs);
    expect(r.dominantBand).toBe('delta');
  });

  it('psd and frequencies arrays are returned', () => {
    const signal = Array.from({ length: 64 }, (_, i) => Math.sin(2 * Math.PI * 8 * i / fs));
    const r = eegBandPower(signal, fs);
    expect(r.psd.length).toBeGreaterThan(0);
    expect(r.frequencies.length).toBeGreaterThan(0);
  });

  it('all band powers are non-negative', () => {
    const signal = Array.from({ length: 256 }, () => Math.random() - 0.5);
    const r = eegBandPower(signal, fs);
    expect(r.delta).toBeGreaterThanOrEqual(0);
    expect(r.theta).toBeGreaterThanOrEqual(0);
    expect(r.alpha).toBeGreaterThanOrEqual(0);
    expect(r.beta).toBeGreaterThanOrEqual(0);
    expect(r.gamma).toBeGreaterThanOrEqual(0);
  });
});

// ─── Connectivity metrics ─────────────────────────────────────────────────────

describe('connectivityMetrics', () => {
  /**
   * Fully connected 4-node graph (K4): every node connects to every other.
   * Clustering coefficient = 1.0 (all triangles closed).
   * Path length = 1 (direct connection always).
   */
  const K4 = [
    [0, 1, 1, 1],
    [1, 0, 1, 1],
    [1, 1, 0, 1],
    [1, 1, 1, 0],
  ];

  it('fully connected graph: clustering = 1.0', () => {
    const r = connectivityMetrics(K4);
    expect(r.clusteringCoefficient).toBeCloseTo(1.0, 5);
  });

  it('fully connected graph: avgPathLength = 1', () => {
    const r = connectivityMetrics(K4);
    expect(r.avgPathLength).toBeCloseTo(1.0, 5);
  });

  it('fully connected graph: edgeCount = 6 (K4)', () => {
    const r = connectivityMetrics(K4);
    expect(r.edgeCount).toBe(6);
  });

  it('fully connected graph: all degrees = 3', () => {
    const r = connectivityMetrics(K4);
    expect(r.degrees.every(d => d === 3)).toBe(true);
  });

  /**
   * Ring graph (4 nodes): 0-1-2-3-0 — each node connects to 2 neighbors.
   * Clustering = 0 (no triangles in ring).
   */
  const ring4 = [
    [0, 1, 0, 1],
    [1, 0, 1, 0],
    [0, 1, 0, 1],
    [1, 0, 1, 0],
  ];

  it('ring graph: clustering = 0', () => {
    const r = connectivityMetrics(ring4);
    expect(r.clusteringCoefficient).toBeCloseTo(0, 5);
  });

  it('ring graph: avgPathLength = (1+2+1)/3 = 4/3', () => {
    // For 4-node ring: distances from 0 are [0,1,2,1] → mean = 4/3
    const r = connectivityMetrics(ring4);
    expect(r.avgPathLength).toBeCloseTo(4 / 3, 4);
  });

  it('throws for fewer than 2 nodes', () => {
    expect(() => connectivityMetrics([[0]])).toThrow();
  });

  it('globalEfficiency is positive for connected graph', () => {
    const r = connectivityMetrics(K4);
    expect(r.globalEfficiency).toBeGreaterThan(0);
  });
});

// ─── Receipt ──────────────────────────────────────────────────────────────────

describe('buildNeuroReceipt', () => {
  it('produces receipt with plugin=neuroscience and CAEL event', () => {
    const hh = hodgkinHuxley({ Iapp: 10, durationMs: 50, dtMs: 0.05 });
    const receipt = buildNeuroReceipt({ hh, converged: true });
    expect(receipt.plugin).toBe('neuroscience');
    expect(receipt.cael.event).toBe('neuroscience.neural_simulation');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for well-formed simulation', () => {
    const hh = hodgkinHuxley({ Iapp: 10, durationMs: 50, dtMs: 0.05 });
    const receipt = buildNeuroReceipt({ hh, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when WC does not converge', () => {
    const wc = wilsonCowan({ durationMs: 10, dtMs: 0.5 }); // too short to converge
    // Force non-convergence flag
    const receipt = buildNeuroReceipt({ wilsonCowan: { ...wc, converged: false }, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('uses provided runId', () => {
    const receipt = buildNeuroReceipt({ converged: true }, { runId: 'neuro-test-01' });
    expect(receipt.runId).toBe('neuro-test-01');
  });
});
