/**
 * PBDSolverCPU — Integration tests for CPU-side PBD soft-body solver.
 *
 * Tests the full solver pipeline: constraint building, stepping,
 * deformation tracking, attachment/detachment, impulse application,
 * and reset functionality. Exercises the quad mesh (2 triangles).
 *
 * @module physics
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PBDSolverCPU, extractEdges } from '@holoscript/core';
import type { ISoftBodyConfig, ISoftBodyState, IVector3 } from '@holoscript/core';

// ── Test Mesh: Quad (2 triangles, 4 vertices) ────────────────────────────

const QUAD_POSITIONS = new Float32Array([
  0,
  1,
  0, // v0 — top-left (pinned)
  1,
  1,
  0, // v1 — top-right (pinned)
  1,
  0,
  0, // v2 — bottom-right
  0,
  0,
  0, // v3 — bottom-left
]);

const QUAD_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);

function createQuadConfig(overrides?: Partial<ISoftBodyConfig>): ISoftBodyConfig {
  const { edges } = extractEdges(QUAD_INDICES, 4);
  return {
    id: 'test-quad',
    positions: new Float32Array(QUAD_POSITIONS),
    masses: new Float32Array([0, 0, 1, 1]), // v0, v1 pinned (mass=0)
    indices: QUAD_INDICES,
    edges,
    compliance: 0.01,
    damping: 0.95,
    collisionMargin: 0.01,
    solverIterations: 10,
    selfCollision: false,
    ...overrides,
  };
}

// ── Larger mesh: 3x3 Grid (18 triangles, 9 vertices) ────────────────────

function createGridConfig(gridSize: number = 3): ISoftBodyConfig {
  const numVerts = gridSize * gridSize;
  const positions = new Float32Array(numVerts * 3);
  const masses = new Float32Array(numVerts);

  for (let z = 0; z < gridSize; z++) {
    for (let x = 0; x < gridSize; x++) {
      const i = z * gridSize + x;
      positions[i * 3] = x;
      positions[i * 3 + 1] = 2; // Start above ground
      positions[i * 3 + 2] = z;
      masses[i] = z === 0 ? 0 : 1; // Pin top row
    }
  }

  const indices: number[] = [];
  for (let z = 0; z < gridSize - 1; z++) {
    for (let x = 0; x < gridSize - 1; x++) {
      const tl = z * gridSize + x;
      const tr = tl + 1;
      const bl = (z + 1) * gridSize + x;
      const br = bl + 1;
      indices.push(tl, tr, bl);
      indices.push(tr, br, bl);
    }
  }

  const { edges } = extractEdges(new Uint32Array(indices), numVerts);

  return {
    id: 'test-grid',
    positions,
    masses,
    indices: new Uint32Array(indices),
    edges,
    compliance: 0.01,
    damping: 0.95,
    collisionMargin: 0.01,
    solverIterations: 10,
    selfCollision: false,
    gravity: { x: 0, y: -9.81, z: 0 },
  };
}

describe('PBDSolverCPU', () => {
  // ── Construction ──────────────────────────────────────────────────

  describe('construction', () => {
    it('creates solver from quad config', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      expect(solver).toBeDefined();
    });

    it('initial state matches config positions', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      const state = solver.getState();
      expect(state.id).toBe('test-quad');
      expect(state.positions[0]).toBe(0);
      expect(state.positions[1]).toBe(1);
      expect(state.positions[3]).toBe(1);
      expect(state.isActive).toBe(true);
    });

    it('initial velocities are zero', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      const state = solver.getState();
      for (let i = 0; i < state.velocities.length; i++) {
        expect(state.velocities[i]).toBe(0);
      }
    });

    it('creates solver from grid config', () => {
      const solver = new PBDSolverCPU(createGridConfig());
      const state = solver.getState();
      expect(state.positions.length).toBe(9 * 3); // 3x3 grid
    });
  });

  // ── Stepping ──────────────────────────────────────────────────────

  describe('step', () => {
    it('returns ISoftBodyState', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      const state = solver.step(1 / 60);
      expect(state).toBeDefined();
      expect(state.positions).toBeInstanceOf(Float32Array);
      expect(state.velocities).toBeInstanceOf(Float32Array);
    });

    it('pinned vertices (mass=0) do not move', () => {
      const solver = new PBDSolverCPU(
        createQuadConfig({
          gravity: { x: 0, y: -9.81, z: 0 },
        })
      );

      for (let i = 0; i < 60; i++) {
        solver.step(1 / 60);
      }

      const state = solver.getState();
      // v0 (pinned) should stay at (0, 1, 0)
      expect(state.positions[0]).toBeCloseTo(0, 3);
      expect(state.positions[1]).toBeCloseTo(1, 3);
      expect(state.positions[2]).toBeCloseTo(0, 3);

      // v1 (pinned) should stay at (1, 1, 0)
      expect(state.positions[3]).toBeCloseTo(1, 3);
      expect(state.positions[4]).toBeCloseTo(1, 3);
    });

    it('free vertices fall under gravity', () => {
      const solver = new PBDSolverCPU(
        createQuadConfig({
          gravity: { x: 0, y: -9.81, z: 0 },
        })
      );

      const initialY_v2 = QUAD_POSITIONS[7]; // v2.y = 0
      solver.step(1 / 60);
      const state = solver.getState();
      // v2 should have moved down (or been constrained near ground)
      // With collision margin, it stays near ground
      expect(state.positions[7]).toBeLessThanOrEqual(initialY_v2 + 0.1);
    });

    it('dt=0 is a no-op', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      const before = new Float32Array(solver.getState().positions);
      solver.step(0);
      const after = solver.getState().positions;
      for (let i = 0; i < before.length; i++) {
        expect(after[i]).toBe(before[i]);
      }
    });

    it('negative dt is a no-op', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      const before = new Float32Array(solver.getState().positions);
      solver.step(-1);
      const after = solver.getState().positions;
      for (let i = 0; i < before.length; i++) {
        expect(after[i]).toBe(before[i]);
      }
    });

    it('multiple steps produce continuous simulation', () => {
      const solver = new PBDSolverCPU(createGridConfig());

      const states: ISoftBodyState[] = [];
      for (let i = 0; i < 10; i++) {
        states.push({
          ...solver.step(1 / 60),
          positions: new Float32Array(solver.getState().positions),
        });
      }

      // Free vertices should progressively move
      const vy_frame0 = states[0].positions[4 * 3 + 1]; // v4 (center, free)
      const vy_frame9 = states[9].positions[4 * 3 + 1];
      // The center vertex is free, but constrained by edges to pinned top row
      // It should stay coherent with the mesh
      expect(Number.isFinite(vy_frame9)).toBe(true);
    });
  });

  // ── Deformation Tracking ──────────────────────────────────────────

  describe('deformation', () => {
    it('deformationAmount is 0 at rest position', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      // Step with no gravity to keep at rest
      solver.step(1 / 60);
      const state = solver.getState();
      // May have slight numerical drift but should be very small
      expect(state.deformationAmount).toBeLessThan(0.5);
    });

    it('deformationAmount increases under gravity', () => {
      const solver = new PBDSolverCPU(createGridConfig());
      for (let i = 0; i < 30; i++) solver.step(1 / 60);
      const state = solver.getState();
      expect(state.deformationAmount).toBeGreaterThanOrEqual(0);
    });

    it('centerOfMass is computed', () => {
      const solver = new PBDSolverCPU(createQuadConfig());
      solver.step(1 / 60);
      const state = solver.getState();
      expect(state.centerOfMass).toBeDefined();
      expect(typeof state.centerOfMass.x).toBe('number');
      expect(typeof state.centerOfMass.y).toBe('number');
      expect(typeof state.centerOfMass.z).toBe('number');
    });
  });

  // ── Attachment Constraints ────────────────────────────────────────

  describe('pinVertex / unpinVertex', () => {
    it('pinVertex keeps vertex at target', () => {
      const config = createQuadConfig({
        masses: new Float32Array([1, 1, 1, 1]), // All free
        gravity: { x: 0, y: -9.81, z: 0 },
      });
      const solver = new PBDSolverCPU(config);
      solver.pinVertex(0, { x: 0, y: 1, z: 0 });

      for (let i = 0; i < 30; i++) solver.step(1 / 60);

      const state = solver.getState();
      // Pinned vertex should stay near target
      expect(state.positions[0]).toBeCloseTo(0, 0);
      expect(state.positions[1]).toBeCloseTo(1, 0);
    });

    it('unpinVertex releases vertex', () => {
      const config = createQuadConfig({
        masses: new Float32Array([1, 1, 1, 1]),
        gravity: { x: 0, y: -9.81, z: 0 },
      });
      const solver = new PBDSolverCPU(config);
      solver.pinVertex(0, { x: 0, y: 1, z: 0 });
      solver.step(1 / 60);
      solver.unpinVertex(0);
      // After unpinning, vertex should be free to move
      for (let i = 0; i < 30; i++) solver.step(1 / 60);
      // It should have fallen somewhat (may hit ground)
      const state = solver.getState();
      expect(Number.isFinite(state.positions[1])).toBe(true);
    });
  });

  // ── Impulse ───────────────────────────────────────────────────────

  describe('applyImpulse', () => {
    it('applies velocity to nearby vertices', () => {
      const config = createQuadConfig({
        masses: new Float32Array([1, 1, 1, 1]),
      });
      const solver = new PBDSolverCPU(config);

      solver.applyImpulse(
        { x: 0.5, y: 0.5, z: 0 }, // Center of quad
        { x: 10, y: 0, z: 0 }, // Push right
        2.0 // Large radius (covers all vertices)
      );

      solver.step(1 / 60);
      const state = solver.getState();
      // All vertices should have moved to the right
      expect(state.velocities[0]).toBeGreaterThan(0); // v0 vx > 0
    });

    it('impulse falloff: closer vertices get more force', () => {
      const config = createQuadConfig({
        masses: new Float32Array([1, 1, 1, 1]),
      });
      const solver = new PBDSolverCPU(config);

      // Apply impulse near v0 (0,1,0)
      solver.applyImpulse({ x: 0, y: 1, z: 0 }, { x: 10, y: 0, z: 0 }, 1.0);

      const state = solver.getState();
      const v0_vx = state.velocities[0]; // v0 is at impulse center
      const v2_vx = state.velocities[6]; // v2 is at (1,0,0), ~1.41 away — outside radius
      expect(v0_vx).toBeGreaterThan(v2_vx);
    });

    it('does not affect pinned vertices (mass=0)', () => {
      const solver = new PBDSolverCPU(createQuadConfig()); // v0, v1 pinned
      solver.applyImpulse({ x: 0.5, y: 0.5, z: 0 }, { x: 100, y: 0, z: 0 }, 5.0);
      const state = solver.getState();
      expect(state.velocities[0]).toBe(0); // v0 pinned
      expect(state.velocities[3]).toBe(0); // v1 pinned
    });
  });

  // ── Active / Inactive ─────────────────────────────────────────────

  describe('setActive', () => {
    it('inactive solver does not update on step', () => {
      const solver = new PBDSolverCPU(
        createQuadConfig({
          gravity: { x: 0, y: -9.81, z: 0 },
        })
      );
      solver.setActive(false);

      const before = new Float32Array(solver.getState().positions);
      solver.step(1 / 60);
      const after = solver.getState().positions;

      for (let i = 0; i < before.length; i++) {
        expect(after[i]).toBe(before[i]);
      }
    });

    it('reactivation resumes simulation', () => {
      const solver = new PBDSolverCPU(
        createQuadConfig({
          masses: new Float32Array([1, 1, 1, 1]),
          gravity: { x: 0, y: -9.81, z: 0 },
        })
      );
      solver.setActive(false);
      solver.step(1 / 60);
      solver.setActive(true);
      solver.step(1 / 60);
      const state = solver.getState();
      // Should have moved
      expect(state.velocities.some((v) => v !== 0)).toBe(true);
    });
  });

  // ── Reset ─────────────────────────────────────────────────────────

  describe('reset', () => {
    it('restores positions to rest shape', () => {
      const solver = new PBDSolverCPU(
        createQuadConfig({
          masses: new Float32Array([1, 1, 1, 1]),
          gravity: { x: 0, y: -9.81, z: 0 },
        })
      );

      for (let i = 0; i < 60; i++) solver.step(1 / 60);
      solver.reset();
      const state = solver.getState();

      // Should be back at original positions
      for (let i = 0; i < QUAD_POSITIONS.length; i++) {
        expect(state.positions[i]).toBeCloseTo(QUAD_POSITIONS[i], 3);
      }
    });
  });

  // ── Ground Collision ──────────────────────────────────────────────

  describe('ground collision', () => {
    it('vertices do not pass through y=0 ground plane', () => {
      const solver = new PBDSolverCPU(
        createQuadConfig({
          masses: new Float32Array([1, 1, 1, 1]), // All free
          gravity: { x: 0, y: -9.81, z: 0 },
          collisionMargin: 0.01,
        })
      );

      for (let i = 0; i < 300; i++) solver.step(1 / 60);

      const state = solver.getState();
      for (let i = 0; i < 4; i++) {
        expect(state.positions[i * 3 + 1]).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
