/**
 * TemporalSmoother — Reduces jitter in per-frame values using Exponential
 * Moving Average (EMA).
 *
 * EMA formula:  smoothed_t = α · current + (1 − α) · smoothed_{t-1}
 *
 * α = 1.0  → no smoothing (raw values pass through)
 * α → 0.0  → very heavy smoothing / high lag
 * α = 0.8  → default; aggressive noise reduction with low latency
 *
 * Works for:
 *  - scalars          (number)
 *  - 2-D vectors      ([x, y])
 *  - 3-D vectors      ([x, y, z])
 *  - 4-D vectors      ([x, y, z, w])
 *  - plain JS objects (Record<string, number>) via `smoothRecord()`
 *
 * Usage:
 * ```ts
 * const smoother = new TemporalSmoother({ alpha: 0.8 });
 * smoother.smooth(rawDepth);     // scalar
 * smoother.smoothVec([x, y, z]); // vector
 * smoother.reset();              // clear history
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];
export type NumericVec = Vec2 | Vec3 | Vec4 | readonly number[];

/** Construction options. */
export interface TemporalSmootherOptions {
  /**
   * Smoothing factor α ∈ (0, 1].
   * Higher = more responsive; lower = smoother but laggier.
   * @default 0.8
   */
  alpha?: number;
  /**
   * When true, the first value passed sets the initial state directly
   * (no warm-up blending). Prevents a slow ramp-in on the first frame.
   * @default true
   */
  coldStart?: boolean;
}

// ── Core class ────────────────────────────────────────────────────────────────

/**
 * Stateful EMA smoother for a single tracked quantity.
 *
 * @typeParam T — The value type being smoothed (inferred from first call).
 */
export class TemporalSmoother {
  private readonly alpha: number;
  private readonly coldStart: boolean;

  private _state: number | null = null;

  constructor(options: TemporalSmootherOptions = {}) {
    const { alpha = 0.8, coldStart = true } = options;
    if (alpha <= 0 || alpha > 1) {
      throw new RangeError(`TemporalSmoother: alpha must be in (0, 1], got ${alpha}`);
    }
    this.alpha = alpha;
    this.coldStart = coldStart;
  }

  /** Current smoothed scalar value, or null if no data has been seen yet. */
  get state(): number | null {
    return this._state;
  }

  /**
   * Update with a new scalar observation and return the smoothed value.
   * On the first call, returns `current` directly (cold-start) or blends
   * it with 0 if `coldStart` is false.
   */
  smooth(current: number): number {
    if (this._state === null) {
      this._state = this.coldStart ? current : this.alpha * current;
    } else {
      this._state = this.alpha * current + (1 - this.alpha) * this._state;
    }
    return this._state;
  }

  /**
   * Reset the smoother to its initial state.
   * The next call to `smooth()` will treat the incoming value as the first.
   */
  reset(): void {
    this._state = null;
  }
}

// ── Vector smoother ───────────────────────────────────────────────────────────

/**
 * Stateful EMA smoother for numeric vector quantities.
 * Each component is smoothed independently.
 */
export class VectorTemporalSmoother {
  private readonly alpha: number;
  private readonly coldStart: boolean;
  private _state: number[] | null = null;

  constructor(options: TemporalSmootherOptions = {}) {
    const { alpha = 0.8, coldStart = true } = options;
    if (alpha <= 0 || alpha > 1) {
      throw new RangeError(`VectorTemporalSmoother: alpha must be in (0, 1], got ${alpha}`);
    }
    this.alpha = alpha;
    this.coldStart = coldStart;
  }

  /** Current smoothed vector, or null if no data has been seen. */
  get state(): readonly number[] | null {
    return this._state;
  }

  /**
   * Update with a new vector observation and return the smoothed vector.
   * The returned array is the same length as `current`.
   */
  smooth<T extends NumericVec>(current: T): T {
    if (this._state === null || this._state.length !== current.length) {
      this._state = this.coldStart
        ? Array.from(current)
        : current.map((v) => this.alpha * v);
    } else {
      for (let i = 0; i < current.length; i++) {
        this._state[i] = this.alpha * current[i] + (1 - this.alpha) * this._state[i];
      }
    }
    return this._state as unknown as T;
  }

  /** Reset internal state — next call is treated as a fresh start. */
  reset(): void {
    this._state = null;
  }
}

// ── Record smoother ───────────────────────────────────────────────────────────

/**
 * Stateful EMA smoother for plain objects with numeric values.
 * Useful for smoothing batches of named metrics.
 *
 * @example
 * ```ts
 * const sm = new RecordTemporalSmoother({ alpha: 0.7 });
 * const smoothed = sm.smooth({ depthMin: 0.1, depthMax: 3.4 });
 * ```
 */
export class RecordTemporalSmoother {
  private readonly alpha: number;
  private readonly coldStart: boolean;
  private _state: Record<string, number> | null = null;

  constructor(options: TemporalSmootherOptions = {}) {
    const { alpha = 0.8, coldStart = true } = options;
    if (alpha <= 0 || alpha > 1) {
      throw new RangeError(`RecordTemporalSmoother: alpha must be in (0, 1], got ${alpha}`);
    }
    this.alpha = alpha;
    this.coldStart = coldStart;
  }

  /** Current smoothed record, or null if no data has been seen. */
  get state(): Readonly<Record<string, number>> | null {
    return this._state;
  }

  /**
   * Update with a new record observation and return the smoothed record.
   * Keys absent in `current` retain their previous smoothed value.
   * New keys in `current` are initialised with the same cold-start rules.
   */
  smooth(current: Record<string, number>): Record<string, number> {
    if (this._state === null) {
      this._state = this.coldStart
        ? { ...current }
        : Object.fromEntries(Object.entries(current).map(([k, v]) => [k, this.alpha * v]));
      return { ...this._state };
    }

    for (const [k, v] of Object.entries(current)) {
      if (!(k in this._state)) {
        // First observation of this key
        this._state[k] = this.coldStart ? v : this.alpha * v;
      } else {
        this._state[k] = this.alpha * v + (1 - this.alpha) * this._state[k];
      }
    }

    return { ...this._state };
  }

  /** Reset internal state. */
  reset(): void {
    this._state = null;
  }
}

// ── Frame-rate-adaptive smoother ──────────────────────────────────────────────

/**
 * A time-adaptive EMA smoother that normalises α to a reference frame rate.
 *
 * When the actual frame interval deviates from `targetFps`, the effective
 * alpha is adjusted so that the smoothing *window* (in real time) remains
 * constant, preventing under/over-smoothing under variable frame rates.
 *
 * Formula:  α_eff = 1 − (1 − α)^(dt_actual / dt_target)
 *
 * @example
 * ```ts
 * const sm = new AdaptiveTemporalSmoother({ alpha: 0.8, targetFps: 60 });
 * // In your render loop:
 * const smoothed = sm.smooth(rawValue, deltaTimeMs);
 * ```
 */
export class AdaptiveTemporalSmoother {
  private readonly baseAlpha: number;
  private readonly targetDt: number; // target Δt in ms
  private readonly coldStart: boolean;
  private _state: number | null = null;

  constructor(options: TemporalSmootherOptions & { targetFps?: number } = {}) {
    const { alpha = 0.8, coldStart = true, targetFps = 60 } = options;
    if (alpha <= 0 || alpha > 1) {
      throw new RangeError(`AdaptiveTemporalSmoother: alpha must be in (0, 1], got ${alpha}`);
    }
    if (targetFps <= 0) {
      throw new RangeError(`AdaptiveTemporalSmoother: targetFps must be > 0, got ${targetFps}`);
    }
    this.baseAlpha = alpha;
    this.targetDt = 1000 / targetFps;
    this.coldStart = coldStart;
  }

  /** Compute the frame-rate-adjusted alpha for a given actual Δt (ms). */
  effectiveAlpha(dtMs: number): number {
    if (dtMs <= 0) return this.baseAlpha;
    const ratio = dtMs / this.targetDt;
    return 1 - Math.pow(1 - this.baseAlpha, ratio);
  }

  /**
   * Update with a new observation and the elapsed time since the last frame.
   * @param current  The raw observed value.
   * @param dtMs     Elapsed time since last call, in milliseconds.
   */
  smooth(current: number, dtMs: number): number {
    if (this._state === null) {
      this._state = this.coldStart ? current : this.effectiveAlpha(dtMs) * current;
    } else {
      const alpha = this.effectiveAlpha(dtMs);
      this._state = alpha * current + (1 - alpha) * this._state;
    }
    return this._state;
  }

  /** Reset internal state. */
  reset(): void {
    this._state = null;
  }
}

// ── Factory helpers ───────────────────────────────────────────────────────────

/**
 * Create a scalar `TemporalSmoother` with the given alpha.
 * @param alpha Smoothing factor ∈ (0, 1]. Default 0.8.
 */
export function createSmoother(alpha = 0.8): TemporalSmoother {
  return new TemporalSmoother({ alpha });
}

/**
 * Create a vector `VectorTemporalSmoother` with the given alpha.
 * @param alpha Smoothing factor ∈ (0, 1]. Default 0.8.
 */
export function createVectorSmoother(alpha = 0.8): VectorTemporalSmoother {
  return new VectorTemporalSmoother({ alpha });
}

/**
 * Convenience: apply a single-step EMA without retaining state.
 * Useful when state is managed externally.
 *
 * @param previous  Previous smoothed value (or null for cold start).
 * @param current   New raw observation.
 * @param alpha     Smoothing factor ∈ (0, 1]. Default 0.8.
 */
export function ema(previous: number | null, current: number, alpha = 0.8): number {
  if (previous === null) return current;
  return alpha * current + (1 - alpha) * previous;
}

/**
 * Convenience: apply a single-step EMA for a numeric array without state.
 *
 * @param previous  Previous smoothed vector (or null for cold start).
 * @param current   New raw observation vector.
 * @param alpha     Smoothing factor ∈ (0, 1]. Default 0.8.
 */
export function emaVec<T extends NumericVec>(
  previous: readonly number[] | null,
  current: T,
  alpha = 0.8,
): T {
  if (previous === null || previous.length !== current.length) {
    return Array.from(current) as unknown as T;
  }
  return current.map((v, i) => alpha * v + (1 - alpha) * previous[i]) as unknown as T;
}
