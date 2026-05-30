/**
 * pfnn-network — unit tests for the real Phase-Functioned NN forward pass.
 *
 * These assert the forward pass is GENUINE (non-zero, deterministic, phase-
 * sensitive) — i.e. not a stub returning zeros. Parity with the provisioned
 * ONNX graph is covered separately in onnx-node-adapter.test.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  PfnnNetwork,
  createBundledPfnn,
  eluInPlace,
  BUNDLED_MODEL_SEED,
  PHASE_CONTROL_POINTS,
} from '../pfnn-network';
import { INPUT_DIM, OUTPUT_DIM } from '../onnx-motion-matching';

function rampInput(dim: number): Float32Array {
  const a = new Float32Array(dim);
  for (let i = 0; i < dim; i++) a[i] = Math.sin(i * 0.3);
  return a;
}

describe('eluInPlace', () => {
  it('is identity for non-negative, exp(x)-1 for negative', () => {
    const d = new Float32Array([-1, 0, 2]);
    eluInPlace(d);
    expect(d[0]).toBeCloseTo(Math.exp(-1) - 1, 6);
    expect(d[1]).toBe(0);
    expect(d[2]).toBe(2);
  });
});

describe('PfnnNetwork forward pass', () => {
  it('produces output of the declared dimension', () => {
    const net = new PfnnNetwork(INPUT_DIM, OUTPUT_DIM, BUNDLED_MODEL_SEED);
    const out = net.forward(rampInput(INPUT_DIM), 0);
    expect(out.length).toBe(OUTPUT_DIM);
  });

  it('produces a NON-ZERO output (real inference, not a zero stub)', () => {
    const net = createBundledPfnn(INPUT_DIM, OUTPUT_DIM);
    const out = net.forward(rampInput(INPUT_DIM), 0.25);
    const nonZero = Array.from(out).filter((v) => v !== 0).length;
    expect(nonZero).toBe(OUTPUT_DIM);
    const sumAbs = Array.from(out).reduce((s, v) => s + Math.abs(v), 0);
    expect(sumAbs).toBeGreaterThan(0);
  });

  it('is deterministic: same seed + input + phase → identical output', () => {
    const a = createBundledPfnn(INPUT_DIM, OUTPUT_DIM).forward(rampInput(INPUT_DIM), 0.4);
    const b = createBundledPfnn(INPUT_DIM, OUTPUT_DIM).forward(rampInput(INPUT_DIM), 0.4);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it('is phase-sensitive: different phase → different output (weights blend)', () => {
    const net = createBundledPfnn(INPUT_DIM, OUTPUT_DIM);
    const at0 = net.forward(rampInput(INPUT_DIM), 0.0);
    const at5 = net.forward(rampInput(INPUT_DIM), 0.5);
    let maxDiff = 0;
    for (let i = 0; i < OUTPUT_DIM; i++) maxDiff = Math.max(maxDiff, Math.abs(at0[i] - at5[i]));
    expect(maxDiff).toBeGreaterThan(1e-4);
  });

  it('different seeds produce different networks', () => {
    const a = new PfnnNetwork(INPUT_DIM, OUTPUT_DIM, 1).forward(rampInput(INPUT_DIM), 0);
    const b = new PfnnNetwork(INPUT_DIM, OUTPUT_DIM, 2).forward(rampInput(INPUT_DIM), 0);
    expect(Array.from(a)).not.toEqual(Array.from(b));
  });

  it('rejects mismatched input length', () => {
    const net = createBundledPfnn(INPUT_DIM, OUTPUT_DIM);
    expect(() => net.forward(new Float32Array(INPUT_DIM - 1), 0)).toThrow(/input length/);
  });

  it('exportWeights returns PHASE_CONTROL_POINTS control points of 3 layers each', () => {
    const w = createBundledPfnn(INPUT_DIM, OUTPUT_DIM).exportWeights();
    expect(w.controlPoints.length).toBe(PHASE_CONTROL_POINTS);
    for (const cp of w.controlPoints) {
      expect(cp.layers.length).toBe(3);
      expect(cp.layers[0].shape[0]).toBe(INPUT_DIM);
      expect(cp.layers[2].shape[1]).toBe(OUTPUT_DIM);
    }
  });

  it('forwardControlPoint(0) differs from blended forward at phase!=0', () => {
    const net = createBundledPfnn(INPUT_DIM, OUTPUT_DIM);
    const raw = net.forwardControlPoint(rampInput(INPUT_DIM), 0);
    const blended = net.forward(rampInput(INPUT_DIM), 0.5);
    let maxDiff = 0;
    for (let i = 0; i < OUTPUT_DIM; i++) maxDiff = Math.max(maxDiff, Math.abs(raw[i] - blended[i]));
    expect(maxDiff).toBeGreaterThan(1e-4);
  });
});
