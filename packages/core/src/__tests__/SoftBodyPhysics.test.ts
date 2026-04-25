import { describe, it, expect, beforeEach } from 'vitest';
import { jsonClone } from '../errors/safeJsonParse';
import {
  SoftBodySolver,
  type Particle,
  type DistanceConstraint,
} from '@holoscript/engine/physics/SoftBodySolver';

describe('SoftBodySolver', () => {
  let solver: SoftBodySolver;
  const initialState: Particle[] = [
    { position: [0, 1, 0], previousPosition: [0, 1, 0], velocity: [0, 0, 0], invMass: 1.0 },
    { position: [0, 2, 0], previousPosition: [0, 2, 0], velocity: [0, 0, 0], invMass: 1.0 },
  ];
  const constraints: DistanceConstraint[] = [{ p1: 0, p2: 1, restLength: 1.0, stiffness: 1.0 }];

  beforeEach(() => {
    // Clone particles to avoid mutation across tests
    const particles = jsonClone(initialState);
    solver = new SoftBodySolver(particles, constraints);
  });

  it('should apply gravity and update positions', () => {
    solver.step(0.1);
    const particles = solver.getParticles();

    // Y positions should decrease due to gravity (0, -9.81, 0)
    expect(particles[0].position[1]).toBeLessThan(1.0);
    expect(particles[1].position[1]).toBeLessThan(2.0);
  });

  it('should satisfy distance constraints', () => {
    // Move particle 1 far away
    const particles = solver.getParticles();
    particles[1].position = [0, 5, 0];

    // One step should bring them closer to restLength (1.0)
    solver.step(0.01);

    const p0 = particles[0].position;
    const p1 = particles[1].position;
    const distance = Math.sqrt(
      Math.pow(p1[0] - p0[0], 2) + Math.pow(p1[1] - p0[1], 2) + Math.pow(p1[2] - p0[2], 2)
    );

    // Should be significantly closer to 1.0 than 4.0 (the initial 5-1 distance)
    expect(distance).toBeLessThan(4.0);
  });

  it('should respect floor collision', () => {
    // Place particle at ground level with downward velocity
    const particles = solver.getParticles();
    particles[0].position = [0, 0, 0];
    particles[0].velocity = [0, -10, 0];

    solver.step(0.1);

    // Should be clamped to 0
    expect(particles[0].position[1]).toBeGreaterThanOrEqual(0);
  });
});
