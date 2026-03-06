/**
 * BloomEffect.prod.test.ts
 *
 * Production tests for BloomEffect — configuration, extractBright,
 * blur, composite, full apply pipeline, and enabled flag.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { BloomEffect } from '../BloomEffect';

/** Create a 2×2 RGBA pixel buffer with a single luminance-uniform colour. */
function makePixels(width: number, height: number, r: number, g: number, b: number, a = 1): Float32Array {
  const buf = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = r; buf[i * 4 + 1] = g; buf[i * 4 + 2] = b; buf[i * 4 + 3] = a;
  }
  return buf;
}

describe('BloomEffect', () => {
  let bloom: BloomEffect;

  beforeEach(() => {
    bloom = new BloomEffect();
    bloom.setThreshold(0.5);
    bloom.setSoftKnee(0);
    bloom.setIntensity(1);
    bloom.setRadius(1);
    bloom.setPasses(1);
    bloom.setEnabled(true);
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------
  describe('configuration', () => {
    it('default config has threshold=0.8', () => {
      const b = new BloomEffect();
      expect(b.getConfig().threshold).toBe(0.8);
    });

    it('setThreshold clamps negative to 0', () => {
      bloom.setThreshold(-1);
      expect(bloom.getConfig().threshold).toBe(0);
    });

    it('setSoftKnee clamps to [0,1]', () => {
      bloom.setSoftKnee(5); expect(bloom.getConfig().softKnee).toBe(1);
      bloom.setSoftKnee(-1); expect(bloom.getConfig().softKnee).toBe(0);
    });

    it('setIntensity clamps negative to 0', () => {
      bloom.setIntensity(-2); expect(bloom.getConfig().intensity).toBe(0);
    });

    it('setRadius minimum is 1', () => {
      bloom.setRadius(0); expect(bloom.getConfig().radius).toBe(1);
    });

    it('setPasses minimum is 1', () => {
      bloom.setPasses(0); expect(bloom.getConfig().passes).toBe(1);
    });

    it('setEnabled toggles enabled flag', () => {
      bloom.setEnabled(false);
      expect(bloom.getConfig().enabled).toBe(false);
    });

    it('getConfig returns a copy', () => {
      const cfg = bloom.getConfig();
      cfg.threshold = 99;
      expect(bloom.getConfig().threshold).not.toBe(99);
    });
  });

  // -------------------------------------------------------------------------
  // extractBright
  // -------------------------------------------------------------------------
  describe('extractBright()', () => {
    it('dark pixels (luminance < threshold) produce zero output', () => {
      bloom.setThreshold(0.5);
      // Very dark: luma ≈ 0.1
      const pix = makePixels(2, 2, 0.1, 0.1, 0.1);
      const out = bloom.extractBright(pix, 2, 2);
      // All output channels should be 0
      for (let i = 0; i < out.length; i += 4) {
        expect(out[i]).toBeCloseTo(0, 3);
      }
    });

    it('bright pixels (luminance > threshold) produce non-zero output', () => {
      bloom.setThreshold(0.3);
      // Bright white: luma = 1.0
      const pix = makePixels(2, 2, 1, 1, 1);
      const out = bloom.extractBright(pix, 2, 2);
      expect(out[0]).toBeGreaterThan(0);
    });

    it('preserves alpha channel unchanged', () => {
      bloom.setThreshold(0.9); // only very bright passes
      const pix = makePixels(2, 2, 0.5, 0.5, 0.5, 0.7);
      const out = bloom.extractBright(pix, 2, 2);
      expect(out[3]).toBeCloseTo(0.7, 3); // alpha preserved
    });

    it('with softKnee: partially bright pixel produces partial output', () => {
      bloom.setThreshold(0.5);
      bloom.setSoftKnee(0.5);
      // Luminance ≈ 0.7 — just above threshold, knee should give partial contribution
      const pix = makePixels(2, 2, 0.7, 0.7, 0.7);
      const out = bloom.extractBright(pix, 2, 2);
      expect(out[0]).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // blur
  // -------------------------------------------------------------------------
  describe('blur()', () => {
    it('returns buffer of same size', () => {
      const pix = makePixels(4, 4, 1, 1, 1);
      const out = bloom.blur(pix, 4, 4);
      expect(out.length).toBe(pix.length);
    });

    it('uniform color survives blur unchanged', () => {
      const pix = makePixels(4, 4, 0.6, 0, 0);
      const out = bloom.blur(pix, 4, 4);
      // Box blur of uniform color = same color
      expect(out[0]).toBeCloseTo(0.6, 3);
    });

    it('multiple passes reduces peak of a spike', () => {
      bloom.setPasses(3);
      // Spike: only center pixel bright
      const w = 5, h = 1;
      const center = new Float32Array(w * h * 4);
      center[8] = 1; center[9] = 0; center[10] = 0; center[11] = 1; // pixel 2
      const out = bloom.blur(center, w, h);
      // Peak should be lower than original 1.0
      expect(out[8]).toBeLessThan(1);
    });
  });

  // -------------------------------------------------------------------------
  // composite
  // -------------------------------------------------------------------------
  describe('composite()', () => {
    it('with zero bloom buffer, output equals original', () => {
      const original = makePixels(2, 2, 0.5, 0.3, 0.2);
      const bloomBuf = new Float32Array(original.length);
      const out = bloom.composite(original, bloomBuf);
      expect(out[0]).toBeCloseTo(0.5, 5);
    });

    it('adds bloom to original with intensity scaling', () => {
      bloom.setIntensity(0.5);
      const original = makePixels(2, 2, 0.5, 0, 0);
      const bloomBuf = makePixels(2, 2, 0.4, 0, 0);
      const out = bloom.composite(original, bloomBuf);
      // 0.5 + 0.4*0.5 = 0.7
      expect(out[0]).toBeCloseTo(0.7, 3);
    });

    it('clamps result to 1', () => {
      bloom.setIntensity(10);
      const original = makePixels(2, 2, 0.9, 0, 0);
      const bloomBuf = makePixels(2, 2, 0.8, 0, 0);
      const out = bloom.composite(original, bloomBuf);
      expect(out[0]).toBe(1);
    });

    it('preserves alpha from original', () => {
      const original = makePixels(2, 2, 0.5, 0.5, 0.5, 0.8);
      const bloomBuf = new Float32Array(original.length);
      const out = bloom.composite(original, bloomBuf);
      expect(out[3]).toBeCloseTo(0.8, 5);
    });
  });

  // -------------------------------------------------------------------------
  // apply (full pipeline)
  // -------------------------------------------------------------------------
  describe('apply()', () => {
    it('when disabled, returns original pixels unchanged', () => {
      bloom.setEnabled(false);
      const pix = makePixels(2, 2, 0.9, 0.9, 0.9);
      const out = bloom.apply(pix, 2, 2);
      expect(out).toBe(pix); // exact same reference
    });

    it('when enabled, returns a new buffer', () => {
      bloom.setEnabled(true);
      bloom.setThreshold(0.3);
      const pix = makePixels(2, 2, 0.8, 0.8, 0.8);
      const out = bloom.apply(pix, 2, 2);
      expect(out).not.toBe(pix);
    });

    it('bloom on all-black input produces all-black output', () => {
      const pix = makePixels(2, 2, 0, 0, 0);
      const out = bloom.apply(pix, 2, 2);
      for (let i = 0; i < out.length; i += 4) {
        expect(out[i]).toBeCloseTo(0, 5);
      }
    });

    it('bright input increases output values', () => {
      bloom.setThreshold(0.3);
      bloom.setIntensity(1);
      const pix = makePixels(2, 2, 0.9, 0.9, 0.9);
      const out = bloom.apply(pix, 2, 2);
      expect(out[0]).toBeGreaterThanOrEqual(pix[0]);
    });
  });
});
