/**
 * FrustumCuller.ts
 *
 * View frustum culling for HoloScript+ VR.
 * Determines which objects are visible from the camera's perspective.
 * Uses a simplified sphere-vs-frustum test for performance.
 */

export interface FrustumPlane {
  nx: number;
  ny: number;
  nz: number; // Normal
  d: number; // Distance from origin
}

export interface BoundingSphere {
  id: string;
  x: number;
  y: number;
  z: number;
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
    pos: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
    _up: { x: number; y: number; z: number },
    _fovY: number,
    _aspect: number,
    near: number,
    far: number
  ): void {
    // Near plane: normal = forward, point on plane = pos + forward*near
    const nearPlane = this.makePlane(
      forward.x,
      forward.y,
      forward.z,
      pos.x + forward.x * near,
      pos.y + forward.y * near,
      pos.z + forward.z * near
    );

    // Far plane: normal = -forward, point on plane = pos + forward*far
    const farPlane = this.makePlane(
      -forward.x,
      -forward.y,
      -forward.z,
      pos.x + forward.x * far,
      pos.y + forward.y * far,
      pos.z + forward.z * far
    );

    this.planes = [nearPlane, farPlane];
  }

  /**
   * Test if a bounding sphere is visible.
   */
  isVisible(sphere: BoundingSphere): boolean {
    for (const plane of this.planes) {
      const dist = plane.nx * sphere.x + plane.ny * sphere.y + plane.nz * sphere.z + plane.d;
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
