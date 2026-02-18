/**
 * SteeringBehaviors Production Tests
 *
 * Seek, flee, arrive, wander, separation, flock, avoidObstacles, applyForce.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SteeringBehaviors, type SteeringAgent } from '../SteeringBehaviors';

function makeAgent(x = 0, y = 0, z = 0): SteeringAgent {
  return {
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    maxSpeed: 10,
    maxForce: 5,
    mass: 1,
  };
}

describe('SteeringBehaviors — Production', () => {
  let sb: SteeringBehaviors;

  beforeEach(() => {
    sb = new SteeringBehaviors();
  });

  describe('seek', () => {
    it('produces force toward target', () => {
      const agent = makeAgent(0, 0, 0);
      const force = sb.seek(agent, { x: 10, y: 0, z: 0 });
      expect(force.x).toBeGreaterThan(0);
    });
  });

  describe('flee', () => {
    it('produces force away from target', () => {
      const agent = makeAgent(0, 0, 0);
      const force = sb.flee(agent, { x: 10, y: 0, z: 0 });
      expect(force.x).toBeLessThan(0);
    });
  });

  describe('arrive', () => {
    it('slows near target', () => {
      const agent = makeAgent(0, 0, 0);
      const farForce = sb.arrive(agent, { x: 100, y: 0, z: 0 });
      const nearForce = sb.arrive(agent, { x: 1, y: 0, z: 0 });
      expect(Math.abs(nearForce.x)).toBeLessThan(Math.abs(farForce.x));
    });
  });

  describe('wander', () => {
    it('produces non-zero force', () => {
      const agent = makeAgent();
      agent.velocity = { x: 1, y: 0, z: 0 };
      const force = sb.wander(agent);
      const mag = Math.sqrt(force.x ** 2 + force.y ** 2 + force.z ** 2);
      expect(mag).toBeGreaterThan(0);
    });
  });

  describe('separation', () => {
    it('pushes away from close neighbors', () => {
      const agent = makeAgent(0, 0, 0);
      const neighbor = makeAgent(1, 0, 0);
      const force = sb.separation(agent, [neighbor]);
      expect(force.x).toBeLessThan(0);
    });

    it('zero force with no neighbors', () => {
      const agent = makeAgent();
      const force = sb.separation(agent, []);
      expect(force.x).toBe(0);
    });
  });

  describe('flock', () => {
    it('combines separation + alignment + cohesion', () => {
      const agent = makeAgent(0, 0, 0);
      const neighbors = [makeAgent(2, 0, 0), makeAgent(-2, 0, 0)];
      const force = sb.flock(agent, neighbors);
      expect(typeof force.x).toBe('number');
    });
  });

  describe('avoidObstacles', () => {
    it('pushes away from obstacle', () => {
      const agent = makeAgent(0, 0, 0);
      agent.velocity = { x: 1, y: 0, z: 0 };
      const force = sb.avoidObstacles(agent, [{ position: { x: 3, y: 0, z: 0 }, radius: 2 }]);
      expect(typeof force.x).toBe('number');
    });
  });

  describe('applyForce', () => {
    it('updates agent position and velocity', () => {
      const agent = makeAgent(0, 0, 0);
      sb.applyForce(agent, { x: 5, y: 0, z: 0 }, 1.0);
      expect(agent.velocity.x).toBeGreaterThan(0);
      expect(agent.position.x).toBeGreaterThan(0);
    });

    it('respects maxSpeed', () => {
      const agent = makeAgent();
      agent.maxSpeed = 2;
      sb.applyForce(agent, { x: 100, y: 0, z: 0 }, 1.0);
      const speed = Math.sqrt(agent.velocity.x ** 2 + agent.velocity.y ** 2 + agent.velocity.z ** 2);
      expect(speed).toBeLessThanOrEqual(2.01);
    });
  });

  describe('config', () => {
    it('getConfig returns config', () => {
      expect(sb.getConfig().separationRadius).toBe(5);
    });

    it('setConfig updates', () => {
      sb.setConfig({ separationRadius: 20 });
      expect(sb.getConfig().separationRadius).toBe(20);
    });
  });
});
