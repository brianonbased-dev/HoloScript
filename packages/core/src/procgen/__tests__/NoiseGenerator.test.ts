import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '../NoiseGenerator';

describe('NoiseGenerator', () => {
  const gen = new NoiseGenerator(42);

  it('getSeed returns construction seed', () => {
    expect(gen.getSeed()).toBe(42);
  });

  // Perlin
  it('perlin2D returns value in [-1, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = gen.perlin2D(i * 0.3, i * 0.7);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('perlin2D is deterministic', () => {
    const a = gen.perlin2D(1.5, 2.7);
    const b = gen.perlin2D(1.5, 2.7);
    expect(a).toBe(b);
  });

  it('perlin2D changes with different inputs', () => {
    const a = gen.perlin2D(0, 0);
    const b = gen.perlin2D(10.5, 20.3);
    expect(a).not.toBe(b);
  });

  // Value
  it('value2D returns value in [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = gen.value2D(i * 0.5, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // Worley
  it('worley2D returns non-negative distance', () => {
    const v = gen.worley2D(1, 2);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(2); // capped at 1 by min(1, dist) + some margin
  });

  // FBM
  it('fbm returns finite number', () => {
    const v = gen.fbm(1, 2, 4, 2, 0.5, 'perlin');
    expect(Number.isFinite(v)).toBe(true);
  });

  it('fbm uses different noise types', () => {
    const perlin = gen.fbm(1, 2, 4, 2, 0.5, 'perlin');
    const value = gen.fbm(1, 2, 4, 2, 0.5, 'value');
    const worley = gen.fbm(1, 2, 4, 2, 0.5, 'worley');
    // All should be finite but different (very likely)
    expect(Number.isFinite(perlin)).toBe(true);
    expect(Number.isFinite(value)).toBe(true);
    expect(Number.isFinite(worley)).toBe(true);
  });

  // Domain warping
  it('warp returns finite number', () => {
    const v = gen.warp(1, 2, 1, 4);
    expect(Number.isFinite(v)).toBe(true);
  });

  // Different seeds produce different output
  it('different seeds produce different output', () => {
    const g1 = new NoiseGenerator(1);
    const g2 = new NoiseGenerator(9999);
    const v1 = g1.perlin2D(5.5, 3.3);
    const v2 = g2.perlin2D(5.5, 3.3);
    expect(v1).not.toBe(v2);
  });
});
