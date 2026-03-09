import { describe, it, expect } from 'vitest';
import { FlockingBehavior } from '../FlockingBehavior';
import { Vector3 } from '../Vector3';

// ─── helpers ────────────────────────────────────────────────────────────────

function mkFlock(cfg?: ConstructorParameters<typeof FlockingBehavior>[0]) {
  return new FlockingBehavior(cfg);
}

function v(x: number, y = 0, z = 0) {
  return new Vector3(x, y, z);
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('FlockingBehavior — defaultConfig', () => {
  it('separationRadius = 25', () => expect(mkFlock().getConfig().separationRadius).toBe(25));
  it('alignmentRadius = 50', () => expect(mkFlock().getConfig().alignmentRadius).toBe(50));
  it('cohesionRadius = 50', () => expect(mkFlock().getConfig().cohesionRadius).toBe(50));
  it('maxSpeed = 4', () => expect(mkFlock().getConfig().maxSpeed).toBe(4));
  it('maxForce = 0.1', () => expect(mkFlock().getConfig().maxForce).toBe(0.1));
  it('boundaryMode = wrap', () => expect(mkFlock().getConfig().boundaryMode).toBe('wrap'));
});

describe('FlockingBehavior — boid CRUD', () => {
  it('addBoid stores boid', () => {
    const flock = mkFlock();
    flock.addBoid('b1', v(0));
    expect(flock.getBoid('b1')).toBeDefined();
  });
  it('addBoid returns boid object', () => {
    const flock = mkFlock();
    const b = flock.addBoid('b2', v(1, 2, 3));
    expect(b.id).toBe('b2');
  });
  it('addBoid sets position correctly', () => {
    const flock = mkFlock();
    flock.addBoid('b3', v(5, 6, 7));
    const b = flock.getBoid('b3')!;
    expect(b.position.x).toBe(5);
    expect(b.position.y).toBe(6);
  });
  it('addBoid with explicit velocity uses it', () => {
    const flock = mkFlock();
    flock.addBoid('b4', v(0), v(1, 0, 0));
    expect(flock.getBoid('b4')!.velocity.x).toBe(1);
  });
  it('removeBoid returns true', () => {
    const flock = mkFlock();
    flock.addBoid('b5', v(0));
    expect(flock.removeBoid('b5')).toBe(true);
  });
  it('removeBoid deletes boid', () => {
    const flock = mkFlock();
    flock.addBoid('b6', v(0));
    flock.removeBoid('b6');
    expect(flock.getBoid('b6')).toBeUndefined();
  });
  it('removeBoid on missing id returns false', () => {
    expect(mkFlock().removeBoid('nope')).toBe(false);
  });
  it('getAllBoids returns all boids', () => {
    const flock = mkFlock();
    flock.addBoid('a', v(0));
    flock.addBoid('b', v(1));
    expect(flock.getAllBoids()).toHaveLength(2);
  });
  it('setBoidPosition moves boid', () => {
    const flock = mkFlock();
    flock.addBoid('m', v(0));
    flock.setBoidPosition('m', v(99, 0, 0));
    expect(flock.getBoid('m')!.position.x).toBe(99);
  });
  it('setBoidPosition no-op for missing id', () => {
    expect(() => mkFlock().setBoidPosition('none', v(1))).not.toThrow();
  });
});

describe('FlockingBehavior — findNeighbors', () => {
  it('finds boid within radius', () => {
    const flock = mkFlock();
    const b1 = flock.addBoid('A', v(0), v(0));
    flock.addBoid('B', v(10), v(0));
    const neighbors = flock.findNeighbors(b1, 20);
    expect(neighbors.some((n) => n.id === 'B')).toBe(true);
  });
  it('excludes boid outside radius', () => {
    const flock = mkFlock();
    const b1 = flock.addBoid('A', v(0), v(0));
    flock.addBoid('B', v(100), v(0));
    const neighbors = flock.findNeighbors(b1, 20);
    expect(neighbors.some((n) => n.id === 'B')).toBe(false);
  });
  it('excludes self from neighbors', () => {
    const flock = mkFlock();
    const b1 = flock.addBoid('self', v(0), v(0));
    const neighbors = flock.findNeighbors(b1, 999);
    expect(neighbors.every((n) => n.id !== 'self')).toBe(true);
  });
});

describe('FlockingBehavior — seek / flee / arrive', () => {
  it('seek returns non-zero force toward target', () => {
    const flock = mkFlock();
    const boid = flock.addBoid('s', v(0), v(0));
    const force = flock.seek(boid, v(100, 0, 0));
    expect(force.x).toBeGreaterThan(0);
  });
  it('flee returns opposite direction from seek', () => {
    const flock = mkFlock();
    const boid = flock.addBoid('f', v(0), v(0));
    const seekF = flock.seek(boid, v(100, 0, 0));
    const fleeF = flock.flee(boid, v(100, 0, 0));
    expect(Math.sign(fleeF.x)).toBe(-Math.sign(seekF.x));
  });
  it('arrive returns zero force when at target', () => {
    const flock = mkFlock({ maxForce: 1 });
    const boid = flock.addBoid('a', v(0), v(0));
    const force = flock.arrive(boid, v(0, 0, 0), 10);
    expect(force.magnitude()).toBeCloseTo(0, 5);
  });
  it('arrive slows within slowingRadius', () => {
    const flock = mkFlock({ maxSpeed: 4, maxForce: 1 });
    // Place boid exactly at slowingRadius/2 from target
    const boid = flock.addBoid('slow', v(5), v(0));
    const fullSeekForce = flock.seek(boid, v(10)).magnitude();
    const arriveForce = flock.arrive(boid, v(10), 10).magnitude(); // inside slowing zone
    // Arrive magnitude should be <= full seek magnitude when slowing
    expect(arriveForce).toBeLessThanOrEqual(fullSeekForce + 0.001);
  });
});

describe('FlockingBehavior — separate / align / cohere', () => {
  it('separate returns zero when no close neighbors', () => {
    const flock = mkFlock({ separationRadius: 5 });
    const boid = flock.addBoid('me', v(0), v(0));
    const far = flock.addBoid('far', v(100), v(0));
    const force = flock.separate(boid, [boid, far]);
    expect(force.magnitude()).toBeCloseTo(0, 5);
  });
  it('separate returns force away from close neighbor', () => {
    const flock = mkFlock({ separationRadius: 30, maxSpeed: 4, maxForce: 1 });
    const boid = flock.addBoid('me', v(0), v(0));
    const close = flock.addBoid('close', v(5), v(0));
    const force = flock.separate(boid, [boid, close]);
    // Should push left (away from +x)
    expect(force.x).toBeLessThan(0);
  });
  it('align returns zero when no in-radius neighbors', () => {
    const flock = mkFlock({ alignmentRadius: 5 });
    const boid = flock.addBoid('me', v(0), v(0));
    const far = flock.addBoid('far', v(100), v(0));
    const force = flock.align(boid, [boid, far]);
    expect(force.magnitude()).toBeCloseTo(0, 5);
  });
  it('cohere steers toward center of nearby neighbors', () => {
    const flock = mkFlock({ cohesionRadius: 200, maxSpeed: 4, maxForce: 1 });
    const boid = flock.addBoid('me', v(0), v(0));
    flock.addBoid('r1', v(100), v(0));
    flock.addBoid('r2', v(100), v(0));
    const all = flock.getAllBoids();
    const force = flock.cohere(boid, all);
    // Center of other boids is at x=100, so cohere should push +x
    expect(force.x).toBeGreaterThan(0);
  });
});

describe('FlockingBehavior — update', () => {
  it('update() runs without throwing', () => {
    const flock = mkFlock();
    flock.addBoid('u1', v(0), v(1, 0, 0));
    flock.addBoid('u2', v(2), v(-1, 0, 0));
    expect(() => flock.update()).not.toThrow();
  });
  it('update() moves boid positions', () => {
    const flock = mkFlock();
    flock.addBoid('m', v(0), v(1, 0, 0));
    const before = flock.getBoid('m')!.position.x;
    flock.update();
    expect(flock.getBoid('m')!.position.x).not.toBe(before);
  });
  it('applyForce adds to acceleration', () => {
    const flock = mkFlock();
    flock.addBoid('af', v(0), v(0));
    flock.applyForce('af', v(5, 0, 0));
    expect(flock.getBoid('af')!.acceleration.x).toBe(5);
  });
  it('applyForceToAll affects all boids', () => {
    const flock = mkFlock();
    flock.addBoid('x1', v(0), v(0));
    flock.addBoid('x2', v(5), v(0));
    flock.applyForceToAll(v(0, 0, 2));
    flock.getAllBoids().forEach((b) => expect(b.acceleration.z).toBe(2));
  });
});

describe('FlockingBehavior — analytics', () => {
  it('getFlockCenter returns zero for empty flock', () => {
    const c = mkFlock().getFlockCenter();
    expect(c.magnitude()).toBeCloseTo(0, 5);
  });
  it('getFlockCenter returns centroid', () => {
    const flock = mkFlock();
    flock.addBoid('a', v(0), v(0));
    flock.addBoid('b', v(10), v(0));
    expect(flock.getFlockCenter().x).toBeCloseTo(5, 5);
  });
  it('getFlockSpread = 0 for single boid', () => {
    const flock = mkFlock();
    flock.addBoid('solo', v(0), v(0));
    expect(flock.getFlockSpread()).toBe(0);
  });
  it('getFlockSpread > 0 for spread boids', () => {
    const flock = mkFlock();
    flock.addBoid('a', v(0), v(0));
    flock.addBoid('b', v(100), v(0));
    expect(flock.getFlockSpread()).toBeGreaterThan(0);
  });
  it('getFlockDirection returns unit vector', () => {
    const flock = mkFlock();
    flock.addBoid('d', v(0), v(3, 0, 0));
    const dir = flock.getFlockDirection();
    expect(dir.magnitude()).toBeCloseTo(1, 5);
  });
});

describe('FlockingBehavior — config', () => {
  it('setConfig updates a field', () => {
    const flock = mkFlock();
    flock.setConfig({ maxSpeed: 10 });
    expect(flock.getConfig().maxSpeed).toBe(10);
  });
  it('setConfig preserves unchanged fields', () => {
    const flock = mkFlock();
    flock.setConfig({ maxSpeed: 10 });
    expect(flock.getConfig().separationRadius).toBe(25);
  });
});
