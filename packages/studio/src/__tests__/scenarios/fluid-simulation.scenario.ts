/**
 * fluid-simulation.scenario.ts — LIVING-SPEC: Fluid Dynamics Integration (Phase 5)
 *
 * Persona: Diego (Physics Engineer) validating the MLS-MPM GPU Fluid Solver
 * and its interaction with the Unified Particle Buffer (PBD coupling).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { usePhysicsStore } from '@/lib/physicsStore';
import { Physics } from '@holoscript/engine';

const { UnifiedParticleBuffer, ParticleType, MLSMPMFluid } = Physics;

describe('Scenario: SimSci Phase 5 — Fluid Dynamics & MLS-MPM', () => {
  describe('Unified Buffer Integration', () => {
    let buffer: UnifiedParticleBuffer;

    beforeEach(() => {
      // 200,000 capacity unified buffer
      buffer = new UnifiedParticleBuffer(200000);
    });

    it('allocates particle ranges for fluid and cloth', () => {
      const fluidRange = buffer.registerParticles(ParticleType.FLUID, 50000, 'Water');
      const clothRange = buffer.registerParticles(ParticleType.CLOTH, 1000, 'Flag');

      expect(fluidRange.offset).toBe(0);
      expect(fluidRange.count).toBe(50000);
      expect(fluidRange.type).toBe(ParticleType.FLUID);

      expect(clothRange.offset).toBe(50000);
      expect(clothRange.count).toBe(1000);
      expect(clothRange.type).toBe(ParticleType.CLOTH);

      const stats = buffer.getStats();
      expect(stats.totalActive).toBe(51000);
      expect(stats.rangeCount).toBe(2);
      expect(stats.totalCapacity).toBe(200000);
    });

    it('calculates repulsive boundary coupling (contact mechanics)', () => {
      // Setup the coupling rule: Fluid pushes Cloth
      buffer.addCoupling({
        from: ParticleType.FLUID,
        to: ParticleType.CLOTH,
        strength: 50.0,
        radius: 0.5,
      });

      const fluidRange = buffer.registerParticles(ParticleType.FLUID, 1, 'Fluid Drop');
      const clothRange = buffer.registerParticles(ParticleType.CLOTH, 1, 'Cloth Vert');

      // Place fluid at origin, cloth slightly above (0, 0.25, 0)
      buffer.writePositions(fluidRange, new Float32Array([0, 0, 0]));
      buffer.writePositions(clothRange, new Float32Array([0, 0.25, 0]));

      // Initially zero velocity
      buffer.writeVelocities(fluidRange, new Float32Array([0, 0, 0]));
      buffer.writeVelocities(clothRange, new Float32Array([0, 0, 0]));

      // Step coupling
      buffer.solveBoundaryCoupling(1 / 60);

      // Dist is 0.25. Overlap is 0.5 - 0.25 = 0.25
      // force = (50.0 * 0.25) / 0.25 * (1/60) = 50 * 1 / 60 ≈ 0.833
      // Push should push cloth UP in +y direction.
      const clothVel = buffer.readVelocities(clothRange);
      expect(clothVel[1]).toBeGreaterThan(0); // Upward push due to fluid
      expect(clothVel[0]).toBe(0);
      expect(clothVel[2]).toBe(0);
    });
  });

  describe('MLSMPMFluid Solver Node', () => {
    let fluid: MLSMPMFluid;

    beforeEach(() => {
      // Basic 1,000 particle liquid sim
      fluid = new MLSMPMFluid({
        type: 'liquid',
        particleCount: 1000,
        gridResolution: 32,
      });
    });

    it('maintains fluid config properties', () => {
      const config = fluid.getConfig();
      expect(config.type).toBe('liquid');
      expect(config.particleCount).toBe(1000);
      expect(config.gravity).toBe(-9.81);
    });

    it('generates uniform particle block within domain', () => {
      // Just testing the bounding box of generated particles
      const positions = fluid.generateParticleBlock([0, 0, 0], [4, 4, 4]);
      // The array includes vec4(x, y, z, volume) per particle
      expect(positions.length).toBe(1000 * 4);

      for (let i = 0; i < 1000; i++) {
        const x = positions[i * 4];
        const y = positions[i * 4 + 1];
        const z = positions[i * 4 + 2];
        const vol = positions[i * 4 + 3];

        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(4);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(4);
        expect(z).toBeGreaterThanOrEqual(0);
        expect(z).toBeLessThanOrEqual(4);
        expect(vol).toBeGreaterThan(0);
      }
    });

    it('exposes stats with gpu buffer metrics', () => {
      const stats = fluid.getStats();
      expect(stats.particleCount).toBe(1000);
      expect(stats.gridResolution).toBe(32);
      expect(stats.gpuBufferSizeMB).toBeGreaterThan(0);
    });
  });
});
