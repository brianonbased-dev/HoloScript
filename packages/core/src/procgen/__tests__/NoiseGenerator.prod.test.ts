/**
 * NoiseGenerator — Production Test Suite
 *
 * Covers: perlin2D, value2D, worley2D, fBm, domain warp,
 * seed determinism, output range sanity.
 */
import { describe, it, expect } from 'vitest';
import { NoiseGenerator } from '../NoiseGenerator';

describe('NoiseGenerator — Production', () => {
  // ─── Determinism ──────────────────────────────────────────────────
  it('same seed produces same result', () => {
    const a = new NoiseGenerator(42);
    const b = new NoiseGenerator(42);
    expect(a.perlin2D(1.5, 2.5)).toBe(b.perlin2D(1.5, 2.5));
  });

  it('different seeds produce different results', () => {
    const a = new NoiseGenerator(42);
    const b = new NoiseGenerator(99);
    expect(a.perlin2D(1.5, 2.5)).not.toBe(b.perlin2D(1.5, 2.5));
  });

  it('getSeed returns constructor seed', () => {
    expect(new NoiseGenerator(123).getSeed()).toBe(123);
  });

  // ─── Perlin 2D ────────────────────────────────────────────────────
  it('perlin2D returns number in reasonable range', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.perlin2D(3.5, 7.2);
    expect(typeof v).toBe('number');
    expect(v).toBeGreaterThanOrEqual(-2);
    expect(v).toBeLessThanOrEqual(2);
  });

  it('perlin2D is continuous (nearby inputs give nearby outputs)', () => {
    const ng = new NoiseGenerator(42);
    const v1 = ng.perlin2D(1.0, 1.0);
    const v2 = ng.perlin2D(1.001, 1.001);
    expect(Math.abs(v1 - v2)).toBeLessThan(0.01);
  });

  // ─── Value 2D ─────────────────────────────────────────────────────
  it('value2D returns number in 0-1 range', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.value2D(5.5, 3.3);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
  });

  // ─── Worley 2D ────────────────────────────────────────────────────
  it('worley2D returns non-negative values', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.worley2D(2.5, 4.5);
    expect(v).toBeGreaterThanOrEqual(0);
  });

  // ─── FBM ──────────────────────────────────────────────────────────
  it('fbm returns number', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.fbm(1.5, 2.5, 4, 2, 0.5, 'perlin');
    expect(typeof v).toBe('number');
  });

  it('fbm with more octaves produces different result', () => {
    const ng = new NoiseGenerator(42);
    const v1 = ng.fbm(3.7, 4.2, 1);
    const v2 = ng.fbm(3.7, 4.2, 6);
    expect(v1).not.toBeCloseTo(v2, 5);
  });

  it('fbm works with value noise type', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.fbm(1.5, 2.5, 4, 2, 0.5, 'value');
    expect(typeof v).toBe('number');
  });

  // ─── Domain Warp ──────────────────────────────────────────────────
  it('warp returns number', () => {
    const ng = new NoiseGenerator(42);
    const v = ng.warp(1.5, 2.5, 1.0, 3);
    expect(typeof v).toBe('number');
  });
});
