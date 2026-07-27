// hs.std.scalar.f64.v1
//
// Executable cross-target subset of @holoscript/std scalar floating-point math.
//
// Inputs and every arithmetic result must remain finite IEEE-754 binary64 values.
// The browser-WASM/UAAL host and owned-metal backend fail closed on
// non-finite inputs, division by zero, and overflow before the value crosses the ABI
// boundary. Signed-zero preservation remains outside this proof.

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
