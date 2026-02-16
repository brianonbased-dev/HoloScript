import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '../procedural/NoiseGenerator';

// =============================================================================
// C304 — NoiseGenerator
// =============================================================================

describe('NoiseGenerator', () => {
  it('value2D returns values in [0,1]', () => {
    const ng = new NoiseGenerator({ seed: 1 });
    for (let i = 0; i < 20; i++) {
      const v = ng.value2D(i * 0.7, i * 1.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('perlin2D returns values in [0,1]', () => {
    const ng = new NoiseGenerator({ seed: 2 });
    for (let i = 0; i < 20; i++) {
      const v = ng.perlin2D(i * 0.5, i * 0.8);
      expect(v).toBeGreaterThanOrEqual(-0.01);
      expect(v).toBeLessThanOrEqual(1.01);
    }
  });

  it('same seed produces same output', () => {
    const a = new NoiseGenerator({ seed: 42 });
    const b = new NoiseGenerator({ seed: 42 });
    expect(a.value2D(10, 20)).toBe(b.value2D(10, 20));
  });

  it('different seeds produce different output', () => {
    const a = new NoiseGenerator({ seed: 1 });
    const b = new NoiseGenerator({ seed: 999 });
    // While not mathematically guaranteed, extremely likely to differ
    expect(a.value2D(10, 20)).not.toBe(b.value2D(10, 20));
  });

  it('value3D returns values in [0,1]', () => {
    const ng = new NoiseGenerator({ seed: 7 });
    const v = ng.value3D(1.5, 2.5, 3.5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('fbm2D produces smoother layered noise', () => {
    const ng = new NoiseGenerator({ seed: 10, octaves: 4, scale: 0.1 });
    const v = ng.fbm2D(5, 5);
    expect(typeof v).toBe('number');
    expect(isNaN(v)).toBe(false);
  });

  it('ridged2D produces non-negative values', () => {
    const ng = new NoiseGenerator({ seed: 3, octaves: 3, scale: 0.05 });
    const v = ng.ridged2D(10, 10);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  it('warped2D is deterministic with same seed', () => {
    const a = new NoiseGenerator({ seed: 50 });
    const b = new NoiseGenerator({ seed: 50 });
    expect(a.warped2D(5, 5)).toBe(b.warped2D(5, 5));
  });

  it('sample2D dispatches by type', () => {
    const ng = new NoiseGenerator({ seed: 1 });
    const v = ng.sample2D(5, 5, 'value');
    const p = ng.sample2D(5, 5, 'perlin');
    expect(typeof v).toBe('number');
    expect(typeof p).toBe('number');
  });

  it('generateMap produces correct-size array', () => {
    const ng = new NoiseGenerator({ seed: 1 });
    const map = ng.generateMap(8, 4);
    expect(map.length).toBe(32);
  });

  it('setSeed changes output', () => {
    const ng = new NoiseGenerator({ seed: 1 });
    const before = ng.value2D(5, 5);
    ng.setSeed(999);
    const after = ng.value2D(5, 5);
    expect(before).not.toBe(after);
  });
});
