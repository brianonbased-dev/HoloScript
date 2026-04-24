/**
 * FrustumCuller.ts
 *
 * View frustum culling for HoloScript+ VR.
 * Determines which objects are visible from the camera's perspective.
 * Uses a simplified sphere-vs-frustum test for performance.
 */

import { Vector3 } from '../types/HoloScriptPlus';

export interface FrustumPlane {
  nx: number;
  ny: number;
  nz: number; // Normal
  d: number; // Distance from origin
}

export interface BoundingSphere {
  id: string;
  position: [number, number, number];
  radius: number;
}

export class FrustumCuller {
  private planes: FrustumPlane[] = [];
  private lastCullCount: number = 0;

  /**
   * Update frustum planes from camera position and orientation.
   * Uses near + far planes for reliable depth culling.
   */
  setFrustumFromPerspective(
    pos: Vector3,
    forward: Vector3,
    _up: Vector3,
    _fovY: number,
    _aspect: number,
    near: number,
    far: number
  ): void {
    // Near plane: normal = forward, point on plane = pos + forward*near
    const nearPlane = this.makePlane(
      forward[0],
      forward[1],
      forward[2],
      pos[0] + forward[0] * near,
      pos[1] + forward[1] * near,
      pos[2] + forward[2] * near
    );

    // Far plane: normal = -forward, point on plane = pos + forward*far
    const farPlane = this.makePlane(
      -forward[0],
      -forward[1],
      -forward[2],
      pos[0] + forward[0] * far,
      pos[1] + forward[1] * far,
      pos[2] + forward[2] * far
    );

    this.planes = [nearPlane, farPlane];
  }

  /**
   * Test if a bounding sphere is visible.
   */
  isVisible(sphere: BoundingSphere): boolean {
    for (const plane of this.planes) {
      const dist =
          plane.nx * sphere.position[0] +
          plane.ny * sphere.position[1] +
          plane.nz * sphere.position[2] +
        plane.d;
      if (dist < -sphere.radius) return false; // Fully behind this plane
    }
    return true;
  }

  /**
   * Cull an array of objects. Returns only visible ones.
   */
  cull(objects: BoundingSphere[]): BoundingSphere[] {
    const visible = objects.filter((o) => this.isVisible(o));
    this.lastCullCount = objects.length - visible.length;
    return visible;
  }

  /**
   * How many objects were culled in the last cull call.
   */
  getLastCullCount(): number {
    return this.lastCullCount;
  }

  private makePlane(
    nx: number,
    ny: number,
    nz: number,
    px: number,
    py: number,
    pz: number
  ): FrustumPlane {
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 0.0001) return { nx: 0, ny: 1, nz: 0, d: 0 };
    const nnx = nx / len,
      nny = ny / len,
      nnz = nz / len;
    return { nx: nnx, ny: nny, nz: nnz, d: -(nnx * px + nny * py + nnz * pz) };
  }
}

