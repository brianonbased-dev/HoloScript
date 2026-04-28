type Vec3 = [number, number, number];
/**
 * NavMesh.ts
 *
 * Navigation mesh: polygon regions, walkable areas,
 * point-in-polygon checks, and nearest-point queries.
 *
 * @module navigation
 */

// =============================================================================
// TYPES
// =============================================================================

export type NavPoint = Vec3;

export interface NavPolygon {
  id: string;
  vertices: NavPoint[];
  neighbors: string[]; // Adjacent polygon IDs
  walkable: boolean;
  cost: number; // Traversal cost multiplier
  center: NavPoint;
  tag?: string;
}

export interface NavMeshData {
  polygons: NavPolygon[];
  bounds: { min: NavPoint; max: NavPoint };
}

// =============================================================================
// NAV MESH
// =============================================================================

let _polyId = 0;

export class NavMesh {
  private polygons: Map<string, NavPolygon> = new Map();

  private toArr3(v: NavPoint | { x: number; y: number; z: number }): [number, number, number] {
    if (Array.isArray(v)) return [v[0], v[1], v[2]];
    return [v.x, v.y, v.z];
  }

  // ---------------------------------------------------------------------------
  // Polygon Management
  // ---------------------------------------------------------------------------

  addPolygon(vertices: Array<NavPoint | { x: number; y: number; z: number }>, walkable = true, cost = 1): NavPolygon {
    const normalized = vertices.map((v) => this.toArr3(v));
    const center = this.computeCenter(normalized);
    const poly: NavPolygon = {
      id: `poly_${_polyId++}`,
      vertices: normalized,
      neighbors: [],
      walkable,
      cost,
      center,
    };
    this.polygons.set(poly.id, poly);
    return poly;
  }

  removePolygon(id: string): boolean {
    const poly = this.polygons.get(id);
    if (!poly) return false;
    // Remove from neighbors
    for (const nid of poly.neighbors) {
      const neighbor = this.polygons.get(nid);
      if (neighbor) {
        neighbor.neighbors = neighbor.neighbors.filter((n) => n !== id);
      }
    }
    return this.polygons.delete(id);
  }

  connectPolygons(id1: string, id2: string): void {
    const p1 = this.polygons.get(id1);
    const p2 = this.polygons.get(id2);
    if (!p1 || !p2) return;
    if (!p1.neighbors.includes(id2)) p1.neighbors.push(id2);
    if (!p2.neighbors.includes(id1)) p2.neighbors.push(id1);
  }

  getPolygon(id: string): NavPolygon | undefined {
    return this.polygons.get(id);
  }

  getPolygonCount(): number {
    return this.polygons.size;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Find which polygon contains the given point (2D, ignoring Y/altitude).
   * Note: HoloScript standard is [x, y, z] where y is up.
   */
  findPolygonAtPoint(point: NavPoint | { x: number; y: number; z: number }): NavPolygon | null {
    const p = this.toArr3(point);
    for (const poly of this.polygons.values()) {
      if (!poly.walkable) continue;
      if (this.isPointInPolygon2D(p, poly.vertices)) {
        return poly;
      }
    }
    return null;
  }

  /**
   * Find the nearest walkable polygon center to a point.
   */
  findNearestPolygon(point: NavPoint | { x: number; y: number; z: number }): NavPolygon | null {
    const p = this.toArr3(point);
    let nearest: NavPolygon | null = null;
    let minDist = Infinity;

    for (const poly of this.polygons.values()) {
      if (!poly.walkable) continue;
      const d = this.dist(p, poly.center);
      if (d < minDist) {
        minDist = d;
        nearest = poly;
      }
    }

    return nearest;
  }

  /**
   * Get walkable neighbor polygons.
   */
  getWalkableNeighbors(polyId: string): NavPolygon[] {
    const poly = this.polygons.get(polyId);
    if (!poly) return [];
    return poly.neighbors
      .map((id) => this.polygons.get(id))
      .filter((p): p is NavPolygon => p !== undefined && p.walkable);
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  export(): NavMeshData {
    const polys = [...this.polygons.values()];
    const min: NavPoint = [Infinity, Infinity, Infinity];
    const max: NavPoint = [-Infinity, -Infinity, -Infinity];
    for (const p of polys) {
      for (const v of p.vertices) {
        const vv = this.toArr3(v);
        min[0] = Math.min(min[0], vv[0]);
        min[1] = Math.min(min[1], vv[1]);
        min[2] = Math.min(min[2], vv[2]);
        max[0] = Math.max(max[0], vv[0]);
        max[1] = Math.max(max[1], vv[1]);
        max[2] = Math.max(max[2], vv[2]);
      }
    }
    return { polygons: polys, bounds: { min, max } };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeCenter(vertices: Array<NavPoint | { x: number; y: number; z: number }>): NavPoint {
    const c = [0, 0, 0];
    for (const v of vertices) {
      const vv = this.toArr3(v);
      c[0] += vv[0];
      c[1] += vv[1];
      c[2] += vv[2];
    }
    const n = vertices.length || 1;
    return [c[0] / n, c[1] / n, c[2] / n];
  }

  private isPointInPolygon2D(point: NavPoint | { x: number; y: number; z: number }, vertices: Array<NavPoint | { x: number; y: number; z: number }>): boolean {
    const p = this.toArr3(point);
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        // Projecting to X/Z plane (ground plane in HoloScript standard)
      const vi = this.toArr3(vertices[i]);
      const vj = this.toArr3(vertices[j]);
      const xi = vi[0],
        zi = vi[2];
      const xj = vj[0],
        zj = vj[2];
      if (
        zi > p[2] !== zj > p[2] &&
        p[0] < ((xj - xi) * (p[2] - zi)) / (zj - zi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private dist(a: NavPoint, b: NavPoint): number {
    return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  }
}
