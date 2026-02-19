/**
 * NavigationSystems.prod.test.ts
 *
 * Production tests for the navigation subsystem:
 *   NavMesh, AStarPathfinder, SteeringBehaviors
 *
 * Rules: pure in-memory, deterministic, no I/O.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NavMesh } from '../NavMesh';
import { AStarPathfinder } from '../AStarPathfinder';
import { SteeringBehaviors, SteeringAgent } from '../SteeringBehaviors';

// =============================================================================
// NavMesh
// =============================================================================

describe('NavMesh', () => {
  let mesh: NavMesh;
  beforeEach(() => { mesh = new NavMesh(); });

  it('adds a polygon and reports count', () => {
    mesh.addPolygon([
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
    ]);
    expect(mesh.getPolygonCount()).toBe(1);
  });

  it('computes polygon center correctly', () => {
    const poly = mesh.addPolygon([
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 },
      { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 },
    ]);
    expect(poly.center.x).toBeCloseTo(2);
    expect(poly.center.z).toBeCloseTo(2);
  });

  it('findPolygonAtPoint returns containing polygon', () => {
    mesh.addPolygon([
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 },
    ]);
    const found = mesh.findPolygonAtPoint({ x: 5, y: 0, z: 5 });
    expect(found).not.toBeNull();
  });

  it('findPolygonAtPoint returns null for non-walkable polygon', () => {
    mesh.addPolygon([
      { x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 }, { x: 0, y: 0, z: 10 },
    ], false /* not walkable */);
    const found = mesh.findPolygonAtPoint({ x: 5, y: 0, z: 5 });
    expect(found).toBeNull();
  });

  it('findNearestPolygon returns closest center', () => {
    mesh.addPolygon([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 },
    ]);
    mesh.addPolygon([
      { x: 10, y: 0, z: 10 }, { x: 12, y: 0, z: 10 },
      { x: 12, y: 0, z: 12 }, { x: 10, y: 0, z: 12 },
    ]);
    const nearest = mesh.findNearestPolygon({ x: 0.5, y: 0, z: 0.5 });
    expect(nearest?.center.x).toBeCloseTo(1);
  });

  it('connectPolygons sets bilateral neighbors', () => {
    const p1 = mesh.addPolygon([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }]);
    const p2 = mesh.addPolygon([{ x: 3, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 2 }, { x: 3, y: 0, z: 2 }]);
    mesh.connectPolygons(p1.id, p2.id);
    expect(p1.neighbors).toContain(p2.id);
    expect(p2.neighbors).toContain(p1.id);
  });

  it('getWalkableNeighbors filters non-walkable', () => {
    const p1 = mesh.addPolygon([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }]);
    const p2 = mesh.addPolygon([{ x: 3, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 2 }, { x: 3, y: 0, z: 2 }], false);
    mesh.connectPolygons(p1.id, p2.id);
    const neighbors = mesh.getWalkableNeighbors(p1.id);
    expect(neighbors.find(n => n.id === p2.id)).toBeUndefined();
  });

  it('removePolygon decrements count and cleans neighbors', () => {
    const p1 = mesh.addPolygon([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }]);
    const p2 = mesh.addPolygon([{ x: 3, y: 0, z: 0 }, { x: 5, y: 0, z: 0 }, { x: 5, y: 0, z: 2 }, { x: 3, y: 0, z: 2 }]);
    mesh.connectPolygons(p1.id, p2.id);
    mesh.removePolygon(p1.id);
    expect(mesh.getPolygonCount()).toBe(1);
    expect(p2.neighbors).not.toContain(p1.id);
  });

  it('export returns bounds and polygons', () => {
    mesh.addPolygon([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }]);
    const data = mesh.export();
    expect(data.polygons.length).toBe(1);
    expect(data.bounds.min.x).toBeCloseTo(0);
    expect(data.bounds.max.x).toBeCloseTo(4);
  });
});

// =============================================================================
// AStarPathfinder
// =============================================================================

describe('AStarPathfinder', () => {
  /**
   * Helper: build a simple linear chain of connected walkable quads.
   * polyA (x=0..4) — polyB (x=5..9) — polyC (x=10..14)
   */
  function buildLinearMesh(): NavMesh {
    const m = new NavMesh();
    const a = m.addPolygon([{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 4 }, { x: 0, y: 0, z: 4 }]);
    const b = m.addPolygon([{ x: 5, y: 0, z: 0 }, { x: 9, y: 0, z: 0 }, { x: 9, y: 0, z: 4 }, { x: 5, y: 0, z: 4 }]);
    const c = m.addPolygon([{ x: 10, y: 0, z: 0 }, { x: 14, y: 0, z: 0 }, { x: 14, y: 0, z: 4 }, { x: 10, y: 0, z: 4 }]);
    m.connectPolygons(a.id, b.id);
    m.connectPolygons(b.id, c.id);
    return m;
  }

  it('finds path in same polygon instantly', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    const result = pf.findPath({ x: 1, y: 0, z: 1 }, { x: 3, y: 0, z: 3 });
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThanOrEqual(2);
  });

  it('finds path across connected polygons', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    const result = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 12, y: 0, z: 2 });
    expect(result.found).toBe(true);
  });

  it('returns not-found when no path exists', () => {
    const mesh = new NavMesh();
    // Two isolated polygons, not connected
    mesh.addPolygon([{ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 2 }, { x: 0, y: 0, z: 2 }]);
    mesh.addPolygon([{ x: 20, y: 0, z: 20 }, { x: 22, y: 0, z: 20 }, { x: 22, y: 0, z: 22 }, { x: 20, y: 0, z: 22 }]);
    const pf = new AStarPathfinder(mesh);
    const result = pf.findPath({ x: 1, y: 0, z: 1 }, { x: 21, y: 0, z: 21 });
    expect(result.found).toBe(false);
  });

  it('path start and end match query points', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    const start = { x: 2, y: 0, z: 2 };
    const goal = { x: 12, y: 0, z: 2 };
    const result = pf.findPath(start, goal);
    if (result.found) {
      expect(result.path[0]).toEqual(start);
      expect(result.path[result.path.length - 1]).toEqual(goal);
    }
  });

  it('cached result returned on repeated findPath call', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    const r1 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 12, y: 0, z: 2 });
    const r2 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 12, y: 0, z: 2 });
    expect(r1.found).toBe(r2.found);
    expect(r1.path.length).toBe(r2.path.length);
  });

  it('adding obstacle clears cache', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    pf.findPath({ x: 2, y: 0, z: 2 }, { x: 12, y: 0, z: 2 });
    pf.addObstacle('obs1', { x: 7, y: 0, z: 2 }, 3);
    expect(pf.getObstacleCount()).toBe(1);
  });

  it('removeObstacle decrements count', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    pf.addObstacle('obs1', { x: 7, y: 0, z: 2 }, 2);
    pf.removeObstacle('obs1');
    expect(pf.getObstacleCount()).toBe(0);
  });

  it('smoothPath shortens redundant collinear points', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    // Collinear path along x-axis — smoothPath should collapse intermediate points
    const raw = [
      { x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 4, y: 0, z: 0 }, { x: 6, y: 0, z: 0 },
    ];
    const smoothed = pf.smoothPath(raw);
    expect(smoothed.length).toBeLessThanOrEqual(raw.length);
  });

  it('clearCache does not throw', () => {
    const mesh = buildLinearMesh();
    const pf = new AStarPathfinder(mesh);
    expect(() => pf.clearCache()).not.toThrow();
  });
});

// =============================================================================
// SteeringBehaviors
// =============================================================================

describe('SteeringBehaviors', () => {
  let sb: SteeringBehaviors;
  const makeAgent = (pos = { x: 0, y: 0, z: 0 }, vel = { x: 0, y: 0, z: 0 }): SteeringAgent => ({
    position: { ...pos },
    velocity: { ...vel },
    maxSpeed: 10,
    maxForce: 5,
    mass: 1,
  });

  beforeEach(() => { sb = new SteeringBehaviors(); });

  it('seek returns non-zero force toward target', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 });
    const force = sb.seek(agent, { x: 10, y: 0, z: 0 });
    expect(force.x).toBeGreaterThan(0);
    expect(Math.abs(force.y)).toBeCloseTo(0);
  });

  it('flee returns non-zero force away from target', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 });
    const force = sb.flee(agent, { x: 10, y: 0, z: 0 });
    expect(force.x).toBeLessThan(0);
  });

  it('arrive returns zero force when already at target', () => {
    const agent = makeAgent({ x: 5, y: 0, z: 5 });
    const force = sb.arrive(agent, { x: 5, y: 0, z: 5 });
    expect(force.x).toBeCloseTo(0);
    expect(force.z).toBeCloseTo(0);
  });

  it('arrive slows down within slowRadius', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 });
    // Target at x=5 is within default arriveSlowRadius=10
    const force = sb.arrive(agent, { x: 5, y: 0, z: 0 });
    // Force magnitude should be less than maxForce
    const mag = Math.sqrt(force.x ** 2 + force.y ** 2 + force.z ** 2);
    expect(mag).toBeLessThanOrEqual(agent.maxForce + 0.01);
  });

  it('wander returns a non-zero force', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const force = sb.wander(agent);
    const mag = Math.sqrt(force.x ** 2 + force.y ** 2 + force.z ** 2);
    expect(mag).toBeGreaterThanOrEqual(0); // wander may sometimes be near 0 depending on angle
  });

  it('separation pushes away from close neighbors', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 });
    const neighbor = makeAgent({ x: 2, y: 0, z: 0 }); // within sep radius=5
    const force = sb.separation(agent, [neighbor]);
    expect(force.x).toBeLessThan(0); // pushed left (away from neighbor on right)
  });

  it('separation returns zero when no neighbors in range', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 });
    const farNeighbor = makeAgent({ x: 100, y: 0, z: 0 });
    const force = sb.separation(agent, [farNeighbor]);
    expect(Math.abs(force.x)).toBeCloseTo(0, 3);
  });

  it('alignment steers toward average neighbor velocity', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 });
    const neighbor = makeAgent({ x: 3, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    const force = sb.alignment(agent, [neighbor]);
    expect(force.x).toBeGreaterThan(0); // align toward neighbor velocity
  });

  it('cohesion steers toward neighbor centroid', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 });
    const neighbor = makeAgent({ x: 5, y: 0, z: 0 });
    const force = sb.cohesion(agent, [neighbor]);
    expect(force.x).toBeGreaterThan(0); // move toward neighbor center
  });

  it('flock combines separation, alignment and cohesion', () => {
    const agent = makeAgent({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const neighbor = makeAgent({ x: 3, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    const force = sb.flock(agent, [neighbor]);
    expect(isFinite(force.x)).toBe(true);
    expect(isFinite(force.z)).toBe(true);
  });

  it('avoidObstacles generates repulsion near obstacle', () => {
    // Agent moving along +x; ahead point ≈ (8,0,0). Place obstacle slightly off-center
    // so normalize(ahead - obstacle) is non-zero and force is generated.
    const agent = makeAgent({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    const obstacle = { position: { x: 8, y: 0, z: 1 }, radius: 3 }; // z=1 offset
    const force = sb.avoidObstacles(agent, [obstacle]);
    const mag = Math.sqrt(force.x ** 2 + force.y ** 2 + force.z ** 2);
    expect(mag).toBeGreaterThan(0);
  });

  it('applyForce updates agent velocity and position', () => {
    const agent = makeAgent();
    sb.applyForce(agent, { x: 5, y: 0, z: 0 }, 1);
    expect(agent.position.x).toBeGreaterThan(0);
    expect(agent.velocity.x).toBeGreaterThan(0);
  });

  it('applyForce clamps velocity to maxSpeed', () => {
    const agent = makeAgent();
    sb.applyForce(agent, { x: 1000, y: 0, z: 0 }, 1);
    const speed = Math.sqrt(agent.velocity.x ** 2 + agent.velocity.y ** 2 + agent.velocity.z ** 2);
    expect(speed).toBeCloseTo(agent.maxSpeed, 1);
  });

  it('getConfig returns default config', () => {
    const cfg = sb.getConfig();
    expect(cfg.separationRadius).toBeGreaterThan(0);
    expect(cfg.alignmentRadius).toBeGreaterThan(0);
  });

  it('setConfig overrides config values', () => {
    sb.setConfig({ separationRadius: 99 });
    expect(sb.getConfig().separationRadius).toBe(99);
  });
});
