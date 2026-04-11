/**
 * curveEasing.ts
 *
 * Pure easing functions for keyframe animation.
 * All functions take t ∈ [0, 1] and return a value ∈ [0, 1].
 *
 * Used by the keyframe timeline and AnimationClip exporter.
 */

export type EasingFn = (t: number) => number;
export type EasingName =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'bounce'
  | 'elastic'
  | 'back';

// ── Basic ───────────────────────────────────────────────────────────────────

export const linear: EasingFn = (t) => t;

// Quadratic
export const easeInQuad: EasingFn = (t) => t * t;
export const easeOutQuad: EasingFn = (t) => t * (2 - t);
export const easeInOutQuad: EasingFn = (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);

// Cubic
export const easeInCubic: EasingFn = (t) => t * t * t;
export const easeOutCubic: EasingFn = (t) => --t * t * t + 1;
export const easeInOutCubic: EasingFn = (t) =>
  t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1;

// Quartic
export const easeInQuart: EasingFn = (t) => t * t * t * t;
export const easeOutQuart: EasingFn = (t) => 1 - --t * t * t * t;
export const easeInOutQuart: EasingFn = (t) =>
  t < 0.5 ? 8 * t * t * t * t : 1 - 8 * --t * t * t * t;

// Sine
export const easeInSine: EasingFn = (t) => 1 - Math.cos((t * Math.PI) / 2);
export const easeOutSine: EasingFn = (t) => Math.sin((t * Math.PI) / 2);
export const easeInOutSine: EasingFn = (t) => -(Math.cos(Math.PI * t) - 1) / 2;

// Exponential
export const easeInExpo: EasingFn = (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10));
export const easeOutExpo: EasingFn = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutExpo: EasingFn = (t) =>
  t === 0
    ? 0
    : t === 1
      ? 1
      : t < 0.5
        ? Math.pow(2, 20 * t - 10) / 2
        : (2 - Math.pow(2, -20 * t + 10)) / 2;

// ── Special ─────────────────────────────────────────────────────────────────

export const easeInBack: EasingFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return c3 * t * t * t - c1 * t * t;
};

export const easeOutBack: EasingFn = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

export const easeInOutBack: EasingFn = (t) => {
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  return t < 0.5
    ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
    : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2;
};

export const easeOutBounce: EasingFn = (t) => {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
};

export const easeInBounce: EasingFn = (t) => 1 - easeOutBounce(1 - t);
export const easeInOutBounce: EasingFn = (t) =>
  t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;

export const easeInElastic: EasingFn = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
};

export const easeOutElastic: EasingFn = (t) => {
  if (t === 0 || t === 1) return t;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

export const easeInOutElastic: EasingFn = (t) => {
  if (t === 0 || t === 1) return t;
  const c5 = (2 * Math.PI) / 4.5;
  return t < 0.5
    ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
    : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
};

// ── Cubic Bézier ─────────────────────────────────────────────────────────────

/**
 * CSS cubic-bezier(p1x, p1y, p2x, p2y) evaluator.
 * Uses Newton's method to solve for t given x, then evaluates y.
 * Matches the browser's cubic-bezier() timing function exactly.
 */
export function cubicBezier(p1x: number, p1y: number, p2x: number, p2y: number): EasingFn {
  const SAMPLE_SIZE = 11;
  const FLOAT_PRECISION = 1e-7;
  const NEWTON_ITERATIONS = 8;

  function a(a1: number, a2: number) {
    return 1.0 - 3.0 * a2 + 3.0 * a1;
  }
  function b(a1: number, a2: number) {
    return 3.0 * a2 - 6.0 * a1;
  }
  function c_(a1: number) {
    return 3.0 * a1;
  }

  function calcBezier(t: number, a1: number, a2: number) {
    return ((a(a1, a2) * t + b(a1, a2)) * t + c_(a1)) * t;
  }
  function getSlope(t: number, a1: number, a2: number) {
    return 3.0 * a(a1, a2) * t * t + 2.0 * b(a1, a2) * t + c_(a1);
  }

  // Build sample table
  const sampleValues = new Float32Array(SAMPLE_SIZE);
  for (let i = 0; i < SAMPLE_SIZE; ++i) {
    sampleValues[i] = calcBezier(i / (SAMPLE_SIZE - 1), p1x, p2x);
  }

  function getTForX(x: number) {
    let start = 0,
      i = 1;
    const dist = 1 / (SAMPLE_SIZE - 1);
    for (; i !== SAMPLE_SIZE - 1 && sampleValues[i]! <= x; ++i) start += dist;
    --i;
    let t = start + ((x - sampleValues[i]!) / (sampleValues[i + 1]! - sampleValues[i]!)) * dist;
    const slope = getSlope(t, p1x, p2x);
    if (slope !== 0) {
      for (let j = 0; j < NEWTON_ITERATIONS; ++j) {
        const cv = calcBezier(t, p1x, p2x) - x;
        const s = getSlope(t, p1x, p2x);
        if (Math.abs(s) < FLOAT_PRECISION) break;
        t -= cv / s;
      }
    }
    return t;
  }

  return (x: number) => {
    if (p1x === p1y && p2x === p2y) return x; // shortcuts for linear
    if (x === 0 || x === 1) return x;
    return calcBezier(getTForX(x), p1y, p2y);
  };
}

// ── Standard presets (matching CSS timing functions) ────────────────────────

export const CSS_EASE = cubicBezier(0.25, 0.1, 0.25, 1.0);
export const CSS_EASE_IN = cubicBezier(0.42, 0, 1.0, 1.0);
export const CSS_EASE_OUT = cubicBezier(0, 0, 0.58, 1.0);
export const CSS_EASE_IN_OUT = cubicBezier(0.42, 0, 0.58, 1.0);

// ── Apply easing to a keyframe interpolation ─────────────────────────────────

/**
 * Evaluate the eased value between two keyframes.
 * @param a  start value
 * @param b  end value
 * @param t  raw linear progress [0,1]
 * @param easingName  easing type (matches Keyframe.easing)
 */
export function applyEasing(
  a: number,
  b: number,
  t: number,
  easingName: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
): number {
  let et: number;
  switch (easingName) {
    case 'ease-in':
      et = easeInCubic(t);
      break;
    case 'ease-out':
      et = easeOutCubic(t);
      break;
    case 'ease-in-out':
      et = easeInOutCubic(t);
      break;
    default:
      et = t; // linear
  }
  return a + (b - a) * et;
}

/**
 * Evaluate a keyframe track with easing support.
 * Mirrors useKeyframes.evaluate() but honours the easing field.
 */
export function evaluateTrackWithEasing(
  keyframes: Array<{
    time: number;
    value: number;
    easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
  }>,
  currentTime: number
): number | null {
  if (keyframes.length === 0) return null;
  if (currentTime <= keyframes[0]!.time) return keyframes[0]!.value;
  if (currentTime >= keyframes[keyframes.length - 1]!.time)
    return keyframes[keyframes.length - 1]!.value;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (currentTime >= a.time && currentTime <= b.time) {
      const t = (currentTime - a.time) / (b.time - a.time);
      return applyEasing(a.value, b.value, t, b.easing);
    }
  }
  return null;
}

/**
 * Insert a keyframe into a sorted keyframes array (by time ascending).
 * Returns a new array — does not mutate the original.
 */
export function insertKeyframeSorted<T extends { time: number }>(keyframes: T[], kf: T): T[] {
  const copy = [...keyframes];
  const idx = copy.findIndex((k) => k.time > kf.time);
  if (idx === -1) copy.push(kf);
  else copy.splice(idx, 0, kf);
  return copy;
}
