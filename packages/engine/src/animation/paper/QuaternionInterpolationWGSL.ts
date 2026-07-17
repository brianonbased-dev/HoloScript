/**
 * Deterministic fixed-point quaternion interpolation for the paper experiments.
 *
 * Input preconditions: quaternion components are normalized Q14 values in
 * [-16384, 16384], and t_q15 is in [0, 32768] (clamped defensively). The output
 * buffer must contain at least one vec4<i32> per input case. Integer semantics
 * are intentional: an f32 approximation can vary with adapter rounding and
 * contraction, while WGSL specifies the bounded integer operations used here.
 * Actual adapter agreement is still an empirical receipt gate.
 */

export const QUATERNION_INTERPOLATION_CONTRACT_VERSION = 'paper6-q14-cordic-slerp-v1' as const;
export const QUATERNION_INTERPOLATION_KERNEL_NAME = 'quaternion_slerp_q14' as const;
export const QUATERNION_INTERPOLATION_WORKGROUP_SIZE = 64 as const;

export const QUATERNION_INTERPOLATION_WGSL = /* wgsl */ `
const Q14_ONE: i32 = 16384;
const Q15_ONE: i32 = 32768;
const NEAR_DOT_Q15: i32 = 32760;
const CORDIC_GAIN_Q15: i32 = 19898;
const QUARTER_TURN_BAM: i32 = 16384;

const CORDIC_ATAN_BAM: array<i32, 15> = array<i32, 15>(
  8192, 4836, 2555, 1297, 651,
  326, 163, 81, 41, 20,
  10, 5, 3, 1, 1,
);

// vec4 + vec4 + four scalars gives a 48-byte storage-array stride.
struct QuaternionInterpolationCase {
  from_q14: vec4<i32>,
  to_q14: vec4<i32>,
  t_q15: u32,
  case_id: u32,
  _pad0: u32,
  _pad1: u32,
};

@group(0) @binding(0) var<storage, read> interpolation_cases:
  array<QuaternionInterpolationCase>;
@group(0) @binding(1) var<storage, read_write> interpolated_q14:
  array<vec4<i32>>;

fn magnitude_u32(value: i32) -> u32 {
  let bits = bitcast<u32>(value);
  return select(bits, 0u - bits, value < 0);
}

fn quaternion_norm_squared_q28(value: vec4<i32>) -> u32 {
  let x = magnitude_u32(value.x);
  let y = magnitude_u32(value.y);
  let z = magnitude_u32(value.z);
  let w = magnitude_u32(value.w);
  return x * x + y * y + z * z + w * w;
}

fn integer_sqrt_u32(value: u32) -> u32 {
  var remainder = value;
  var root = 0u;
  var bit = 1u << 30u;

  // Restoring square root: two input bits are consumed per iteration.
  for (var iteration = 0u; iteration < 16u; iteration = iteration + 1u) {
    let trial = root + bit;
    if (remainder >= trial) {
      remainder = remainder - trial;
      root = (root >> 1u) + bit;
    } else {
      root = root >> 1u;
    }
    bit = bit >> 2u;
  }

  return root;
}

fn round_shift_13_symmetric(value: i32) -> i32 {
  if (value < 0) {
    return -((-value + 4096) >> 13u);
  }
  return (value + 4096) >> 13u;
}

fn round_shift_15_symmetric(value: i32) -> i32 {
  if (value < 0) {
    return -((-value + 16384) >> 15u);
  }
  return (value + 16384) >> 15u;
}

fn dot_q28(a: vec4<i32>, b: vec4<i32>) -> i32 {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

fn cordic_atan2_first_quadrant_bam(y_input: u32, x_input: u32) -> u32 {
  if (y_input == 0u) {
    return 0u;
  }
  if (x_input == 0u) {
    return u32(QUARTER_TURN_BAM);
  }

  var x = i32(x_input);
  var y = i32(y_input);
  var angle = 0;

  for (var iteration = 0u; iteration < 15u; iteration = iteration + 1u) {
    let x_shift = x >> iteration;
    let y_shift = y >> iteration;
    if (y > 0) {
      x = x + y_shift;
      y = y - x_shift;
      angle = angle + CORDIC_ATAN_BAM[iteration];
    } else {
      x = x - y_shift;
      y = y + x_shift;
      angle = angle - CORDIC_ATAN_BAM[iteration];
    }
  }

  return u32(clamp(angle, 0, QUARTER_TURN_BAM));
}

fn cordic_sin_q15(angle_bam: u32) -> u32 {
  if (angle_bam == 0u) {
    return 0u;
  }
  if (angle_bam >= u32(QUARTER_TURN_BAM)) {
    return u32(Q15_ONE);
  }

  var x = CORDIC_GAIN_Q15;
  var y = 0;
  var remaining = i32(angle_bam);

  for (var iteration = 0u; iteration < 15u; iteration = iteration + 1u) {
    let x_shift = x >> iteration;
    let y_shift = y >> iteration;
    if (remaining >= 0) {
      x = x - y_shift;
      y = y + x_shift;
      remaining = remaining - CORDIC_ATAN_BAM[iteration];
    } else {
      x = x + y_shift;
      y = y - x_shift;
      remaining = remaining + CORDIC_ATAN_BAM[iteration];
    }
  }

  return u32(clamp(y, 0, Q15_ONE));
}

fn blend_component_q14(
  from_component: i32,
  to_component: i32,
  from_weight_q15: i32,
  to_weight_q15: i32,
) -> i32 {
  let weighted =
    from_component * from_weight_q15 + to_component * to_weight_q15;
  return round_shift_15_symmetric(weighted);
}

fn normalized_q14_or_identity(value: vec4<i32>) -> vec4<i32> {
  let norm_squared = quaternion_norm_squared_q28(value);
  if (norm_squared == 0u) {
    return vec4<i32>(0, 0, 0, Q14_ONE);
  }

  let norm_q14 = integer_sqrt_u32(norm_squared);
  if (norm_q14 == 0u) {
    return vec4<i32>(0, 0, 0, Q14_ONE);
  }

  let divisor = i32(norm_q14);
  return vec4<i32>(
    (value.x * Q14_ONE) / divisor,
    (value.y * Q14_ONE) / divisor,
    (value.z * Q14_ONE) / divisor,
    (value.w * Q14_ONE) / divisor,
  );
}

@compute @workgroup_size(${QUATERNION_INTERPOLATION_WORKGROUP_SIZE})
fn ${QUATERNION_INTERPOLATION_KERNEL_NAME}(
  @builtin(global_invocation_id) global_id: vec3<u32>,
) {
  let case_index = global_id.x;
  if (
    case_index >= arrayLength(&interpolation_cases) ||
    case_index >= arrayLength(&interpolated_q14)
  ) {
    return;
  }

  let interpolation_case = interpolation_cases[case_index];
  let from_q14 = interpolation_case.from_q14;
  var to_q14 = interpolation_case.to_q14;

  // A zero quaternion is invalid and has no stable rotation interpretation.
  if (
    quaternion_norm_squared_q28(from_q14) == 0u ||
    quaternion_norm_squared_q28(to_q14) == 0u
  ) {
    interpolated_q14[case_index] = vec4<i32>(0, 0, 0, Q14_ONE);
    return;
  }

  var shortest_dot_q28 = dot_q28(from_q14, to_q14);
  if (shortest_dot_q28 < 0) {
    to_q14 = -to_q14;
    shortest_dot_q28 = -shortest_dot_q28;
  }

  let dot_q15 = clamp(round_shift_13_symmetric(shortest_dot_q28), 0, Q15_ONE);
  let t_q15 = min(interpolation_case.t_q15, u32(Q15_ONE));

  // Near-parallel quaternions use normalized linear interpolation.
  var from_weight_q15 = Q15_ONE - i32(t_q15);
  var to_weight_q15 = i32(t_q15);

  if (dot_q15 < NEAR_DOT_Q15) {
    let dot_u32 = u32(dot_q15);
    let radicand_q30 = 1073741824u - dot_u32 * dot_u32;
    let y_q15 = integer_sqrt_u32(radicand_q30);
    let theta_bam = cordic_atan2_first_quadrant_bam(y_q15, dot_u32);

    let from_angle_bam = u32(round_shift_15_symmetric(
      i32(u32(Q15_ONE) - t_q15) * i32(theta_bam),
    ));
    let to_angle_bam = u32(round_shift_15_symmetric(
      i32(t_q15) * i32(theta_bam),
    ));

    let sin_theta_q15 = cordic_sin_q15(theta_bam);
    if (sin_theta_q15 != 0u) {
      let sin_from_q15 = cordic_sin_q15(from_angle_bam);
      let sin_to_q15 = cordic_sin_q15(to_angle_bam);
      from_weight_q15 = i32((sin_from_q15 << 15u) / sin_theta_q15);
      to_weight_q15 = i32((sin_to_q15 << 15u) / sin_theta_q15);
    }
  }

  let blended_q14 = vec4<i32>(
    blend_component_q14(from_q14.x, to_q14.x, from_weight_q15, to_weight_q15),
    blend_component_q14(from_q14.y, to_q14.y, from_weight_q15, to_weight_q15),
    blend_component_q14(from_q14.z, to_q14.z, from_weight_q15, to_weight_q15),
    blend_component_q14(from_q14.w, to_q14.w, from_weight_q15, to_weight_q15),
  );

  interpolated_q14[case_index] = normalized_q14_or_identity(blended_q14);
}
`;
