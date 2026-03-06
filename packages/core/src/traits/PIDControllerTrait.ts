/**
 * PIDController<T> Generic Trait - Configurable inner/outer loop timing,
 * setpoint tracking, velocity monitoring. Thread-safe for VR 90fps.
 * @version 1.0.0
 */
export interface PIDGains { kp: number; ki: number; kd: number; }
export interface PIDConfig {
  gains: PIDGains; outputMin: number; outputMax: number;
  integralWindupLimit: number; derivativeFilterCoeff: number;
  innerLoopHz: number; outerLoopHz: number; deadband: number;
}
export const DEFAULT_PID_CONFIG: PIDConfig = {
  gains: { kp: 1.0, ki: 0.1, kd: 0.05 }, outputMin: -Infinity, outputMax: Infinity,
  integralWindupLimit: 100, derivativeFilterCoeff: 0.1, innerLoopHz: 90, outerLoopHz: 30, deadband: 0.001,
};
export interface PIDState {
  setpoint: number; measurement: number; error: number; integral: number; derivative: number;
  previousError: number; output: number; velocity: number; lastInnerTick: number; lastOuterTick: number;
  tickCount: number; settled: boolean;
}
function clamp(v: number, min: number, max: number): number { return Math.min(Math.max(v, min), max); }

export class PIDControllerTrait {
  public readonly traitName = 'PIDController';
  private config: PIDConfig;
  private front: PIDState;
  private back: PIDState;
  constructor(config: Partial<PIDConfig> = {}) {
    this.config = { ...DEFAULT_PID_CONFIG, ...config, gains: { ...DEFAULT_PID_CONFIG.gains, ...config.gains } };
    const init: PIDState = { setpoint:0, measurement:0, error:0, integral:0, derivative:0, previousError:0, output:0, velocity:0, lastInnerTick:0, lastOuterTick:0, tickCount:0, settled:false };
    this.front = { ...init }; this.back = { ...init };
  }
  setSetpoint(value: number): void { this.back.setpoint = value; }
  update(measurement: number, dt: number): number {
    const s = this.back; const { kp, ki, kd } = this.config.gains;
    const prev = s.measurement; s.measurement = measurement;
    s.velocity = dt > 0 ? (measurement - prev) / dt : 0;
    s.error = s.setpoint - measurement;
    if (Math.abs(s.error) < this.config.deadband) { s.error = 0; s.settled = true; } else { s.settled = false; }
    s.integral += s.error * dt;
    s.integral = clamp(s.integral, -this.config.integralWindupLimit, this.config.integralWindupLimit);
    const rawD = dt > 0 ? (s.error - s.previousError) / dt : 0;
    const a = this.config.derivativeFilterCoeff;
    s.derivative = a * rawD + (1 - a) * s.derivative;
    s.previousError = s.error;
    s.output = clamp(kp * s.error + ki * s.integral + kd * s.derivative, this.config.outputMin, this.config.outputMax);
    s.tickCount++; s.lastInnerTick = Date.now();
    Object.assign(this.front, this.back);
    return s.output;
  }
  outerUpdate(newSetpoint: number): void { this.back.setpoint = newSetpoint; this.back.lastOuterTick = Date.now(); }
  reset(): void { this.back.integral=0; this.back.derivative=0; this.back.previousError=0; this.back.output=0; this.back.tickCount=0; this.back.settled=false; Object.assign(this.front, this.back); }
  getState(): Readonly<PIDState> { return this.front; }
  getGains(): PIDGains { return { ...this.config.gains }; }
  setGains(gains: Partial<PIDGains>): void { Object.assign(this.config.gains, gains); }
  isSettled(): boolean { return this.front.settled; }
  getVelocity(): number { return this.front.velocity; }
}
