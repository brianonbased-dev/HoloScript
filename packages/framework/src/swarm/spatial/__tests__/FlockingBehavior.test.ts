/**
 * FlockingBehavior Tests
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FlockingBehavior } from '../FlockingBehavior';
import { Vector3 } from '../Vector3';

describe('FlockingBehavior', () => {
  let flock: FlockingBehavior;

  beforeEach(() => {
    flock = new FlockingBehavior({
      separationRadius: 25,
      alignmentRadius: 50,
      cohesionRadius: 50,
      maxSpeed: 4,
      maxForce: 0.1,
    });
  });

  describe('boid management', () => {
    it('should add a boid', () => {
      const boid = flock.addBoid('boid-1', new Vector3(0, 0, 0));
      expect(boid.id).toBe('boid-1');
      expect(boid.position.x).toBe(0);
    });

    it('should add boid with velocity', () => {
      const boid = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(1, 0, 0));
      expect(boid.velocity.x).toBe(1);
    });

    it('should generate random velocity if not provided', () => {
      const boid = flock.addBoid('boid-1', new Vector3(0, 0, 0));
      const mag = boid.velocity.magnitude();
      expect(mag).toBeGreaterThan(0);
    });

    it('should remove a boid', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0));
      expect(flock.removeBoid('boid-1')).toBe(true);
      expect(flock.getBoid('boid-1')).toBeUndefined();
    });

    it('should get all boids', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0));
      expect(flock.getAllBoids()).toHaveLength(2);
    });

    it('should set boid position', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0));
      flock.setBoidPosition('boid-1', new Vector3(100, 100, 100));
      const boid = flock.getBoid('boid-1');
      expect(boid?.position.x).toBe(100);
    });
  });

  describe('separation', () => {
    it('should steer away from close neighbors', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const boid2 = flock.addBoid('boid-2', new Vector3(10, 0, 0), new Vector3(0, 0, 0));

      const steer = flock.separate(boid1, [boid2]);
      // Should steer away (negative x direction)
      expect(steer.x).toBeLessThan(0);
    });

    it('should return zero if no neighbors in separation radius', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const boid2 = flock.addBoid('boid-2', new Vector3(100, 0, 0), new Vector3(0, 0, 0));

      const steer = flock.separate(boid1, [boid2]);
      expect(steer.magnitude()).toBe(0);
    });
  });

  describe('alignment', () => {
    it('should steer toward average heading of neighbors', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const boid2 = flock.addBoid('boid-2', new Vector3(10, 0, 0), new Vector3(1, 0, 0));
      const boid3 = flock.addBoid('boid-3', new Vector3(-10, 0, 0), new Vector3(1, 0, 0));

      const steer = flock.align(boid1, [boid2, boid3]);
      // Should align with positive x direction
      expect(steer.x).toBeGreaterThan(0);
    });

    it('should return zero if no neighbors in alignment radius', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const boid2 = flock.addBoid('boid-2', new Vector3(100, 0, 0), new Vector3(1, 0, 0));

      const steer = flock.align(boid1, [boid2]);
      expect(steer.magnitude()).toBe(0);
    });
  });

  describe('cohesion', () => {
    it('should steer toward center of neighbors', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const boid2 = flock.addBoid('boid-2', new Vector3(30, 0, 0), new Vector3(0, 0, 0));
      const boid3 = flock.addBoid('boid-3', new Vector3(30, 30, 0), new Vector3(0, 0, 0));

      const steer = flock.cohere(boid1, [boid2, boid3]);
      // Center is at (30, 15, 0), so should steer positive x and y
      expect(steer.x).toBeGreaterThan(0);
      expect(steer.y).toBeGreaterThan(0);
    });

    it('should return zero if no neighbors in cohesion radius', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const boid2 = flock.addBoid('boid-2', new Vector3(100, 0, 0), new Vector3(0, 0, 0));

      const steer = flock.cohere(boid1, [boid2]);
      expect(steer.magnitude()).toBe(0);
    });
  });

  describe('steering behaviors', () => {
    it('should seek target', () => {
      const boid = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const target = new Vector3(100, 0, 0);

      const steer = flock.seek(boid, target);
      expect(steer.x).toBeGreaterThan(0);
    });

    it('should flee from target', () => {
      const boid = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const target = new Vector3(100, 0, 0);

      const steer = flock.flee(boid, target);
      expect(steer.x).toBeLessThan(0);
    });

    it('should arrive and slow down near target', () => {
      // Use high maxForce to avoid clamping
      const arrivalFlock = new FlockingBehavior({ maxSpeed: 4, maxForce: 10 });
      const boid = arrivalFlock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      const nearTarget = new Vector3(2, 0, 0); // Very close, within slowingRadius
      const farTarget = new Vector3(100, 0, 0);

      const nearSteer = arrivalFlock.arrive(boid, nearTarget, 20);
      const farSteer = arrivalFlock.arrive(boid, farTarget, 20);

      // Near target should have smaller force due to slowing behavior
      expect(nearSteer.magnitude()).toBeLessThan(farSteer.magnitude());
    });
  });

  describe('neighbors', () => {
    it('should find neighbors within radius', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0));
      flock.addBoid('boid-3', new Vector3(100, 0, 0));

      const neighbors = flock.findNeighbors(boid1, 50);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe('boid-2');
    });

    it('should exclude self from neighbors', () => {
      const boid1 = flock.addBoid('boid-1', new Vector3(0, 0, 0));
      flock.addBoid('boid-2', new Vector3(0, 0, 0)); // Same position

      const neighbors = flock.findNeighbors(boid1, 50);
      expect(neighbors).toHaveLength(1);
      expect(neighbors[0].id).toBe('boid-2');
    });
  });

  describe('update', () => {
    it('should update all boids', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(1, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0), new Vector3(1, 0, 0));

      const initialPos = flock.getBoid('boid-1')!.position.clone();
      flock.update();
      const newPos = flock.getBoid('boid-1')!.position;

      expect(newPos.equals(initialPos)).toBe(false);
    });

    it('should respect max speed', () => {
      const boid = flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(100, 0, 0));
      flock.update();

      expect(boid.velocity.magnitude()).toBeLessThanOrEqual(flock.getConfig().maxSpeed);
    });
  });

  describe('external forces', () => {
    it('should apply force to single boid', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      flock.applyForce('boid-1', new Vector3(1, 0, 0));

      const boid = flock.getBoid('boid-1')!;
      expect(boid.acceleration.x).toBe(1);
    });

    it('should apply force to all boids', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(0, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0), new Vector3(0, 0, 0));
      flock.applyForceToAll(new Vector3(0, 1, 0));

      expect(flock.getBoid('boid-1')!.acceleration.y).toBe(1);
      expect(flock.getBoid('boid-2')!.acceleration.y).toBe(1);
    });
  });

  describe('flock statistics', () => {
    it('should calculate flock center', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0));
      flock.addBoid('boid-3', new Vector3(20, 0, 0));

      const center = flock.getFlockCenter();
      expect(center.x).toBe(10);
      expect(center.y).toBe(0);
    });

    it('should return zero for empty flock center', () => {
      const center = flock.getFlockCenter();
      expect(center.magnitude()).toBe(0);
    });

    it('should calculate flock direction', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0), new Vector3(1, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0), new Vector3(1, 0, 0));

      const direction = flock.getFlockDirection();
      expect(direction.x).toBeCloseTo(1);
      expect(direction.y).toBeCloseTo(0);
    });

    it('should calculate flock spread', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0));
      flock.addBoid('boid-2', new Vector3(10, 0, 0));
      flock.addBoid('boid-3', new Vector3(-10, 0, 0));

      const spread = flock.getFlockSpread();
      expect(spread).toBe(10);
    });

    it('should return zero spread for single boid', () => {
      flock.addBoid('boid-1', new Vector3(0, 0, 0));
      expect(flock.getFlockSpread()).toBe(0);
    });
  });

  describe('boundaries', () => {
    it('should wrap positions', () => {
      const boundedFlock = new FlockingBehavior({
        boundaryMode: 'wrap',
        worldBounds: {
          min: new Vector3(0, 0, 0),
          max: new Vector3(100, 100, 100),
        },
      });

      const boid = boundedFlock.addBoid('boid-1', new Vector3(99, 50, 50), new Vector3(10, 0, 0));
      boundedFlock.update();

      // Should wrap to low x values
      expect(boid.position.x).toBeLessThan(100);
    });

    it('should bounce off boundaries', () => {
      const boundedFlock = new FlockingBehavior({
        boundaryMode: 'bounce',
        worldBounds: {
          min: new Vector3(0, 0, 0),
          max: new Vector3(100, 100, 100),
        },
      });

      const boid = boundedFlock.addBoid('boid-1', new Vector3(99, 50, 50), new Vector3(10, 0, 0));
      boundedFlock.update();

      // Velocity should be reversed
      expect(boid.velocity.x).toBeLessThan(0);
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      flock.setConfig({ maxSpeed: 10 });
      expect(flock.getConfig().maxSpeed).toBe(10);
    });

    it('should preserve existing config values', () => {
      flock.setConfig({ maxSpeed: 10 });
      expect(flock.getConfig().separationRadius).toBe(25);
    });
  });
});
