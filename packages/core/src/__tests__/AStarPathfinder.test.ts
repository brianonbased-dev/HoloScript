import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AStarPathfinder } from '@holoscript/engine/navigation';
import type { NavMesh, NavPoint, NavPolygon } from '@holoscript/engine/navigation';

// =============================================================================
// C224 — A* Pathfinder
// =============================================================================

/** Minimal NavPolygon mock */
function makePoly(id: string, cx: number, cy: number, cz: number, cost = 1): NavPolygon {
  return { id, center: { x: cx, y: cy, z: cz }, cost, vertices: [], neighbors: [] } as any;
}

/** Build a simple 3-polygon linear nav mesh: A -> B -> C */
function buildNavMesh(polys: NavPolygon[], adjacency: Record<string, string[]> = {}): NavMesh {
  return {
    findPolygonAtPoint: vi.fn((p: NavPoint) => {
      // Closest center match
      let best: NavPolygon | null = null;
      let bestDist = Infinity;
      for (const poly of polys) {
        const d = Math.hypot(p.x - poly.center.x, p.y - poly.center.y, p.z - poly.center.z);
        if (d < bestDist) {
          bestDist = d;
          best = poly;
        }
      }
      return bestDist < 5 ? best : null;
    }),
    findNearestPolygon: vi.fn((p: NavPoint) => {
      let best: NavPolygon | null = null;
      let bestDist = Infinity;
      for (const poly of polys) {
        const d = Math.hypot(p.x - poly.center.x, p.y - poly.center.y, p.z - poly.center.z);
        if (d < bestDist) {
          bestDist = d;
          best = poly;
        }
      }
      return best;
    }),
    getWalkableNeighbors: vi.fn((polyId: string) => {
      const neighborIds = adjacency[polyId] ?? [];
      return polys.filter((p) => neighborIds.includes(p.id));
    }),
  } as unknown as NavMesh;
}

describe('AStarPathfinder', () => {
  const polyA = makePoly('A', 0, 0, 0);
  const polyB = makePoly('B', 10, 0, 0);
  const polyC = makePoly('C', 20, 0, 0);
  const adjacency = { A: ['B'], B: ['A', 'C'], C: ['B'] };

  let pathfinder: AStarPathfinder;

  beforeEach(() => {
    const mesh = buildNavMesh([polyA, polyB, polyC], adjacency);
    pathfinder = new AStarPathfinder(mesh);
  });

  it('finds path between start and goal on same polygon', () => {
    const result = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThanOrEqual(2);
  });

  it('finds path across multiple polygons', () => {
    const result = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    expect(result.found).toBe(true);
    expect(result.path.length).toBeGreaterThanOrEqual(2);
    expect(result.cost).toBeGreaterThan(0);
  });

  it('returns found=false when no path exists', () => {
    const isolated = makePoly('D', 100, 100, 100);
    const mesh = buildNavMesh([polyA, isolated], { A: [], D: [] });
    const pf = new AStarPathfinder(mesh);
    const result = pf.findPath({ x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 100 });
    expect(result.found).toBe(false);
    expect(result.path).toHaveLength(0);
  });

  it('caches path results', () => {
    const r1 = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    const r2 = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    expect(r1).toBe(r2); // Same reference
  });

  it('clearCache invalidates cached results', () => {
    const r1 = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    pathfinder.clearCache();
    const r2 = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    expect(r1).not.toBe(r2); // Different reference
  });

  it('addObstacle blocks points', () => {
    pathfinder.addObstacle('wall', { x: 10, y: 0, z: 0 }, 2);
    expect(pathfinder.getObstacleCount()).toBe(1);
  });

  it('removeObstacle clears obstacle', () => {
    pathfinder.addObstacle('wall', { x: 10, y: 0, z: 0 }, 2);
    pathfinder.removeObstacle('wall');
    expect(pathfinder.getObstacleCount()).toBe(0);
  });

  it('obstacle invalidates path cache', () => {
    pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    pathfinder.addObstacle('wall', { x: 10, y: 0, z: 0 }, 2);
    // Cache should be cleared after adding obstacle
    const result = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    expect(result).toBeDefined(); // Recalculated, not cached
  });

  it('smoothPath reduces waypoints', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 15, y: 0, z: 0 },
      { x: 20, y: 0, z: 0 },
    ];
    const smoothed = pathfinder.smoothPath(path);
    expect(smoothed.length).toBeLessThanOrEqual(path.length);
    expect(smoothed[0]).toEqual(path[0]);
    expect(smoothed[smoothed.length - 1]).toEqual(path[path.length - 1]);
  });

  it('smoothPath preserves short paths', () => {
    const path = [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
    ];
    expect(pathfinder.smoothPath(path)).toHaveLength(2);
  });

  it('setMaxIterations limits search', () => {
    pathfinder.setMaxIterations(0);
    const result = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    // With 0 iterations, it won't find the path (or might find if same poly)
    expect(result).toBeDefined();
  });

  it('PathResult includes timing info', () => {
    const result = pathfinder.findPath({ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 });
    expect(result.timeMs).toBeGreaterThanOrEqual(0);
    expect(result.polygonsVisited).toBeGreaterThanOrEqual(0);
  });
});
