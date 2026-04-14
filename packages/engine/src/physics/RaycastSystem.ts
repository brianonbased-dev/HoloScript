import type { Vector3 } from '@holoscript/core';
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
  origin: Vector3;
  direction: Vector3;
}

export interface AABB {
  min: Vector3;
  max: Vector3;
}

export interface Sphere {
  center: Vector3;
  radius: number;
}

export interface Plane {
  normal: Vector3;
  distance: number; // Distance from origin along normal
}

export interface RayHit {
  entityId: string;
  distance: number;
  point: Vector3;
  normal: Vector3;
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
    origin: Vector3,
    dir: Vector3,
    aabb: AABB,
    entityId: string
  ): RayHit | null {
    let tmin = -Infinity,
      tmax = Infinity;
    let hitNormal: Vector3 = [0, 0, 0];

    for (let axis = 0; axis < 3; axis++) {
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
        hitNormal = [0, 0, 0];
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
      point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t],
      normal: hitNormal,
    };
  }

  private raySphere(
    origin: Vector3,
    dir: Vector3,
    sphere: Sphere,
    entityId: string
  ): RayHit | null {
    const ox = origin[0] - sphere.center[0],
      oy = origin[1] - sphere.center[1],
      oz = origin[2] - sphere.center[2];
    const a = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
    const b = 2 * (ox * dir[0] + oy * dir[1] + oz * dir[2]);
    const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
    const disc = b * b - 4 * a * c;

    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    let t = (-b - sqrtDisc) / (2 * a);
    if (t < 0) t = (-b + sqrtDisc) / (2 * a);
    if (t < 0) return null;

    const point: Vector3 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    const nx = point[0] - sphere.center[0],
      ny = point[1] - sphere.center[1],
      nz = point[2] - sphere.center[2];
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

    return {
      entityId,
      distance: t,
      point,
      normal: [nx / nLen, ny / nLen, nz / nLen],
    };
  }

  private rayPlane(
    origin: Vector3,
    dir: Vector3,
    plane: Plane,
    entityId: string
  ): RayHit | null {
    const denom = plane.normal[0] * dir[0] + plane.normal[1] * dir[1] + plane.normal[2] * dir[2];
    if (Math.abs(denom) < 1e-10) return null;

    const t =
      -(
        plane.normal[0] * origin[0] +
        plane.normal[1] * origin[1] +
        plane.normal[2] * origin[2] +
        plane.distance
      ) / denom;
    if (t < 0) return null;

    return {
      entityId,
      distance: t,
      point: [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t],
      normal: [plane.normal[0], plane.normal[1], plane.normal[2]],
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private normalize(v: Vector3): Vector3 {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }
}
