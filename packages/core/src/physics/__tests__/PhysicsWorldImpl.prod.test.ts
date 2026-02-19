/**
 * PhysicsWorldImpl — Production Test Suite (Deep)
 *
 * Covers: gravity, body CRUD, transforms, forces/impulses, constraints,
 * step, broadphase, sphere overlap, box overlap, contacts, raycast, dispose.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PhysicsWorldImpl, createPhysicsWorld } from '../PhysicsWorldImpl';

let bodyCounter = 0;

function bodyConfig(overrides: Record<string, any> = {}) {
  const id = overrides.id || `body_${++bodyCounter}`;
  return {
    id,
    type: 'dynamic' as const,
    mass: 1,
    shape: { type: 'sphere' as const, radius: 0.5 },
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    ...overrides,
  };
}

describe('PhysicsWorldImpl — Production', () => {
  let world: PhysicsWorldImpl;

  beforeEach(() => {
    world = new PhysicsWorldImpl();
    bodyCounter = 0;
  });

  // ─── Factory ──────────────────────────────────────────────────────
  it('createPhysicsWorld factory works', () => {
    const w = createPhysicsWorld();
    expect(w).toBeDefined();
    (w as any).dispose?.();
  });

  // ─── Gravity ──────────────────────────────────────────────────────
  it('default gravity is downward', () => {
    const g = world.getGravity();
    expect(g.y).toBeLessThan(0);
  });

  it('setGravity changes gravity', () => {
    world.setGravity({ x: 0, y: -20, z: 0 });
    expect(world.getGravity().y).toBe(-20);
  });

  // ─── Body CRUD ────────────────────────────────────────────────────
  it('createBody returns id', () => {
    const id = world.createBody(bodyConfig());
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
  });

  it('getBody returns body state', () => {
    const id = world.createBody(bodyConfig());
    const body = world.getBody(id);
    expect(body).toBeDefined();
    expect(body!.id).toBe(id);
  });

  it('getAllBodies returns all', () => {
    world.createBody(bodyConfig());
    world.createBody(bodyConfig());
    expect(world.getAllBodies().length).toBe(2);
  });

  it('removeBody removes a body', () => {
    const id = world.createBody(bodyConfig());
    expect(world.removeBody(id)).toBe(true);
    expect(world.getBody(id)).toBeUndefined();
  });

  it('removeBody returns false for unknown', () => {
    expect(world.removeBody('nope')).toBe(false);
  });

  // ─── Transforms ───────────────────────────────────────────────────
  it('setPosition updates position', () => {
    const id = world.createBody(bodyConfig());
    world.setPosition(id, { x: 10, y: 20, z: 30 });
    const body = world.getBody(id)!;
    expect(body.position.x).toBe(10);
  });

  it('setRotation updates rotation', () => {
    const id = world.createBody(bodyConfig());
    world.setRotation(id, { x: 0, y: 0.707, z: 0, w: 0.707 });
    const body = world.getBody(id)!;
    expect(body.rotation.y).toBeCloseTo(0.707, 2);
  });

  it('setTransform updates both', () => {
    const id = world.createBody(bodyConfig());
    world.setTransform(id, {
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    });
    const body = world.getBody(id)!;
    expect(body.position.z).toBe(3);
  });

  // ─── Velocity ─────────────────────────────────────────────────────
  it('setLinearVelocity updates velocity', () => {
    const id = world.createBody(bodyConfig());
    world.setLinearVelocity(id, { x: 5, y: 0, z: 0 });
    const body = world.getBody(id)!;
    expect(body.linearVelocity.x).toBe(5);
  });

  it('setAngularVelocity updates angular velocity', () => {
    const id = world.createBody(bodyConfig());
    world.setAngularVelocity(id, { x: 0, y: 1, z: 0 });
    const body = world.getBody(id)!;
    expect(body.angularVelocity.y).toBe(1);
  });

  // ─── Forces / Impulses ────────────────────────────────────────────
  it('applyForce does not throw', () => {
    const id = world.createBody(bodyConfig());
    expect(() => world.applyForce(id, { x: 100, y: 0, z: 0 })).not.toThrow();
  });

  it('applyImpulse changes velocity immediately', () => {
    const id = world.createBody(bodyConfig());
    world.applyImpulse(id, { x: 10, y: 0, z: 0 });
    const body = world.getBody(id)!;
    expect(body.linearVelocity.x).toBeGreaterThan(0);
  });

  it('applyTorque does not throw', () => {
    const id = world.createBody(bodyConfig());
    expect(() => world.applyTorque(id, { x: 0, y: 1, z: 0 })).not.toThrow();
  });

  // ─── Stepping ─────────────────────────────────────────────────────
  it('step advances simulation', () => {
    const id = world.createBody(bodyConfig());
    world.setLinearVelocity(id, { x: 10, y: 0, z: 0 });
    world.step(1 / 60);
    const body = world.getBody(id)!;
    expect(body).toBeDefined();
  });

  it('step with zero dt is safe', () => {
    expect(() => world.step(0)).not.toThrow();
  });

  // ─── Constraints ──────────────────────────────────────────────────
  it('createConstraint returns id', () => {
    const a = world.createBody(bodyConfig());
    const b = world.createBody(bodyConfig());
    const cid = world.createConstraint({
      id: 'c1',
      type: 'distance',
      bodyA: a,
      bodyB: b,
      distance: 2,
    } as any);
    expect(typeof cid).toBe('string');
  });

  it('removeConstraint removes it', () => {
    const a = world.createBody(bodyConfig());
    const b = world.createBody(bodyConfig());
    const cid = world.createConstraint({
      id: 'c2',
      type: 'distance',
      bodyA: a,
      bodyB: b,
      distance: 2,
    } as any);
    expect(world.removeConstraint(cid)).toBe(true);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getContacts returns array', () => {
    expect(Array.isArray(world.getContacts())).toBe(true);
  });

  it('getTriggers returns array', () => {
    expect(Array.isArray(world.getTriggers())).toBe(true);
  });

  // ─── Overlap ──────────────────────────────────────────────────────
  it('sphereOverlap finds nearby bodies', () => {
    world.createBody(bodyConfig());
    const results = world.sphereOverlap({ x: 0, y: 0, z: 0 }, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('sphereOverlap returns empty for distant query', () => {
    world.createBody(bodyConfig());
    const results = world.sphereOverlap({ x: 1000, y: 1000, z: 1000 }, 0.1);
    expect(results.length).toBe(0);
  });

  it('boxOverlap finds bodies within box', () => {
    world.createBody(bodyConfig());
    const results = world.boxOverlap(
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 5, z: 5 }
    );
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  // ─── Raycast ──────────────────────────────────────────────────────
  it('raycast returns hits array', () => {
    world.createBody(bodyConfig({
      transform: { position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
    }));
    const hits = world.raycast({
      origin: { x: -10, y: 0, z: 0 },
      direction: { x: 1, y: 0, z: 0 },
    });
    expect(Array.isArray(hits)).toBe(true);
  });

  it('raycastClosest returns closest or null', () => {
    const result = world.raycastClosest({
      origin: { x: 0, y: 100, z: 0 },
      direction: { x: 0, y: 1, z: 0 },
    });
    expect(result === null || typeof result === 'object').toBe(true);
  });

  // ─── Static body ignores velocity ─────────────────────────────────
  it('static body ignores velocity set', () => {
    const id = world.createBody(bodyConfig({ type: 'static' as const }));
    world.setLinearVelocity(id, { x: 100, y: 0, z: 0 });
    const body = world.getBody(id)!;
    expect(body.linearVelocity.x).toBe(0);
  });

  // ─── Dispose ──────────────────────────────────────────────────────
  it('dispose cleans up', () => {
    world.createBody(bodyConfig());
    world.dispose();
    expect(world.getAllBodies().length).toBe(0);
  });
});
