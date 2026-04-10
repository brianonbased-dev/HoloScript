import { describe, it, expect } from 'vitest';
import { AudioFilter } from '../audio/AudioFilter';
import { AudioEnvelope } from '../audio/AudioEnvelope';
import { AudioDynamics } from '../audio/AudioDynamics';

describe('Cycle 160: Audio Processing', () => {
  // -------------------------------------------------------------------------
  // AudioFilter
  // -------------------------------------------------------------------------

  it('should attenuate frequencies above lowpass cutoff', () => {
    const filter = new AudioFilter();
    filter.addBand('lp', { type: 'lowpass', frequency: 1000, q: 1, gain: 0 });

    const belowCutoff = filter.getResponse(500);
    const aboveCutoff = filter.getResponse(4000);

    expect(belowCutoff).toBe(0); // No attenuation below
    expect(aboveCutoff).toBeLessThan(0); // Attenuated above
  });

  it('should apply peaking EQ gain around center frequency', () => {
    const filter = new AudioFilter();
    filter.addBand('mid', { type: 'peaking', frequency: 1000, q: 2, gain: 6 });

    const atCenter = filter.getResponse(1000);
    const farAway = filter.getResponse(5000);

    expect(atCenter).toBe(6);
    expect(farAway).toBe(0);
  });

  // -------------------------------------------------------------------------
  // AudioEnvelope
  // -------------------------------------------------------------------------

  it('should progress through ADSR stages', () => {
    const env = new AudioEnvelope({ attack: 0.1, decay: 0.1, sustain: 0.5, release: 0.1 });

    env.noteOn();
    expect(env.getStage()).toBe('attack');

    // Complete attack
    env.process(0.1);
    expect(env.getStage()).toBe('decay');

    // Complete decay
    env.process(0.1);
    expect(env.getStage()).toBe('sustain');
    expect(env.getLevel()).toBeCloseTo(0.5);

    // Release
    env.noteOff();
    env.process(0.1);
    expect(env.getStage()).toBe('idle');
    expect(env.getLevel()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // AudioDynamics
  // -------------------------------------------------------------------------

  it('should compress signal above threshold', () => {
    const dyn = new AudioDynamics();
    dyn.setCompressor({ threshold: -20, ratio: 4, knee: 0, makeup: 0 });

    const below = dyn.processCompressor(-30); // Below threshold
    expect(below).toBe(-30); // No compression

    const above = dyn.processCompressor(-8); // 12dB above threshold
    // Output = -20 + (12 / 4) = -17
    expect(above).toBe(-17);
    expect(dyn.getGainReduction()).toBeGreaterThan(0);
  });

  it('should duck when sidechain exceeds threshold', () => {
    const dyn = new AudioDynamics();
    dyn.setSidechainLevel(-5);

    const ducked = dyn.processDucking(-10, -10, 12);
    expect(ducked).toBe(-22); // -10 - 12
    expect(dyn.isDucking()).toBe(true);

    dyn.setSidechainLevel(-20);
    const unducked = dyn.processDucking(-10, -10, 12);
    expect(unducked).toBe(-10); // No ducking
    expect(dyn.isDucking()).toBe(false);
  });
});
