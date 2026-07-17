/**
 * Integer quaternion-interpolation contract used by the Paper 6 conformance experiment.
 *
 * This is deliberately not the shipped AnimationClip policy (which is shortest-arc nlerp),
 * and it is not MinimaxSLERP. It is a fixed-point, CORDIC approximation of shortest-arc
 * SLERP whose claimed output is the encoded i32 byte sequence. The WebGPU implementation
 * uses only WGSL i32/u32 operations; this independent oracle uses BigInt throughout.
 */

export const QUATERNION_INTERPOLATION_CONTRACT_VERSION = 'paper6-q14-cordic-slerp-v1' as const;

export const QUATERNION_Q14_ONE = 16_384;
export const WEIGHT_Q15_ONE = 32_768;
export const NEAR_ALIGNED_DOT_Q15 = 32_760;
export const CORDIC_GAIN_Q15 = 19_898;

/** atan(2^-i) in BAM16, where one complete turn is 65,536 units. */
export const CORDIC_ATAN_BAM16 = [
  8192, 4836, 2555, 1297, 651, 326, 163, 81, 41, 20, 10, 5, 3, 1, 1,
] as const;

export type QuaternionQ14 = readonly [number, number, number, number];

export interface QuaternionInterpolationCase {
  readonly id: string;
  readonly from: QuaternionQ14;
  readonly to: QuaternionQ14;
  /** Unsigned interpolation fraction on [0, 32768], where 32768 is exactly one. */
  readonly tQ15: number;
}

const Q14 = BigInt(QUATERNION_Q14_ONE);
const Q15 = BigInt(WEIGHT_Q15_ONE);
const NEAR_DOT = BigInt(NEAR_ALIGNED_DOT_Q15);
const CORDIC_GAIN = BigInt(CORDIC_GAIN_Q15);
const ATAN_TABLE = CORDIC_ATAN_BAM16.map(BigInt);

function clampBigInt(value: bigint, minimum: bigint, maximum: bigint): bigint {
  return value < minimum ? minimum : value > maximum ? maximum : value;
}

/** Symmetric round-to-nearest with midpoint ties away from zero. */
function roundShiftSigned(value: bigint, bits: bigint): bigint {
  if (bits <= 0n) return value;
  const half = 1n << (bits - 1n);
  return value >= 0n ? (value + half) >> bits : -((-value + half) >> bits);
}

/** Floor(sqrt(value)); all contract callers pass a non-negative u32-range value. */
function integerSqrt(value: bigint): bigint {
  if (value < 0n) throw new RangeError('integerSqrt requires a non-negative value');
  if (value < 2n) return value;

  let estimate = value;
  let next = (estimate + 1n) >> 1n;
  while (next < estimate) {
    estimate = next;
    next = (estimate + value / estimate) >> 1n;
  }
  return estimate;
}

function cordicAtan2FirstQuadrantBam16(yInput: bigint, xInput: bigint): bigint {
  if (yInput === 0n) return 0n;
  if (xInput === 0n) return 16_384n;

  let x = xInput;
  let y = yInput;
  let angle = 0n;
  for (let index = 0; index < ATAN_TABLE.length; index += 1) {
    const shift = BigInt(index);
    const previousX = x;
    if (y > 0n) {
      x += y >> shift;
      y -= previousX >> shift;
      angle += ATAN_TABLE[index];
    } else {
      x -= y >> shift;
      y += previousX >> shift;
      angle -= ATAN_TABLE[index];
    }
  }
  return clampBigInt(angle, 0n, 16_384n);
}

function cordicSinQ15(angleInput: bigint): bigint {
  if (angleInput === 0n) return 0n;
  if (angleInput === 16_384n) return Q15;

  let x = CORDIC_GAIN;
  let y = 0n;
  let angle = clampBigInt(angleInput, 0n, 16_384n);
  for (let index = 0; index < ATAN_TABLE.length; index += 1) {
    const shift = BigInt(index);
    const previousX = x;
    if (angle >= 0n) {
      x -= y >> shift;
      y += previousX >> shift;
      angle -= ATAN_TABLE[index];
    } else {
      x += y >> shift;
      y -= previousX >> shift;
      angle += ATAN_TABLE[index];
    }
  }
  return clampBigInt(y, 0n, Q15);
}

function normalizeQ14(values: readonly bigint[]): QuaternionQ14 {
  const normSquared = values.reduce((sum, value) => sum + value * value, 0n);
  const norm = integerSqrt(normSquared);
  if (norm === 0n) return [0, 0, 0, QUATERNION_Q14_ONE];

  return values.map((value) => {
    const magnitude = ((value < 0n ? -value : value) << 14n) / norm;
    return Number(value < 0n ? -magnitude : magnitude);
  }) as unknown as QuaternionQ14;
}

function validateCase(testCase: QuaternionInterpolationCase): void {
  if (!Number.isInteger(testCase.tQ15) || testCase.tQ15 < 0 || testCase.tQ15 > WEIGHT_Q15_ONE) {
    throw new RangeError(`${testCase.id}: tQ15 must be an integer on [0, ${WEIGHT_Q15_ONE}]`);
  }
  for (const [name, quaternion] of [
    ['from', testCase.from],
    ['to', testCase.to],
  ] as const) {
    for (const component of quaternion) {
      if (
        !Number.isInteger(component) ||
        component < -QUATERNION_Q14_ONE ||
        component > QUATERNION_Q14_ONE
      ) {
        throw new RangeError(
          `${testCase.id}: ${name} component must be an integer on ` +
            `[-${QUATERNION_Q14_ONE}, ${QUATERNION_Q14_ONE}]`
        );
      }
    }
    const normSquared = quaternion.reduce((sum, component) => sum + BigInt(component) ** 2n, 0n);
    const minimumNorm = Q14 - 2n;
    const maximumNorm = Q14 + 2n;
    if (normSquared < minimumNorm * minimumNorm || normSquared > maximumNorm * maximumNorm) {
      throw new RangeError(`${testCase.id}: ${name} is not a canonical Q14 unit quaternion`);
    }
  }
}

/**
 * Independent BigInt oracle for the integer WGSL schedule.
 *
 * The raw Q28 dot selects the shortest-arc sign before any approximation. The ordinary
 * branch computes theta=atan2(sqrt(1-dot^2), dot), evaluates the two sine weights with
 * integer CORDIC, blends in Q14, and integer-normalizes the result.
 */
export function slerpQuaternionQ14Oracle(testCase: QuaternionInterpolationCase): QuaternionQ14 {
  validateCase(testCase);

  const from = testCase.from.map(BigInt);
  let to = testCase.to.map(BigInt);
  let dotQ28 = from.reduce((sum, component, index) => sum + component * to[index], 0n);
  if (dotQ28 < 0n) {
    dotQ28 = -dotQ28;
    to = to.map((component) => -component);
  }

  const dotQ15 = clampBigInt(roundShiftSigned(dotQ28, 13n), 0n, Q15);
  const t = BigInt(testCase.tQ15);
  let weightFrom: bigint;
  let weightTo: bigint;

  if (dotQ15 >= NEAR_DOT) {
    weightFrom = Q15 - t;
    weightTo = t;
  } else {
    const sineTheta = integerSqrt(Q15 * Q15 - dotQ15 * dotQ15);
    const theta = cordicAtan2FirstQuadrantBam16(sineTheta, dotQ15);
    const denominator = cordicSinQ15(theta);
    if (denominator === 0n) {
      weightFrom = Q15 - t;
      weightTo = t;
    } else {
      const angleFrom = roundShiftSigned((Q15 - t) * theta, 15n);
      const angleTo = roundShiftSigned(t * theta, 15n);
      weightFrom = (cordicSinQ15(angleFrom) << 15n) / denominator;
      weightTo = (cordicSinQ15(angleTo) << 15n) / denominator;
    }
  }

  const blended = from.map((component, index) =>
    roundShiftSigned(weightFrom * component + weightTo * to[index], 15n)
  );
  return normalizeQ14(blended);
}

const IDENTITY: QuaternionQ14 = [0, 0, 0, 16_384];
const X_90: QuaternionQ14 = [11_585, 0, 0, 11_585];
const Y_90: QuaternionQ14 = [0, 11_585, 0, 11_585];
const Z_90: QuaternionQ14 = [0, 0, 11_585, 11_585];
const X_180: QuaternionQ14 = [16_384, 0, 0, 0];
const Y_180: QuaternionQ14 = [0, 16_384, 0, 0];
const BALANCED: QuaternionQ14 = [8192, 8192, 8192, 8192];
const BALANCED_SIGNED: QuaternionQ14 = [-8192, 8192, -8192, 8192];
const ADVERSARIAL_A: QuaternionQ14 = [13_439, -4682, 4847, -6513];
const ADVERSARIAL_B: QuaternionQ14 = [-1792, 2065, 4440, -15_532];
const NEAR_IDENTITY: QuaternionQ14 = [16, 0, 0, 16_384];

const PAIRS: ReadonlyArray<readonly [string, QuaternionQ14, QuaternionQ14]> = [
  ['identity-x90', IDENTITY, X_90],
  ['identity-y90', IDENTITY, Y_90],
  ['identity-z90', IDENTITY, Z_90],
  ['identity-x180', IDENTITY, X_180],
  ['identity-y180', IDENTITY, Y_180],
  ['balanced-signed', BALANCED, BALANCED_SIGNED],
  ['adversarial', ADVERSARIAL_A, ADVERSARIAL_B],
  ['antipodal', ADVERSARIAL_A, ADVERSARIAL_A.map((value) => -value) as unknown as QuaternionQ14],
  ['near-aligned', IDENTITY, NEAR_IDENTITY],
];

const T_VALUES = [0, 1, 4096, 8192, 16_384, 24_576, 32_767, 32_768] as const;

/** Frozen, adversarial byte-level corpus shared by the oracle and GPU receipt harness. */
export const PAPER6_Q14_SLERP_CASES: readonly QuaternionInterpolationCase[] = PAIRS.flatMap(
  ([pairId, from, to]) =>
    T_VALUES.map((tQ15) => ({
      id: `${pairId}-t${tQ15}`,
      from,
      to,
      tQ15,
    }))
);

/**
 * Encode each case as a 48-byte storage-buffer row matching the independent WGSL struct:
 * from[4] i32, to[4] i32, t u32, case id u32, and two explicit padding words.
 */
export function encodeQuaternionInterpolationCases(
  cases: readonly QuaternionInterpolationCase[]
): Int32Array {
  const words = new Int32Array(cases.length * 12);
  cases.forEach((testCase, caseIndex) => {
    validateCase(testCase);
    const offset = caseIndex * 12;
    words.set(testCase.from, offset);
    words.set(testCase.to, offset + 4);
    words[offset + 8] = testCase.tQ15;
    words[offset + 9] = caseIndex;
  });
  return words;
}

export function encodeQuaternionInterpolationOracleResults(
  cases: readonly QuaternionInterpolationCase[]
): Int32Array {
  const words = new Int32Array(cases.length * 4);
  cases.forEach((testCase, caseIndex) => {
    words.set(slerpQuaternionQ14Oracle(testCase), caseIndex * 4);
  });
  return words;
}
