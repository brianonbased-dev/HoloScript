import { describe, it, expect, beforeEach } from 'vitest';
import { SoftBodySolver, Particle, DistanceConstraint } from '..';

function mkParticle(x: number, y: number, z: number, invMass = 1): Particle {
  return {
    position: [x, y, z],
    previousPosition: [x, y, z],
    velocity: [0, 0, 0],
    invMass,
  };
}

describe('SoftBodySolver', () => {
  it('constructs with particles and constraints', () => {
    const particles = [mkParticle(0, 5, 0), mkParticle(1, 5, 0)];
    const constraints: DistanceConstraint[] = [{ p1: 0, p2: 1, restLength: 1, stiffness: 1 }];
    const solver = new SoftBodySolver(particles, constraints);
    expect(solver.getParticles().length).toBe(2);
    expect(solver.getConstraints().length).toBe(1);
  });

  it('step applies gravity and moves particles', () => {
    const p = mkParticle(0, 5, 0);
    const solver = new SoftBodySolver([p], []);
    solver.step(1 / 60);
    expect(solver.getParticles()[0].position[1]).toBeLessThan(5);
  });

  it('pinned particle (invMass=0) stays stationary', () => {
    const p = mkParticle(0, 5, 0, 0); // pinned
    const solver = new SoftBodySolver([p], []);
    solver.step(1 / 60);
    expect(solver.getParticles()[0].position[1]).toBe(5);
  });

  it('distance constraint maintains rest length', () => {
    const particles = [mkParticle(0, 5, 0), mkParticle(3, 5, 0)]; // distance = 3, rest = 1
    const constraints: DistanceConstraint[] = [{ p1: 0, p2: 1, restLength: 1, stiffness: 1 }];
    const solver = new SoftBodySolver(particles, constraints);
    // After several steps, distance should approach rest length
    for (let i = 0; i < 100; i++) solver.step(1 / 60);
    const ps = solver.getParticles();
    const dx = ps[0].position[0] - ps[1].position[0];
    const dy = ps[0].position[1] - ps[1].position[1];
    const dz = ps[0].position[2] - ps[1].position[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // Should be closer to 1 than initial 3
    expect(dist).toBeLessThan(2.5);
  });

  it('floor constraint prevents Y < 0', () => {
    const p = mkParticle(0, 0.1, 0);
    const solver = new SoftBodySolver([p], []);
    for (let i = 0; i < 100; i++) solver.step(1 / 60);
    expect(solver.getParticles()[0].position[1]).toBeGreaterThanOrEqual(0);
  });

  it('velocity updates after step', () => {
    const p = mkParticle(0, 5, 0);
    const solver = new SoftBodySolver([p], []);
    solver.step(1 / 60);
    const vel = solver.getParticles()[0].velocity;
    // Gravity should create downward velocity
    expect(vel[1]).toBeLessThan(0);
  });
});
