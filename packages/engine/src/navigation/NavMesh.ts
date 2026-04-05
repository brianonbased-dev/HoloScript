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

export interface NavPoint {
  x: number;
  y: number;
  z: number;
}

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
   * Find which polygon contains the given point (2D, ignoring Z).
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
    const min: NavPoint = { x: Infinity, y: Infinity, z: Infinity };
    const max: NavPoint = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of polys) {
      for (const v of p.vertices) {
        min.x = Math.min(min.x, v.x);
        min.y = Math.min(min.y, v.y);
        min.z = Math.min(min.z, v.z);
        max.x = Math.max(max.x, v.x);
        max.y = Math.max(max.y, v.y);
        max.z = Math.max(max.z, v.z);
      }
    }
    return { polygons: polys, bounds: { min, max } };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private computeCenter(vertices: NavPoint[]): NavPoint {
    const c = { x: 0, y: 0, z: 0 };
    for (const v of vertices) {
      c.x += v.x;
      c.y += v.y;
      c.z += v.z;
    }
    const n = vertices.length || 1;
    return { x: c.x / n, y: c.y / n, z: c.z / n };
  }

  private isPointInPolygon2D(point: NavPoint, vertices: NavPoint[]): boolean {
    let inside = false;
    const n = vertices.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = vertices[i].x,
        yi = vertices[i].z;
      const xj = vertices[j].x,
        yj = vertices[j].z;
      if (
        yi > point.z !== yj > point.z &&
        point.x < ((xj - xi) * (point.z - yi)) / (yj - yi) + xi
      ) {
        inside = !inside;
      }
    }
    return inside;
  }

  private dist(a: NavPoint, b: NavPoint): number {
    return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  }
}

