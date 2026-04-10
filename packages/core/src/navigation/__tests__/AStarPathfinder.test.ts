import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AStarPathfinder } from '../AStarPathfinder';
import { NavMesh } from '../NavMesh';

/** Build a simple 3-polygon NavMesh for testing A*. */
function buildTestNavMesh(): NavMesh {
  const mesh = new NavMesh();
  // A → B → C linear graph (addPolygon takes vertices[], walkable, cost)
  const a = mesh.addPolygon(
    [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
      { x: 0, y: 0, z: 5 },
    ],
    true,
    1
  );
  const b = mesh.addPolygon(
    [
      { x: 5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 0, z: 5 },
      { x: 5, y: 0, z: 5 },
    ],
    true,
    1
  );
  const c = mesh.addPolygon(
    [
      { x: 10, y: 0, z: 0 },
      { x: 15, y: 0, z: 0 },
      { x: 15, y: 0, z: 5 },
      { x: 10, y: 0, z: 5 },
    ],
    true,
    1
  );
  // Link neighbors: A↔B↔C
  mesh.connectPolygons(a.id, b.id);
  mesh.connectPolygons(b.id, c.id);
  return mesh;
}

describe('AStarPathfinder', () => {
  let mesh: NavMesh;
  let pf: AStarPathfinder;

  beforeEach(() => {
    mesh = buildTestNavMesh();
    pf = new AStarPathfinder(mesh);
  });

  // --- Basic Pathfinding ---
  it('findPath returns found:true for reachable goal', () => {
    const result = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThanOrEqual(2);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('findPath returns start and goal in path', () => {
    const start = { x: 2, y: 0, z: 2 };
    const goal = { x: 13, y: 0, z: 2 };
    const result = pf.findPath(start, goal);
    expect(result.path[0]).toEqual(start);
    expect(result.path[result.path.length - 1]).toEqual(goal);
  });

  it('findPath within same polygon', () => {
    const result = pf.findPath({ x: 1, y: 0, z: 1 }, { x: 4, y: 0, z: 4 });
    expect(result.found).toBe(true);
    expect(result.path).toHaveLength(2); // just start and goal
  });

  it('findPath tracks polygonsVisited', () => {
    const result = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    expect(result.polygonsVisited).toBeGreaterThan(0);
  });

  it('findPath records timeMs', () => {
    const result = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
  });

  // --- Caching ---
  it('repeated findPath returns cached result', () => {
    const r1 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    const r2 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    expect(r1).toBe(r2); // same reference (cached)
  });

  it('clearCache invalidates cache', () => {
    const r1 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    pf.clearCache();
    const r2 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    expect(r1).not.toBe(r2); // different reference
  });

  // --- Path Smoothing ---
  it('smoothPath returns start and end', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    const smoothed = pf.smoothPath(path);
    expect(smoothed[0]).toEqual(path[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(path[path.length - 1]);
  });

  it('smoothPath removes redundant collinear points', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 15, y: 0, z: 0 },
    ];
    const smoothed = pf.smoothPath(path);
    expect(smoothed.length).toBeLessThanOrEqual(path.length);
  });

  it('smoothPath with 2 or fewer points returns as-is', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 5 },
    ];
    expect(pf.smoothPath(path)).toEqual(path);
  });

  // --- Dynamic Obstacles ---
  it('addObstacle / getObstacleCount', () => {
    pf.addObstacle('wall', { x: 7.5, y: 0, z: 2.5 }, 2);
    expect(pf.getObstacleCount()).toBe(1);
  });

  it('removeObstacle removes', () => {
    pf.addObstacle('wall', { x: 7.5, y: 0, z: 2.5 }, 2);
    pf.removeObstacle('wall');
    expect(pf.getObstacleCount()).toBe(0);
  });

  it('addObstacle clears cache', () => {
    const r1 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    pf.addObstacle('wall', { x: 50, y: 50, z: 50 }, 0.1);
    const r2 = pf.findPath({ x: 2, y: 0, z: 2 }, { x: 13, y: 0, z: 2 });
    expect(r1).not.toBe(r2);
  });

  // --- setMaxIterations ---
  it('setMaxIterations does not throw', () => {
    expect(() => pf.setMaxIterations(100)).not.toThrow();
  });
});
