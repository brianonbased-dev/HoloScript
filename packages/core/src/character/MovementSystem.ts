/**
 * MovementSystem — walk/run/Sprint speeds, acceleration/deceleration, input mapping.
 * Self-contained. No external dependencies.
 */

export type MovementMode = 'idle' | 'walk' | 'run' | 'Sprint';

export interface MovementInput {
  forward: number;   // -1 to 1
  right: number;     // -1 to 1
  Sprint: boolean;
  walk: boolean;     // hold-to-walk toggle (otherwise default is run)
}

export interface MovementConfig {
  walkSpeed?: number;
  runSpeed?: number;
  sprintSpeed?: number;
  acceleration?: number;
  deceleration?: number;
  /** Stamina cost per second while sprinting. */
  sprintStaminaCost?: number;
}

export interface MovementState {
  mode: MovementMode;
  speed: number;
  direction: { x: number; z: number };
  velocityX: number;
  velocityZ: number;
}

export class MovementSystem {
  private _walkSpeed: number;
  private _runSpeed: number;
  private _sprintSpeed: number;
  private _acceleration: number;
  private _deceleration: number;
  private _sprintStaminaCost: number;

  private _currentVelocityX: number = 0;
  private _currentVelocityZ: number = 0;
  private _mode: MovementMode = 'idle';

  constructor(config: MovementConfig = {}) {
    this._walkSpeed = config.walkSpeed ?? 2.0;
    this._runSpeed = config.runSpeed ?? 5.0;
    this._sprintSpeed = config.sprintSpeed ?? 8.0;
    this._acceleration = config.acceleration ?? 10.0;
    this._deceleration = config.deceleration ?? 15.0;
    this._sprintStaminaCost = config.sprintStaminaCost ?? 10.0;
  }

  get mode(): MovementMode {
    return this._mode;
  }

  get walkSpeed(): number {
    return this._walkSpeed;
  }

  get runSpeed(): number {
    return this._runSpeed;
  }

  get sprintSpeed(): number {
    return this._sprintSpeed;
  }

  get sprintStaminaCost(): number {
    return this._sprintStaminaCost;
  }

  get state(): MovementState {
    const speed = Math.sqrt(
      this._currentVelocityX ** 2 + this._currentVelocityZ ** 2,
    );
    return {
      mode: this._mode,
      speed,
      direction: this._normalizeDirection(this._currentVelocityX, this._currentVelocityZ),
      velocityX: this._currentVelocityX,
      velocityZ: this._currentVelocityZ,
    };
  }

  /**
   * Process input and produce movement deltas for a given frame.
   * Returns the stamina cost for this frame (only non-zero when sprinting).
   */
  update(input: MovementInput, deltaTime: number): { dx: number; dz: number; staminaCost: number } {
    if (deltaTime <= 0) return { dx: 0, dz: 0, staminaCost: 0 };

    const hasInput = input.forward !== 0 || input.right !== 0;

    // Determine target speed
    let targetSpeed = 0;
    if (hasInput) {
      if (input.Sprint) {
        this._mode = 'Sprint';
        targetSpeed = this._sprintSpeed;
      } else if (input.walk) {
        this._mode = 'walk';
        targetSpeed = this._walkSpeed;
      } else {
        this._mode = 'run';
        targetSpeed = this._runSpeed;
      }
    } else {
      this._mode = 'idle';
    }

    // Normalize input direction (forward = +z, right = +x)
    const dir = this._normalizeDirection(input.right, input.forward);
    const targetVX = dir.x * targetSpeed;
    const targetVZ = dir.z * targetSpeed;

    // Accelerate / decelerate toward target
    const rate = hasInput ? this._acceleration : this._deceleration;
    this._currentVelocityX = this._approach(this._currentVelocityX, targetVX, rate * deltaTime);
    this._currentVelocityZ = this._approach(this._currentVelocityZ, targetVZ, rate * deltaTime);

    // Compute displacement
    const dx = this._currentVelocityX * deltaTime;
    const dz = this._currentVelocityZ * deltaTime;

    // Stamina cost
    const staminaCost = input.Sprint && hasInput ? this._sprintStaminaCost * deltaTime : 0;

    return { dx, dz, staminaCost };
  }

  /** Reset velocity to zero. */
  stop(): void {
    this._currentVelocityX = 0;
    this._currentVelocityZ = 0;
    this._mode = 'idle';
  }

  /** Apply an external speed multiplier (e.g., slow debuff). */
  getSpeedForMode(mode: MovementMode): number {
    switch (mode) {
      case 'walk':
        return this._walkSpeed;
      case 'run':
        return this._runSpeed;
      case 'Sprint':
        return this._sprintSpeed;
      default:
        return 0;
    }
  }

  private _approach(current: number, target: number, maxDelta: number): number {
    if (current < target) {
      return Math.min(current + maxDelta, target);
    }
    return Math.max(current - maxDelta, target);
  }

  private _normalizeDirection(x: number, z: number): { x: number; z: number } {
    const len = Math.sqrt(x * x + z * z);
    if (len < 0.001) return { x: 0, z: 0 };
    return { x: x / len, z: z / len };
  }
}
