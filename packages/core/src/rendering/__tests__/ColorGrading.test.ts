import { describe, it, expect, beforeEach } from 'vitest';
import { ColorGrading } from '../ColorGrading';

describe('ColorGrading', () => {
  let cg: ColorGrading;

  beforeEach(() => {
    cg = new ColorGrading();
  });

  // Defaults
  it('defaults to ACES tonemapper, enabled', () => {
    const c = cg.getConfig();
    expect(c.tonemapper).toBe('aces');
    expect(c.enabled).toBe(true);
    expect(c.exposure).toBe(0);
    expect(c.contrast).toBe(1);
    expect(c.saturation).toBe(1);
  });

  // Setters & clamping
  it('sets tonemapper', () => {
    cg.setTonemapper('reinhard');
    expect(cg.getConfig().tonemapper).toBe('reinhard');
  });

  it('sets exposure without clamping', () => {
    cg.setExposure(5);
    expect(cg.getConfig().exposure).toBe(5);
  });

  it('clamps contrast to [0..2]', () => {
    cg.setContrast(10);
    expect(cg.getConfig().contrast).toBe(2);
    cg.setContrast(-5);
    expect(cg.getConfig().contrast).toBe(0);
  });

  it('clamps saturation to [0..2]', () => {
    cg.setSaturation(-1);
    expect(cg.getConfig().saturation).toBe(0);
  });

  it('clamps temperature to [-1..1]', () => {
    cg.setTemperature(5);
    expect(cg.getConfig().temperature).toBe(1);
  });

  it('clamps gamma to [0.1..3]', () => {
    cg.setGamma(0);
    expect(cg.getConfig().gamma).toBeCloseTo(0.1);
    cg.setGamma(100);
    expect(cg.getConfig().gamma).toBe(3);
  });

  it('setEnabled toggles', () => {
    cg.setEnabled(false);
    expect(cg.getConfig().enabled).toBe(false);
  });

  // Tonemapping operators
  it('tonemap "none" clamps to [0,1]', () => {
    cg.setTonemapper('none');
    const [r, g, b] = cg.tonemap(2, 0.5, 0);
    expect(r).toBe(1);
    expect(g).toBe(0.5);
    expect(b).toBe(0);
  });

  it('tonemap "reinhard" compresses HDR', () => {
    cg.setTonemapper('reinhard');
    const [r] = cg.tonemap(10, 0, 0);
    expect(r).toBeCloseTo(10 / 11);
  });

  it('ACES tonemap output in [0,1]', () => {
    const [r, g, b] = cg.tonemap(1, 1, 1);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('filmic tonemap output in [0,1]', () => {
    cg.setTonemapper('filmic');
    const [r] = cg.tonemap(1, 0.5, 0);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('uncharted2 tonemap output in [0,1]', () => {
    cg.setTonemapper('uncharted2');
    const [r] = cg.tonemap(1, 0.5, 0);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  // Exposure
  it('adjustExposure doubles at +1 EV', () => {
    cg.setExposure(1);
    const [r] = cg.adjustExposure(0.5, 0, 0);
    expect(r).toBeCloseTo(1.0);
  });

  // Contrast
  it('adjustContrast neutral at contrast=1', () => {
    const [r] = cg.adjustContrast(0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.5);
  });

  // Saturation
  it('adjustSaturation 0 produces grayscale', () => {
    cg.setSaturation(0);
    const [r, g, b] = cg.adjustSaturation(1, 0, 0);
    expect(r).toBeCloseTo(g);
    expect(g).toBeCloseTo(b);
  });

  // Apply pipeline
  it('apply returns same array when disabled', () => {
    cg.setEnabled(false);
    const px = new Float32Array([1, 0, 0, 1]);
    const out = cg.apply(px, 1, 1);
    expect(out).toBe(px);
  });

  it('apply processes 4-channel pixels', () => {
    const px = new Float32Array([0.5, 0.5, 0.5, 1, 0.8, 0.3, 0.1, 1]);
    const out = cg.apply(px, 2, 1);
    expect(out.length).toBe(8);
    expect(out[3]).toBe(1); // alpha preserved
    expect(out[7]).toBe(1);
  });

  it('apply output clamped to [0..1]', () => {
    cg.setExposure(5);
    const px = new Float32Array([1, 1, 1, 1]);
    const out = cg.apply(px, 1, 1);
    for (let i = 0; i < 3; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });

  // getConfig returns copy
  it('getConfig returns copy', () => {
    const a = cg.getConfig();
    const b = cg.getConfig();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
