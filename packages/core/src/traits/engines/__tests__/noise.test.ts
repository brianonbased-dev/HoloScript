import { describe, it, expect } from 'vitest';
import { noise, smoothNoise } from '../noise';

describe('noise', () => {
  it('is deterministic — same (t, seed) → same value across calls', () => {
    expect(noise(1.5, 42)).toBe(noise(1.5, 42));
    expect(noise(0.001, 0)).toBe(noise(0.001, 0));
  });

  it('different seeds produce different values', () => {
    expect(noise(2.5, 0)).not.toBe(noise(2.5, 1));
  });

  it('output stays in [-1, 1]', () => {
    for (let t = 0; t < 100; t += 0.13) {
      const v = noise(t, 7);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('different t values produce different output (no flat regions)', () => {
    const samples = new Set<number>();
    for (let i = 0; i < 100; i++) samples.add(noise(i * 0.07, 0));
    // Hash noise should produce many distinct values across 100 samples
    expect(samples.size).toBeGreaterThan(50);
  });
});

describe('smoothNoise', () => {
  it('is deterministic across calls', () => {
    expect(smoothNoise(3.7, 0)).toBe(smoothNoise(3.7, 0));
  });

  it('matches noise() exactly at integer t (smoothstep weight = 0)', () => {
    for (const t of [0, 1, 2, 5, 10]) {
      expect(smoothNoise(t, 0)).toBeCloseTo(noise(t, 0), 10);
    }
  });

  it('output stays in [-1, 1]', () => {
    for (let t = 0; t < 100; t += 0.17) {
      const v = smoothNoise(t, 3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('continuous — small t step produces small output step', () => {
    // Pick a random non-integer point; nearby samples should be close.
    const t = 5.3;
    const v0 = smoothNoise(t, 0);
    const v1 = smoothNoise(t + 0.001, 0);
    expect(Math.abs(v1 - v0)).toBeLessThan(0.05);
  });
});
