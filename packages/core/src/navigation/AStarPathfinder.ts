/**
 * AStarPathfinder.ts
 *
 * A* search over a NavMesh graph: heuristic-driven pathfinding,
 * path smoothing, dynamic obstacle avoidance, and path caching.
 *
 * @module navigation
 */

import { NavMesh, NavPoint, NavPolygon } from './NavMesh';

// =============================================================================
// TYPES
// =============================================================================

export interface PathNode {
  polyId: string;
  position: NavPoint;
  g: number; // Cost from start
  h: number; // Heuristic to goal
  f: number; // g + h
  parent: PathNode | null;
}

export interface PathResult {
  found: boolean;
  path: NavPoint[];
  cost: number;
  polygonsVisited: number;
  timeMs: number;
}

export interface DynamicObstacle {
  id: string;
  position: NavPoint;
  radius: number;
}

// =============================================================================
// A* PATHFINDER
// =============================================================================

export class AStarPathfinder {
  private navMesh: NavMesh;
  private obstacles: Map<string, DynamicObstacle> = new Map();
  private pathCache: Map<string, PathResult> = new Map();
  private maxIterations = 5000;

  constructor(navMesh: NavMesh) {
    this.navMesh = navMesh;
  }

  // ---------------------------------------------------------------------------
  // Pathfinding
  // ---------------------------------------------------------------------------

  findPath(start: NavPoint, goal: NavPoint): PathResult {
    const t0 = performance.now();

    // Check cache
    const cacheKey = this.makeCacheKey(start, goal);
    const cached = this.pathCache.get(cacheKey);
    if (cached) return cached;

    const startPoly =
      this.navMesh.findPolygonAtPoint(start) ?? this.navMesh.findNearestPolygon(start);
    const goalPoly = this.navMesh.findPolygonAtPoint(goal) ?? this.navMesh.findNearestPolygon(goal);

    if (!startPoly || !goalPoly) {
      return {
        found: false,
        path: [],
        cost: 0,
        polygonsVisited: 0,
        timeMs: performance.now() - t0,
      };
    }

    if (startPoly.id === goalPoly.id) {
      return {
        found: true,
        path: [start, goal],
        cost: this.dist(start, goal),
        polygonsVisited: 1,
        timeMs: performance.now() - t0,
      };
    }

    // A* open/closed sets
    const open: Map<string, PathNode> = new Map();
    const closed: Set<string> = new Set();

    const startNode: PathNode = {
      polyId: startPoly.id,
      position: startPoly.center,
      g: 0,
      h: this.dist(startPoly.center, goalPoly.center),
      f: 0,
      parent: null,
    };
    startNode.f = startNode.g + startNode.h;
    open.set(startPoly.id, startNode);

    let iterations = 0;
    let visited = 0;

    while (open.size > 0 && iterations < this.maxIterations) {
      iterations++;

      // Find lowest f in open
      let current: PathNode | null = null;
      for (const n of open.values()) {
        if (!current || n.f < current.f) current = n;
      }
      if (!current) break;

      // Goal reached
      if (current.polyId === goalPoly.id) {
        const path = this.reconstructPath(current, start, goal);
        const result: PathResult = {
          found: true,
          path,
          cost: current.g,
          polygonsVisited: visited,
          timeMs: performance.now() - t0,
        };
        this.pathCache.set(cacheKey, result);
        return result;
      }

      open.delete(current.polyId);
      closed.add(current.polyId);
      visited++;

      // Expand neighbors
      const neighbors = this.navMesh.getWalkableNeighbors(current.polyId);
      for (const neighbor of neighbors) {
        if (closed.has(neighbor.id)) continue;
        if (this.isBlocked(neighbor.center)) continue;

        const tentativeG = current.g + this.dist(current.position, neighbor.center) * neighbor.cost;

        const existing = open.get(neighbor.id);
        if (existing && tentativeG >= existing.g) continue;

        const node: PathNode = {
          polyId: neighbor.id,
          position: neighbor.center,
          g: tentativeG,
          h: this.dist(neighbor.center, goalPoly.center),
          f: 0,
          parent: current,
        };
        node.f = node.g + node.h;
        open.set(neighbor.id, node);
      }
    }

    return {
      found: false,
      path: [],
      cost: 0,
      polygonsVisited: visited,
      timeMs: performance.now() - t0,
    };
  }

  // ---------------------------------------------------------------------------
  // Path Smoothing (simple line-of-sight)
  // ---------------------------------------------------------------------------

  smoothPath(path: NavPoint[]): NavPoint[] {
    if (path.length <= 2) return path;
    const smoothed: NavPoint[] = [path[0]];

    let current = 0;
    while (current < path.length - 1) {
      let furthest = current + 1;
      for (let i = path.length - 1; i > current + 1; i--) {
        // Simple: check if intermediate points are roughly on the line
        if (this.canSkipTo(path, current, i)) {
          furthest = i;
          break;
        }
      }
      smoothed.push(path[furthest]);
      current = furthest;
    }

    return smoothed;
  }

  private canSkipTo(path: NavPoint[], from: number, to: number): boolean {
    // Simplified: skip if intermediate points are all within threshold of line
    const a = path[from],
      b = path[to];
    const lineLen = this.dist(a, b);
    if (lineLen < 0.001) return true;

    for (let i = from + 1; i < to; i++) {
      const p = path[i];
      const crossX = (p.z - a.z) * (b.x - a.x) - (p.x - a.x) * (b.z - a.z);
      const perpDist = Math.abs(crossX) / lineLen;
      if (perpDist > 2) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Dynamic Obstacles
  // ---------------------------------------------------------------------------

  addObstacle(id: string, position: NavPoint, radius: number): void {
    this.obstacles.set(id, { id, position, radius });
    this.pathCache.clear();
  }

  removeObstacle(id: string): void {
    this.obstacles.delete(id);
    this.pathCache.clear();
  }

  getObstacleCount(): number {
    return this.obstacles.size;
  }

  private isBlocked(point: NavPoint): boolean {
    for (const obs of this.obstacles.values()) {
      if (this.dist(point, obs.position) <= obs.radius) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private reconstructPath(node: PathNode, start: NavPoint, goal: NavPoint): NavPoint[] {
    const path: NavPoint[] = [goal];
    let current: PathNode | null = node;
    while (current) {
      path.unshift(current.position);
      current = current.parent;
    }
    path[0] = start; // Replace first center with actual start
    return path;
  }

  private dist(a: NavPoint, b: NavPoint): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }

  private makeCacheKey(a: NavPoint, b: NavPoint): string {
    return `${a.x.toFixed(1)},${a.y.toFixed(1)},${a.z.toFixed(1)}->${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}`;
  }

  clearCache(): void {
    this.pathCache.clear();
  }
  setMaxIterations(n: number): void {
    this.maxIterations = n;
  }
}
