// hs.std.vector.i32.v1
// hs.std.vector.aggregate.i32.v1
// hs.std.aabb3.aggregate.i32.v1
//
// Executable cross-target subset of the HoloScript standard-library Vec3 and AABB math.
//
// StdVec3I32 is a flat POD record transferred as one affine value across function calls and
// returns. StdAabb3I32 proves recursively nested immutable POD layout and scalar leaf projection
// without flattening either Vec3 across the calling convention. Owned buffers and mutable or
// borrowed aggregate transfer remain outside this cross-target contract.

struct StdVec3I32 { x: i32, y: i32, z: i32 }
struct StdAabb3I32 { min: StdVec3I32, max: StdVec3I32 }

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

export function std_math_aabb3_make_i32(
  min: StdVec3I32,
  max: StdVec3I32
): StdAabb3I32 {
  slot value: StdAabb3I32 = StdAabb3I32(move(min), move(max))
  return move(value)
}

export function std_math_aabb3_size_value_i32(bounds: StdAabb3I32): StdVec3I32 {
  let x: i32 = load(bounds.max.x) - load(bounds.min.x)
  let y: i32 = load(bounds.max.y) - load(bounds.min.y)
  let z: i32 = load(bounds.max.z) - load(bounds.min.z)
  slot size: StdVec3I32 = StdVec3I32(x, y, z)
  return move(size)
}

export function std_math_aabb3_volume_value_i32(bounds: StdAabb3I32): i32 {
  let width: i32 = load(bounds.max.x) - load(bounds.min.x)
  let height: i32 = load(bounds.max.y) - load(bounds.min.y)
  let depth: i32 = load(bounds.max.z) - load(bounds.min.z)
  return width * height * depth
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
