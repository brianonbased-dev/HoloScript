/**
 * ColorGrading — Production Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ColorGrading } from '../ColorGrading';

function makeCG() {
  return new ColorGrading();
}

describe('ColorGrading — defaults', () => {
  it('defaults tonemapper=aces', () => {
    expect(makeCG().getConfig().tonemapper).toBe('aces');
  });
  it('defaults exposure=0', () => {
    expect(makeCG().getConfig().exposure).toBe(0);
  });
  it('defaults contrast=1, saturation=1, gamma=1', () => {
    const cfg = makeCG().getConfig();
    expect(cfg.contrast).toBe(1);
    expect(cfg.saturation).toBe(1);
    expect(cfg.gamma).toBe(1);
  });
  it('enabled=true by default', () => {
    expect(makeCG().getConfig().enabled).toBe(true);
  });
});

describe('ColorGrading — setters with clamping', () => {
  it('setTonemapper changes tonemapper', () => {
    const cg = makeCG();
    cg.setTonemapper('reinhard');
    expect(cg.getConfig().tonemapper).toBe('reinhard');
  });
  it('all tonemap operators accepted', () => {
    const ops = ['none', 'reinhard', 'aces', 'filmic', 'uncharted2'] as const;
    const cg = makeCG();
    for (const op of ops) {
      cg.setTonemapper(op);
      expect(cg.getConfig().tonemapper).toBe(op);
    }
  });
  it('setExposure stores value', () => {
    const cg = makeCG();
    cg.setExposure(1.5);
    expect(cg.getConfig().exposure).toBe(1.5);
  });
  it('setContrast clamps to [0, 2]', () => {
    const cg = makeCG();
    cg.setContrast(-1);
    expect(cg.getConfig().contrast).toBe(0);
    cg.setContrast(5);
    expect(cg.getConfig().contrast).toBe(2);
    cg.setContrast(1.2);
    expect(cg.getConfig().contrast).toBeCloseTo(1.2);
  });
  it('setSaturation clamps to [0, 2]', () => {
    const cg = makeCG();
    cg.setSaturation(-0.5);
    expect(cg.getConfig().saturation).toBe(0);
    cg.setSaturation(3);
    expect(cg.getConfig().saturation).toBe(2);
  });
  it('setTemperature clamps to [-1, 1]', () => {
    const cg = makeCG();
    cg.setTemperature(-2);
    expect(cg.getConfig().temperature).toBe(-1);
    cg.setTemperature(2);
    expect(cg.getConfig().temperature).toBe(1);
  });
  it('setTint clamps to [-1, 1]', () => {
    const cg = makeCG();
    cg.setTint(-5);
    expect(cg.getConfig().tint).toBe(-1);
    cg.setTint(5);
    expect(cg.getConfig().tint).toBe(1);
  });
  it('setGamma clamps to [0.1, 3]', () => {
    const cg = makeCG();
    cg.setGamma(0);
    expect(cg.getConfig().gamma).toBe(0.1);
    cg.setGamma(5);
    expect(cg.getConfig().gamma).toBe(3);
    cg.setGamma(2.2);
    expect(cg.getConfig().gamma).toBeCloseTo(2.2);
  });
  it('setEnabled toggles', () => {
    const cg = makeCG();
    cg.setEnabled(false);
    expect(cg.getConfig().enabled).toBe(false);
  });
  it('getConfig returns a copy', () => {
    const cg = makeCG();
    const cfg = cg.getConfig();
    cfg.exposure = 99;
    expect(cg.getConfig().exposure).toBe(0);
  });
});

describe('ColorGrading — tonemap', () => {
  it('reinhard: clamps output to [0,1] for HDR inputs', () => {
    const cg = makeCG();
    cg.setTonemapper('reinhard');
    const [r, g, b] = cg.tonemap(10, 5, 3);
    expect(r).toBeLessThanOrEqual(1);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(1);
  });
  it('aces: output in [0, 1]', () => {
    const cg = makeCG();
    cg.setTonemapper('aces');
    const [r, g, b] = cg.tonemap(2, 1, 0.5);
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThanOrEqual(1);
    expect(g).toBeGreaterThanOrEqual(0);
    expect(b).toBeGreaterThanOrEqual(0);
  });
  it('filmic: output in [0, 1]', () => {
    const cg = makeCG();
    cg.setTonemapper('filmic');
    const [r, g, b] = cg.tonemap(3, 2, 1);
    expect(r).toBeLessThanOrEqual(1);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(1);
  });
  it('uncharted2: output in [0, 1]', () => {
    const cg = makeCG();
    cg.setTonemapper('uncharted2');
    const [r, g, b] = cg.tonemap(4, 2, 1);
    expect(r).toBeLessThanOrEqual(1);
    expect(g).toBeLessThanOrEqual(1);
    expect(b).toBeLessThanOrEqual(1);
  });
  it('none (linear): caps at 1, passes through negatives', () => {
    const cg = makeCG();
    cg.setTonemapper('none');
    const [r, g, b] = cg.tonemap(2, 0.5, -1);
    expect(r).toBe(1); // capped at 1
    expect(g).toBe(0.5); // unchanged
    expect(b).toBe(-1); // negative passed through (Math.min(1, -1) = -1)
  });
});

describe('ColorGrading — adjustExposure', () => {
  it('EV=0 returns same value', () => {
    const cg = makeCG();
    cg.setExposure(0);
    const [r] = cg.adjustExposure(0.5, 0.5, 0.5);
    expect(r).toBeCloseTo(0.5);
  });
  it('EV=1 doubles luminance', () => {
    const cg = makeCG();
    cg.setExposure(1);
    const [r] = cg.adjustExposure(0.5, 0, 0);
    expect(r).toBeCloseTo(1.0);
  });
  it('EV=-1 halves luminance', () => {
    const cg = makeCG();
    cg.setExposure(-1);
    const [r] = cg.adjustExposure(1, 0, 0);
    expect(r).toBeCloseTo(0.5);
  });
});

describe('ColorGrading — adjustContrast', () => {
  it('contrast=1 is identity', () => {
    const cg = makeCG();
    cg.setContrast(1);
    const [r] = cg.adjustContrast(0.7, 0, 0);
    expect(r).toBeCloseTo(0.7);
  });
  it('contrast=2 spreads from midpoint', () => {
    const cg = makeCG();
    cg.setContrast(2);
    const [r] = cg.adjustContrast(0.75, 0, 0); // (0.75-0.5)*2+0.5=1.0
    expect(r).toBeCloseTo(1.0);
  });
  it('contrast=0 collapses to midpoint', () => {
    const cg = makeCG();
    cg.setContrast(0);
    const [r] = cg.adjustContrast(0.9, 0, 0);
    expect(r).toBeCloseTo(0.5);
  });
});

describe('ColorGrading — adjustSaturation', () => {
  it('saturation=1 is identity', () => {
    const cg = makeCG();
    cg.setSaturation(1);
    const [r, g, b] = cg.adjustSaturation(0.8, 0.4, 0.2);
    expect(r).toBeCloseTo(0.8);
  });
  it('saturation=0 converts to grey', () => {
    const cg = makeCG();
    cg.setSaturation(0);
    const [r, g, b] = cg.adjustSaturation(1, 0, 0);
    const lum = 1 * 0.2126 + 0 * 0.7152 + 0 * 0.0722;
    expect(r).toBeCloseTo(lum);
    expect(g).toBeCloseTo(lum);
    expect(b).toBeCloseTo(lum);
  });
});

describe('ColorGrading — adjustGamma', () => {
  it('gamma=1 is identity', () => {
    const cg = makeCG();
    cg.setGamma(1);
    const [r] = cg.adjustGamma(0.5, 0, 0);
    expect(r).toBeCloseTo(0.5);
  });
  it('gamma=2 brightens midtones', () => {
    const cg = makeCG();
    cg.setGamma(2);
    const [r] = cg.adjustGamma(0.25, 0, 0); // 0.25^(1/2) = 0.5
    expect(r).toBeCloseTo(0.5);
  });
});

describe('ColorGrading — apply (full pipeline)', () => {
  it('returns input unchanged when disabled', () => {
    const cg = makeCG();
    cg.setEnabled(false);
    const pixels = new Float32Array([0.5, 0.3, 0.1, 1.0]);
    const out = cg.apply(pixels, 1, 1);
    expect(out).toBe(pixels);
  });
  it('processes a 1-pixel buffer', () => {
    const cg = makeCG();
    const pixels = new Float32Array([1, 0.5, 0.2, 1]);
    const out = cg.apply(pixels, 1, 1);
    expect(out.length).toBe(4);
    for (let i = 0; i < 3; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
    expect(out[3]).toBe(1); // alpha preserved
  });
  it('alpha channel is preserved unchanged', () => {
    const cg = makeCG();
    const pixels = new Float32Array([0.5, 0.5, 0.5, 0.7]);
    const out = cg.apply(pixels, 1, 1);
    expect(out[3]).toBeCloseTo(0.7);
  });
  it('multiple pixels processed correctly', () => {
    const cg = makeCG();
    const pixels = new Float32Array([1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1]);
    const out = cg.apply(pixels, 3, 1);
    expect(out.length).toBe(12);
    for (let i = 0; i < 12; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });
  it('output values all in [0,1]', () => {
    const cg = makeCG();
    cg.setExposure(3);
    cg.setContrast(2);
    const pixels = new Float32Array([2, 1.5, 0.8, 1]); // HDR values
    const out = cg.apply(pixels, 1, 1);
    for (let i = 0; i < 3; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });
});
