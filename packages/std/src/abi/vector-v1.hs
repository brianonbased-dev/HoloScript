// hs.std.vector.i32.v1
//
// Executable cross-target subset of @holoscript/std Vec3 math.
//
// Vec3 values are projected into explicit i32 component arguments because the
// current browser-WASM -> UAAL and owned-metal compiler paths expose scalar
// machine values, not a stable aggregate calling convention. The component
// entrypoints preserve the same dot, cross, and squared-length semantics as
// the package's JavaScript Vec3 implementation.

export function std_math_vec3_dot_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  return ax * bx + ay * by + az * bz
}

export function std_math_vec3_cross_x_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  return ay * bz - az * by
}

export function std_math_vec3_cross_y_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  return az * bx - ax * bz
}

export function std_math_vec3_cross_z_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  return ax * by - ay * bx
}

export function std_math_vec3_length_sq_i32(x: i32, y: i32, z: i32): i32 {
  return x * x + y * y + z * z
}

