/**
 * @holoscript/std — Spatial Module
 *
 * Provides spatial math utilities: Vec3, Quaternion, Transform, Ray, AABB, distance.
 * Used by the HoloScript runtime for spatial computing operations.
 *
 * @version 0.2.0
 * @module @holoscript/std/spatial
 */

// =============================================================================
// Vec3
// =============================================================================

export class Vec3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  static zero(): Vec3 { return new Vec3(0, 0, 0); }
  static one(): Vec3 { return new Vec3(1, 1, 1); }
  static up(): Vec3 { return new Vec3(0, 1, 0); }
  static down(): Vec3 { return new Vec3(0, -1, 0); }
  static forward(): Vec3 { return new Vec3(0, 0, -1); }
  static right(): Vec3 { return new Vec3(1, 0, 0); }

  add(other: Vec3): Vec3 { return new Vec3(this.x + other.x, this.y + other.y, this.z + other.z); }
  sub(other: Vec3): Vec3 { return new Vec3(this.x - other.x, this.y - other.y, this.z - other.z); }
  mul(s: number): Vec3 { return new Vec3(this.x * s, this.y * s, this.z * s); }
  div(s: number): Vec3 { return new Vec3(this.x / s, this.y / s, this.z / s); }

  dot(other: Vec3): number { return this.x * other.x + this.y * other.y + this.z * other.z; }
  cross(other: Vec3): Vec3 {
    return new Vec3(
      this.y * other.z - this.z * other.y,
      this.z * other.x - this.x * other.z,
      this.x * other.y - this.y * other.x,
    );
  }

  length(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }
  lengthSquared(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize(): Vec3 { const l = this.length(); return l > 0 ? this.div(l) : Vec3.zero(); }

  distanceTo(other: Vec3): number { return this.sub(other).length(); }
  lerp(other: Vec3, t: number): Vec3 { return this.add(other.sub(this).mul(t)); }

  toArray(): [number, number, number] { return [this.x, this.y, this.z]; }
  static fromArray(arr: number[]): Vec3 { return new Vec3(arr[0] || 0, arr[1] || 0, arr[2] || 0); }

  equals(other: Vec3, epsilon = 1e-6): boolean {
    return Math.abs(this.x - other.x) < epsilon &&
           Math.abs(this.y - other.y) < epsilon &&
           Math.abs(this.z - other.z) < epsilon;
  }

  toString(): string { return `Vec3(${this.x}, ${this.y}, ${this.z})`; }
}

// =============================================================================
// Quaternion
// =============================================================================

export class Quaternion {
  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}

  static identity(): Quaternion { return new Quaternion(0, 0, 0, 1); }

  static fromEuler(x: number, y: number, z: number): Quaternion {
    const cx = Math.cos(x * 0.5), sx = Math.sin(x * 0.5);
    const cy = Math.cos(y * 0.5), sy = Math.sin(y * 0.5);
    const cz = Math.cos(z * 0.5), sz = Math.sin(z * 0.5);
    return new Quaternion(
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz,
    );
  }

  static fromAxisAngle(axis: Vec3, angle: number): Quaternion {
    const half = angle * 0.5;
    const s = Math.sin(half);
    const n = axis.normalize();
    return new Quaternion(n.x * s, n.y * s, n.z * s, Math.cos(half));
  }

  multiply(other: Quaternion): Quaternion {
    return new Quaternion(
      this.w * other.x + this.x * other.w + this.y * other.z - this.z * other.y,
      this.w * other.y - this.x * other.z + this.y * other.w + this.z * other.x,
      this.w * other.z + this.x * other.y - this.y * other.x + this.z * other.w,
      this.w * other.w - this.x * other.x - this.y * other.y - this.z * other.z,
    );
  }

  rotateVec3(v: Vec3): Vec3 {
    const u = new Vec3(this.x, this.y, this.z);
    const s = this.w;
    return u.mul(2 * u.dot(v))
      .add(v.mul(s * s - u.dot(u)))
      .add(u.cross(v).mul(2 * s));
  }

  slerp(other: Quaternion, t: number): Quaternion {
    let dot = this.x * other.x + this.y * other.y + this.z * other.z + this.w * other.w;
    const neg = dot < 0;
    if (neg) dot = -dot;
    if (dot > 0.9995) {
      // Linear interpolation for very close quaternions
      const r = new Quaternion(
        this.x + t * ((neg ? -other.x : other.x) - this.x),
        this.y + t * ((neg ? -other.y : other.y) - this.y),
        this.z + t * ((neg ? -other.z : other.z) - this.z),
        this.w + t * ((neg ? -other.w : other.w) - this.w),
      );
      const len = Math.sqrt(r.x * r.x + r.y * r.y + r.z * r.z + r.w * r.w);
      return new Quaternion(r.x / len, r.y / len, r.z / len, r.w / len);
    }
    const theta = Math.acos(dot);
    const sinTheta = Math.sin(theta);
    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta * (neg ? -1 : 1);
    return new Quaternion(
      a * this.x + b * other.x, a * this.y + b * other.y,
      a * this.z + b * other.z, a * this.w + b * other.w,
    );
  }

  normalize(): Quaternion {
    const len = Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z + this.w * this.w);
    return new Quaternion(this.x / len, this.y / len, this.z / len, this.w / len);
  }

  toEuler(): Vec3 {
    const sinr = 2 * (this.w * this.x + this.y * this.z);
    const cosr = 1 - 2 * (this.x * this.x + this.y * this.y);
    const sinp = 2 * (this.w * this.y - this.z * this.x);
    const siny = 2 * (this.w * this.z + this.x * this.y);
    const cosy = 1 - 2 * (this.y * this.y + this.z * this.z);
    return new Vec3(
      Math.atan2(sinr, cosr),
      Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp),
      Math.atan2(siny, cosy),
    );
  }
}

// =============================================================================
// Transform
// =============================================================================

export class Transform {
  constructor(
    public position: Vec3 = Vec3.zero(),
    public rotation: Quaternion = Quaternion.identity(),
    public scale: Vec3 = Vec3.one(),
  ) {}

  static identity(): Transform { return new Transform(); }

  transformPoint(point: Vec3): Vec3 {
    const scaled = new Vec3(point.x * this.scale.x, point.y * this.scale.y, point.z * this.scale.z);
    return this.rotation.rotateVec3(scaled).add(this.position);
  }

  transformDirection(dir: Vec3): Vec3 {
    return this.rotation.rotateVec3(dir);
  }
}

// =============================================================================
// Ray & AABB
// =============================================================================

export class Ray {
  constructor(public origin: Vec3, public direction: Vec3) {}

  pointAt(t: number): Vec3 { return this.origin.add(this.direction.mul(t)); }
}

export class AABB {
  constructor(public min: Vec3, public max: Vec3) {}

  contains(point: Vec3): boolean {
    return point.x >= this.min.x && point.x <= this.max.x &&
           point.y >= this.min.y && point.y <= this.max.y &&
           point.z >= this.min.z && point.z <= this.max.z;
  }

  intersects(other: AABB): boolean {
    return this.min.x <= other.max.x && this.max.x >= other.min.x &&
           this.min.y <= other.max.y && this.max.y >= other.min.y &&
           this.min.z <= other.max.z && this.max.z >= other.min.z;
  }

  center(): Vec3 { return this.min.add(this.max).div(2); }
  size(): Vec3 { return this.max.sub(this.min); }

  intersectsRay(ray: Ray): number | null {
    let tmin = (this.min.x - ray.origin.x) / ray.direction.x;
    let tmax = (this.max.x - ray.origin.x) / ray.direction.x;
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (this.min.y - ray.origin.y) / ray.direction.y;
    let tymax = (this.max.y - ray.origin.y) / ray.direction.y;
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if (tmin > tymax || tymin > tmax) return null;
    tmin = Math.max(tmin, tymin);
    tmax = Math.min(tmax, tymax);

    let tzmin = (this.min.z - ray.origin.z) / ray.direction.z;
    let tzmax = (this.max.z - ray.origin.z) / ray.direction.z;
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if (tmin > tzmax || tzmin > tmax) return null;
    return Math.max(tmin, tzmin);
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

export function distance(a: Vec3, b: Vec3): number { return a.distanceTo(b); }
export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
export function clamp(v: number, min: number, max: number): number { return Math.min(Math.max(v, min), max); }
export function degToRad(deg: number): number { return deg * (Math.PI / 180); }
export function radToDeg(rad: number): number { return rad * (180 / Math.PI); }
