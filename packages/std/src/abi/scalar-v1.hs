// hs.std.scalar.i32.v1
//
// Executable cross-target subset of @holoscript/std scalar math.
//
// This ABI intentionally uses i32 values and control flow that are supported by
// the browser-WASM -> UAAL and owned-metal compiler paths. It does not claim
// floating-point, vector, quaternion, noise, or collections parity.

export function std_math_clamp_i32(value: i32, minimum: i32, maximum: i32): i32 {
  if (value < minimum) {
    return minimum
  }
  if (value > maximum) {
    return maximum
  }
  return value
}

export function std_math_sign_i32(value: i32): i32 {
  if (value < 0) {
    return 0 - 1
  }
  if (value > 0) {
    return 1
  }
  return 0
}

export function std_math_step_i32(edge: i32, value: i32): i32 {
  if (value < edge) {
    return 0
  }
  return 1
}
