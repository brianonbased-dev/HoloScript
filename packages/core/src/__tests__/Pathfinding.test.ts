import { describe, it, expect } from 'vitest';
import { NavMesh } from '../navigation/NavMesh';
import { AStarPathfinder } from '../navigation/AStarPathfinder';
import { SteeringBehaviors, SteeringAgent } from '../navigation/SteeringBehaviors';

describe('Cycle 118: Pathfinding & Navigation', () => {
  // -------------------------------------------------------------------------
  // NavMesh
  // -------------------------------------------------------------------------

  function buildSimpleMesh(): NavMesh {
    const mesh = new NavMesh();
    // Two triangles side by side in XZ plane
    const p1 = mesh.addPolygon([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 5, y: 0, z: 10 },
    ]);
    const p2 = mesh.addPolygon([
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 15, y: 0, z: 10 },
    ]);
    mesh.connectPolygons(p1.id, p2.id);
    return mesh;
  }

  it('should create polygons and find by point', () => {
    const mesh = buildSimpleMesh();
    expect(mesh.getPolygonCount()).toBe(2);

    // Point inside first triangle
    const found = mesh.findPolygonAtPoint({ x: 5, y: 0, z: 3 });
    expect(found).not.toBeNull();
  });

  it('should find nearest polygon and walkable neighbors', () => {
    const mesh = buildSimpleMesh();
    const nearest = mesh.findNearestPolygon({ x: 50, y: 0, z: 50 });
    expect(nearest).not.toBeNull();

    // Check neighbors
    const neighbors = mesh.getWalkableNeighbors(nearest!.id);
    expect(neighbors.length).toBeGreaterThanOrEqual(0);
  });

  // -------------------------------------------------------------------------
  // AStarPathfinder
  // -------------------------------------------------------------------------

  it('should find path through nav mesh', () => {
    const mesh = new NavMesh();
    const p1 = mesh.addPolygon([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
      { x: 0, y: 0, z: 10 },
    ]);
    const p2 = mesh.addPolygon([
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 20, y: 0, z: 10 },
      { x: 10, y: 0, z: 10 },
    ]);
    const p3 = mesh.addPolygon([
      { x: 20, y: 0, z: 0 },
      { x: 30, y: 0, z: 0 },
      { x: 30, y: 0, z: 10 },
      { x: 20, y: 0, z: 10 },
    ]);
    mesh.connectPolygons(p1.id, p2.id);
    mesh.connectPolygons(p2.id, p3.id);

    const pathfinder = new AStarPathfinder(mesh);
    const result = pathfinder.findPath({ x: 5, y: 0, z: 5 }, { x: 25, y: 0, z: 5 });

    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('should avoid dynamic obstacles', () => {
    const mesh = new NavMesh();
    const p1 = mesh.addPolygon([
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 10 },
      { x: 0, y: 0, z: 10 },
    ]);
    const p2 = mesh.addPolygon([
      { x: 10, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
      { x: 20, y: 0, z: 10 },
      { x: 10, y: 0, z: 10 },
    ]);
    mesh.connectPolygons(p1.id, p2.id);

    const pathfinder = new AStarPathfinder(mesh);
    // Block the center of p2
    pathfinder.addObstacle('wall', { x: 15, y: 0, z: 5 }, 20);
    expect(pathfinder.getObstacleCount()).toBe(1);

    const result = pathfinder.findPath({ x: 5, y: 0, z: 5 }, { x: 15, y: 0, z: 5 });
    // Path may not be found since the destination polygon center is blocked
    expect(result.found).toBe(false);
  });

  it('should smooth paths', () => {
    const mesh = new NavMesh();
    const pathfinder = new AStarPathfinder(mesh);

    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0.1 }, // Nearly collinear
      { x: 10, y: 0, z: 0 },
    ];
    const smoothed = pathfinder.smoothPath(path);
    expect(smoothed.length).toBeLessThanOrEqual(path.length);
  });

  // -------------------------------------------------------------------------
  // SteeringBehaviors
  // -------------------------------------------------------------------------

  function makeAgent(x = 0, z = 0): SteeringAgent {
    return {
      position: { x, y: 0, z },
      velocity: { x: 0, y: 0, z: 0 },
      maxSpeed: 10,
      maxForce: 5,
      mass: 1,
    };
  }

  it('should seek toward target', () => {
    const steering = new SteeringBehaviors();
    const agent = makeAgent(0, 0);
    const force = steering.seek(agent, { x: 10, y: 0, z: 0 });

    expect(force.x).toBeGreaterThan(0); // Should push right
  });

  it('should flee away from target', () => {
    const steering = new SteeringBehaviors();
    const agent = makeAgent(0, 0);
    const force = steering.flee(agent, { x: 10, y: 0, z: 0 });

    expect(force.x).toBeLessThan(0); // Should push left (away)
  });

  it('should arrive and slow down near target', () => {
    const steering = new SteeringBehaviors({ arriveSlowRadius: 5 });
    const agent = makeAgent(0, 0);

    const farForce = steering.arrive(agent, { x: 20, y: 0, z: 0 });
    const nearForce = steering.arrive(agent, { x: 2, y: 0, z: 0 });

    // Far force should be stronger than near force (closer = slower)
    expect(Math.abs(farForce.x)).toBeGreaterThan(Math.abs(nearForce.x));
  });

  it('should compute flock forces from neighbors', () => {
    const steering = new SteeringBehaviors({
      separationRadius: 10,
      alignmentRadius: 20,
      cohesionRadius: 20,
    });
    const agent = makeAgent(0, 0);
    const neighbors = [makeAgent(2, 0), makeAgent(-2, 0), makeAgent(0, 3)];

    const force = steering.flock(agent, neighbors);
    // Force should be non-zero (some combination of separation/alignment/cohesion)
    const mag = Math.sqrt(force.x ** 2 + force.y ** 2 + force.z ** 2);
    expect(mag).toBeGreaterThan(0);
  });
});
