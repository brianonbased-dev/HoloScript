/**
 * Vector3 - 3D vector for spatial calculations
 * HoloScript v3.2 - Autonomous Agent Swarms
 */

/**
 * 3D Vector class for spatial operations
 */
export class Vector3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0
  ) {}

  /**
   * Create from array
   */
  static fromArray(arr: number[]): Vector3 {
    return new Vector3(arr[0] ?? 0, arr[1] ?? 0, arr[2] ?? 0);
  }

  /**
   * Create zero vector
   */
  static zero(): Vector3 {
    return new Vector3(0, 0, 0);
  }

  /**
   * Create unit vector
   */
  static one(): Vector3 {
    return new Vector3(1, 1, 1);
  }

  /**
   * Add another vector
   */
  add(v: Vector3): Vector3 {
    return new Vector3(this.x + v.x, this.y + v.y, this.z + v.z);
  }

  /**
   * Subtract another vector
   */
  subtract(v: Vector3): Vector3 {
    return new Vector3(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  /**
   * Multiply by scalar
   */
  multiply(scalar: number): Vector3 {
    return new Vector3(this.x * scalar, this.y * scalar, this.z * scalar);
  }

  /**
   * Divide by scalar
   */
  divide(scalar: number): Vector3 {
    if (scalar === 0) return Vector3.zero();
    return new Vector3(this.x / scalar, this.y / scalar, this.z / scalar);
  }

  /**
   * Get magnitude (length)
   */
  magnitude(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
  }

  /**
   * Get squared magnitude (faster for comparisons)
   */
  magnitudeSquared(): number {
    return this.x * this.x + this.y * this.y + this.z * this.z;
  }

  /**
   * Normalize to unit vector
   */
  normalize(): Vector3 {
    const mag = this.magnitude();
    if (mag === 0) return Vector3.zero();
    return this.divide(mag);
  }

  /**
   * Dot product
   */
  dot(v: Vector3): number {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  /**
   * Cross product
   */
  cross(v: Vector3): Vector3 {
    return new Vector3(
      this.y * v.z - this.z * v.y,
      this.z * v.x - this.x * v.z,
      this.x * v.y - this.y * v.x
    );
  }

  /**
   * Distance to another vector
   */
  distanceTo(v: Vector3): number {
    return this.subtract(v).magnitude();
  }

  /**
   * Squared distance (faster for comparisons)
   */
  distanceToSquared(v: Vector3): number {
    return this.subtract(v).magnitudeSquared();
  }

  /**
   * Linear interpolation
   */
  lerp(v: Vector3, t: number): Vector3 {
    return this.add(v.subtract(this).multiply(t));
  }

  /**
   * Clamp magnitude
   */
  clampMagnitude(maxLength: number): Vector3 {
    const mag = this.magnitude();
    if (mag > maxLength && mag > 0) {
      return this.divide(mag).multiply(maxLength);
    }
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Check equality within epsilon
   */
  equals(v: Vector3, epsilon = 0.0001): boolean {
    return (
      Math.abs(this.x - v.x) < epsilon &&
      Math.abs(this.y - v.y) < epsilon &&
      Math.abs(this.z - v.z) < epsilon
    );
  }

  /**
   * Clone vector
   */
  clone(): Vector3 {
    return new Vector3(this.x, this.y, this.z);
  }

  /**
   * Convert to array
   */
  toArray(): [number, number, number] {
    return [this.x, this.y, this.z];
  }

  /**
   * String representation
   */
  toString(): string {
    return `Vector3(${this.x.toFixed(3)}, ${this.y.toFixed(3)}, ${this.z.toFixed(3)})`;
  }
}
