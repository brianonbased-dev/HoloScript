/**
 * OcclusionCulling.ts
 *
 * Visibility determination: frustum culling, AABB tests,
 * portal-based occlusion, and query batching.
 *
 * @module world
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AABB {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface FrustumPlane {
  normal: { x: number; y: number; z: number };
  distance: number;
}

export interface CullableObject {
  id: string;
  bounds: AABB;
  visible: boolean;
  lastTestFrame: number;
  layer: number;
}

export interface OcclusionPortal {
  id: string;
  bounds: AABB;
  connectedZones: [string, string];
  open: boolean;
}

export interface OcclusionZone {
  id: string;
  bounds: AABB;
  objects: string[];
}

// =============================================================================
// OCCLUSION CULLING
// =============================================================================

export class OcclusionCulling {
  private objects: Map<string, CullableObject> = new Map();
  private zones: Map<string, OcclusionZone> = new Map();
  private portals: Map<string, OcclusionPortal> = new Map();
  private frustumPlanes: FrustumPlane[] = [];
  private currentFrame = 0;
  private visibleCount = 0;
  private culledCount = 0;
  private layerMask = 0xffffffff;

  // ---------------------------------------------------------------------------
  // Object Management
  // ---------------------------------------------------------------------------

  register(id: string, bounds: AABB, layer = 0): CullableObject {
    const obj: CullableObject = {
      id,
      bounds,
      visible: true,
      lastTestFrame: 0,
      layer,
    };
    this.objects.set(id, obj);
    return obj;
  }

  unregister(id: string): boolean {
    return this.objects.delete(id);
  }

  updateBounds(id: string, bounds: AABB): void {
    const obj = this.objects.get(id);
    if (obj) obj.bounds = bounds;
  }

  // ---------------------------------------------------------------------------
  // Zones & Portals
  // ---------------------------------------------------------------------------

  addZone(id: string, bounds: AABB, objectIds: string[] = []): void {
    this.zones.set(id, { id, bounds, objects: objectIds });
  }

  addPortal(id: string, bounds: AABB, zone1: string, zone2: string): void {
    this.portals.set(id, { id, bounds, connectedZones: [zone1, zone2], open: true });
  }

  setPortalOpen(id: string, open: boolean): void {
    const portal = this.portals.get(id);
    if (portal) portal.open = open;
  }

  // ---------------------------------------------------------------------------
  // Frustum Setup
  // ---------------------------------------------------------------------------

  setFrustum(planes: FrustumPlane[]): void {
    this.frustumPlanes = planes;
  }

  setLayerMask(mask: number): void {
    this.layerMask = mask;
  }

  // ---------------------------------------------------------------------------
  // Culling
  // ---------------------------------------------------------------------------

  performCulling(): void {
    this.currentFrame++;
    this.visibleCount = 0;
    this.culledCount = 0;

    for (const obj of this.objects.values()) {
      // Layer mask check
      if ((this.layerMask & (1 << obj.layer)) === 0) {
        obj.visible = false;
        this.culledCount++;
        continue;
      }

      // Frustum test
      obj.visible = this.isInFrustum(obj.bounds);
      obj.lastTestFrame = this.currentFrame;

      if (obj.visible) {
        this.visibleCount++;
      } else {
        this.culledCount++;
      }
    }
  }

  private isInFrustum(bounds: AABB): boolean {
    if (this.frustumPlanes.length === 0) return true; // No frustum = everything visible

    for (const plane of this.frustumPlanes) {
      // Test AABB against plane: get the positive vertex
      const px = plane.normal.x >= 0 ? bounds.max.x : bounds.min.x;
      const py = plane.normal.y >= 0 ? bounds.max.y : bounds.min.y;
      const pz = plane.normal.z >= 0 ? bounds.max.z : bounds.min.z;

      const dot = plane.normal.x * px + plane.normal.y * py + plane.normal.z * pz + plane.distance;
      if (dot < 0) return false; // Completely outside
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // AABB Intersection
  // ---------------------------------------------------------------------------

  testAABBOverlap(a: AABB, b: AABB): boolean {
    return (
      a.min.x <= b.max.x &&
      a.max.x >= b.min.x &&
      a.min.y <= b.max.y &&
      a.max.y >= b.min.y &&
      a.min.z <= b.max.z &&
      a.max.z >= b.min.z
    );
  }

  queryRegion(region: AABB): CullableObject[] {
    const result: CullableObject[] = [];
    for (const obj of this.objects.values()) {
      if (this.testAABBOverlap(obj.bounds, region)) {
        result.push(obj);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Portal Visibility
  // ---------------------------------------------------------------------------

  getVisibleZones(startZone: string): string[] {
    const visited = new Set<string>();
    const queue = [startZone];
    visited.add(startZone);

    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const portal of this.portals.values()) {
        if (!portal.open) continue;
        const [z1, z2] = portal.connectedZones;
        if (z1 === current && !visited.has(z2)) {
          visited.add(z2);
          queue.push(z2);
        } else if (z2 === current && !visited.has(z1)) {
          visited.add(z1);
          queue.push(z1);
        }
      }
    }

    return [...visited];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getVisibleObjects(): CullableObject[] {
    return [...this.objects.values()].filter((o) => o.visible);
  }

  getVisibleCount(): number {
    return this.visibleCount;
  }
  getCulledCount(): number {
    return this.culledCount;
  }
  getTotalCount(): number {
    return this.objects.size;
  }
  getCullRatio(): number {
    return this.objects.size > 0 ? this.culledCount / this.objects.size : 0;
  }
  getCurrentFrame(): number {
    return this.currentFrame;
  }
}
