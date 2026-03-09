/**
 * FogSystem.prod.test.ts
 *
 * Production tests for FogSystem — linear/exponential/exponential2 fog,
 * height fog, color blending, enabled flag, and animation update.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FogSystem } from '../FogSystem';

describe('FogSystem', () => {
  let fog: FogSystem;

  beforeEach(() => {
    fog = new FogSystem({ enabled: true });
  });

  describe('configuration', () => {
    it('default mode is exponential', () => {
      expect(new FogSystem().getConfig().mode).toBe('exponential');
    });

    it('setConfig merges partial config', () => {
      fog.setConfig({ density: 0.1 });
      expect(fog.getConfig().density).toBeCloseTo(0.1, 5);
    });

    it('setEnabled / isEnabled', () => {
      fog.setEnabled(false);
      expect(fog.isEnabled()).toBe(false);
    });

    it('getConfig returns a copy', () => {
      const cfg = fog.getConfig();
      cfg.density = 99;
      expect(fog.getConfig().density).not.toBe(99);
    });
  });

  describe('computeFogFactor — linear', () => {
    beforeEach(() => {
      fog.setConfig({ mode: 'linear', nearDistance: 10, farDistance: 100 });
    });

    it('at nearDistance factor = 0', () => {
      expect(fog.computeFogFactor(10)).toBeCloseTo(0, 5);
    });

    it('at farDistance factor = 1', () => {
      expect(fog.computeFogFactor(100)).toBeCloseTo(1, 5);
    });

    it('midpoint factor ≈ 0.5', () => {
      expect(fog.computeFogFactor(55)).toBeCloseTo(0.5, 3);
    });

    it('beyond farDistance clamped to 1', () => {
      expect(fog.computeFogFactor(200)).toBeCloseTo(1, 5);
    });
  });

  describe('computeFogFactor — exponential', () => {
    beforeEach(() => {
      fog.setConfig({ mode: 'exponential', density: 0.05 });
    });

    it('at distance=0 factor = 0', () => {
      expect(fog.computeFogFactor(0)).toBeCloseTo(0, 5);
    });

    it('increases with distance', () => {
      expect(fog.computeFogFactor(50)).toBeGreaterThan(fog.computeFogFactor(10));
    });

    it('always in [0,1]', () => {
      for (const d of [0, 10, 50, 100, 1000]) {
        const f = fog.computeFogFactor(d);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('computeFogFactor — exponential2', () => {
    it('at distance=0 factor = 0', () => {
      fog.setConfig({ mode: 'exponential2', density: 0.05 });
      expect(fog.computeFogFactor(0)).toBeCloseTo(0, 5);
    });

    it('exp2 >= exponential at same density and distance', () => {
      fog.setConfig({ mode: 'exponential2', density: 0.05 });
      const f2 = fog.computeFogFactor(30);
      fog.setConfig({ mode: 'exponential', density: 0.05 });
      const f1 = fog.computeFogFactor(30);
      expect(f2).toBeGreaterThanOrEqual(f1);
    });
  });

  describe('when disabled', () => {
    it('computeFogFactor returns 0', () => {
      fog.setEnabled(false);
      fog.setConfig({ mode: 'linear', nearDistance: 10, farDistance: 100 });
      expect(fog.computeFogFactor(1000)).toBe(0);
    });
  });

  describe('height fog', () => {
    beforeEach(() => {
      fog.setConfig({
        mode: 'exponential',
        density: 0.02,
        heightFog: true,
        heightStart: 0,
        heightEnd: 50,
        heightDensity: 0,
      });
    });

    it('at heightEnd fog is 0', () => {
      expect(fog.computeFogFactor(100, 50)).toBeCloseTo(0, 3);
    });

    it('above heightEnd fog = 0', () => {
      expect(fog.computeFogFactor(100, 100)).toBeCloseTo(0, 3);
    });

    it('mid-height produces partial fog', () => {
      const full = fog.computeFogFactor(100, 0);
      const mid = fog.computeFogFactor(100, 25);
      expect(mid).toBeLessThan(full);
      expect(mid).toBeGreaterThan(0);
    });
  });

  describe('blendWithFog()', () => {
    it('at distance=0 color unchanged', () => {
      fog.setConfig({ mode: 'exponential', density: 0.02 });
      const b = fog.blendWithFog([0.8, 0.4, 0.2], 0);
      expect(b[0]).toBeCloseTo(0.8, 3);
    });

    it('at full fog approaches fog color', () => {
      fog.setConfig({ mode: 'linear', nearDistance: 0, farDistance: 10, color: [0.7, 0.75, 0.8] });
      const b = fog.blendWithFog([0, 0, 0], 10);
      expect(b[0]).toBeCloseTo(0.7, 3);
    });

    it('partial fog mixes scene and fog color', () => {
      fog.setConfig({ mode: 'linear', nearDistance: 0, farDistance: 100, color: [1, 0, 0] });
      const b = fog.blendWithFog([0, 0, 1], 50);
      expect(b[0]).toBeGreaterThan(0);
      expect(b[2]).toBeGreaterThan(0);
    });
  });

  describe('update() animation', () => {
    it('speed=0: density unchanged', () => {
      fog.setAnimation(0);
      const before = fog.getConfig().density;
      fog.update(0.016);
      expect(fog.getConfig().density).toBeCloseTo(before, 5);
    });

    it('speed>0: density oscillates over multiple updates', () => {
      fog.setConfig({ density: 0.02 });
      fog.setAnimation(1);
      const densities: number[] = [];
      for (let i = 0; i < 10; i++) {
        fog.update(0.1);
        densities.push(fog.getConfig().density);
      }
      const allSame = densities.every((d) => Math.abs(d - densities[0]) < 1e-10);
      expect(allSame).toBe(false);
    });
  });
});
