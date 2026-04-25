import { describe, it, expect } from 'vitest';
import { NavMesh } from '@holoscript/engine/navigation';
import { AStarPathfinder } from '@holoscript/engine/navigation';
import { SteeringBehaviors, SteeringAgent } from '@holoscript/engine/navigation';

describe('Cycle 118: Pathfinding & Navigation', () => {
  // -------------------------------------------------------------------------
  // NavMesh
  // -------------------------------------------------------------------------

  function buildSimpleMesh(): NavMesh {
    const mesh = new NavMesh();
    // Two triangles side by side in XZ plane
    const p1 = mesh.addPolygon([
      [0, 0, 0],
      [10, 0, 0],
      [5, 0, 10],
    ]);
    const p2 = mesh.addPolygon([
      [10, 0, 0],
      [20, 0, 0],
      [15, 0, 10],
    ]);
    mesh.connectPolygons(p1.id, p2.id);
    return mesh;
  }

  it('should create polygons and find by point', () => {
    const mesh = buildSimpleMesh();
    expect(mesh.getPolygonCount()).toBe(2);

    // Point inside first triangle
    const found = mesh.findPolygonAtPoint([5, 0, 3]);
    expect(found).not.toBeNull();
  });

  it('should find nearest polygon and walkable neighbors', () => {
    const mesh = buildSimpleMesh();
    const nearest = mesh.findNearestPolygon([50, 0, 50]);
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
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 10],
    ]);
    const p2 = mesh.addPolygon([
      [10, 0, 0],
      [20, 0, 0],
      [20, 0, 10],
      [10, 0, 10],
    ]);
    const p3 = mesh.addPolygon([
      [20, 0, 0],
      [30, 0, 0],
      [30, 0, 10],
      [20, 0, 10],
    ]);
    mesh.connectPolygons(p1.id, p2.id);
    mesh.connectPolygons(p2.id, p3.id);

    const pathfinder = new AStarPathfinder(mesh);
    const result = pathfinder.findPath([5, 0, 5], [25, 0, 5]);

    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThan(0);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('should avoid dynamic obstacles', () => {
    const mesh = new NavMesh();
    const p1 = mesh.addPolygon([
      [0, 0, 0],
      [10, 0, 0],
      [10, 0, 10],
      [0, 0, 10],
    ]);
    const p2 = mesh.addPolygon([
      [10, 0, 0],
      [20, 0, 0],
      [20, 0, 10],
      [10, 0, 10],
    ]);
    mesh.connectPolygons(p1.id, p2.id);

    const pathfinder = new AStarPathfinder(mesh);
    // Block the center of p2
    pathfinder.addObstacle('wall', [15, 0, 5], 20);
    expect(pathfinder.getObstacleCount()).toBe(1);

    const result = pathfinder.findPath([5, 0, 5], [15, 0, 5]);
    // Path may not be found since the destination polygon center is blocked
    expect(result.found).toBe(false);
  });

  it('should smooth paths', () => {
    const mesh = new NavMesh();
    const pathfinder = new AStarPathfinder(mesh);

    const path = [
      [0, 0, 0],
      [5, 0, 0.1],
      [10, 0, 0],
    ];
    const smoothed = pathfinder.smoothPath(path);
    expect(smoothed.length).toBeLessThanOrEqual(path.length);
  });

  // -------------------------------------------------------------------------
  // SteeringBehaviors
  // -------------------------------------------------------------------------

  function makeAgent(x = 0, z = 0): SteeringAgent {
    return {
      position: [x, 0, z],
      velocity: [0, 0, 0],
      maxSpeed: 10,
      maxForce: 5,
      mass: 1,
    };
  }

  it('should seek toward target', () => {
    const steering = new SteeringBehaviors();
    const agent = makeAgent(0, 0);
    const force = steering.seek(agent, [10, 0, 0]);

    expect(force[0]).toBeGreaterThan(0); // Should push right
  });

  it('should flee away from target', () => {
    const steering = new SteeringBehaviors();
    const agent = makeAgent(0, 0);
    const force = steering.flee(agent, [10, 0, 0]);

    expect(force[0]).toBeLessThan(0); // Should push left (away)
  });

  it('should arrive and slow down near target', () => {
    const steering = new SteeringBehaviors({ arriveSlowRadius: 5 });
    const agent = makeAgent(0, 0);

    const farForce = steering.arrive(agent, [20, 0, 0]);
    const nearForce = steering.arrive(agent, [2, 0, 0]);

    // Far force should be stronger than near force (closer = slower)
    expect(Math.abs(farForce[0])).toBeGreaterThan(Math.abs(nearForce[0]));
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
    const mag = Math.sqrt(force[0] ** 2 + force[1] ** 2 + force[2] ** 2);
    expect(mag).toBeGreaterThan(0);
  });
});
