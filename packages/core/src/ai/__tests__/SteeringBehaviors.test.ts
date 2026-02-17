/**
 * SteeringBehaviors Unit Tests — static API
 */
import { describe, it, expect } from 'vitest';
import { SteeringBehaviors } from '../SteeringBehaviors';
import type { SteeringAgent, FlockConfig, ObstacleCircle } from '../SteeringBehaviors';

const S = SteeringBehaviors;

function makeAgent(x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0): SteeringAgent {
  return { position: { x, y, z }, velocity: { x: vx, y: vy, z: vz }, maxSpeed: 10, maxForce: 5, mass: 1 };
}

describe('SteeringBehaviors', () => {
  describe('vector utilities', () => {
    it('sub', () => { expect(S.sub({ x: 3, y: 2, z: 1 }, { x: 1, y: 1, z: 1 })).toEqual({ x: 2, y: 1, z: 0 }); });
    it('add', () => { expect(S.add({ x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 })).toEqual({ x: 5, y: 7, z: 9 }); });
    it('scale', () => { expect(S.scale({ x: 2, y: 3, z: 4 }, 2)).toEqual({ x: 4, y: 6, z: 8 }); });
    it('length', () => { expect(S.length({ x: 3, y: 4, z: 0 })).toBeCloseTo(5); });
    it('distance', () => { expect(S.distance({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBeCloseTo(5); });
    it('normalize', () => { const n = S.normalize({ x: 3, y: 0, z: 0 }); expect(n.x).toBeCloseTo(1); });
    it('normalize zero', () => { expect(S.length(S.normalize({ x: 0, y: 0, z: 0 }))).toBeCloseTo(0); });
    it('truncate long', () => { expect(S.length(S.truncate({ x: 10, y: 0, z: 0 }, 3))).toBeCloseTo(3); });
    it('truncate short', () => { expect(S.length(S.truncate({ x: 1, y: 0, z: 0 }, 5))).toBeCloseTo(1); });
  });

  describe('seek', () => {
    it('should produce force toward target', () => {
      expect(S.seek(makeAgent(), { x: 10, y: 0, z: 0 }).x).toBeGreaterThan(0);
    });
  });

  describe('flee', () => {
    it('should produce force away from threat', () => {
      expect(S.flee(makeAgent(), { x: 10, y: 0, z: 0 }).x).toBeLessThan(0);
    });
  });

  describe('arrive', () => {
    it('should slow down near target', () => {
      const target = { x: 5, y: 0, z: 0 };
      const farF = S.arrive(makeAgent(0, 0, 0), target, 3);
      const closeF = S.arrive(makeAgent(4, 0, 0), target, 3);
      expect(S.length(closeF)).toBeLessThan(S.length(farF));
    });
  });

  describe('wander', () => {
    it('should produce non-zero force', () => {
      const { force, newAngle } = S.wander(makeAgent(0, 0, 0, 1, 0, 0), 2, 1, 0.5, 0);
      expect(S.length(force)).toBeGreaterThan(0);
      expect(typeof newAngle).toBe('number');
    });
  });

  describe('flock', () => {
    it('should combine separation/alignment/cohesion', () => {
      const cfg: FlockConfig = { separationWeight: 1, alignmentWeight: 1, cohesionWeight: 1, neighborRadius: 10 };
      const f = S.flock(makeAgent(), [makeAgent(1, 0, 0, 0, 0, 1)], cfg);
      expect(typeof f.x).toBe('number');
    });

    it('should return zero with no neighbors', () => {
      const cfg: FlockConfig = { separationWeight: 1, alignmentWeight: 1, cohesionWeight: 1, neighborRadius: 10 };
      expect(S.length(S.flock(makeAgent(), [], cfg))).toBe(0);
    });
  });

  describe('obstacleAvoidance', () => {
    it('should produce avoidance force', () => {
      const f = S.obstacleAvoidance(makeAgent(0, 0, 0, 5, 0, 0), [{ center: { x: 5, y: 0, z: 0 }, radius: 2 }], 10);
      expect(typeof f.x).toBe('number');
    });

    it('should return zero with no obstacles', () => {
      expect(S.length(S.obstacleAvoidance(makeAgent(0, 0, 0, 5, 0, 0), [], 10))).toBe(0);
    });
  });

  describe('applyForce', () => {
    it('should update velocity and position', () => {
      const agent = makeAgent();
      S.applyForce(agent, { x: 5, y: 0, z: 0 }, 1);
      expect(agent.velocity.x).toBeGreaterThan(0);
      expect(agent.position.x).toBeGreaterThan(0);
    });

    it('should clamp to maxSpeed', () => {
      const agent = makeAgent();
      S.applyForce(agent, { x: 100, y: 0, z: 0 }, 1);
      expect(S.length(agent.velocity)).toBeLessThanOrEqual(agent.maxSpeed + 0.001);
    });
  });
});
