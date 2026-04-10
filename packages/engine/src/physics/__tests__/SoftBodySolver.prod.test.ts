/**
 * SoftBodySolver — Production Test Suite
 *
 * Covers: constructor, step (PBD), predictPositions, solveConstraints,
 * updateVelocities, getParticles, getConstraints, floor constraint.
 */
import { describe, it, expect } from 'vitest';
import { SoftBodySolver, type Particle, type DistanceConstraint } from '@holoscript/core';

function mkParticle(x: number, y: number, z: number, invMass = 1): Particle {
  return {
    position: [x, y, z],
    previousPosition: [x, y, z],
    velocity: [0, 0, 0],
    invMass,
  };
}

describe('SoftBodySolver — Production', () => {
  it('constructor stores particles and constraints', () => {
    const p = [mkParticle(0, 5, 0), mkParticle(1, 5, 0)];
    const c: DistanceConstraint[] = [{ p1: 0, p2: 1, restLength: 1, stiffness: 1 }];
    const solver = new SoftBodySolver(p, c);
    expect(solver.getParticles().length).toBe(2);
    expect(solver.getConstraints().length).toBe(1);
  });

  it('step applies gravity (particles fall)', () => {
    const p = [mkParticle(0, 5, 0)];
    const solver = new SoftBodySolver(p, []);
    solver.step(1 / 60);
    expect(solver.getParticles()[0].position[1]).toBeLessThan(5);
  });

  it('pinned particles (invMass=0) remain stationary', () => {
    const p = [mkParticle(0, 5, 0, 0)];
    const solver = new SoftBodySolver(p, []);
    solver.step(1 / 60);
    expect(solver.getParticles()[0].position[1]).toBe(5);
  });

  it('distance constraints maintain rest length', () => {
    const p = [mkParticle(0, 5, 0, 0), mkParticle(0, 8, 0)]; // 3 apart, rest=1
    const c: DistanceConstraint[] = [{ p1: 0, p2: 1, restLength: 1, stiffness: 1 }];
    const solver = new SoftBodySolver(p, c);
    solver.step(1 / 60);
    const ps = solver.getParticles();
    const dy = Math.abs(ps[0].position[1] - ps[1].position[1]);
    expect(dy).toBeLessThan(3); // should have pulled closer
  });

  it('floor constraint prevents y < 0', () => {
    const p = [mkParticle(0, 0.01, 0)];
    const solver = new SoftBodySolver(p, []);
    solver.step(1); // big step to force below floor
    expect(solver.getParticles()[0].position[1]).toBeGreaterThanOrEqual(0);
  });

  it('velocity updates after step', () => {
    const p = [mkParticle(0, 5, 0)];
    const solver = new SoftBodySolver(p, []);
    solver.step(1 / 60);
    const vel = solver.getParticles()[0].velocity;
    // velocity should be non-zero after movement
    expect(Math.abs(vel[0]) + Math.abs(vel[1]) + Math.abs(vel[2])).toBeGreaterThan(0);
  });

  it('multiple substeps converge constraints', () => {
    const p = [mkParticle(0, 5, 0, 0), mkParticle(5, 5, 0)];
    const c: DistanceConstraint[] = [{ p1: 0, p2: 1, restLength: 1, stiffness: 1 }];
    const solver = new SoftBodySolver(p, c);
    for (let i = 0; i < 10; i++) solver.step(1 / 60);
    const ps = solver.getParticles();
    const dx = ps[1].position[0] - ps[0].position[0];
    const dy = ps[1].position[1] - ps[0].position[1];
    const dz = ps[1].position[2] - ps[0].position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Should be closer to restLength=1 than original 5
    expect(dist).toBeLessThan(4);
  });
});
