import { describe, it, expect } from 'vitest';
import {
  GIProbeGrid,
  createSH9,
  addSHSample,
  evalSH9Irradiance,
  scaleSH9,
  lerpSH9,
  type SH9,
  type GIConfig,
} from '../GlobalIllumination';

describe('GlobalIllumination — Production Tests', () => {

  // ---------------------------------------------------------------------------
  // SH9 utilities
  // ---------------------------------------------------------------------------
  describe('createSH9', () => {
    it('creates all-zero SH9', () => {
      const sh = createSH9();
      expect(sh.r.length).toBe(9);
      expect(sh.g.length).toBe(9);
      expect(sh.b.length).toBe(9);
      for (let i = 0; i < 9; i++) {
        expect(sh.r[i]).toBe(0); expect(sh.g[i]).toBe(0); expect(sh.b[i]).toBe(0);
      }
    });
  });

  describe('addSHSample', () => {
    it('adds a positive contribution for overhead light', () => {
      const sh = createSH9();
      addSHSample(sh, { x: 0, y: 1, z: 0 }, [1, 1, 1]);
      // L1m1 basis amplified by y=1 direction
      expect(sh.r[1]).toBeGreaterThan(0);
    });

    it('weight scales contribution linearly', () => {
      const sh1 = createSH9();
      const sh2 = createSH9();
      addSHSample(sh1, { x: 0, y: 1, z: 0 }, [1, 0, 0], 1);
      addSHSample(sh2, { x: 0, y: 1, z: 0 }, [1, 0, 0], 2);
      expect(sh2.r[0]).toBeCloseTo(sh1.r[0] * 2, 5);
    });

    it('accumulates multiple samples', () => {
      const sh = createSH9();
      addSHSample(sh, { x: 0, y: 1, z: 0 }, [1, 0, 0]);
      addSHSample(sh, { x: 0, y: -1, z: 0 }, [1, 0, 0]);
      // L0 is always added; L1m1 cancels from opposite dirs
      expect(sh.r[0]).toBeGreaterThan(0);
    });
  });

  describe('evalSH9Irradiance', () => {
    it('returns non-negative values for an upward-lit scene', () => {
      const sh = createSH9();
      addSHSample(sh, { x: 0, y: 1, z: 0 }, [1, 0.9, 0.8]);
      const ir = evalSH9Irradiance(sh, { x: 0, y: 1, z: 0 });
      for (const c of ir) expect(c).toBeGreaterThanOrEqual(0);
    });

    it('normal facing away from light receives little irradiance', () => {
      const sh = createSH9();
      addSHSample(sh, { x: 0, y: 1, z: 0 }, [1, 1, 1], 10);
      const irUp = evalSH9Irradiance(sh, { x: 0, y: 1, z: 0 });
      const irDown = evalSH9Irradiance(sh, { x: 0, y: -1, z: 0 });
      const sumUp = irUp.reduce((a, b) => a + b, 0);
      const sumDown = irDown.reduce((a, b) => a + b, 0);
      expect(sumUp).toBeGreaterThan(sumDown);
    });
  });

  describe('scaleSH9', () => {
    it('scales all coefficients', () => {
      const sh = createSH9();
      addSHSample(sh, { x: 0, y: 1, z: 0 }, [1, 0, 0]);
      const before = sh.r.slice();
      scaleSH9(sh, 2);
      for (let i = 0; i < 9; i++) expect(sh.r[i]).toBeCloseTo(before[i] * 2, 5);
    });

    it('scale by 0 → all zero', () => {
      const sh = createSH9();
      addSHSample(sh, { x: 1, y: 0, z: 0 }, [1, 1, 1]);
      scaleSH9(sh, 0);
      for (let i = 0; i < 9; i++) expect(sh.r[i]).toBeCloseTo(0, 5);
    });
  });

  describe('lerpSH9', () => {
    it('t=0 returns a copy of a', () => {
      const a = createSH9(); addSHSample(a, { x: 1, y: 0, z: 0 }, [1, 0, 0]);
      const b = createSH9(); addSHSample(b, { x: 0, y: 1, z: 0 }, [0, 1, 0]);
      const result = lerpSH9(a, b, 0);
      for (let i = 0; i < 9; i++) expect(result.r[i]).toBeCloseTo(a.r[i], 5);
    });

    it('t=1 returns a copy of b', () => {
      const a = createSH9(); addSHSample(a, { x: 1, y: 0, z: 0 }, [1, 0, 0]);
      const b = createSH9(); addSHSample(b, { x: 0, y: 1, z: 0 }, [0, 1, 0]);
      const result = lerpSH9(a, b, 1);
      for (let i = 0; i < 9; i++) expect(result.g[i]).toBeCloseTo(b.g[i], 5);
    });

    it('t=0.5 is midpoint', () => {
      const a = createSH9(); a.r[0] = 2;
      const b = createSH9(); b.r[0] = 4;
      const result = lerpSH9(a, b, 0.5);
      expect(result.r[0]).toBeCloseTo(3, 5);
    });
  });

  // ---------------------------------------------------------------------------
  // GIProbeGrid
  // ---------------------------------------------------------------------------
  describe('GIProbeGrid — Construction', () => {
    it('creates correct number of probes for 4x2x4 grid', () => {
      const grid = new GIProbeGrid({ gridSize: [4, 2, 4], probeSpacing: 1 });
      expect(grid.getProbeCount()).toBe(32);
    });

    it('probe at (0,0,0) is at gridOrigin', () => {
      const origin = { x: 5, y: 0, z: -3 };
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2], probeSpacing: 2, gridOrigin: origin });
      const p = grid.getProbe(0, 0, 0);
      expect(p?.worldPos.x).toBeCloseTo(origin.x, 5);
      expect(p?.worldPos.y).toBeCloseTo(origin.y, 5);
    });

    it('out-of-bounds probe returns undefined', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2] });
      expect(grid.getProbe(10, 0, 0)).toBeUndefined();
    });
  });

  describe('GIProbeGrid — Probe Updates', () => {
    it('updateProbe stores SH and increments updateCount', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2] });
      const sh = createSH9(); addSHSample(sh, { x: 0, y: 1, z: 0 }, [1, 0, 0]);
      grid.updateProbe(0, 0, 0, sh);
      const p = grid.getProbe(0, 0, 0);
      expect(p?.sh.r[0]).toBeCloseTo(sh.r[0], 5);
      expect(p?.updateCount).toBe(1);
    });

    it('setValidity clamps to [0,1]', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2] });
      grid.setValidity(0, 0, 0, 2);
      expect(grid.getProbe(0, 0, 0)?.validity).toBe(1);
      grid.setValidity(0, 0, 0, -1);
      expect(grid.getProbe(0, 0, 0)?.validity).toBe(0);
    });

    it('invalidateAll sets all validity to 0', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2] });
      grid.invalidateAll();
      expect(grid.getValidProbeCount()).toBe(0);
    });

    it('getValidProbeCount reflects validity state', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2] });
      grid.setValidity(0, 0, 0, 0);
      grid.setValidity(1, 0, 0, 0);
      expect(grid.getValidProbeCount()).toBe(6);
    });
  });

  describe('GIProbeGrid — Irradiance Sampling', () => {
    it('returns non-negative RGB values', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2], probeSpacing: 1 });
      // Add a bit of SH to all probes
      for (let z = 0; z < 2; z++)
        for (let y = 0; y < 2; y++)
          for (let x = 0; x < 2; x++) {
            const sh = createSH9();
            addSHSample(sh, { x: 0, y: 1, z: 0 }, [0.5, 0.7, 0.9]);
            grid.updateProbe(x, y, z, sh);
          }

      const ir = grid.sampleIrradiance({ x: 0.5, y: 0.5, z: 0.5 }, { x: 0, y: 1, z: 0 });
      for (const c of ir) expect(c).toBeGreaterThanOrEqual(0);
    });

    it('outside grid clamps gracefully (no throw)', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2], probeSpacing: 1 });
      expect(() => grid.sampleIrradiance({ x: 100, y: 100, z: 100 }, { x: 0, y: 1, z: 0 })).not.toThrow();
    });
  });

  describe('GIProbeGrid — Lightmap UV', () => {
    it('returns page 0 for first probe', () => {
      const grid = new GIProbeGrid({ gridSize: [2, 2, 2] });
      const uv = grid.getLightmapUV(0);
      expect(uv.page).toBe(0);
      expect(uv.u).toBe(0);
      expect(uv.v).toBe(0);
    });

    it('returns increasing UV for consecutive probes', () => {
      const grid = new GIProbeGrid({ gridSize: [4, 4, 4] });
      const uv0 = grid.getLightmapUV(0);
      const uv1 = grid.getLightmapUV(1);
      // They should differ in at least one component
      expect(uv0.u !== uv1.u || uv0.v !== uv1.v || uv0.page !== uv1.page).toBe(true);
    });
  });
});
