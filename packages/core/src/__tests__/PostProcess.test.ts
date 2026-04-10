import { describe, it, expect } from 'vitest';
import { PostProcessStack } from '../rendering/PostProcessStack';
import { BloomEffect } from '../rendering/BloomEffect';
import { ColorGrading } from '../rendering/ColorGrading';

// Helper: create a 2x2 RGBA pixel buffer
function makePixels(r: number, g: number, b: number, a = 1): Float32Array {
  const buf = new Float32Array(16);
  for (let i = 0; i < 16; i += 4) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
    buf[i + 3] = a;
  }
  return buf;
}

describe('Cycle 133: Post-Processing', () => {
  // -------------------------------------------------------------------------
  // PostProcessStack
  // -------------------------------------------------------------------------

  it('should process effects in priority order', () => {
    const stack = new PostProcessStack();
    const order: string[] = [];

    stack.addEffect('second', 20, (input) => {
      order.push('B');
      return input;
    });
    stack.addEffect('first', 10, (input) => {
      order.push('A');
      return input;
    });

    stack.process(makePixels(0.5, 0.5, 0.5), 2, 2);
    expect(order).toEqual(['A', 'B']);
  });

  it('should skip disabled effects and blend weights', () => {
    const stack = new PostProcessStack();
    const brighten = stack.addEffect('brighten', 10, (input) => {
      const out = new Float32Array(input.length);
      for (let i = 0; i < input.length; i++) out[i] = 1;
      return out;
    });

    const dark = makePixels(0, 0, 0);
    const result = stack.process(dark, 2, 2);
    expect(result[0]).toBe(1); // Full brightness

    stack.setWeight(brighten.id, 0.5);
    const blended = stack.process(dark, 2, 2);
    expect(blended[0]).toBeCloseTo(0.5, 1);

    stack.setEnabled(brighten.id, false);
    expect(stack.getActiveCount()).toBe(0);
  });

  // -------------------------------------------------------------------------
  // BloomEffect
  // -------------------------------------------------------------------------

  it('should extract bright pixels above threshold', () => {
    const bloom = new BloomEffect();
    bloom.setThreshold(0.5);

    const bright = makePixels(0.9, 0.9, 0.9);
    const dim = makePixels(0.2, 0.2, 0.2);

    const brightExtract = bloom.extractBright(bright, 2, 2);
    const dimExtract = bloom.extractBright(dim, 2, 2);

    expect(brightExtract[0]).toBeGreaterThan(0);
    expect(dimExtract[0]).toBeCloseTo(0, 1);
  });

  it('should apply full bloom pipeline', () => {
    const bloom = new BloomEffect();
    bloom.setThreshold(0.3);
    bloom.setIntensity(0.5);
    bloom.setPasses(1);

    const input = makePixels(0.8, 0.8, 0.8);
    const result = bloom.apply(input, 2, 2);

    // Bloom adds brightness
    expect(result[0]).toBeGreaterThanOrEqual(input[0]);
  });

  // -------------------------------------------------------------------------
  // ColorGrading
  // -------------------------------------------------------------------------

  it('should apply ACES tonemapping', () => {
    const cg = new ColorGrading();
    cg.setTonemapper('aces');
    const [r, g, b] = cg.tonemap(2, 2, 2); // HDR input

    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('should adjust exposure and contrast', () => {
    const cg = new ColorGrading();

    cg.setExposure(1); // +1 EV = 2x brightness
    const [er, eg, eb] = cg.adjustExposure(0.25, 0.25, 0.25);
    expect(er).toBeCloseTo(0.5, 1);

    cg.setContrast(2);
    const [cr, cg2, cb] = cg.adjustContrast(0.75, 0.75, 0.75);
    expect(cr).toBe(1); // (0.75 - 0.5) * 2 + 0.5 = 1
  });

  it('should desaturate when saturation is 0', () => {
    const cg = new ColorGrading();
    cg.setSaturation(0);
    const [r, g, b] = cg.adjustSaturation(1, 0, 0); // Pure red

    // Should be grayscale (luminance)
    expect(r).toBeCloseTo(g, 2);
    expect(g).toBeCloseTo(b, 2);
  });

  it('should apply full color grading pipeline', () => {
    const cg = new ColorGrading();
    cg.setTonemapper('filmic');
    cg.setExposure(0.5);
    cg.setContrast(1.1);
    cg.setSaturation(1.2);
    cg.setGamma(1);

    const input = makePixels(0.6, 0.4, 0.2);
    const result = cg.apply(input, 2, 2);
    expect(result[0]).toBeGreaterThan(0);
    expect(result[0]).toBeLessThanOrEqual(1);
  });
});
