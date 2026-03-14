/**
 * BoundingBox — Axis-Aligned Bounding Box (AABB) for spatial assertions
 *
 * The core math primitive for HoloTest spatial assertions.
 * All coordinates are in world-space meters.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export class BoundingBox {
  constructor(
    public readonly min: Readonly<Vec3>,
    public readonly max: Readonly<Vec3>
  ) {}

  // ── Factories ────────────────────────────────────────────────────────────

  static fromMinMax(min: Vec3, max: Vec3): BoundingBox {
    return new BoundingBox(
      { x: Math.min(min.x, max.x), y: Math.min(min.y, max.y), z: Math.min(min.z, max.z) },
      { x: Math.max(min.x, max.x), y: Math.max(min.y, max.y), z: Math.max(min.z, max.z) }
    );
  }

  /** Build a box centered at `center` with half-extents `size/2`. */
  static fromCenterSize(center: Vec3, size: Vec3): BoundingBox {
    const hx = Math.abs(size.x) / 2;
    const hy = Math.abs(size.y) / 2;
    const hz = Math.abs(size.z) / 2;
    return new BoundingBox(
      { x: center.x - hx, y: center.y - hy, z: center.z - hz },
      { x: center.x + hx, y: center.y + hy, z: center.z + hz }
    );
  }

  /** Build a box from a bottom-center position (e.g. an object placed on the ground). */
  static fromBottomCenter(bottomCenter: Vec3, size: Vec3): BoundingBox {
    const hx = Math.abs(size.x) / 2;
    const hz_ = Math.abs(size.z) / 2;
    return new BoundingBox(
      { x: bottomCenter.x - hx, y: bottomCenter.y, z: bottomCenter.z - hz_ },
      { x: bottomCenter.x + hx, y: bottomCenter.y + Math.abs(size.y), z: bottomCenter.z + hz_ }
    );
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  /** Size on each axis. */
  size(): Vec3 {
    return {
      x: this.max.x - this.min.x,
      y: this.max.y - this.min.y,
      z: this.max.z - this.min.z,
    };
  }

  /** Center of the box. */
  center(): Vec3 {
    return {
      x: (this.min.x + this.max.x) / 2,
      y: (this.min.y + this.max.y) / 2,
      z: (this.min.z + this.max.z) / 2,
    };
  }

  /** Volume in m³. */
  volume(): number {
    const s = this.size();
    return s.x * s.y * s.z;
  }

  /** True if the point is strictly inside (inclusive of boundary). */
  contains(point: Vec3): boolean {
    return (
      point.x >= this.min.x && point.x <= this.max.x &&
      point.y >= this.min.y && point.y <= this.max.y &&
      point.z >= this.min.z && point.z <= this.max.z
    );
  }

  /** True if this box overlaps `other`. Touching edges count as intersection. */
  intersects(other: BoundingBox): boolean {
    return (
      this.min.x <= other.max.x && this.max.x >= other.min.x &&
      this.min.y <= other.max.y && this.max.y >= other.min.y &&
      this.min.z <= other.max.z && this.max.z >= other.min.z
    );
  }

  /**
   * Volume of intersection with `other`, in m³.
   * Returns 0 when there is no overlap.
   */
  intersectionVolume(other: BoundingBox): number {
    const ox = Math.min(this.max.x, other.max.x) - Math.max(this.min.x, other.min.x);
    const oy = Math.min(this.max.y, other.max.y) - Math.max(this.min.y, other.min.y);
    const oz = Math.min(this.max.z, other.max.z) - Math.max(this.min.z, other.min.z);
    if (ox <= 0 || oy <= 0 || oz <= 0) return 0;
    return ox * oy * oz;
  }

  /**
   * How far this box must move along each axis to no longer intersect `other`.
   * Returns `{x:0, y:0, z:0}` when there is no intersection.
   */
  penetrationDepth(other: BoundingBox): Vec3 {
    if (!this.intersects(other)) return { x: 0, y: 0, z: 0 };
    return {
      x: Math.min(this.max.x, other.max.x) - Math.max(this.min.x, other.min.x),
      y: Math.min(this.max.y, other.max.y) - Math.max(this.min.y, other.min.y),
      z: Math.min(this.max.z, other.max.z) - Math.max(this.min.z, other.min.z),
    };
  }

  /** Returns a new BoundingBox translated by `delta`. */
  translate(delta: Vec3): BoundingBox {
    return new BoundingBox(
      { x: this.min.x + delta.x, y: this.min.y + delta.y, z: this.min.z + delta.z },
      { x: this.max.x + delta.x, y: this.max.y + delta.y, z: this.max.z + delta.z }
    );
  }

  /** Returns the nearest point inside this box to `point`. */
  closestPoint(point: Vec3): Vec3 {
    return {
      x: clamp(point.x, this.min.x, this.max.x),
      y: clamp(point.y, this.min.y, this.max.y),
      z: clamp(point.z, this.min.z, this.max.z),
    };
  }

  toString(): string {
    const { min: n, max: x } = this;
    return `BoundingBox(${n.x},${n.y},${n.z} → ${x.x},${x.y},${x.z})`;
  }
}
