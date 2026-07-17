import { describe, expect, it } from 'vitest';
import {
  PAPER6_Q14_SLERP_CASES,
  QUATERNION_Q14_ONE,
  WEIGHT_Q15_ONE,
  encodeQuaternionInterpolationCases,
  encodeQuaternionInterpolationOracleResults,
  slerpQuaternionQ14Oracle,
  type QuaternionInterpolationCase,
  type QuaternionQ14,
} from '../QuaternionInterpolationContract';

function normalize(values: readonly number[]): number[] {
  const norm = Math.hypot(...values);
  return norm === 0 ? [0, 0, 0, 1] : values.map((value) => value / norm);
}

function referenceSlerp(testCase: QuaternionInterpolationCase): number[] {
  const from = normalize(testCase.from);
  let to = normalize(testCase.to);
  let dot = from.reduce((sum, component, index) => sum + component * to[index], 0);
  if (dot < 0) {
    dot = -dot;
    to = to.map((component) => -component);
  }

  const t = testCase.tQ15 / WEIGHT_Q15_ONE;
  if (dot > 0.9995) {
    return normalize(from.map((component, index) => (1 - t) * component + t * to[index]));
  }

  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  const denominator = Math.sin(theta);
  return normalize(
    from.map(
      (component, index) =>
        (Math.sin((1 - t) * theta) / denominator) * component +
        (Math.sin(t * theta) / denominator) * to[index]
    )
  );
}

function orientationErrorRadians(actualQ14: QuaternionQ14, expected: readonly number[]): number {
  const actual = normalize(actualQ14.map((component) => component / QUATERNION_Q14_ONE));
  const dot = Math.abs(
    actual.reduce((sum, component, index) => sum + component * expected[index], 0)
  );
  return 2 * Math.acos(Math.min(1, dot));
}

function makeXorShift(seed = 0x6d2b79f5): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function randomQuaternionQ14(random: () => number): QuaternionQ14 {
  let values: number[];
  do {
    values = Array.from({ length: 4 }, () => random() * 2 - 1);
  } while (Math.hypot(...values) < 1e-9);
  return normalize(values).map((value) => Math.round(value * QUATERNION_Q14_ONE)) as QuaternionQ14;
}

describe('Paper 6 integer quaternion interpolation contract', () => {
  it('freezes an aligned 48-byte input row and 16-byte output row per case', () => {
    const input = encodeQuaternionInterpolationCases(PAPER6_Q14_SLERP_CASES);
    const output = encodeQuaternionInterpolationOracleResults(PAPER6_Q14_SLERP_CASES);

    expect(PAPER6_Q14_SLERP_CASES).toHaveLength(72);
    expect(input.byteLength).toBe(PAPER6_Q14_SLERP_CASES.length * 48);
    expect(output.byteLength).toBe(PAPER6_Q14_SLERP_CASES.length * 16);
    expect(input[9]).toBe(0);
    expect(input[21]).toBe(1);
  });

  it('preserves endpoints modulo the quaternion antipodal equivalence', () => {
    for (const testCase of PAPER6_Q14_SLERP_CASES) {
      if (testCase.tQ15 !== 0 && testCase.tQ15 !== WEIGHT_Q15_ONE) continue;
      const result = slerpQuaternionQ14Oracle(testCase);
      const expected = testCase.tQ15 === 0 ? testCase.from : testCase.to;
      expect(orientationErrorRadians(result, normalize(expected))).toBeLessThan(0.0002);
    }
  });

  it('takes the geodesic midpoint for an identity-to-180-degree rotation', () => {
    const midpoint = PAPER6_Q14_SLERP_CASES.find(
      (testCase) => testCase.id === 'identity-x180-t16384'
    );
    expect(midpoint).toBeDefined();
    expect(slerpQuaternionQ14Oracle(midpoint!)).toEqual([11_585, 0, 0, 11_585]);
  });

  it('selects the same shortest arc for antipodal endpoints', () => {
    const start = PAPER6_Q14_SLERP_CASES.find((testCase) => testCase.id === 'antipodal-t0')!;
    for (const testCase of PAPER6_Q14_SLERP_CASES.filter((item) =>
      item.id.startsWith('antipodal-')
    )) {
      expect(slerpQuaternionQ14Oracle(testCase)).toEqual(start.from);
    }
  });

  it('stays within the exploratory angular-error budget on a seeded adversarial sweep', () => {
    const random = makeXorShift();
    let maximumError = 0;
    for (let index = 0; index < 10_000; index += 1) {
      const testCase: QuaternionInterpolationCase = {
        id: `seeded-${index}`,
        from: randomQuaternionQ14(random),
        to: randomQuaternionQ14(random),
        tQ15: Math.floor(random() * (WEIGHT_Q15_ONE + 1)),
      };
      const actual = slerpQuaternionQ14Oracle(testCase);
      maximumError = Math.max(
        maximumError,
        orientationErrorRadians(actual, referenceSlerp(testCase))
      );
    }

    // Calibration threshold, not a mathematical global bound: 0.0015 rad ~= 0.086 degrees.
    expect(maximumError).toBeLessThan(0.0015);
  });

  it('fails closed on non-canonical inputs', () => {
    expect(() =>
      slerpQuaternionQ14Oracle({
        id: 'zero-input',
        from: [0, 0, 0, 0],
        to: [0, 0, 0, QUATERNION_Q14_ONE],
        tQ15: 0,
      })
    ).toThrow(/canonical Q14 unit quaternion/);

    expect(() =>
      slerpQuaternionQ14Oracle({
        id: 'invalid-time',
        from: [0, 0, 0, QUATERNION_Q14_ONE],
        to: [0, 0, 0, QUATERNION_Q14_ONE],
        tQ15: WEIGHT_Q15_ONE + 1,
      })
    ).toThrow(/tQ15/);

    expect(() =>
      slerpQuaternionQ14Oracle({
        id: 'outside-norm-tolerance-despite-floor',
        from: [QUATERNION_Q14_ONE, 300, 0, 0],
        to: [0, 0, 0, QUATERNION_Q14_ONE],
        tQ15: 0,
      })
    ).toThrow(/canonical Q14 unit quaternion/);
  });
});
