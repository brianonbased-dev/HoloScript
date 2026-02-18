import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '../NoiseGenerator';

describe('NoiseGenerator', () => {
  it('constructor stores seed', () => {
    const ng = new NoiseGenerator(123);
    expect(ng.getSeed()).toBe(123);
  });

  it('default seed is 42', () => {
    const ng = new NoiseGenerator();
    expect(ng.getSeed()).toBe(42);
  });

  it('perlin2D returns values in [-1, 1]', () => {
    const ng = new NoiseGenerator(1);
    for (let i = 0; i < 100; i++) {
      const v = ng.perlin2D(i * 0.1, i * 0.2);
      expect(v).toBeGreaterThanOrEqual(-1.5); // Perlin can slightly exceed ±1
      expect(v).toBeLessThanOrEqual(1.5);
    }
  });

  it('perlin2D is deterministic with same seed', () => {
    const a = new NoiseGenerator(99);
    const b = new NoiseGenerator(99);
    expect(a.perlin2D(1.5, 2.3)).toBe(b.perlin2D(1.5, 2.3));
  });

  it('different seeds produce different output', () => {
    const a = new NoiseGenerator(1);
    const b = new NoiseGenerator(2);
    expect(a.perlin2D(5.7, 3.2)).not.toBe(b.perlin2D(5.7, 3.2));
  });

  it('value2D returns values in [0, 1]', () => {
    const ng = new NoiseGenerator(7);
    for (let i = 0; i < 50; i++) {
      const v = ng.value2D(i * 0.3, i * 0.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('worley2D returns non-negative values', () => {
    const ng = new NoiseGenerator(13);
    for (let i = 0; i < 50; i++) {
      const v = ng.worley2D(i * 0.5, i * 0.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('fbm with perlin returns bounded noise', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.fbm(3.0, 7.0, 4, 2, 0.5, 'perlin');
    expect(v).toBeGreaterThan(-2);
    expect(v).toBeLessThan(2);
  });

  it('fbm with value noise returns values', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.fbm(1, 1, 3, 2, 0.5, 'value');
    expect(typeof v).toBe('number');
    expect(Number.isFinite(v)).toBe(true);
  });

  it('fbm with worley noise returns values', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.fbm(1, 1, 3, 2, 0.5, 'worley');
    expect(typeof v).toBe('number');
    expect(Number.isFinite(v)).toBe(true);
  });

  it('warp produces finite output', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.warp(2, 3, 1.5, 3);
    expect(Number.isFinite(v)).toBe(true);
  });

  it('perlin2D varies smoothly (no discontinuities)', () => {
    const ng = new NoiseGenerator(42);
    const a = ng.perlin2D(1.0, 1.0);
    const b = ng.perlin2D(1.01, 1.0);
    expect(Math.abs(a - b)).toBeLessThan(0.1); // near points → near values
  });
});
