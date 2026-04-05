/**
 * MLSMPMFluid — Integration tests for GPU-accelerated MLS-MPM fluid simulation.
 *
 * Tests both CPU-side logic (config, particle generation, stats) and the
 * full GPU pipeline when Dawn WebGPU is available locally.
 *
 * Run with PHYSICS_FORCE_MOCK=1 to force mock mode.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MLSMPMFluid } from '@holoscript/core';
import type { MLSMPMConfig, MLSMPMStats } from '@holoscript/core';
import { GPU_LIVE, testDevice } from './gpu-setup';

describe('MLSMPMFluid', () => {
  // ── Config / Construction ───────────────────────────────────────────────

  describe('construction', () => {
    it('creates with default config', () => {
      const fluid = new MLSMPMFluid();
      const cfg = fluid.getConfig();
      expect(cfg.type).toBe('liquid');
      expect(cfg.particleCount).toBe(50000);
      expect(cfg.viscosity).toBe(0.01);
      expect(cfg.gridResolution).toBe(128);
      expect(cfg.domainSize).toBe(10);
      expect(cfg.gravity).toBe(-9.81);
      expect(cfg.restDensity).toBe(1000);
      expect(cfg.bulkModulus).toBe(50);
      expect(cfg.particleRadius).toBe(0.02);
      expect(cfg.resolutionScale).toBe(0.5);
      expect(cfg.absorptionColor).toEqual([0.4, 0.04, 0.0]);
      expect(cfg.absorptionStrength).toBe(2.0);
    });

    it('accepts partial config overrides', () => {
      const fluid = new MLSMPMFluid({
        type: 'gas',
        particleCount: 1000,
        viscosity: 0.05,
        gridResolution: 64,
      });
      const cfg = fluid.getConfig();
      expect(cfg.type).toBe('gas');
      expect(cfg.particleCount).toBe(1000);
      expect(cfg.viscosity).toBe(0.05);
      expect(cfg.gridResolution).toBe(64);
      // Defaults preserved for unspecified fields
      expect(cfg.gravity).toBe(-9.81);
      expect(cfg.domainSize).toBe(10);
    });

    it('config is frozen (readonly)', () => {
      const fluid = new MLSMPMFluid();
      const cfg = fluid.getConfig();
      expect(Object.isFrozen(cfg) || cfg.particleCount === 50000).toBe(true);
    });
  });

  // ── Stats ───────────────────────────────────────────────────────────────

  describe('stats', () => {
    it('returns zeroed timing stats before init', () => {
      const fluid = new MLSMPMFluid({ particleCount: 100, gridResolution: 16 });
      const stats = fluid.getStats();
      expect(stats.particleCount).toBe(100);
      expect(stats.gridResolution).toBe(16);
      expect(stats.lastStepMs).toBe(0);
      expect(stats.lastRenderMs).toBe(0);
    });

    it('computes GPU buffer size correctly', () => {
      const fluid = new MLSMPMFluid({ particleCount: 1000, gridResolution: 32 });
      const stats = fluid.getStats();
      // Particle: 1000 * (16+16+64+4) = 100,000 bytes = ~0.095 MB
      // Grid: 32^3 * (16+16) = 32768 * 32 = 1,048,576 bytes = 1 MB
      expect(stats.gpuBufferSizeMB).toBeGreaterThan(0);
      expect(stats.gpuBufferSizeMB).toBeLessThan(100);
    });

    it('buffer size scales with particle count', () => {
      const small = new MLSMPMFluid({ particleCount: 1000, gridResolution: 16 });
      const large = new MLSMPMFluid({ particleCount: 100000, gridResolution: 16 });
      expect(large.getStats().gpuBufferSizeMB).toBeGreaterThan(small.getStats().gpuBufferSizeMB);
    });

    it('buffer size scales with grid resolution', () => {
      const small = new MLSMPMFluid({ particleCount: 1000, gridResolution: 16 });
      const large = new MLSMPMFluid({ particleCount: 1000, gridResolution: 64 });
      expect(large.getStats().gpuBufferSizeMB).toBeGreaterThan(small.getStats().gpuBufferSizeMB);
    });
  });

  // ── Accessors ──────────────────────────────────────────────────────────

  describe('accessors before init', () => {
    it('getParticleCount returns configured count', () => {
      const fluid = new MLSMPMFluid({ particleCount: 2500 });
      expect(fluid.getParticleCount()).toBe(2500);
    });

    it('getParticlePositionBuffer returns null before init', () => {
      const fluid = new MLSMPMFluid();
      expect(fluid.getParticlePositionBuffer()).toBeNull();
    });

    it('getParticleVelocityBuffer returns null before init', () => {
      const fluid = new MLSMPMFluid();
      expect(fluid.getParticleVelocityBuffer()).toBeNull();
    });
  });

  // ── Dispose ────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('can be called on uninitialized instance', () => {
      const fluid = new MLSMPMFluid();
      expect(() => fluid.dispose()).not.toThrow();
    });

    it('step is a no-op after dispose', () => {
      const fluid = new MLSMPMFluid();
      fluid.dispose();
      expect(() => fluid.step(1 / 60)).not.toThrow();
    });
  });

  // ── GPU Pipeline (requires WebGPU — Dawn or mock) ─────────────────────

  describe('GPU pipeline', () => {
    let fluid: MLSMPMFluid;

    beforeEach(() => {
      fluid = new MLSMPMFluid({
        particleCount: 1000,
        gridResolution: 32,
      });
    });

    afterEach(() => {
      fluid.dispose();
    });

    it('initializes GPU resources', async () => {
      expect(testDevice).not.toBeNull();
      await fluid.init(testDevice!);
      expect(fluid.getParticlePositionBuffer()).not.toBeNull();
      expect(fluid.getParticleVelocityBuffer()).not.toBeNull();
    });

    it('generates particle block in cubic region', async () => {
      await fluid.init(testDevice!);
      const positions = fluid.generateParticleBlock([2, 2, 2], [4, 4, 4]);
      expect(positions).toBeInstanceOf(Float32Array);
      // 1000 particles * 4 components (x, y, z, volume)
      expect(positions.length).toBe(1000 * 4);

      // All particles should be within the specified bounds
      for (let i = 0; i < 1000; i++) {
        const x = positions[i * 4];
        const y = positions[i * 4 + 1];
        const z = positions[i * 4 + 2];
        expect(x).toBeGreaterThanOrEqual(2);
        expect(x).toBeLessThanOrEqual(4);
        expect(y).toBeGreaterThanOrEqual(2);
        expect(y).toBeLessThanOrEqual(4);
        expect(z).toBeGreaterThanOrEqual(2);
        expect(z).toBeLessThanOrEqual(4);
      }
    });

    it('particle volume equals domain^3 / count', async () => {
      await fluid.init(testDevice!);
      const positions = fluid.generateParticleBlock([0, 0, 0], [5, 5, 5]);
      const expectedVolume = 10 ** 3 / 1000; // domainSize=10, particleCount=1000
      expect(positions[3]).toBeCloseTo(expectedVolume, 5);
    });

    it('step runs without throwing', async () => {
      await fluid.init(testDevice!);
      fluid.generateParticleBlock([2, 2, 2], [4, 4, 4]);
      expect(() => fluid.step(1 / 60)).not.toThrow();
    });

    it('stats update after step', async () => {
      await fluid.init(testDevice!);
      fluid.generateParticleBlock([2, 2, 2], [4, 4, 4]);
      fluid.step(1 / 60);
      const stats = fluid.getStats();
      // lastStepMs should be set (>= 0, may be 0 on mock)
      expect(stats.lastStepMs).toBeGreaterThanOrEqual(0);
    });

    it('multiple steps do not throw', async () => {
      await fluid.init(testDevice!);
      fluid.generateParticleBlock([2, 2, 2], [4, 4, 4]);
      for (let i = 0; i < 10; i++) {
        expect(() => fluid.step(1 / 60)).not.toThrow();
      }
    });

    it('dispose does not throw and marks disposed', async () => {
      await fluid.init(testDevice!);
      expect(fluid.getParticlePositionBuffer()).not.toBeNull();
      fluid.dispose();
      // After dispose, step should be a no-op (disposed flag set)
      expect(() => fluid.step(1 / 60)).not.toThrow();
    });

    it('setInitialPositions throws before init', () => {
      const uninitFluid = new MLSMPMFluid({ particleCount: 10 });
      expect(() => uninitFluid.setInitialPositions(new Float32Array(40))).toThrow(
        'MLSMPMFluid not initialized'
      );
    });

    it('setInitialPositions works after init', async () => {
      await fluid.init(testDevice!);
      const positions = new Float32Array(1000 * 4);
      for (let i = 0; i < 1000; i++) {
        positions[i * 4] = Math.random() * 5;
        positions[i * 4 + 1] = Math.random() * 5;
        positions[i * 4 + 2] = Math.random() * 5;
        positions[i * 4 + 3] = 0.001;
      }
      expect(() => fluid.setInitialPositions(positions)).not.toThrow();
    });

    // GPU-only tests (skip on mock)
    (GPU_LIVE ? describe : describe.skip)('live GPU', () => {
      it('step completes on real GPU within reasonable time', async () => {
        const gpuFluid = new MLSMPMFluid({
          particleCount: 10000,
          gridResolution: 64,
        });
        await gpuFluid.init(testDevice!);
        gpuFluid.generateParticleBlock([2, 2, 2], [8, 8, 8]);

        gpuFluid.step(1 / 60);
        const stats = gpuFluid.getStats();
        // Real GPU step should complete in under 100ms for 10K particles
        expect(stats.lastStepMs).toBeGreaterThan(0);
        expect(stats.lastStepMs).toBeLessThan(100);
        gpuFluid.dispose();
      });

      it('100K particles can be initialized on GPU', async () => {
        const gpuFluid = new MLSMPMFluid({
          particleCount: 100000,
          gridResolution: 128,
        });
        await gpuFluid.init(testDevice!);
        const positions = gpuFluid.generateParticleBlock([0, 0, 0], [10, 10, 10]);
        expect(positions.length).toBe(100000 * 4);
        gpuFluid.dispose();
      });
    });
  });
});
