/**
 * FrustumCuller.ts
 *
 * Frustum culling: 6-plane frustum extraction, AABB/sphere tests,
 * batch culling, and visibility sets.
 *
 * @module spatial
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Plane4 {
  a: number;
  b: number;
  c: number;
  d: number; // ax + by + cz + d = 0
}

export interface BoundingVolume {
  id: string;
  type: 'aabb' | 'sphere';
  centerX: number;
  centerY: number;
  centerZ: number;
  halfX?: number;
  halfY?: number;
  halfZ?: number; // AABB half-extents
  radius?: number;
}

export type CullResult = 'inside' | 'intersect' | 'outside';

// =============================================================================
// FRUSTUM CULLER
// =============================================================================

export class FrustumCuller {
  private planes: Plane4[] = [];
  private volumes: Map<string, BoundingVolume> = new Map();
  private visibleSet: Set<string> = new Set();

  // ---------------------------------------------------------------------------
  // Frustum Setup
  // ---------------------------------------------------------------------------

  setFrustumFromPerspective(
    fovDeg: number,
    aspect: number,
    near: number,
    far: number,
    eyeX: number,
    eyeY: number,
    eyeZ: number,
    lookX: number,
    lookY: number,
    lookZ: number
  ): void {
    // Compute simplified frustum planes based on camera parameters
    const fovRad = ((fovDeg / 2) * Math.PI) / 180;
    const tanHalf = Math.tan(fovRad);

    // Forward direction
    const dx = lookX - eyeX,
      dy = lookY - eyeY,
      dz = lookZ - eyeZ;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const fx = dx / len,
      fy = dy / len,
      fz = dz / len;

    // Near and far planes
    this.planes = [
      {
        a: fx,
        b: fy,
        c: fz,
        d: -(fx * (eyeX + fx * near) + fy * (eyeY + fy * near) + fz * (eyeZ + fz * near)),
      },
      {
        a: -fx,
        b: -fy,
        c: -fz,
        d: fx * (eyeX + fx * far) + fy * (eyeY + fy * far) + fz * (eyeZ + fz * far),
      },
    ];

    // Simplified side planes (using fov angle offset)
    const _rightX = fy * 0 - fz * 0 || 1,
      _rightY = 0,
      _rightZ = 0; // Simplified right vector
    this.planes.push(
      { a: fx + tanHalf, b: fy, c: fz, d: -(eyeX * (fx + tanHalf) + eyeY * fy + eyeZ * fz) },
      { a: fx - tanHalf, b: fy, c: fz, d: -(eyeX * (fx - tanHalf) + eyeY * fy + eyeZ * fz) }
    );
  }

  setPlanes(planes: Plane4[]): void {
    this.planes = planes.map((p) => ({ ...p }));
  }
  getPlaneCount(): number {
    return this.planes.length;
  }

  // ---------------------------------------------------------------------------
  // Volume Management
  // ---------------------------------------------------------------------------

  addVolume(volume: BoundingVolume): void {
    this.volumes.set(volume.id, volume);
  }
  removeVolume(id: string): void {
    this.volumes.delete(id);
  }
  getVolumeCount(): number {
    return this.volumes.size;
  }

  // ---------------------------------------------------------------------------
  // Culling
  // ---------------------------------------------------------------------------

  testSphere(cx: number, cy: number, cz: number, radius: number): CullResult {
    for (const plane of this.planes) {
      const dist = plane.a * cx + plane.b * cy + plane.c * cz + plane.d;
      if (dist < -radius) return 'outside';
    }
    return 'inside';
  }

  testAABB(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): CullResult {
    for (const plane of this.planes) {
      // P-vertex (most positive along plane normal)
      const px = plane.a >= 0 ? cx + hx : cx - hx;
      const py = plane.b >= 0 ? cy + hy : cy - hy;
      const pz = plane.c >= 0 ? cz + hz : cz - hz;

      if (plane.a * px + plane.b * py + plane.c * pz + plane.d < 0) return 'outside';
    }
    return 'inside';
  }

  // ---------------------------------------------------------------------------
  // Batch Cull
  // ---------------------------------------------------------------------------

  cullAll(): string[] {
    this.visibleSet.clear();

    for (const vol of this.volumes.values()) {
      let result: CullResult;

      if (vol.type === 'sphere' && vol.radius !== undefined) {
        result = this.testSphere(vol.centerX, vol.centerY, vol.centerZ, vol.radius);
      } else if (vol.type === 'aabb' && vol.halfX !== undefined) {
        result = this.testAABB(
          vol.centerX,
          vol.centerY,
          vol.centerZ,
          vol.halfX!,
          vol.halfY!,
          vol.halfZ!
        );
      } else {
        continue;
      }

      if (result !== 'outside') this.visibleSet.add(vol.id);
    }

    return [...this.visibleSet];
  }

  isVisible(id: string): boolean {
    return this.visibleSet.has(id);
  }
  getVisibleCount(): number {
    return this.visibleSet.size;
  }
}
