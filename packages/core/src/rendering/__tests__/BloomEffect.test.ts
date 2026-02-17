import { describe, it, expect, beforeEach } from 'vitest';
import { BloomEffect } from '../BloomEffect';

function makePixels(w: number, h: number, fill = 0.5): Float32Array {
  const px = new Float32Array(w * h * 4);
  for (let i = 0; i < px.length; i += 4) {
    px[i] = fill; px[i + 1] = fill; px[i + 2] = fill; px[i + 3] = 1;
  }
  return px;
}

describe('BloomEffect', () => {
  let bloom: BloomEffect;

  beforeEach(() => { bloom = new BloomEffect(); });

  it('default config', () => {
    const c = bloom.getConfig();
    expect(c.threshold).toBe(0.8);
    expect(c.passes).toBe(3);
    expect(c.enabled).toBe(true);
  });

  it('setThreshold clamps to >= 0', () => {
    bloom.setThreshold(-1);
    expect(bloom.getConfig().threshold).toBe(0);
  });

  it('setSoftKnee clamps [0,1]', () => {
    bloom.setSoftKnee(2);
    expect(bloom.getConfig().softKnee).toBe(1);
    bloom.setSoftKnee(-1);
    expect(bloom.getConfig().softKnee).toBe(0);
  });

  it('setIntensity clamps >= 0', () => {
    bloom.setIntensity(-5);
    expect(bloom.getConfig().intensity).toBe(0);
  });

  it('setRadius floors and clamps >= 1', () => {
    bloom.setRadius(0.5);
    expect(bloom.getConfig().radius).toBe(1);
  });

  it('setPasses floors and clamps >= 1', () => {
    bloom.setPasses(0);
    expect(bloom.getConfig().passes).toBe(1);
  });

  it('setEnabled toggles', () => {
    bloom.setEnabled(false);
    expect(bloom.getConfig().enabled).toBe(false);
  });

  // extractBright
  it('extractBright zeroes out below-threshold pixels', () => {
    bloom.setThreshold(0.9);
    bloom.setSoftKnee(0);
    const px = makePixels(2, 2, 0.3); // well below threshold
    const bright = bloom.extractBright(px, 2, 2);
    // all values should be 0 (below threshold)
    for (let i = 0; i < bright.length; i += 4) {
      expect(bright[i]).toBe(0);
      expect(bright[i + 1]).toBe(0);
    }
  });

  it('extractBright keeps bright pixels', () => {
    bloom.setThreshold(0.1);
    bloom.setSoftKnee(0);
    const px = makePixels(2, 2, 0.9);
    const bright = bloom.extractBright(px, 2, 2);
    expect(bright[0]).toBeGreaterThan(0);
  });

  // blur
  it('blur returns same-size array', () => {
    const px = makePixels(4, 4, 0.5);
    const blurred = bloom.blur(px, 4, 4);
    expect(blurred.length).toBe(px.length);
  });

  // composite
  it('composite adds bloom to original', () => {
    const orig = makePixels(2, 2, 0.3);
    const bl = makePixels(2, 2, 0.1);
    const result = bloom.composite(orig, bl);
    expect(result[0]).toBeGreaterThan(0.3); // 0.3 + 0.1*1
  });

  // apply (full pipeline)
  it('apply returns original if disabled', () => {
    bloom.setEnabled(false);
    const px = makePixels(2, 2, 0.5);
    expect(bloom.apply(px, 2, 2)).toBe(px);
  });

  it('apply returns float32 array of same size', () => {
    const px = makePixels(4, 4, 0.9);
    bloom.setThreshold(0.1);
    const result = bloom.apply(px, 4, 4);
    expect(result.length).toBe(px.length);
    expect(result).toBeInstanceOf(Float32Array);
  });
});
