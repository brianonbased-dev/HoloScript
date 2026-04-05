/**
 * RaycastSystem.ts
 *
 * Raycasting: ray-AABB, ray-sphere, ray-plane intersection tests,
 * distance sorting, layer masks, and batch queries.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Ray {
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
}

export interface AABB {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

export interface Sphere {
  center: { x: number; y: number; z: number };
  radius: number;
}

export interface Plane {
  normal: { x: number; y: number; z: number };
  distance: number; // Distance from origin along normal
}

export interface RayHit {
  entityId: string;
  distance: number;
  point: { x: number; y: number; z: number };
  normal: { x: number; y: number; z: number };
}

export interface Collider {
  entityId: string;
  type: 'aabb' | 'sphere' | 'plane';
  shape: AABB | Sphere | Plane;
  layer: number;
}

// =============================================================================
// RAYCAST SYSTEM
// =============================================================================

export class RaycastSystem {
  private colliders: Map<string, Collider> = new Map();

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  addCollider(collider: Collider): void {
    this.colliders.set(collider.entityId, collider);
  }
  removeCollider(entityId: string): void {
    this.colliders.delete(entityId);
  }
  getColliderCount(): number {
    return this.colliders.size;
  }

  // ---------------------------------------------------------------------------
  // Raycasting
  // ---------------------------------------------------------------------------

  raycast(ray: Ray, maxDistance = Infinity, layerMask = 0xffffffff): RayHit | null {
    const hits = this.raycastAll(ray, maxDistance, layerMask);
    return hits.length > 0 ? hits[0] : null;
  }

  raycastAll(ray: Ray, maxDistance = Infinity, layerMask = 0xffffffff): RayHit[] {
    const hits: RayHit[] = [];
    const dir = this.normalize(ray.direction);

    for (const collider of this.colliders.values()) {
      if ((collider.layer & layerMask) === 0) continue;

      let hit: RayHit | null = null;
      switch (collider.type) {
        case 'aabb':
          hit = this.rayAABB(ray.origin, dir, collider.shape as AABB, collider.entityId);
          break;
        case 'sphere':
          hit = this.raySphere(ray.origin, dir, collider.shape as Sphere, collider.entityId);
          break;
        case 'plane':
          hit = this.rayPlane(ray.origin, dir, collider.shape as Plane, collider.entityId);
          break;
      }

      if (hit && hit.distance <= maxDistance) hits.push(hit);
    }

    return hits.sort((a, b) => a.distance - b.distance);
  }

  // ---------------------------------------------------------------------------
  // Intersection Tests
  // ---------------------------------------------------------------------------

  private rayAABB(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    aabb: AABB,
    entityId: string
  ): RayHit | null {
    let tmin = -Infinity,
      tmax = Infinity;
    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    let hitNormal = { x: 0, y: 0, z: 0 };

    for (const axis of axes) {
      if (Math.abs(dir[axis]) < 1e-10) {
        if (origin[axis] < aabb.min[axis] || origin[axis] > aabb.max[axis]) return null;
        continue;
      }

      const t1 = (aabb.min[axis] - origin[axis]) / dir[axis];
      const t2 = (aabb.max[axis] - origin[axis]) / dir[axis];
      const tNear = Math.min(t1, t2);
      const tFar = Math.max(t1, t2);

      if (tNear > tmin) {
        tmin = tNear;
        hitNormal = { x: 0, y: 0, z: 0 };
        hitNormal[axis] = dir[axis] > 0 ? -1 : 1;
      }
      tmax = Math.min(tmax, tFar);

      if (tmin > tmax || tmax < 0) return null;
    }

    const t = tmin >= 0 ? tmin : tmax;
    if (t < 0) return null;

    return {
      entityId,
      distance: t,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      normal: hitNormal,
    };
  }

  private raySphere(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    sphere: Sphere,
    entityId: string
  ): RayHit | null {
    const ox = origin.x - sphere.center.x,
      oy = origin.y - sphere.center.y,
      oz = origin.z - sphere.center.z;
    const a = dir.x * dir.x + dir.y * dir.y + dir.z * dir.z;
    const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
    const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
    const disc = b * b - 4 * a * c;

    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    let t = (-b - sqrtDisc) / (2 * a);
    if (t < 0) t = (-b + sqrtDisc) / (2 * a);
    if (t < 0) return null;

    const point = { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t };
    const nx = point.x - sphere.center.x,
      ny = point.y - sphere.center.y,
      nz = point.z - sphere.center.z;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

    return {
      entityId,
      distance: t,
      point,
      normal: { x: nx / nLen, y: ny / nLen, z: nz / nLen },
    };
  }

  private rayPlane(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    plane: Plane,
    entityId: string
  ): RayHit | null {
    const denom = plane.normal.x * dir.x + plane.normal.y * dir.y + plane.normal.z * dir.z;
    if (Math.abs(denom) < 1e-10) return null;

    const t =
      -(
        plane.normal.x * origin.x +
        plane.normal.y * origin.y +
        plane.normal.z * origin.z +
        plane.distance
      ) / denom;
    if (t < 0) return null;

    return {
      entityId,
      distance: t,
      point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t, z: origin.z + dir.z * t },
      normal: { ...plane.normal },
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalize(v: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z) || 1;
    return { x: v.x / len, y: v.y / len, z: v.z / len };
  }
}
