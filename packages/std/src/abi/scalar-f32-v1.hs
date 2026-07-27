// hs.std.scalar.f32.v1
//
// Executable cross-target subset of @holoscript/std single-precision math.
//
// Every parameter, literal, intermediate arithmetic result, and return uses
// IEEE-754 binary32 rounding. Callers must provide a non-zero input span to
// inverse-lerp and remap. NaN, infinity, signed-zero preservation, and
// division-by-zero behavior remain outside this ABI proof.

export function std_math_clamp_f32(value: f32, minimum: f32, maximum: f32): f32 {
  if (value < minimum) {
    return minimum
  }
  if (value > maximum) {
    return maximum
  }
  return value
}

export function std_math_lerp_f32(start: f32, end: f32, amount: f32): f32 {
  return start + (end - start) * amount
}

export function std_math_inverse_lerp_f32(start: f32, end: f32, value: f32): f32 {
  return (value - start) / (end - start)
}

export function std_math_remap_f32(
  value: f32,
  input_minimum: f32,
  input_maximum: f32,
  output_minimum: f32,
  output_maximum: f32
): f32 {
  return std_math_lerp_f32(
    output_minimum,
    output_maximum,
    std_math_inverse_lerp_f32(input_minimum, input_maximum, value)
  )
}
