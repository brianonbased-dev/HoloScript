import { describe, it, expect, beforeEach } from 'vitest';
import { AudioDynamics } from '../AudioDynamics';

describe('AudioDynamics', () => {
  let dyn: AudioDynamics;

  beforeEach(() => { dyn = new AudioDynamics(); });

  // ---------------------------------------------------------------------------
  // Compressor
  // ---------------------------------------------------------------------------

  it('below threshold passes through unchanged', () => {
    const out = dyn.processCompressor(-30); // default threshold -20
    expect(out).toBeCloseTo(-30);
  });

  it('above threshold applies compression', () => {
    const out = dyn.processCompressor(-10); // 10dB above threshold, ratio 4:1
    // expected: -20 + (-10 - (-20))/4 = -20 + 2.5 = -17.5
    expect(out).toBeCloseTo(-17.5);
  });

  it('getGainReduction tracks reduction amount', () => {
    dyn.processCompressor(-10);
    expect(dyn.getGainReduction()).toBeGreaterThan(0);
  });

  it('makeup gain is applied', () => {
    dyn.setCompressor({ makeup: 6 });
    const out = dyn.processCompressor(-30);
    expect(out).toBeCloseTo(-24); // -30 + 6
  });

  it('setCompressor updates config', () => {
    dyn.setCompressor({ threshold: -10, ratio: 2 });
    expect(dyn.getCompressor().threshold).toBe(-10);
    expect(dyn.getCompressor().ratio).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Gate
  // ---------------------------------------------------------------------------

  it('gate opens when signal above threshold', () => {
    dyn.processGate(-30, 0.01); // above default -40
    expect(dyn.isGateOpen()).toBe(true);
  });

  it('gate closes when signal below threshold', () => {
    // First open the gate
    dyn.processGate(-30, 0.01);
    // Then close it by going below threshold with enough time
    dyn.processGate(-50, 0.1);
    expect(dyn.isGateOpen()).toBe(false);
  });

  it('gate applies attenuation when closed', () => {
    const out = dyn.processGate(-50, 1); // well below threshold, long dt
    expect(out).toBeLessThan(-50); // attenuated further by range
  });

  it('setGate updates gate config', () => {
    dyn.setGate({ threshold: -20 });
    dyn.processGate(-25, 0.01);
    expect(dyn.isGateOpen()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Sidechain Ducking
  // ---------------------------------------------------------------------------

  it('ducks when sidechain exceeds threshold', () => {
    dyn.setSidechainLevel(-5);
    const out = dyn.processDucking(-10, -10, 12);
    expect(out).toBeCloseTo(-22); // -10 - 12
    expect(dyn.isDucking()).toBe(true);
    expect(dyn.getDuckAmount()).toBe(12);
  });

  it('no ducking when sidechain below threshold', () => {
    dyn.setSidechainLevel(-20);
    const out = dyn.processDucking(-10, -10, 12);
    expect(out).toBeCloseTo(-10);
    expect(dyn.isDucking()).toBe(false);
    expect(dyn.getDuckAmount()).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Limiter
  // ---------------------------------------------------------------------------

  it('limit caps signal at ceiling', () => {
    expect(dyn.limit(-5, -6)).toBe(-6);
    expect(dyn.limit(-10, -6)).toBe(-10);
  });
});
