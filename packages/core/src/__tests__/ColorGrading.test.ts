import { describe, it, expect } from 'vitest';
import { ColorGrading } from '../rendering/ColorGrading';

// =============================================================================
// C245 — Color Grading
// =============================================================================

describe('ColorGrading', () => {
  it('default config is ACES enabled', () => {
    const cg = new ColorGrading();
    const c = cg.getConfig();
    expect(c.tonemapper).toBe('aces');
    expect(c.enabled).toBe(true);
  });

  it('reinhard tonemap compresses HDR', () => {
    const cg = new ColorGrading();
    cg.setTonemapper('reinhard');
    const [r] = cg.tonemap(2, 0, 0);
    // reinhard: 2 / (1+2) = 0.666
    expect(r).toBeCloseTo(0.667, 2);
  });

  it('none tonemap clamps to 1', () => {
    const cg = new ColorGrading();
    cg.setTonemapper('none');
    const [r] = cg.tonemap(5, 0, 0);
    expect(r).toBe(1);
  });

  it('adjustExposure scales by 2^ev', () => {
    const cg = new ColorGrading();
    cg.setExposure(1); // 2^1 = 2x
    const [r] = cg.adjustExposure(0.5, 0, 0);
    expect(r).toBeCloseTo(1.0);
  });

  it('adjustContrast with neutral=1 is identity at midpoint', () => {
    const cg = new ColorGrading();
    cg.setContrast(1);
    const [r] = cg.adjustContrast(0.5, 0, 0);
    expect(r).toBeCloseTo(0.5);
  });

  it('adjustContrast > 1 increases range', () => {
    const cg = new ColorGrading();
    cg.setContrast(2);
    const [r] = cg.adjustContrast(0.8, 0, 0);
    // (0.8 - 0.5) * 2 + 0.5 = 1.1
    expect(r).toBeCloseTo(1.1);
  });

  it('adjustSaturation 0 desaturates to luminance', () => {
    const cg = new ColorGrading();
    cg.setSaturation(0);
    const [r, g, b] = cg.adjustSaturation(1, 0, 0);
    // luminance = 1*0.2126 + 0 + 0 = 0.2126
    expect(r).toBeCloseTo(0.2126, 3);
    expect(g).toBeCloseTo(0.2126, 3);
    expect(b).toBeCloseTo(0.2126, 3);
  });

  it('adjustGamma 1 is identity', () => {
    const cg = new ColorGrading();
    cg.setGamma(1);
    const [r] = cg.adjustGamma(0.5, 0, 0);
    expect(r).toBeCloseTo(0.5);
  });

  it('setContrast clamps 0-2', () => {
    const cg = new ColorGrading();
    cg.setContrast(5);
    expect(cg.getConfig().contrast).toBe(2);
    cg.setContrast(-1);
    expect(cg.getConfig().contrast).toBe(0);
  });

  it('apply with disabled returns input unchanged', () => {
    const cg = new ColorGrading();
    cg.setEnabled(false);
    const input = new Float32Array([0.5, 0.3, 0.1, 1.0]);
    const output = cg.apply(input, 1, 1);
    expect(output[0]).toBe(0.5);
    expect(output[3]).toBe(1.0);
  });

  it('apply processes each pixel (RGBA stride 4)', () => {
    const cg = new ColorGrading();
    cg.setTonemapper('none');
    cg.setExposure(0);
    cg.setContrast(1);
    cg.setSaturation(1);
    cg.setGamma(1);
    const input = new Float32Array([0.5, 0.5, 0.5, 1.0, 0.2, 0.3, 0.4, 1.0]);
    const output = cg.apply(input, 2, 1);
    expect(output.length).toBe(8);
    // Alpha preserved
    expect(output[3]).toBe(1.0);
    expect(output[7]).toBe(1.0);
  });

  it('full pipeline produces clamped output', () => {
    const cg = new ColorGrading();
    cg.setExposure(2);
    const input = new Float32Array([0.8, 0.9, 1.0, 1.0]);
    const output = cg.apply(input, 1, 1);
    expect(output[0]).toBeGreaterThanOrEqual(0);
    expect(output[0]).toBeLessThanOrEqual(1);
    expect(output[1]).toBeGreaterThanOrEqual(0);
    expect(output[1]).toBeLessThanOrEqual(1);
  });
});
