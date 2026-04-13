import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsWorldImpl, createPhysicsWorld } from '..';

/** Helper to create a body config with the required transform property */
function bodyConfig(overrides: Record<string, any> = {}) {
  const pos = overrides.position ?? { x: 0, y: 0, z: 0 };
  const rot = overrides.rotation ?? { x: 0, y: 0, z: 0, w: 1 };
  return {
    id: overrides.id ?? 'body',
    type: overrides.type ?? 'dynamic',
    shape: overrides.shape ?? { type: 'sphere', radius: 1 },
    transform: { position: pos, rotation: rot },
    mass: overrides.mass ?? 1,
    ...overrides,
  };
}

describe('PhysicsWorldImpl', () => {
  let world: PhysicsWorldImpl;

  beforeEach(() => {
    world = new PhysicsWorldImpl();
  });

  // ===========================================================================
  // Construction & Configuration
  // ===========================================================================
  describe('construction', () => {
    it('creates with default gravity', () => {
      const g = world.getGravity();
      expect(g.y).toBeLessThan(0);
    });

    it('accepts custom config', () => {
      const w = new PhysicsWorldImpl({
        gravity: { x: 0, y: -20, z: 0 },
        fixedTimestep: 1 / 120,
        maxSubsteps: 10,
        solverIterations: 4,
        allowSleep: false,
        broadphase: 'aabb',
      });
      expect(w.getGravity().y).toBe(-20);
    });

    it('setGravity updates gravity', () => {
      world.setGravity({ x: 0, y: -5, z: 0 });
      expect(world.getGravity().y).toBe(-5);
    });
  });

  // ===========================================================================
  // Body Management
  // ===========================================================================
  describe('body management', () => {
    it('creates and retrieves a body', () => {
      world.createBody(
        bodyConfig({
          id: 'box1',
          type: 'dynamic',
          shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } },
          position: [0, 5, 0],
          mass: 1,
        })
      );
      const state = world.getBody('box1');
      expect(state).toBeDefined();
      expect(state!.position.y).toBe(5);
    });

    it('throws on duplicate body id', () => {
      const cfg = bodyConfig({
        id: 'dup',
        type: 'dynamic',
        shape: { type: 'sphere', radius: 1 },
        mass: 1,
      });
      world.createBody(cfg);
      expect(() => world.createBody(cfg)).toThrow();
    });

    it('removes a body', () => {
      world.createBody(bodyConfig({ id: 'rem' }));
      expect(world.removeBody('rem')).toBe(true);
      expect(world.getBody('rem')).toBeUndefined();
    });

    it('removeBody returns false for unknown id', () => {
      expect(world.removeBody('nope')).toBe(false);
    });

    it('getAllBodies returns all bodies', () => {
      world.createBody(bodyConfig({ id: 'a' }));
      world.createBody(
        bodyConfig({
          id: 'b',
          type: 'static',
          shape: { type: 'box', halfExtents: { x: 10, y: 0.5, z: 10 } },
          position: [0, -1, 0],
          mass: 0,
        })
      );
      expect(world.getAllBodies()).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Body Manipulation
  // ===========================================================================
  describe('body manipulation', () => {
    beforeEach(() => {
      world.createBody(bodyConfig({ id: 'obj' }));
    });

    it('setPosition updates position', () => {
      world.setPosition('obj', { x: 5, y: 10, z: 15 });
      expect(world.getBody('obj')!.position.x).toBe(5);
    });

    it('setLinearVelocity updates velocity', () => {
      world.setLinearVelocity('obj', { x: 1, y: 2, z: 3 });
      const state = world.getBody('obj')!;
      expect(state.linearVelocity.x).toBe(1);
    });

    it('applyForce does not throw', () => {
      expect(() => world.applyForce('obj', { x: 10, y: 0, z: 0 })).not.toThrow();
    });

    it('applyImpulse does not throw', () => {
      expect(() => world.applyImpulse('obj', { x: 0, y: 5, z: 0 })).not.toThrow();
    });

    it('applyTorque does not throw', () => {
      expect(() => world.applyTorque('obj', { x: 0, y: 1, z: 0 })).not.toThrow();
    });
  });

  // ===========================================================================
  // Constraint Management
  // ===========================================================================
  describe('constraints', () => {
    beforeEach(() => {
      world.createBody(bodyConfig({ id: 'cA' }));
      world.createBody(bodyConfig({ id: 'cB', position: [5, 0, 0] }));
    });

    it('creates a distance constraint', () => {
      const id = world.createConstraint({
        id: 'dist1',
        type: 'distance',
        bodyA: 'cA',
        bodyB: 'cB',
        distance: 5,
      });
      expect(id).toBe('dist1');
    });

    it('throws on duplicate constraint id', () => {
      world.createConstraint({
        id: 'dup',
        type: 'distance',
        bodyA: 'cA',
        bodyB: 'cB',
        distance: 5,
      });
      expect(() =>
        world.createConstraint({
          id: 'dup',
          type: 'distance',
          bodyA: 'cA',
          bodyB: 'cB',
          distance: 5,
        })
      ).toThrow();
    });

    it('throws if body not found', () => {
      expect(() =>
        world.createConstraint({
          id: 'bad',
          type: 'distance',
          bodyA: 'missing',
          bodyB: 'cB',
          distance: 5,
        })
      ).toThrow();
    });

    it('removes a constraint', () => {
      world.createConstraint({
        id: 'rem',
        type: 'distance',
        bodyA: 'cA',
        bodyB: 'cB',
        distance: 5,
      });
      expect(world.removeConstraint('rem')).toBe(true);
    });

    it('setConstraintEnabled does not throw', () => {
      world.createConstraint({
        id: 'tog',
        type: 'distance',
        bodyA: 'cA',
        bodyB: 'cB',
        distance: 5,
      });
      expect(() => world.setConstraintEnabled('tog', false)).not.toThrow();
    });
  });

  // ===========================================================================
  // Simulation
  // ===========================================================================
  describe('simulation', () => {
    it('step applies gravity to dynamic body', () => {
      world.createBody(
        bodyConfig({
          id: 'fall',
          shape: { type: 'sphere', radius: 0.5 },
          position: [0, 10, 0],
        })
      );
      world.step(1 / 60);
      const state = world.getBody('fall')!;
      expect(state.position.y).toBeLessThan(10);
    });

    it('static bodies do not move', () => {
      world.createBody(
        bodyConfig({
          id: 'ground',
          type: 'static',
          shape: { type: 'box', halfExtents: { x: 100, y: 0.5, z: 100 } },
          mass: 0,
        })
      );
      world.step(1 / 60);
      expect(world.getBody('ground')!.position.y).toBe(0);
    });

    it('sphere-sphere collision generates events', () => {
      world.createBody(bodyConfig({ id: 's1' }));
      world.createBody(bodyConfig({ id: 's2', position: [1.5, 0, 0] }));
      world.step(1 / 60);
      const contacts = world.getContacts();
      expect(contacts.length).toBeGreaterThan(0);
      expect(contacts[0].type).toBe('begin');
    });
  });

  // ===========================================================================
  // Spatial Queries
  // ===========================================================================
  describe('spatial queries', () => {
    beforeEach(() => {
      world.createBody(
        bodyConfig({
          id: 'target',
          shape: { type: 'box', halfExtents: { x: 1, y: 1, z: 1 } },
          position: [0, 0, -5],
        })
      );
    });

    it('raycast hits a body', () => {
      const hits = world.raycast({
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: -1 },
        maxDistance: 100,
      });
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].bodyId).toBe('target');
    });

    it('raycast misses when direction is wrong', () => {
      const hits = world.raycast({
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: 1 },
        maxDistance: 100,
      });
      expect(hits).toHaveLength(0);
    });

    it('raycastClosest returns single hit', () => {
      const hit = world.raycastClosest({
        origin: { x: 0, y: 0, z: 0 },
        direction: { x: 0, y: 0, z: -1 },
        maxDistance: 100,
      });
      expect(hit).not.toBeNull();
      expect(hit!.bodyId).toBe('target');
    });

    it('sphereOverlap finds nearby bodies', () => {
      const results = world.sphereOverlap({ x: 0, y: 0, z: -5 }, 2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].bodyId).toBe('target');
    });

    it('boxOverlap finds overlapping bodies', () => {
      const results = world.boxOverlap({ x: 0, y: 0, z: -5 }, { x: 2, y: 2, z: 2 });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================
  describe('cleanup', () => {
    it('dispose clears all bodies and constraints', () => {
      world.createBody(bodyConfig({ id: 'x' }));
      world.dispose();
      expect(world.getAllBodies()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // createPhysicsWorld
  // ===========================================================================
  describe('createPhysicsWorld', () => {
    it('returns a PhysicsWorldImpl instance', () => {
      const pw = createPhysicsWorld();
      expect(pw).toBeDefined();
      expect(typeof pw.step).toBe('function');
    });
  });
});
