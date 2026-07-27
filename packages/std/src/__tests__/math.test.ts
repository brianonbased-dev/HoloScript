import { describe, it, expect } from 'vitest';
import {
  PI,
  TAU,
  HALF_PI,
  DEG_TO_RAD,
  RAD_TO_DEG,
  EPSILON,
  clamp,
  lerp,
  inverseLerp,
  remap,
  clampF32,
  lerpF32,
  inverseLerpF32,
  remapF32,
  clampFiniteF32,
  lerpFiniteF32,
  inverseLerpFiniteF32,
  remapFiniteF32,
  clampFiniteF64,
  lerpFiniteF64,
  inverseLerpFiniteF64,
  remapFiniteF64,
  smoothstep,
  smootherstep,
  degToRad,
  radToDeg,
  mod,
  fract,
  sign,
  step,
} from '../math.js';

describe('finite-only floating ABI references', () => {
  it('matches the finite f32 and f64 reference results', () => {
    expect(clampFiniteF32(1.00000007, 0, 2)).toBe(1.0000001192092896);
    expect(lerpFiniteF32(16_777_216, 16_777_218, 0.5)).toBe(16_777_216);
    expect(inverseLerpFiniteF32(0, 10, 1)).toBe(0.10000000149011612);
    expect(remapFiniteF32(0.1, 0, 1, 10, 18)).toBe(10.800000190734863);
    expect(clampFiniteF64(1.25, 0, 2)).toBe(1.25);
    expect(lerpFiniteF64(2, 10, 0.25)).toBe(4);
    expect(inverseLerpFiniteF64(2, 10, 4)).toBe(0.25);
    expect(remapFiniteF64(0.25, 0, 1, 10, 18)).toBe(12);
  });

  it('fails closed on non-finite inputs, zero divisors, and overflow results', () => {
    expect(() => clampFiniteF64(Number.NaN, 0, 1)).toThrow('requires finite f64');
    expect(() => lerpFiniteF64(Number.MAX_VALUE, -Number.MAX_VALUE, 2)).toThrow(
      'produced a non-finite f64 result'
    );
    expect(() => inverseLerpFiniteF64(1, 1, 1)).toThrow('rejects division by zero');
    expect(() => clampFiniteF32(Number.POSITIVE_INFINITY, 0, 1)).toThrow(
      'requires finite rounded f32'
    );
    expect(() => lerpFiniteF32(3.4e38, -3.4e38, 2)).toThrow(
      'produced a non-finite rounded f32 result'
    );
    expect(() => inverseLerpFiniteF32(1, 1, 1)).toThrow('rejects division by zero');
  });
});

describe('Math Constants', () => {
  it('PI should be Math.PI', () => {
    expect(PI).toBe(Math.PI);
  });

  it('TAU should be 2 * PI', () => {
    expect(TAU).toBe(Math.PI * 2);
  });

  it('HALF_PI should be PI / 2', () => {
    expect(HALF_PI).toBe(Math.PI / 2);
  });

  it('DEG_TO_RAD should convert degrees to radians', () => {
    expect(DEG_TO_RAD).toBe(Math.PI / 180);
  });

  it('RAD_TO_DEG should convert radians to degrees', () => {
    expect(RAD_TO_DEG).toBe(180 / Math.PI);
  });

  it('EPSILON should be a small value for float comparison', () => {
    expect(EPSILON).toBe(1e-6);
  });
});

describe('clamp', () => {
  it('should return min when value is below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('should return max when value is above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('should return value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('should handle edge cases at boundaries', () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('should work with negative ranges', () => {
    expect(clamp(-5, -10, -1)).toBe(-5);
    expect(clamp(-15, -10, -1)).toBe(-10);
  });
});

describe('lerp', () => {
  it('should return a when t is 0', () => {
    expect(lerp(0, 10, 0)).toBe(0);
  });

  it('should return b when t is 1', () => {
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('should return midpoint when t is 0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('should extrapolate when t > 1', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });

  it('should work with negative values', () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });
});

describe('inverseLerp', () => {
  it('should return 0 when value equals a', () => {
    expect(inverseLerp(0, 10, 0)).toBe(0);
  });

  it('should return 1 when value equals b', () => {
    expect(inverseLerp(0, 10, 10)).toBe(1);
  });

  it('should return 0.5 when value is midpoint', () => {
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
  });

  it('should work with negative ranges', () => {
    expect(inverseLerp(-10, 10, 0)).toBe(0.5);
  });
});

describe('remap', () => {
  it('should remap 0-1 to 0-100', () => {
    expect(remap(0.5, 0, 1, 0, 100)).toBe(50);
  });

  it('should remap between different ranges', () => {
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });

  it('should handle inverted output ranges', () => {
    expect(remap(0, 0, 10, 100, 0)).toBe(100);
    expect(remap(10, 0, 10, 100, 0)).toBe(0);
  });
});

describe('binary32 math', () => {
  it('rounds interpolation after every arithmetic operation', () => {
    expect(lerpF32(16_777_216, 16_777_218, 0.5)).toBe(16_777_216);
    expect(lerp(16_777_216, 16_777_218, 0.5)).toBe(16_777_217);
  });

  it('keeps clamp, inverse-lerp, and remap results in binary32', () => {
    expect(clampF32(1.00000007, 0, 2)).toBe(Math.fround(1.00000007));
    expect(inverseLerpF32(0, 10, 1)).toBe(Math.fround(0.1));
    expect(remapF32(0.1, 0, 1, 10, 18)).toBe(Math.fround(10.8));
  });
});

describe('smoothstep', () => {
  it('should return 0 when x <= edge0', () => {
    expect(smoothstep(0, 1, -0.5)).toBe(0);
    expect(smoothstep(0, 1, 0)).toBe(0);
  });

  it('should return 1 when x >= edge1', () => {
    expect(smoothstep(0, 1, 1)).toBe(1);
    expect(smoothstep(0, 1, 1.5)).toBe(1);
  });

  it('should return smooth interpolation in between', () => {
    const mid = smoothstep(0, 1, 0.5);
    expect(mid).toBe(0.5);
  });
});

describe('smootherstep', () => {
  it('should return 0 when x <= edge0', () => {
    expect(smootherstep(0, 1, 0)).toBe(0);
  });

  it('should return 1 when x >= edge1', () => {
    expect(smootherstep(0, 1, 1)).toBe(1);
  });

  it('should return smooth interpolation at midpoint', () => {
    const mid = smootherstep(0, 1, 0.5);
    expect(mid).toBe(0.5);
  });
});

describe('degToRad', () => {
  it('should convert 0 degrees to 0 radians', () => {
    expect(degToRad(0)).toBe(0);
  });

  it('should convert 180 degrees to PI radians', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
  });

  it('should convert 360 degrees to 2*PI radians', () => {
    expect(degToRad(360)).toBeCloseTo(2 * Math.PI);
  });

  it('should convert 90 degrees to PI/2 radians', () => {
    expect(degToRad(90)).toBeCloseTo(Math.PI / 2);
  });
});

describe('radToDeg', () => {
  it('should convert 0 radians to 0 degrees', () => {
    expect(radToDeg(0)).toBe(0);
  });

  it('should convert PI radians to 180 degrees', () => {
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });

  it('should convert 2*PI radians to 360 degrees', () => {
    expect(radToDeg(2 * Math.PI)).toBeCloseTo(360);
  });
});

describe('mod', () => {
  it('should handle positive modulo', () => {
    expect(mod(7, 3)).toBe(1);
  });

  it('should handle negative values correctly (always positive result)', () => {
    expect(mod(-1, 3)).toBe(2);
    expect(mod(-4, 3)).toBe(2);
  });

  it('should return 0 for exact multiples', () => {
    expect(mod(6, 3)).toBe(0);
  });
});

describe('fract', () => {
  it('should return fractional part of positive numbers', () => {
    expect(fract(3.7)).toBeCloseTo(0.7);
  });

  it('should return 0 for integers', () => {
    expect(fract(5)).toBe(0);
  });

  it('should handle negative numbers', () => {
    expect(fract(-3.3)).toBeCloseTo(0.7);
  });
});

describe('sign', () => {
  it('should return 1 for positive numbers', () => {
    expect(sign(5)).toBe(1);
    expect(sign(0.001)).toBe(1);
  });

  it('should return -1 for negative numbers', () => {
    expect(sign(-5)).toBe(-1);
    expect(sign(-0.001)).toBe(-1);
  });

  it('should return 0 for zero', () => {
    expect(sign(0)).toBe(0);
  });
});

describe('step', () => {
  it('should return 0 when x < edge', () => {
    expect(step(0.5, 0.3)).toBe(0);
  });

  it('should return 1 when x >= edge', () => {
    expect(step(0.5, 0.5)).toBe(1);
    expect(step(0.5, 0.7)).toBe(1);
  });
});
