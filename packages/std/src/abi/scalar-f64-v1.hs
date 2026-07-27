// hs.std.scalar.f64.v1
//
// Executable cross-target subset of @holoscript/std scalar floating-point math.
//
// This first contract covers finite IEEE-754 binary64 inputs. Callers must provide
// a non-zero input span to inverse-lerp and remap. NaN, infinity, signed-zero
// preservation, and division-by-zero behavior remain outside this ABI proof.

export function std_math_clamp_f64(value: f64, minimum: f64, maximum: f64): f64 {
  if (value < minimum) {
    return minimum
  }
  if (value > maximum) {
    return maximum
  }
  return value
}

export function std_math_lerp_f64(start: f64, end: f64, amount: f64): f64 {
  return start + (end - start) * amount
}

export function std_math_inverse_lerp_f64(start: f64, end: f64, value: f64): f64 {
  return (value - start) / (end - start)
}

export function std_math_remap_f64(
  value: f64,
  input_minimum: f64,
  input_maximum: f64,
  output_minimum: f64,
  output_maximum: f64
): f64 {
  return std_math_lerp_f64(
    output_minimum,
    output_maximum,
    std_math_inverse_lerp_f64(input_minimum, input_maximum, value)
  )
}
