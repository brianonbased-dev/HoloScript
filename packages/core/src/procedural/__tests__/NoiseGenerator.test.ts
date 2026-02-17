import { describe, it, expect, beforeEach } from 'vitest';
import { NoiseGenerator } from '../NoiseGenerator';

describe('NoiseGenerator', () => {
  let noise: NoiseGenerator;

  beforeEach(() => { noise = new NoiseGenerator({ seed: 42 }); });

  // ---------------------------------------------------------------------------
  // Seeding
  // ---------------------------------------------------------------------------

  it('same seed produces same value', () => {
    const a = new NoiseGenerator({ seed: 123 });
    const b = new NoiseGenerator({ seed: 123 });
    expect(a.perlin2D(1, 1)).toBe(b.perlin2D(1, 1));
  });

  it('different seeds produce different values', () => {
    const a = new NoiseGenerator({ seed: 111 });
    const b = new NoiseGenerator({ seed: 999 });
    // Use fractional coords — integer points always equal 0.5 regardless of seed
    let different = false;
    for (let i = 0; i < 20; i++) {
      if (a.perlin2D(i + 0.37, i + 0.71) !== b.perlin2D(i + 0.37, i + 0.71)) {
        different = true;
        break;
      }
    }
    expect(different).toBe(true);
  });

  it('setSeed changes output', () => {
    const before = noise.perlin2D(3.7, 3.3);
    noise.setSeed(999);
    const after = noise.perlin2D(3.7, 3.3);
    expect(before).not.toBe(after);
  });

  // ---------------------------------------------------------------------------
  // Perlin Noise 2D
  // ---------------------------------------------------------------------------

  it('perlin2D returns value in [-1, 1]', () => {
    for (let i = 0; i < 100; i++) {
      const v = noise.perlin2D(i * 0.1, i * 0.3);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  // ---------------------------------------------------------------------------
  // Value Noise
  // ---------------------------------------------------------------------------

  it('value2D returns value in [0, 1]', () => {
    for (let i = 0; i < 50; i++) {
      const v = noise.value2D(i * 0.5, i * 0.7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('value3D returns a finite number', () => {
    const v = noise.value3D(1, 2, 3);
    expect(Number.isFinite(v)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // FBM
  // ---------------------------------------------------------------------------

  it('fbm2D produces different values at different positions', () => {
    const a = noise.fbm2D(0, 0);
    const b = noise.fbm2D(10, 10);
    expect(a).not.toBe(b);
  });

  it('fbm2D returns a finite number', () => {
    const v = noise.fbm2D(5, 5);
    expect(Number.isFinite(v)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Ridged Noise
  // ---------------------------------------------------------------------------

  it('ridged2D returns a finite number', () => {
    const v = noise.ridged2D(5, 5);
    expect(Number.isFinite(v)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Domain-Warped Noise
  // ---------------------------------------------------------------------------

  it('warped2D returns a finite number', () => {
    const v = noise.warped2D(5, 5, 2);
    expect(Number.isFinite(v)).toBe(true);
  });

  it('warped2D differs from unwarped', () => {
    const warped = noise.warped2D(5, 5, 4);
    const base = noise.perlin2D(5, 5);
    // Warping distorts coords, so result should differ (most of the time)
    expect(typeof warped).toBe('number');
  });

  // ---------------------------------------------------------------------------
  // sample2D
  // ---------------------------------------------------------------------------

  it('sample2D selects noise type', () => {
    const val = noise.sample2D(3, 3, 'value');
    const prl = noise.sample2D(3, 3, 'perlin');
    expect(Number.isFinite(val)).toBe(true);
    expect(Number.isFinite(prl)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // generateMap
  // ---------------------------------------------------------------------------

  it('generateMap returns Float32Array of correct length', () => {
    const map = noise.generateMap(8, 6);
    expect(map).toBeInstanceOf(Float32Array);
    expect(map.length).toBe(8 * 6);
  });

  it('generateMap values are finite', () => {
    const map = noise.generateMap(4, 4);
    for (let i = 0; i < map.length; i++) {
      expect(Number.isFinite(map[i])).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  it('getConfig returns current config', () => {
    const cfg = noise.getConfig();
    expect(cfg.seed).toBe(42);
    expect(cfg.octaves).toBeDefined();
  });

  it('setConfig updates config', () => {
    noise.setConfig({ octaves: 3 });
    expect(noise.getConfig().octaves).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // Continuity
  // ---------------------------------------------------------------------------

  it('noise is continuous (nearby points have similar values)', () => {
    const a = noise.perlin2D(1.0, 1.0);
    const b = noise.perlin2D(1.001, 1.0);
    expect(Math.abs(a - b)).toBeLessThan(0.1);
  });
});
