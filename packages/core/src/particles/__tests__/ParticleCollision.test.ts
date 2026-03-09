import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ParticleCollisionSystem,
  type CollidableParticle,
  type CollisionPlane,
  type CollisionSphere,
} from '../ParticleCollision';

function makeParticle(x = 0, y = 0, z = 0, vx = 0, vy = 0, vz = 0): CollidableParticle {
  return { x, y, z, vx, vy, vz, lifetime: 10, alive: true };
}

const groundPlane: CollisionPlane = {
  id: 'ground',
  nx: 0,
  ny: 1,
  nz: 0,
  d: 0,
  bounce: 0.8,
  friction: 0.1,
  lifetimeLoss: 0.5,
};

const sphere: CollisionSphere = {
  id: 's1',
  cx: 0,
  cy: 0,
  cz: 0,
  radius: 2,
  bounce: 0.5,
  friction: 0,
};

describe('ParticleCollisionSystem', () => {
  let sys: ParticleCollisionSystem;

  beforeEach(() => {
    sys = new ParticleCollisionSystem();
  });

  it('addPlane and resolve detects collision', () => {
    sys.addPlane(groundPlane);
    const p = makeParticle(0, -0.5, 0, 0, -5, 0);
    sys.resolve([p]);
    expect(sys.getCollisionCount()).toBe(1);
    expect(p.y).toBeGreaterThanOrEqual(0); // pushed out
    expect(p.vy).toBeGreaterThan(0); // reflected up
  });

  it('lifetime loss on plane collision', () => {
    sys.addPlane(groundPlane);
    const p = makeParticle(0, -0.1, 0, 0, -1, 0);
    const before = p.lifetime;
    sys.resolve([p]);
    expect(p.lifetime).toBeLessThan(before);
  });

  it('particle dies if lifetime drops to zero', () => {
    sys.addPlane({ ...groundPlane, lifetimeLoss: 100 });
    const p = makeParticle(0, -0.1, 0, 0, -1, 0);
    sys.resolve([p]);
    expect(p.alive).toBe(false);
  });

  it('dead particles are skipped', () => {
    sys.addPlane(groundPlane);
    const p = makeParticle(0, -0.5, 0, 0, -5, 0);
    p.alive = false;
    sys.resolve([p]);
    expect(sys.getCollisionCount()).toBe(0);
  });

  it('addSphere and resolve detects sphere collision', () => {
    sys.addSphere(sphere);
    const p = makeParticle(0.5, 0, 0, -1, 0, 0); // inside sphere
    sys.resolve([p]);
    expect(sys.getCollisionCount()).toBe(1);
  });

  it('sphere pushes particle outside radius', () => {
    sys.addSphere(sphere);
    const p = makeParticle(0.5, 0, 0, -1, 0, 0);
    sys.resolve([p]);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    expect(dist).toBeGreaterThanOrEqual(sphere.radius - 0.01);
  });

  it('no collision when above ground', () => {
    sys.addPlane(groundPlane);
    const p = makeParticle(0, 5, 0, 0, 0, 0);
    sys.resolve([p]);
    expect(sys.getCollisionCount()).toBe(0);
  });

  it('onSubEmit callback fires on collision', () => {
    sys.addPlane(groundPlane);
    const cb = vi.fn();
    sys.onSubEmit(cb, 5);
    const p = makeParticle(0, -0.1, 0, 0, -1, 0);
    sys.resolve([p]);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), 5);
  });

  it('collision count resets per resolve call', () => {
    sys.addPlane(groundPlane);
    const p = makeParticle(0, -0.1, 0, 0, -1, 0);
    sys.resolve([p]);
    expect(sys.getCollisionCount()).toBe(1);
    sys.resolve([]); // no particles
    expect(sys.getCollisionCount()).toBe(0);
  });
});
