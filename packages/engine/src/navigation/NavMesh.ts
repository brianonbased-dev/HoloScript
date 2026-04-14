import type { Vector3 } from '@holoscript/core';
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

export type NavPoint = Vector3;

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

  // ---------------------------------------------------------------------------
  // Polygon Management
  // ---------------------------------------------------------------------------

  addPolygon(vertices: NavPoint[], walkable = true, cost = 1): NavPolygon {
    const center = this.computeCenter(vertices);
    const poly: NavPolygon = {
      id: `poly_${_polyId++}`,
      vertices: [...vertices],
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
  findPolygonAtPoint(point: NavPoint): NavPolygon | null {
    for (const poly of this.polygons.values()) {
      if (!poly.walkable) continue;
      if (this.isPointInPolygon2D(point, poly.vertices)) {
        return poly;
      }
    }
    return null;
  }

  /**
   * Find the nearest walkable polygon center to a point.
   */
  findNearestPolygon(point: NavPoint): NavPolygon | null {
    let nearest: NavPolygon | null = null;
    let minDist = Infinity;

    for (const poly of this.polygons.values()) {
      if (!poly.walkable) continue;
      const d = this.dist(point, poly.center);
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
        min[0] = Math.min(min[0], v[0]);
        min[1] = Math.min(min[1], v[1]);
        min[2] = Math.min(min[2], v[2]);
        max[0] = Math.max(max[0], v[0]);
        max[1] = Math.max(max[1], v[1]);
        max[2] = Math.max(max[2], v[2]);
      }
    }
    return { polygons: polys, bounds: { min, max } };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeCenter(vertices: NavPoint[]): NavPoint {
    const c = [0, 0, 0];
    for (const v of vertices) {
      c[0] += v[0];
      c[1] += v[1];
      c[2] += v[2];
    }
    const n = vertices.length || 1;
    return [c[0] / n, c[1] / n, c[2] / n];
  }

  private isPointInPolygon2D(point: NavPoint, vertices: NavPoint[]): boolean {
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        // Projecting to X/Z plane (ground plane in HoloScript standard)
      const xi = vertices[i][0],
        zi = vertices[i][2];
      const xj = vertices[j][0],
        zj = vertices[j][2];
      if (
        zi > point[2] !== zj > point[2] &&
        point[0] < ((xj - xi) * (point[2] - zi)) / (zj - zi) + xi
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
