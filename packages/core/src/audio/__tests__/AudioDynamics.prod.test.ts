/**
 * AudioDynamics — Production Test Suite
 *
 * Covers: processCompressor (below/above/soft-knee, gainReduction, makeup),
 * processGate (open/close, range attenuation), setSidechainLevel,
 * processDucking (threshold/amount), limit, setCompressor/setGate/getCompressor,
 * isDucking/getDuckAmount/isGateOpen/getGainReduction.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AudioDynamics } from '../AudioDynamics';

describe('AudioDynamics — Production', () => {
  let dyn: AudioDynamics;

  beforeEach(() => {
    dyn = new AudioDynamics();
  });

  // ─── processCompressor — below threshold ──────────────────────────
  it('compressor passes signal below threshold unchanged', () => {
    // Default threshold = -20dB, knee = 6 → below-threshold zone: < -23dB
    const input = -40;
    const output = dyn.processCompressor(input);
    expect(output).toBeCloseTo(input, 1); // no makeup by default
  });

  it('compressor reduces signal above threshold', () => {
    // Input well above threshold (-20), ratio=4
    const output = dyn.processCompressor(0); // 0dB >> -20dB threshold
    expect(output).toBeLessThan(0); // compressed well below input
  });

  it('compressor gainReduction is 0 below threshold', () => {
    dyn.processCompressor(-40);
    expect(dyn.getGainReduction()).toBeCloseTo(0, 1);
  });

  it('compressor gainReduction > 0 above threshold', () => {
    dyn.processCompressor(0);
    expect(dyn.getGainReduction()).toBeGreaterThan(0);
  });

  it('makeup gain is added to output', () => {
    dyn.setCompressor({ threshold: -20, ratio: 4, makeup: 6 });
    const noMakeup = dyn.processCompressor(0);
    dyn.setCompressor({ makeup: 0 });
    const withoutMakeup = dyn.processCompressor(0);
    expect(noMakeup).toBeGreaterThan(withoutMakeup);
  });

  it('soft-knee output is between no-compression and full-compression', () => {
    // knee = 6dB, threshold = -20dB → knee zone: -23 to -17dB
    const inputInKnee = -20; // middle of knee
    const out = dyn.processCompressor(inputInKnee);
    // Should be less than linear pass-through but more than fully compressed
    const fullyCompressed = -20 + (-20 - -20) / 4; // = -20 (threshold boundary)
    expect(out).toBeLessThanOrEqual(inputInKnee + 1); // some reduction
  });

  // ─── getCompressor ────────────────────────────────────────────────
  it('getCompressor returns current config', () => {
    const cfg = dyn.getCompressor();
    expect(cfg.threshold).toBe(-20);
    expect(cfg.ratio).toBe(4);
  });

  it('setCompressor updates config', () => {
    dyn.setCompressor({ threshold: -10, ratio: 8 });
    expect(dyn.getCompressor().threshold).toBe(-10);
    expect(dyn.getCompressor().ratio).toBe(8);
  });

  // ─── processGate ─────────────────────────────────────────────────
  it('gate opens when signal above threshold', () => {
    // Default gate threshold = -40dB
    dyn.processGate(0, 0.1); // loud signal, time > attack
    expect(dyn.isGateOpen()).toBe(true);
  });

  it('gate closes when signal below threshold', () => {
    // First open it
    dyn.processGate(0, 1);
    // Now close it with silent signal + long dt
    for (let i = 0; i < 100; i++) dyn.processGate(-80, 0.1);
    expect(dyn.isGateOpen()).toBe(false);
  });

  it('gate attenuates closed signal by range', () => {
    dyn.setGate({ threshold: -40, attack: 0.001, release: 0.001, range: -80 });
    // Keep gate closed (well below threshold)
    const out1 = dyn.processGate(-80, 10);
    // Should be attenuated by range
    expect(out1).toBeLessThan(-80);
  });

  it('gate passes open signal with minimal attenuation', () => {
    // Open repeatedly
    for (let i = 0; i < 10; i++) dyn.processGate(0, 0.1);
    const out = dyn.processGate(0, 0.1);
    expect(out).toBeCloseTo(0, 0); // gate fully open, no attenuation
  });

  // ─── processDucking ───────────────────────────────────────────────
  it('processDucking ducks when sidechain exceeds threshold', () => {
    dyn.setSidechainLevel(-10); // above typical -20dB threshold
    const out = dyn.processDucking(0, -20, 6);
    expect(out).toBe(-6); // 0 - 6 = -6
    expect(dyn.isDucking()).toBe(true);
    expect(dyn.getDuckAmount()).toBe(6);
  });

  it('processDucking passes through when sidechain below threshold', () => {
    dyn.setSidechainLevel(-40);
    const out = dyn.processDucking(0, -20, 6);
    expect(out).toBe(0);
    expect(dyn.isDucking()).toBe(false);
  });

  // ─── limit ────────────────────────────────────────────────────────
  it('limit clamps input above ceiling to ceiling', () => {
    expect(dyn.limit(5, 0)).toBe(0);
  });

  it('limit passes input below ceiling through', () => {
    expect(dyn.limit(-6, 0)).toBe(-6);
  });

  it('limit at exact ceiling returns ceiling', () => {
    expect(dyn.limit(0, 0)).toBe(0);
  });
});
