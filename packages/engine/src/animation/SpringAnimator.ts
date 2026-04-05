/**
 * SpringAnimator.ts
 *
 * Physics-based spring dynamics for smooth, natural-feeling animations.
 * Implements a critically-damped spring model for responsive UI motion.
 */

export interface SpringConfig {
  stiffness: number; // Spring constant (higher = snappier). Default: 170
  damping: number; // Damping coefficient (higher = less bounce). Default: 26
  mass: number; // Mass (higher = more inertia). Default: 1
  precision: number; // Threshold to consider "at rest". Default: 0.01
}

export const SpringPresets: Record<string, SpringConfig> = {
  /** Snappy, minimal bounce — good for buttons, toggles */
  stiff: { stiffness: 300, damping: 30, mass: 1, precision: 0.01 },
  /** Default responsive spring */
  default: { stiffness: 170, damping: 26, mass: 1, precision: 0.01 },
  /** Gentle, bouncy — good for dialogs, modals */
  gentle: { stiffness: 120, damping: 14, mass: 1, precision: 0.01 },
  /** Wobbly — fun/playful animations */
  wobbly: { stiffness: 180, damping: 12, mass: 1, precision: 0.01 },
  /** Slow, heavy — good for large panels */
  slow: { stiffness: 80, damping: 20, mass: 2, precision: 0.01 },
  /** Molasses — ultra-slow drift */
  molasses: { stiffness: 40, damping: 30, mass: 3, precision: 0.005 },
};

export class SpringAnimator {
  private current: number;
  private target: number;
  private velocity: number = 0;
  private config: SpringConfig;
  private atRest: boolean = true;
  private onUpdate?: (value: number) => void;
  private onRest?: () => void;

  constructor(
    initialValue: number,
    config: Partial<SpringConfig> = {},
    onUpdate?: (value: number) => void,
    onRest?: () => void
  ) {
    this.current = initialValue;
    this.target = initialValue;
    this.config = { ...SpringPresets.default, ...config };
    this.onUpdate = onUpdate;
    this.onRest = onRest;
  }

  /**
   * Set a new target value. The spring will animate towards it.
   */
  setTarget(target: number): void {
    this.target = target;
    this.atRest = false;
  }

  /**
   * Instantly jump to a value (no animation).
   */
  setValue(value: number): void {
    this.current = value;
    this.target = value;
    this.velocity = 0;
    this.atRest = true;
    if (this.onUpdate) this.onUpdate(value);
  }

  /**
   * Apply an impulse (instant velocity change).
   */
  impulse(force: number): void {
    this.velocity += force;
    this.atRest = false;
  }

  /**
   * Step the spring simulation forward.
   * Uses semi-implicit Euler integration.
   */
  update(delta: number): number {
    if (this.atRest) return this.current;

    const { stiffness, damping, mass, precision } = this.config;

    // Force = -k * displacement - c * velocity
    const displacement = this.current - this.target;
    const springForce = -stiffness * displacement;
    const dampingForce = -damping * this.velocity;
    const acceleration = (springForce + dampingForce) / mass;

    // Semi-implicit Euler
    this.velocity += acceleration * delta;
    this.current += this.velocity * delta;

    // Rest detection
    if (Math.abs(this.velocity) < precision && Math.abs(displacement) < precision) {
      this.current = this.target;
      this.velocity = 0;
      this.atRest = true;
      if (this.onUpdate) this.onUpdate(this.current);
      if (this.onRest) this.onRest();
      return this.current;
    }

    if (this.onUpdate) this.onUpdate(this.current);
    return this.current;
  }

  /**
   * Get current value.
   */
  getValue(): number {
    return this.current;
  }

  /**
   * Check if the spring has settled.
   */
  isAtRest(): boolean {
    return this.atRest;
  }

  /**
   * Change spring configuration dynamically.
   */
  setConfig(config: Partial<SpringConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// =============================================================================
// VEC3 SPRING (convenience)
// =============================================================================

export class Vec3SpringAnimator {
  x: SpringAnimator;
  y: SpringAnimator;
  z: SpringAnimator;

  constructor(
    initial: { x: number; y: number; z: number },
    config: Partial<SpringConfig> = {},
    onUpdate?: (value: { x: number; y: number; z: number }) => void
  ) {
    const notifyAll = () => {
      if (onUpdate) {
        onUpdate({ x: this.x.getValue(), y: this.y.getValue(), z: this.z.getValue() });
      }
    };
    this.x = new SpringAnimator(initial.x, config, notifyAll);
    this.y = new SpringAnimator(initial.y, config, notifyAll);
    this.z = new SpringAnimator(initial.z, config, notifyAll);
  }

  setTarget(target: { x: number; y: number; z: number }): void {
    this.x.setTarget(target.x);
    this.y.setTarget(target.y);
    this.z.setTarget(target.z);
  }

  update(delta: number): { x: number; y: number; z: number } {
    return {
      x: this.x.update(delta),
      y: this.y.update(delta),
      z: this.z.update(delta),
    };
  }

  getValue(): { x: number; y: number; z: number } {
    return { x: this.x.getValue(), y: this.y.getValue(), z: this.z.getValue() };
  }

  isAtRest(): boolean {
    return this.x.isAtRest() && this.y.isAtRest() && this.z.isAtRest();
  }
}

