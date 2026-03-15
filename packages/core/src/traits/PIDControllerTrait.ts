/**
 * PIDController<T> Generic Trait - Configurable inner/outer loop timing,
 * setpoint tracking, velocity monitoring. Thread-safe for VR 90fps.
 *
 * Extended capabilities:
 *   - Cascade PID support (outer loop feeds inner loop setpoint)
 *   - Auto-tuning via Ziegler-Nichols method (ultimate gain + period)
 *   - Performance metrics (overshoot %, rise time, settling time, steady-state error)
 *   - Configurable output smoothing filter
 *
 * @version 2.0.0
 */

// ===========================================================================
// Types
// ===========================================================================

export interface PIDGains {
  kp: number;
  ki: number;
  kd: number;
}

export interface PIDConfig {
  gains: PIDGains;
  outputMin: number;
  outputMax: number;
  integralWindupLimit: number;
  derivativeFilterCoeff: number;
  innerLoopHz: number;
  outerLoopHz: number;
  deadband: number;
  /** Output smoothing filter coefficient (0 = no smoothing, 1 = maximum smoothing). */
  outputSmoothingCoeff: number;
}

export const DEFAULT_PID_CONFIG: PIDConfig = {
  gains: { kp: 1.0, ki: 0.1, kd: 0.05 },
  outputMin: -Infinity,
  outputMax: Infinity,
  integralWindupLimit: 100,
  derivativeFilterCoeff: 0.1,
  innerLoopHz: 90,
  outerLoopHz: 30,
  deadband: 0.001,
  outputSmoothingCoeff: 0,
};

export interface PIDState {
  setpoint: number;
  measurement: number;
  error: number;
  integral: number;
  derivative: number;
  previousError: number;
  output: number;
  velocity: number;
  lastInnerTick: number;
  lastOuterTick: number;
  tickCount: number;
  settled: boolean;
  /** Smoothed output (after optional low-pass filter). */
  smoothedOutput: number;
}

// ===========================================================================
// Performance metrics
// ===========================================================================

/**
 * Snapshot of dynamic PID performance, computed from step-response history.
 */
export interface PIDPerformanceMetrics {
  /** Maximum overshoot as a percentage of the step size (0 if no overshoot). */
  overshootPercent: number;
  /** Time in seconds from setpoint change to first reaching 90% of the step. */
  riseTimeS: number | null;
  /** Time in seconds from setpoint change until the error stays within 2% of the step. */
  settlingTimeS: number | null;
  /** Absolute steady-state error (average of last N samples). */
  steadyStateError: number;
  /** Total number of samples collected. */
  sampleCount: number;
}

// ===========================================================================
// Auto-tune result
// ===========================================================================

export type ZNTuningRule = 'classic' | 'some_overshoot' | 'no_overshoot';

export interface AutoTuneResult {
  /** Ultimate gain Ku at which sustained oscillation was detected. */
  ultimateGain: number;
  /** Ultimate period Tu in seconds. */
  ultimatePeriod: number;
  /** Computed gains using the selected Ziegler-Nichols tuning rule. */
  gains: PIDGains;
  /** The rule that was applied. */
  rule: ZNTuningRule;
}

// ===========================================================================
// Helpers
// ===========================================================================

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/**
 * Apply Ziegler-Nichols tuning formulas given Ku and Tu.
 */
function zieglerNicholsGains(Ku: number, Tu: number, rule: ZNTuningRule): PIDGains {
  switch (rule) {
    case 'classic':
      // Classic PID: Kp=0.6*Ku, Ki=1.2*Ku/Tu, Kd=0.075*Ku*Tu
      return { kp: 0.6 * Ku, ki: (1.2 * Ku) / Tu, kd: 0.075 * Ku * Tu };
    case 'some_overshoot':
      // Kp=0.33*Ku, Ki=0.66*Ku/Tu, Kd=0.11*Ku*Tu
      return { kp: 0.33 * Ku, ki: (0.66 * Ku) / Tu, kd: 0.11 * Ku * Tu };
    case 'no_overshoot':
      // Kp=0.2*Ku, Ki=0.4*Ku/Tu, Kd=0.066*Ku*Tu
      return { kp: 0.2 * Ku, ki: (0.4 * Ku) / Tu, kd: 0.066 * Ku * Tu };
  }
}

// ===========================================================================
// Performance tracker (internal)
// ===========================================================================

interface StepResponseSample {
  timeS: number;
  measurement: number;
  setpoint: number;
  error: number;
}

class PerformanceTracker {
  private samples: StepResponseSample[] = [];
  private stepStartTime: number | null = null;
  private stepSize: number = 0;
  private stepTarget: number = 0;
  private readonly windowSize = 20;

  /** Call when the setpoint changes to begin a new step-response measurement. */
  onSetpointChange(newSetpoint: number, previousSetpoint: number, currentTimeS: number): void {
    this.samples = [];
    this.stepStartTime = currentTimeS;
    this.stepSize = Math.abs(newSetpoint - previousSetpoint);
    this.stepTarget = newSetpoint;
  }

  /** Record a measurement sample. */
  record(measurement: number, setpoint: number, timeS: number): void {
    this.samples.push({ timeS, measurement, setpoint, error: setpoint - measurement });
  }

  /** Compute metrics from recorded step-response. */
  compute(): PIDPerformanceMetrics {
    if (this.samples.length === 0 || this.stepStartTime === null || this.stepSize === 0) {
      return {
        overshootPercent: 0,
        riseTimeS: null,
        settlingTimeS: null,
        steadyStateError: 0,
        sampleCount: 0,
      };
    }

    const target = this.stepTarget;
    const stepSize = this.stepSize;
    const t0 = this.stepStartTime;

    // Overshoot: max deviation past the target in the direction of the step
    let maxOvershoot = 0;
    for (const s of this.samples) {
      const deviation = s.measurement - target;
      // Overshoot is positive if we went past the target in the step direction
      const signed = this.stepSize > 0 ? deviation : -deviation;
      if (signed > maxOvershoot) maxOvershoot = signed;
    }
    const overshootPercent = (maxOvershoot / stepSize) * 100;

    // Rise time: time to reach 90% of step size from step start
    const threshold90 = target - 0.1 * (target - (target - stepSize));
    let riseTimeS: number | null = null;
    for (const s of this.samples) {
      const pctReached = 1 - Math.abs(s.measurement - target) / stepSize;
      if (pctReached >= 0.9) {
        riseTimeS = s.timeS - t0;
        break;
      }
    }

    // Settling time: time after which error stays within 2% of step size
    const band = 0.02 * stepSize;
    let settlingTimeS: number | null = null;
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (Math.abs(this.samples[i].error) > band) {
        if (i + 1 < this.samples.length) {
          settlingTimeS = this.samples[i + 1].timeS - t0;
        }
        break;
      }
      // If we reach the beginning and all samples are within band
      if (i === 0) {
        settlingTimeS = 0;
      }
    }

    // Steady-state error: average of last N samples
    const tailCount = Math.min(this.windowSize, this.samples.length);
    const tail = this.samples.slice(-tailCount);
    const steadyStateError = tail.reduce((sum, s) => sum + Math.abs(s.error), 0) / tailCount;

    return {
      overshootPercent: Math.max(0, overshootPercent),
      riseTimeS,
      settlingTimeS,
      steadyStateError,
      sampleCount: this.samples.length,
    };
  }

  reset(): void {
    this.samples = [];
    this.stepStartTime = null;
    this.stepSize = 0;
    this.stepTarget = 0;
  }
}

// ===========================================================================
// PIDControllerTrait (extended)
// ===========================================================================

export class PIDControllerTrait {
  public readonly traitName = 'PIDController';
  private config: PIDConfig;
  private front: PIDState;
  private back: PIDState;
  private perfTracker: PerformanceTracker = new PerformanceTracker();
  private cumulativeTimeS: number = 0;

  constructor(config: Partial<PIDConfig> = {}) {
    this.config = {
      ...DEFAULT_PID_CONFIG,
      ...config,
      gains: { ...DEFAULT_PID_CONFIG.gains, ...config.gains },
    };
    const init: PIDState = {
      setpoint: 0,
      measurement: 0,
      error: 0,
      integral: 0,
      derivative: 0,
      previousError: 0,
      output: 0,
      velocity: 0,
      lastInnerTick: 0,
      lastOuterTick: 0,
      tickCount: 0,
      settled: false,
      smoothedOutput: 0,
    };
    this.front = { ...init };
    this.back = { ...init };
  }

  setSetpoint(value: number): void {
    const previous = this.back.setpoint;
    this.back.setpoint = value;
    if (Math.abs(value - previous) > this.config.deadband) {
      this.perfTracker.onSetpointChange(value, previous, this.cumulativeTimeS);
    }
  }

  update(measurement: number, dt: number): number {
    const s = this.back;
    const { kp, ki, kd } = this.config.gains;
    const prev = s.measurement;
    s.measurement = measurement;
    s.velocity = dt > 0 ? (measurement - prev) / dt : 0;
    s.error = s.setpoint - measurement;
    if (Math.abs(s.error) < this.config.deadband) {
      s.error = 0;
      s.settled = true;
    } else {
      s.settled = false;
    }
    s.integral += s.error * dt;
    s.integral = clamp(
      s.integral,
      -this.config.integralWindupLimit,
      this.config.integralWindupLimit
    );
    const rawD = dt > 0 ? (s.error - s.previousError) / dt : 0;
    const a = this.config.derivativeFilterCoeff;
    s.derivative = a * rawD + (1 - a) * s.derivative;
    s.previousError = s.error;
    const rawOutput = clamp(
      kp * s.error + ki * s.integral + kd * s.derivative,
      this.config.outputMin,
      this.config.outputMax
    );

    // Output smoothing filter (exponential moving average)
    const smooth = this.config.outputSmoothingCoeff;
    if (smooth > 0 && smooth <= 1) {
      s.smoothedOutput = smooth * s.smoothedOutput + (1 - smooth) * rawOutput;
      s.output = s.smoothedOutput;
    } else {
      s.output = rawOutput;
      s.smoothedOutput = rawOutput;
    }

    s.tickCount++;
    s.lastInnerTick = Date.now();
    this.cumulativeTimeS += dt;

    // Record for performance metrics
    this.perfTracker.record(measurement, s.setpoint, this.cumulativeTimeS);

    Object.assign(this.front, this.back);
    return s.output;
  }

  outerUpdate(newSetpoint: number): void {
    const previous = this.back.setpoint;
    this.back.setpoint = newSetpoint;
    this.back.lastOuterTick = Date.now();
    if (Math.abs(newSetpoint - previous) > this.config.deadband) {
      this.perfTracker.onSetpointChange(newSetpoint, previous, this.cumulativeTimeS);
    }
  }

  reset(): void {
    this.back.integral = 0;
    this.back.derivative = 0;
    this.back.previousError = 0;
    this.back.output = 0;
    this.back.smoothedOutput = 0;
    this.back.tickCount = 0;
    this.back.settled = false;
    this.cumulativeTimeS = 0;
    this.perfTracker.reset();
    Object.assign(this.front, this.back);
  }

  getState(): Readonly<PIDState> {
    return this.front;
  }
  getGains(): PIDGains {
    return { ...this.config.gains };
  }
  setGains(gains: Partial<PIDGains>): void {
    Object.assign(this.config.gains, gains);
  }
  isSettled(): boolean {
    return this.front.settled;
  }
  getVelocity(): number {
    return this.front.velocity;
  }

  // =========================================================================
  // Output smoothing configuration
  // =========================================================================

  /**
   * Set the output smoothing coefficient.
   * @param coeff - 0 disables smoothing, values near 1 produce heavy smoothing.
   */
  setOutputSmoothing(coeff: number): void {
    this.config.outputSmoothingCoeff = clamp(coeff, 0, 1);
  }

  getOutputSmoothing(): number {
    return this.config.outputSmoothingCoeff;
  }

  // =========================================================================
  // Performance metrics
  // =========================================================================

  /** Return the current step-response performance metrics. */
  getPerformanceMetrics(): PIDPerformanceMetrics {
    return this.perfTracker.compute();
  }

  // =========================================================================
  // Ziegler-Nichols auto-tuning
  // =========================================================================

  /**
   * Auto-tune PID gains using the Ziegler-Nichols ultimate gain method.
   *
   * This method performs a relay experiment in software:
   * 1. Caller provides a `processStep` callback that runs the plant for one
   *    iteration given a control output and returns the resulting measurement.
   * 2. The method applies a relay (bang-bang) output and measures the
   *    resulting oscillation to determine Ku and Tu.
   * 3. Z-N formulas compute kp, ki, kd.
   *
   * @param processStep - Async function: (controlOutput: number) => measurement.
   *   The function should advance the plant by one time step (~dt).
   * @param setpoint     - The setpoint around which oscillation is measured.
   * @param relayAmplitude - Amplitude of the relay output (default: half of outputMax or 1).
   * @param maxIterations - Max iterations for the relay experiment (default: 2000).
   * @param dt            - Time step per iteration in seconds (default: 1/innerLoopHz).
   * @param rule          - Z-N tuning rule to apply (default: 'classic').
   * @param apply         - If true, immediately apply the computed gains (default: true).
   *
   * @returns AutoTuneResult with Ku, Tu, and computed gains, or null if
   *   oscillation was not detected within maxIterations.
   */
  async autoTune(
    processStep: (controlOutput: number) => Promise<number> | number,
    setpoint: number,
    options: {
      relayAmplitude?: number;
      maxIterations?: number;
      dt?: number;
      rule?: ZNTuningRule;
      apply?: boolean;
    } = {}
  ): Promise<AutoTuneResult | null> {
    const relayAmplitude =
      options.relayAmplitude ?? (isFinite(this.config.outputMax) ? this.config.outputMax * 0.5 : 1);
    const maxIter = options.maxIterations ?? 2000;
    const dt = options.dt ?? 1 / this.config.innerLoopHz;
    const rule = options.rule ?? 'classic';
    const apply = options.apply !== false;

    // Relay experiment: output = +relay when error > 0, -relay when error < 0
    const zeroCrossingTimes: number[] = [];
    const peaks: number[] = [];
    let previousError = 0;
    let currentPeak = -Infinity;
    let iterTime = 0;

    for (let i = 0; i < maxIter; i++) {
      const output = previousError >= 0 ? relayAmplitude : -relayAmplitude;
      const measurement = await processStep(output);
      const error = setpoint - measurement;

      // Track peaks (local maxima of measurement)
      if (measurement > currentPeak) {
        currentPeak = measurement;
      }

      // Detect zero-crossings (error sign change)
      if (i > 0 && ((previousError >= 0 && error < 0) || (previousError < 0 && error >= 0))) {
        zeroCrossingTimes.push(iterTime);

        // Record peak from the half-cycle that just ended
        peaks.push(currentPeak);
        currentPeak = -Infinity;
      }

      previousError = error;
      iterTime += dt;

      // Need at least 4 zero crossings to compute a reliable period
      if (zeroCrossingTimes.length >= 6) break;
    }

    // Need at least 4 zero-crossings for 2 full periods
    if (zeroCrossingTimes.length < 4) {
      return null; // Oscillation not detected
    }

    // Ultimate period Tu = average time between every other zero-crossing
    // (a full period = 2 half-periods = distance between crossing N and N+2)
    const periods: number[] = [];
    for (let i = 2; i < zeroCrossingTimes.length; i += 2) {
      periods.push(zeroCrossingTimes[i] - zeroCrossingTimes[i - 2]);
    }
    const Tu = periods.reduce((a, b) => a + b, 0) / periods.length;

    // Ultimate gain Ku = 4 * relayAmplitude / (pi * peakAmplitude)
    // Peak amplitude = average of peak deviations from setpoint
    const validPeaks = peaks.filter((p) => isFinite(p) && p > -Infinity);
    if (validPeaks.length === 0) return null;
    const avgPeakDeviation =
      validPeaks.reduce((a, b) => a + Math.abs(b - setpoint), 0) / validPeaks.length;
    if (avgPeakDeviation === 0) return null;

    const Ku = (4 * relayAmplitude) / (Math.PI * avgPeakDeviation);

    const gains = zieglerNicholsGains(Ku, Tu, rule);

    if (apply) {
      this.setGains(gains);
    }

    return { ultimateGain: Ku, ultimatePeriod: Tu, gains, rule };
  }
}

// ===========================================================================
// CascadePIDController
// ===========================================================================

/**
 * Cascade PID controller: the outer loop's output becomes the inner
 * loop's setpoint.
 *
 * Typical use cases:
 *   - Position (outer) -> Velocity (inner) control
 *   - Temperature (outer) -> Heater power (inner) control
 *   - Altitude (outer) -> Thrust (inner) control
 *
 * The outer loop runs at outerLoopHz; the inner loop at innerLoopHz.
 * Both loops share the same output range and smoothing settings unless
 * overridden.
 */
export class CascadePIDController {
  public readonly traitName = 'CascadePID';
  public readonly outer: PIDControllerTrait;
  public readonly inner: PIDControllerTrait;
  private outerAccumDt: number = 0;
  private readonly outerPeriodS: number;

  /**
   * @param outerConfig - Configuration for the outer (slow) loop.
   * @param innerConfig - Configuration for the inner (fast) loop.
   */
  constructor(outerConfig: Partial<PIDConfig> = {}, innerConfig: Partial<PIDConfig> = {}) {
    // Outer loop defaults to slower rate
    const outerDefaults: Partial<PIDConfig> = { innerLoopHz: 30, outerLoopHz: 10 };
    this.outer = new PIDControllerTrait({ ...outerDefaults, ...outerConfig });

    // Inner loop defaults to fast rate
    const innerDefaults: Partial<PIDConfig> = { innerLoopHz: 90, outerLoopHz: 30 };
    this.inner = new PIDControllerTrait({ ...innerDefaults, ...innerConfig });

    const mergedOuterHz = outerConfig.outerLoopHz ?? outerDefaults.outerLoopHz ?? 10;
    this.outerPeriodS = 1 / mergedOuterHz;
  }

  /**
   * Set the outer loop setpoint (the "primary" desired value).
   */
  setSetpoint(value: number): void {
    this.outer.setSetpoint(value);
  }

  /**
   * Run one tick of the cascade controller.
   *
   * @param outerMeasurement - Measurement for the outer loop (e.g. position).
   * @param innerMeasurement - Measurement for the inner loop (e.g. velocity).
   * @param dt               - Time delta in seconds.
   * @returns The inner loop's output (the final control signal).
   */
  update(outerMeasurement: number, innerMeasurement: number, dt: number): number {
    this.outerAccumDt += dt;

    // Run outer loop at its configured rate
    if (this.outerAccumDt >= this.outerPeriodS) {
      const outerOutput = this.outer.update(outerMeasurement, this.outerAccumDt);
      // Feed outer output as inner setpoint
      this.inner.setSetpoint(outerOutput);
      this.outerAccumDt = 0;
    }

    // Inner loop runs every tick
    return this.inner.update(innerMeasurement, dt);
  }

  reset(): void {
    this.outer.reset();
    this.inner.reset();
    this.outerAccumDt = 0;
  }

  getOuterState(): Readonly<PIDState> {
    return this.outer.getState();
  }
  getInnerState(): Readonly<PIDState> {
    return this.inner.getState();
  }

  /** Get performance metrics for both loops. */
  getPerformanceMetrics(): { outer: PIDPerformanceMetrics; inner: PIDPerformanceMetrics } {
    return {
      outer: this.outer.getPerformanceMetrics(),
      inner: this.inner.getPerformanceMetrics(),
    };
  }
}

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const pIDControllerHandler = {
  name: 'p_i_d_controller',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__p_i_d_controllerState = { active: true, config };
    ctx.emit('p_i_d_controller_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('p_i_d_controller_detached', { node });
    delete node.__p_i_d_controllerState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'p_i_d_controller_configure') {
      Object.assign(node.__p_i_d_controllerState?.config ?? {}, event.payload ?? {});
      ctx.emit('p_i_d_controller_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
