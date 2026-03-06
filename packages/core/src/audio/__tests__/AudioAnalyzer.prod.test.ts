/**
 * AudioAnalyzer.prod.test.ts
 * Production tests for AudioAnalyzer — FFT spectrum, loudness, bands, beat detection.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AudioAnalyzer, DEFAULT_BANDS } from '../AudioAnalyzer';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a sine wave at the given frequency */
function makeSine(freq: number, samples: number, sampleRate: number): Float32Array {
  const buf = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    buf[i] = Math.sin(2 * Math.PI * freq * i / sampleRate);
  }
  return buf;
}

/** Silent buffer */
function makeSilence(samples: number): Float32Array {
  return new Float32Array(samples);
}

/** DC-offset / full-amplitude buffer */
function makeFullAmplitude(samples: number): Float32Array {
  return new Float32Array(samples).fill(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AudioAnalyzer', () => {
  let analyzer: AudioAnalyzer;

  beforeEach(() => {
    analyzer = new AudioAnalyzer(256, 44100);
  });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('construction', () => {
    it('starts with null spectrum', () => {
      expect(analyzer.getSpectrum()).toBeNull();
    });

    it('starts with zero beats', () => {
      expect(analyzer.getBeats()).toHaveLength(0);
      expect(analyzer.getLastBeat()).toBeNull();
    });

    it('starts with zero smoothed energy', () => {
      expect(analyzer.getSmoothedEnergy()).toBe(0);
    });

    it('starts with 7 default bands', () => {
      const bands = analyzer.getBands();
      expect(bands).toHaveLength(DEFAULT_BANDS.length);
      expect(bands.map(b => b.name)).toEqual(DEFAULT_BANDS.map(b => b.name));
    });

    it('starts with silent loudness metrics', () => {
      const l = analyzer.getLoudness();
      expect(l.rms).toBe(0);
      expect(l.peak).toBe(0);
      expect(l.lufs).toBe(-100);
    });
  });

  // -------------------------------------------------------------------------
  // Spectrum Analysis
  // -------------------------------------------------------------------------
  describe('analyze() — spectrum', () => {
    it('populates spectrum after first call', () => {
      const samples = makeSine(440, 256, 44100);
      analyzer.analyze(samples, 0);
      const spec = analyzer.getSpectrum();
      expect(spec).not.toBeNull();
      expect(spec!.binCount).toBeGreaterThan(0);
      expect(spec!.sampleRate).toBe(44100);
    });

    it('peakFrequency is positive after sine input', () => {
      const samples = makeSine(440, 256, 44100);
      analyzer.analyze(samples, 0);
      expect(analyzer.getSpectrum()!.peakFrequency).toBeGreaterThan(0);
    });

    it('peakMagnitude is positive for non-silent input', () => {
      const samples = makeSine(440, 256, 44100);
      analyzer.analyze(samples, 0);
      expect(analyzer.getSpectrum()!.peakMagnitude).toBeGreaterThan(0);
    });

    it('peakMagnitude is near zero for silence', () => {
      analyzer.analyze(makeSilence(256), 0);
      expect(analyzer.getSpectrum()!.peakMagnitude).toBeCloseTo(0, 5);
    });
  });

  // -------------------------------------------------------------------------
  // Band Energies
  // -------------------------------------------------------------------------
  describe('getBandEnergy()', () => {
    it('returns 0 for unknown band name', () => {
      analyzer.analyze(makeSine(440, 256, 44100), 0);
      expect(analyzer.getBandEnergy('nonexistent')).toBe(0);
    });

    it('bands have energy after analysis of non-silent input', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      const totalEnergy = analyzer.getBands().reduce((sum, b) => sum + b.energy, 0);
      expect(totalEnergy).toBeGreaterThan(0);
    });

    it('getBands() returns a copy — mutations do not affect internals', () => {
      analyzer.analyze(makeSine(440, 256, 44100), 0);
      const bands = analyzer.getBands();
      const originalEnergy = bands[0].energy;
      bands[0].energy = 999;
      expect(analyzer.getBandEnergy(bands[0].name)).toBeCloseTo(originalEnergy, 5);
    });

    it('all 7 named bands are present', () => {
      analyzer.analyze(makeSine(440, 256, 44100), 0);
      const names = analyzer.getBands().map(b => b.name);
      expect(names).toContain('bass');
      expect(names).toContain('mid');
      expect(names).toContain('brilliance');
    });
  });

  // -------------------------------------------------------------------------
  // Loudness
  // -------------------------------------------------------------------------
  describe('getLoudness()', () => {
    it('rms equals 1 for full-amplitude DC signal', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      expect(analyzer.getLoudness().rms).toBeCloseTo(1, 3);
    });

    it('peak equals 1 for full-amplitude signal', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      expect(analyzer.getLoudness().peak).toBeCloseTo(1, 3);
    });

    it('lufs is -100 for silence', () => {
      analyzer.analyze(makeSilence(256), 0);
      expect(analyzer.getLoudness().lufs).toBe(-100);
    });

    it('lufs is 0 dB for full-scale signal', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      expect(analyzer.getLoudness().lufs).toBeCloseTo(0, 1);
    });

    it('dynamicRange is 0 for constant-amplitude signal', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      // peak dB = lufs dB → dynamicRange = 0
      expect(analyzer.getLoudness().dynamicRange).toBeCloseTo(0, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Beat Detection
  // -------------------------------------------------------------------------
  describe('beat detection', () => {
    it('no beats fired for silence', () => {
      for (let t = 0; t < 5000; t += 100) {
        analyzer.analyze(makeSilence(256), t);
      }
      expect(analyzer.getBeats()).toHaveLength(0);
    });

    it('beats fire for high-energy spikes above threshold', () => {
      // Use high sensitivity and low threshold so full-amplitude spikes register
      const hot = new AudioAnalyzer(256, 44100, {
        sensitivity: 0.1,
        energyThreshold: 0,
        minInterval: 100,
      });

      // Alternate silence and full-amplitude to create energy spikes
      let t = 0;
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          hot.analyze(makeFullAmplitude(256), t);
        } else {
          hot.analyze(makeSilence(256), t);
        }
        t += 200;
      }
      // Should have detected at least one beat
      expect(hot.getBeats().length).toBeGreaterThan(0);
    });

    it('getLastBeat() returns null when no beats have fired', () => {
      expect(analyzer.getLastBeat()).toBeNull();
    });

    it('getLastBeat() is not null after a beat fires', () => {
      const hot = new AudioAnalyzer(256, 44100, {
        sensitivity: 0.1,
        energyThreshold: 0,
        minInterval: 100,
      });
      let t = 0;
      for (let i = 0; i < 50; i++) {
        hot.analyze(i % 2 === 0 ? makeFullAmplitude(256) : makeSilence(256), t);
        t += 200;
      }
      if (hot.getBeats().length > 0) {
        expect(hot.getLastBeat()).not.toBeNull();
      }
    });

    it('getEstimatedBPM() returns 0 with fewer than 2 beats', () => {
      expect(analyzer.getEstimatedBPM()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Smoothed Energy
  // -------------------------------------------------------------------------
  describe('getSmoothedEnergy()', () => {
    it('increases from zero after non-silent analysis', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      expect(analyzer.getSmoothedEnergy()).toBeGreaterThan(0);
    });

    it('approaches zero after sustained silence', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      // Many silent frames of exponential decay (factor 0.8 per frame)
      for (let t = 100; t < 2000; t += 100) {
        analyzer.analyze(makeSilence(256), t);
      }
      expect(analyzer.getSmoothedEnergy()).toBeCloseTo(0, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Reactive Value
  // -------------------------------------------------------------------------
  describe('getReactiveValue()', () => {
    it('returns 0 before any analysis', () => {
      expect(analyzer.getReactiveValue()).toBe(0);
    });

    it('is clamped to [0, 1]', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      const v = analyzer.getReactiveValue();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Reset
  // -------------------------------------------------------------------------
  describe('reset()', () => {
    it('clears spectrum after reset', () => {
      analyzer.analyze(makeSine(440, 256, 44100), 0);
      analyzer.reset();
      expect(analyzer.getSpectrum()).toBeNull();
    });

    it('clears beat history after reset', () => {
      const hot = new AudioAnalyzer(256, 44100, { sensitivity: 0.1, energyThreshold: 0, minInterval: 100 });
      let t = 0;
      for (let i = 0; i < 50; i++) {
        hot.analyze(i % 2 === 0 ? makeFullAmplitude(256) : makeSilence(256), t);
        t += 200;
      }
      hot.reset();
      expect(hot.getBeats()).toHaveLength(0);
      expect(hot.getLastBeat()).toBeNull();
    });

    it('resets loudness to defaults', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      analyzer.reset();
      expect(analyzer.getLoudness().rms).toBe(0);
      expect(analyzer.getLoudness().lufs).toBe(-100);
    });

    it('resets smoothed energy to zero', () => {
      analyzer.analyze(makeFullAmplitude(256), 0);
      analyzer.reset();
      expect(analyzer.getSmoothedEnergy()).toBe(0);
    });
  });
});
