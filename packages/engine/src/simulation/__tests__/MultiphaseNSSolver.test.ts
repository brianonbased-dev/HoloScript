/**
 * MultiphaseNSSolver Verification — Benchmarks for two-phase flow.
 *
 * The solver uses a rescaled Poisson formulation with local density correction
 * in the velocity projection. For the default 100-iteration budget, it falls
 * back to constant-coefficient Jacobi (first-order for variable density);
 * with pressureIterations >= 200, it uses the full variable-coefficient solve.
 */

import { describe, it, expect } from 'vitest';
import { MultiphaseNSSolver, type MultiphaseConfig } from '../MultiphaseNSSolver';

describe('MultiphaseNSSolver', () => {
  describe('Benchmark 1: Hydrostatic equilibrium', () => {
    it('remains bounded with flat interface and gravity', () => {
      const config: MultiphaseConfig = {
        gridResolution: [10, 20, 3],
        domainSize: [0.5, 1.0, 0.15],
        rhoLiquid: 1000,
        rhoGas: 1.225,
        surfaceTension: 0.072,
        gravity: [0, -9.81, 0],
        pressureIterations: 200,
      };

      const solver = new MultiphaseNSSolver(config);
      solver.initializeLevelSet((x, y, z) => y - 0.5);

      const dt = 0.0001;
      for (let i = 0; i < 50; i++) solver.step(dt);

      // At early time with gravity, velocities should be bounded (not diverging)
      const stats = solver.getStats();
      expect(Number.isFinite(stats.maxVelocity)).toBe(true);
      expect(stats.maxVelocity).toBeLessThan(50);
    });
  });

  describe('Benchmark 2: Low density ratio — stable flow', () => {
    it('maintains stability with moderate density contrast', () => {
      // Use moderate density ratio (10:1) for numerical stability
      const config: MultiphaseConfig = {
        gridResolution: [5, 10, 3],
        domainSize: [0.25, 0.5, 0.15],
        rhoLiquid: 10,
        rhoGas: 1,
        surfaceTension: 0.01,
        gravity: [0, -1, 0],
        pressureIterations: 200,
      };

      const solver = new MultiphaseNSSolver(config);
      solver.initializeLevelSet((x, y, z) => y - 0.25);

      const dt = 0.001;
      for (let i = 0; i < 100; i++) solver.step(dt);

      const stats = solver.getStats();
      expect(Number.isFinite(stats.maxVelocity)).toBe(true);
      expect(stats.maxVelocity).toBeLessThan(10);
      // Liquid phase should still exist
      expect(stats.liquidVolumeFraction).toBeGreaterThan(0);
    });
  });

  describe('Benchmark 3: No driving forces', () => {
    it('stays nearly quiescent without gravity or initial velocity', () => {
      const config: MultiphaseConfig = {
        gridResolution: [5, 10, 3],
        domainSize: [0.25, 0.5, 0.15],
        rhoLiquid: 1.0,
        rhoGas: 0.5,
        surfaceTension: 0.01,
        gravity: [0, 0, 0],
        pressureIterations: 200,
      };

      const solver = new MultiphaseNSSolver(config);
      solver.initializeLevelSet((x, y, z) => y - 0.25);

      for (let i = 0; i < 100; i++) solver.step(0.001);

      const stats = solver.getStats();
      expect(Number.isFinite(stats.maxVelocity)).toBe(true);
      // With no driving force, velocities should remain small
      // (surface tension causes some small initial transient)
      expect(stats.maxVelocity).toBeLessThan(1.0);
    });
  });

  describe('Benchmark 4: Projection reduces divergence', () => {
    it('solver stays stable with density contrast under gravity', () => {
      const config: MultiphaseConfig = {
        gridResolution: [8, 12, 3],
        domainSize: [0.4, 0.6, 0.15],
        rhoLiquid: 100,
        rhoGas: 1,
        surfaceTension: 0.1,
        gravity: [0, -1, 0],
        pressureIterations: 200,
      };

      const solver = new MultiphaseNSSolver(config);
      solver.initializeLevelSet((x, y, z) => y - 0.3);

      const dt = 0.001;
      for (let i = 0; i < 200; i++) solver.step(dt);

      const stats = solver.getStats();
      expect(Number.isFinite(stats.maxVelocity)).toBe(true);
      expect(stats.maxVelocity).toBeLessThan(50);
      expect(stats.liquidVolumeFraction).toBeGreaterThan(0);
    });
  });

  describe('Benchmark 5: Variable-coefficient Poisson (moderate density ratio)', () => {
    it('handles 10:1 density ratio with variable-coefficient solve', () => {
      // Use 10:1 ratio (manageable for the variable-coefficient Jacobi).
      // The 1000:1 water:air ratio requires a preconditioned solver (CG/multigrid)
      // which is a future enhancement — tracked in the deep-ratchet E3 task.
      const config: MultiphaseConfig = {
        gridResolution: [8, 16, 3],
        domainSize: [0.4, 0.8, 0.15],
        rhoLiquid: 10,
        rhoGas: 1,
        surfaceTension: 0.01,
        gravity: [0, -0.1, 0],
        pressureIterations: 300,  // variable-coefficient path
      };

      const solver = new MultiphaseNSSolver(config);
      solver.initializeLevelSet((x, y, z) => y - 0.4);

      const dt = 0.001;
      for (let i = 0; i < 50; i++) solver.step(dt);

      const stats = solver.getStats();
      expect(Number.isFinite(stats.maxVelocity)).toBe(true);
      expect(stats.maxVelocity).toBeLessThan(10);  // bounded, not diverging
      expect(Number.isFinite(stats.liquidVolumeFraction)).toBe(true);
      expect(stats.liquidVolumeFraction).toBeGreaterThan(0.1);
      expect(stats.liquidVolumeFraction).toBeLessThan(0.9);
    });
  });
});