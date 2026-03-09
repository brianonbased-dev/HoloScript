import { describe, it, expect, beforeEach } from 'vitest';
import { AudioDynamics } from '../audio/AudioDynamics';

describe('AudioDynamics', () => {
  let dyn: AudioDynamics;

  beforeEach(() => {
    dyn = new AudioDynamics();
  });

  it('passes signal below compressor threshold uncompressed', () => {
    // default threshold is -20, knee 6 → below threshold-knee/2 = -23
    const out = dyn.processCompressor(-30);
    expect(out).toBe(-30); // unchanged + 0 makeup
  });

  it('compresses signal above threshold', () => {
    // input well above threshold+knee/2=-17, ratio 4
    const out = dyn.processCompressor(0);
    // expected: -20 + (0 - (-20))/4 = -20 + 5 = -15
    expect(out).toBeCloseTo(-15, 1);
  });

  it('tracks gain reduction', () => {
    dyn.processCompressor(0);
    expect(dyn.getGainReduction()).toBeGreaterThan(0);
  });

  it('applies makeup gain', () => {
    dyn.setCompressor({ makeup: 6 });
    const out = dyn.processCompressor(-30);
    expect(out).toBe(-30 + 6);
  });

  it('gate opens when signal above threshold', () => {
    dyn.processGate(-10, 0.01); // above default -40 threshold
    expect(dyn.isGateOpen()).toBe(true);
  });

  it('gate closes when signal below threshold', () => {
    // First open gate
    dyn.processGate(-10, 1);
    // Then close it
    dyn.processGate(-50, 1);
    expect(dyn.isGateOpen()).toBe(false);
  });

  it('gate attenuates closed signal by range', () => {
    // Gate closed, range = -80
    const out = dyn.processGate(-50, 1);
    expect(out).toBeLessThan(-50); // attenuated further
  });

  it('sidechain ducking reduces level when trigger is hot', () => {
    dyn.setSidechainLevel(-5);
    const out = dyn.processDucking(0, -10, 12);
    expect(out).toBe(-12);
    expect(dyn.isDucking()).toBe(true);
    expect(dyn.getDuckAmount()).toBe(12);
  });

  it('sidechain ducking passes through when trigger is below', () => {
    dyn.setSidechainLevel(-20);
    const out = dyn.processDucking(0, -10, 12);
    expect(out).toBe(0);
    expect(dyn.isDucking()).toBe(false);
  });

  it('limiter clamps signal to ceiling', () => {
    expect(dyn.limit(3, 0)).toBe(0);
    expect(dyn.limit(-5, 0)).toBe(-5);
  });

  it('soft knee produces intermediate compression', () => {
    // Signal in knee region: threshold=-20, knee=6 → [-23, -17]
    const out = dyn.processCompressor(-20);
    // Should be slightly below -20 (some compression in knee)
    expect(out).toBeLessThanOrEqual(-20 + 0.01);
  });
});
