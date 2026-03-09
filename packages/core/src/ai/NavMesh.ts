/**
 * NavMesh — Navigation mesh with polygon walk and path smoothing
 *
 * @version 1.0.0
 */

export interface NavPolygon {
  id: number;
  vertices: { x: number; z: number }[];
  neighbors: number[];
  center: { x: number; z: number };
  walkable: boolean;
  cost: number;
}

export interface NavPath {
  waypoints: { x: number; z: number }[];
  totalCost: number;
  polygonIds: number[];
}

export class NavMesh {
  private polygons: Map<number, NavPolygon> = new Map();
  private nextId: number = 0;

  /**
   * Add a navigation polygon
   */
  addPolygon(
    vertices: { x: number; z: number }[],
    walkable: boolean = true,
    cost: number = 1
  ): number {
    const id = this.nextId++;
    const cx = vertices.reduce((s, v) => s + v.x, 0) / vertices.length;
    const cz = vertices.reduce((s, v) => s + v.z, 0) / vertices.length;
    this.polygons.set(id, {
      id,
      vertices,
      neighbors: [],
      center: { x: cx, z: cz },
      walkable,
      cost,
    });
    return id;
  }

  /**
   * Connect two polygons as neighbors
   */
  connect(a: number, b: number): boolean {
    const pa = this.polygons.get(a);
    const pb = this.polygons.get(b);
    if (!pa || !pb) return false;
    if (!pa.neighbors.includes(b)) pa.neighbors.push(b);
    if (!pb.neighbors.includes(a)) pb.neighbors.push(a);
    return true;
  }

  /**
   * Find path using A*
   */
  findPath(startPoly: number, endPoly: number): NavPath | null {
    const start = this.polygons.get(startPoly);
    const end = this.polygons.get(endPoly);
    if (!start || !end || !start.walkable || !end.walkable) return null;

    const openSet = new Set<number>([startPoly]);
    const cameFrom = new Map<number, number>();
    const gScore = new Map<number, number>();
    const fScore = new Map<number, number>();

    gScore.set(startPoly, 0);
    fScore.set(startPoly, this.heuristic(start.center, end.center));

    while (openSet.size > 0) {
      // Get node with lowest fScore
      let current = -1;
      let lowestF = Infinity;
      for (const id of openSet) {
        const f = fScore.get(id) ?? Infinity;
        if (f < lowestF) {
          lowestF = f;
          current = id;
        }
      }

      if (current === endPoly) {
        return this.reconstructPath(cameFrom, current, gScore.get(current) ?? 0);
      }

      openSet.delete(current);
      const currentPoly = this.polygons.get(current)!;

      for (const neighborId of currentPoly.neighbors) {
        const neighbor = this.polygons.get(neighborId);
        if (!neighbor || !neighbor.walkable) continue;

        const tentativeG =
          (gScore.get(current) ?? Infinity) +
          this.heuristic(currentPoly.center, neighbor.center) * neighbor.cost;

        if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
          cameFrom.set(neighborId, current);
          gScore.set(neighborId, tentativeG);
          fScore.set(neighborId, tentativeG + this.heuristic(neighbor.center, end.center));
          openSet.add(neighborId);
        }
      }
    }

    return null; // No path
  }

  /**
   * Smooth a path using string-pulling (funnel algorithm simplified)
   */
  smoothPath(path: NavPath): NavPath {
    if (path.waypoints.length <= 2) return path;

    const smoothed: { x: number; z: number }[] = [path.waypoints[0]];
    let i = 0;

    while (i < path.waypoints.length - 1) {
      let farthest = i + 1;
      for (let j = i + 2; j < path.waypoints.length; j++) {
        // Simple line-of-sight check via distance
        const dx = path.waypoints[j].x - path.waypoints[i].x;
        const dz = path.waypoints[j].z - path.waypoints[i].z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 50) farthest = j; // Simplified — skip intermediate points within range
      }
      smoothed.push(path.waypoints[farthest]);
      i = farthest;
    }

    return { waypoints: smoothed, totalCost: path.totalCost, polygonIds: path.polygonIds };
  }

  private reconstructPath(
    cameFrom: Map<number, number>,
    current: number,
    totalCost: number
  ): NavPath {
    const polygonIds: number[] = [current];
    while (cameFrom.has(current)) {
      current = cameFrom.get(current)!;
      polygonIds.unshift(current);
    }
    const waypoints = polygonIds.map((id) => this.polygons.get(id)!.center);
    return { waypoints, totalCost, polygonIds };
  }

  private heuristic(a: { x: number; z: number }, b: { x: number; z: number }): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
  }

  getPolygon(id: number): NavPolygon | undefined {
    return this.polygons.get(id);
  }
  getPolygonCount(): number {
    return this.polygons.size;
  }
  setWalkable(id: number, walkable: boolean): void {
    const p = this.polygons.get(id);
    if (p) p.walkable = walkable;
  }
}
