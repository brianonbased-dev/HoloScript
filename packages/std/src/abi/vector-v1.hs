// hs.std.vector.i32.v1
// hs.std.vector.aggregate.i32.v1
//
// Executable cross-target subset of the HoloScript standard-library Vec3 math.
//
// StdVec3I32 is a flat POD record transferred as one affine value across function calls and
// returns. Owned buffers, nested records, and mutable/reference transfer remain outside this
// first cross-target aggregate contract.

struct StdVec3I32 { x: i32, y: i32, z: i32 }

export function std_math_vec3_make_i32(x: i32, y: i32, z: i32): StdVec3I32 {
  slot value: StdVec3I32 = StdVec3I32(x, y, z)
  return move(value)
}

export function std_math_vec3_dot_value_i32(
  left: StdVec3I32,
  right: StdVec3I32
): i32 {
  return load(left.x) * load(right.x) +
    load(left.y) * load(right.y) +
    load(left.z) * load(right.z)
}

export function std_math_vec3_cross_value_i32(
  left: StdVec3I32,
  right: StdVec3I32
): StdVec3I32 {
  let x: i32 = load(left.y) * load(right.z) - load(left.z) * load(right.y)
  let y: i32 = load(left.z) * load(right.x) - load(left.x) * load(right.z)
  let z: i32 = load(left.x) * load(right.y) - load(left.y) * load(right.x)
  slot result: StdVec3I32 = StdVec3I32(x, y, z)
  return move(result)
}

export function std_math_vec3_length_sq_value_i32(value: StdVec3I32): i32 {
  return load(value.x) * load(value.x) +
    load(value.y) * load(value.y) +
    load(value.z) * load(value.z)
}

// Compatibility entrypoints retain the original scalar signatures while executing through the
// aggregate-value functions above.
export function std_math_vec3_dot_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  slot left: StdVec3I32 = std_math_vec3_make_i32(ax, ay, az)
  slot right: StdVec3I32 = std_math_vec3_make_i32(bx, by, bz)
  return std_math_vec3_dot_value_i32(move(left), move(right))
}

export function std_math_vec3_cross_x_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  slot left: StdVec3I32 = std_math_vec3_make_i32(ax, ay, az)
  slot right: StdVec3I32 = std_math_vec3_make_i32(bx, by, bz)
  slot cross: StdVec3I32 = std_math_vec3_cross_value_i32(move(left), move(right))
  return load(cross.x)
}

export function std_math_vec3_cross_y_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  slot left: StdVec3I32 = std_math_vec3_make_i32(ax, ay, az)
  slot right: StdVec3I32 = std_math_vec3_make_i32(bx, by, bz)
  slot cross: StdVec3I32 = std_math_vec3_cross_value_i32(move(left), move(right))
  return load(cross.y)
}

export function std_math_vec3_cross_z_i32(
  ax: i32,
  ay: i32,
  az: i32,
  bx: i32,
  by: i32,
  bz: i32
): i32 {
  slot left: StdVec3I32 = std_math_vec3_make_i32(ax, ay, az)
  slot right: StdVec3I32 = std_math_vec3_make_i32(bx, by, bz)
  slot cross: StdVec3I32 = std_math_vec3_cross_value_i32(move(left), move(right))
  return load(cross.z)
}

export function std_math_vec3_length_sq_i32(x: i32, y: i32, z: i32): i32 {
  slot value: StdVec3I32 = std_math_vec3_make_i32(x, y, z)
  return std_math_vec3_length_sq_value_i32(move(value))
}
