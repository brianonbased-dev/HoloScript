/**
 * 3D Vector mathematics utilities
 * Centralized implementation to avoid code duplication across modules
 */

export type Vec3 = [number, number, number];

export type Vec3Array = [number, number, number];

/**
 * Normalize a vector in-place and return its original length
 * @param v - Vector to normalize (modified in-place)
 * @returns Original length of the vector
 */
export function vec3NormalizeInPlace(v: number[]): number {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len > 1e-8) {
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }
  return len;
}

/**
 * Normalize a Vec3 object and return a new normalized vector
 * @param v - Vector to normalize
 * @returns New normalized vector
 */
export function vec3Normalize(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Calculate the length of a vector
 * @param v - Vector
 * @returns Length of the vector
 */
export function vec3Length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/**
 * Cross product of two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Cross product result
 */
export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Cross product for array-based vectors
 * @param a - First vector as array
 * @param b - Second vector as array
 * @returns Cross product result as array
 */
export function vec3CrossArray(a: number[], b: number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * Subtract two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Subtraction result
 */
export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Subtract two array-based vectors
 * @param a - First vector as array
 * @param b - Second vector as array
 * @returns Subtraction result as array
 */
export function vec3SubArray(a: number[], b: number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * Add two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Addition result
 */
export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

/**
 * Scale a vector by a scalar
 * @param v - Vector to scale
 * @param s - Scalar value
 * @returns Scaled vector
 */
export function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Scale an array-based vector by a scalar
 * @param v - Vector as array
 * @param s - Scalar value
 * @returns Scaled vector as array
 */
export function vec3ScaleArray(v: number[], s: number): number[] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

/**
 * Distance between two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Distance between the vectors
 */
export function vec3Distance(a: Vec3, b: Vec3): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * Dot product of two vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Dot product result
 */
export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
