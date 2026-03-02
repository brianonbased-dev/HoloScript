import { describe, it, expect } from 'vitest';
import {
  createBoxCollider, createSphereCollider, createCapsuleCollider,
  createRigidbody,
} from '../physics.js';
import { Vec3 } from '../spatial.js';

describe('createBoxCollider', () => {
  it('creates a box collider with defaults', () => {
    const c = createBoxCollider(new Vec3(1, 1, 1));
    expect(c.shape).toBe('box');
    expect(c.isTrigger).toBe(false);
    expect(c.friction).toBe(0.5);
    expect(c.restitution).toBe(0.0);
    expect(c.halfExtents).toBeDefined();
  });

  it('accepts option overrides', () => {
    const c = createBoxCollider(new Vec3(2, 2, 2), { friction: 0.9, isTrigger: true });
    expect(c.friction).toBe(0.9);
    expect(c.isTrigger).toBe(true);
  });
});

describe('createSphereCollider', () => {
  it('creates a sphere collider', () => {
    const c = createSphereCollider(0.5);
    expect(c.shape).toBe('sphere');
    expect(c.radius).toBe(0.5);
    expect(c.friction).toBe(0.5);
  });

  it('overrides restitution', () => {
    const c = createSphereCollider(1.0, { restitution: 0.8 });
    expect(c.restitution).toBe(0.8);
  });
});

describe('createCapsuleCollider', () => {
  it('creates a capsule collider', () => {
    const c = createCapsuleCollider(0.3, 1.8);
    expect(c.shape).toBe('capsule');
    expect(c.radius).toBe(0.3);
    expect(c.height).toBe(1.8);
  });
});

describe('createRigidbody', () => {
  it('creates a rigidbody with defaults', () => {
    const rb = createRigidbody(10);
    expect(rb.mass).toBe(10);
    expect(rb.useGravity).toBe(true);
    expect(rb.linearDamping).toBe(0.0);
    expect(rb.angularDamping).toBe(0.05);
    expect(rb.isKinematic).toBe(false);
    expect(rb.freezePosition).toEqual([false, false, false]);
    expect(rb.freezeRotation).toEqual([false, false, false]);
  });

  it('overrides gravity', () => {
    const rb = createRigidbody(5, { useGravity: false });
    expect(rb.useGravity).toBe(false);
  });

  it('overrides kinematic', () => {
    const rb = createRigidbody(1, { isKinematic: true });
    expect(rb.isKinematic).toBe(true);
    expect(rb.mass).toBe(1);
  });

  it('overrides damping', () => {
    const rb = createRigidbody(50, { linearDamping: 0.5, angularDamping: 0.8 });
    expect(rb.linearDamping).toBe(0.5);
    expect(rb.angularDamping).toBe(0.8);
  });

  it('overrides freeze axes', () => {
    const rb = createRigidbody(1, { freezePosition: [true, false, true] });
    expect(rb.freezePosition).toEqual([true, false, true]);
  });
});
