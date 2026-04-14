import type { Vector3 } from '../types';
/**
 * @holoscript/core Joint Trait
 *
 * Enables physics joint constraints between rigid bodies.
 * Supports fixed, hinge, ball, slider, and spring joints.
 *
 * @example
 * ```hsplus
 * object "Door" {
 *   @joint {
 *     jointType: "hinge",
 *     connectedBody: "DoorFrame",
 *     anchor: [-0.5, 0, 0 ],
 *     axis: [0, 1, 0 ],
 *     limits: { min: 0, max: 120 }
 *   }
 * }
 * ```
 */

export type JointType =
  | 'fixed'
  | 'hinge'
  | 'ball'
  | 'slider'
  | 'spring'
  | 'distance'
  | 'configurable';

/**
 * 3D Vector
 */


/**
 * Angular limits
 */
export interface AngularLimits {
  /** Minimum angle in degrees */
  min: number;

  /** Maximum angle in degrees */
  max: number;

  /** Bounciness at limits (0-1) */
  bounciness?: number;

  /** Contact distance for limit activation */
  contactDistance?: number;
}

/**
 * Linear limits
 */
export interface LinearLimits {
  /** Minimum distance */
  min: number;

  /** Maximum distance */
  max: number;

  /** Bounciness at limits (0-1) */
  bounciness?: number;

  /** Contact distance for limit activation */
  contactDistance?: number;
}

/**
 * Spring configuration
 */
export interface SpringConfig {
  /** Spring stiffness (force per unit displacement) */
  stiffness: number;

  /** Damping coefficient */
  damping: number;

  /** Target position/angle */
  target?: number;

  /** Enable spring */
  enabled?: boolean;
}

/**
 * Motor configuration
 */
export interface MotorConfig {
  /** Target velocity */
  targetVelocity: number;

  /** Maximum force/torque */
  maxForce: number;

  /** Enable motor */
  enabled?: boolean;

  /** Is servo (position control) */
  servo?: boolean;

  /** Target position for servo */
  targetPosition?: number;
}

/**
 * Drive configuration for configurable joints
 */
export interface DriveConfig {
  /** X-axis linear drive */
  xDrive?: MotorConfig | SpringConfig;

  /** Y-axis linear drive */
  yDrive?: MotorConfig | SpringConfig;

  /** Z-axis linear drive */
  zDrive?: MotorConfig | SpringConfig;

  /** X-axis angular drive (twist) */
  angularXDrive?: MotorConfig | SpringConfig;

  /** YZ angular drive (swing) */
  angularYZDrive?: MotorConfig | SpringConfig;

  /** Slerp drive (combined rotation) */
  slerpDrive?: MotorConfig | SpringConfig;
}

/**
 * Joint configuration
 */
export interface JointConfig {
  /** Type of joint */
  jointType: JointType;

  /** Connected rigid body ID */
  connectedBody?: string;

  /** Anchor point in local space */
  anchor?: Vector3;

  /** Connected anchor in connected body's local space */
  connectedAnchor?: Vector3;

  /** Primary axis for hinge/slider */
  axis?: Vector3;

  /** Secondary axis for configurable joints */
  secondaryAxis?: Vector3;

  /** Angular limits (for hinge, ball) */
  angularLimits?: AngularLimits;

  /** Linear limits (for slider, distance) */
  linearLimits?: LinearLimits;

  /** Spring configuration */
  spring?: SpringConfig;

  /** Motor configuration */
  motor?: MotorConfig;

  /** Drive configuration (for configurable joints) */
  drive?: DriveConfig;

  /** Break force (Infinity = unbreakable) */
  breakForce?: number;

  /** Break torque (Infinity = unbreakable) */
  breakTorque?: number;

  /** Enable collision between connected bodies */
  enableCollision?: boolean;

  /** Enable preprocessing */
  enablePreprocessing?: boolean;

  /** Mass scale of connected body */
  connectedMassScale?: number;

  /** Mass scale of this body */
  massScale?: number;
}

/**
 * Joint state
 */
export interface JointState {
  /** Current angle (for hinge) */
  angle?: number;

  /** Current position (for slider) */
  position?: number;

  /** Angular velocity */
  angularVelocity?: Vector3;

  /** Linear velocity */
  linearVelocity?: Vector3;

  /** Applied force */
  appliedForce?: Vector3;

  /** Applied torque */
  appliedTorque?: Vector3;

  /** Is broken */
  broken: boolean;

  /** At limit */
  atLimit: boolean;
}

// ============================================================================
// JointTrait Class
// ============================================================================

/**
 * JointTrait - Enables physics joint constraints
 */
export class JointTrait {
  private config: JointConfig;
  private state: JointState;
  private eventListeners: Map<string, ((event: JointEvent) => void)[]> = new Map();

  constructor(config: JointConfig) {
    this.config = {
      enableCollision: false,
      enablePreprocessing: true,
      massScale: 1,
      connectedMassScale: 1,
      ...config,
    };

    this.state = {
      broken: false,
      atLimit: false,
    };

    // Set defaults based on joint type
    this.applyTypeDefaults();
  }

  /**
   * Apply default values based on joint type
   */
  private applyTypeDefaults(): void {
    switch (this.config.jointType) {
      case 'hinge':
        if (!this.config.axis) {
          this.config.axis = [0, 1, 0 ]; // Default to Y-axis
        }
        break;

      case 'slider':
        if (!this.config.axis) {
          this.config.axis = [1, 0, 0 ]; // Default to X-axis
        }
        break;

      case 'spring':
        if (!this.config.spring) {
          this.config.spring = {
            stiffness: 100,
            damping: 5,
            enabled: true,
          };
        }
        break;

      case 'ball':
        // Ball joint allows rotation in all directions
        break;

      case 'fixed':
        // Fixed joint locks all degrees of freedom
        break;
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): JointConfig {
    return { ...this.config };
  }

  /**
   * Get joint state
   */
  public getState(): JointState {
    return { ...this.state };
  }

  /**
   * Set joint limits
   */
  public setLimits(
    limits: AngularLimits | LinearLimits,
    type: 'angular' | 'linear' = 'angular'
  ): void {
    if (type === 'angular') {
      this.config.angularLimits = limits as AngularLimits;
    } else {
      this.config.linearLimits = limits as LinearLimits;
    }
  }

  /**
   * Set spring configuration
   */
  public setSpring(spring: SpringConfig): void {
    this.config.spring = spring;
  }

  /**
   * Set motor configuration
   */
  public setMotor(motor: MotorConfig): void {
    this.config.motor = motor;
  }

  /**
   * Enable/disable motor
   */
  public enableMotor(enabled: boolean): void {
    if (this.config.motor) {
      this.config.motor.enabled = enabled;
    }
  }

  /**
   * Set motor target velocity
   */
  public setMotorVelocity(velocity: number): void {
    if (this.config.motor) {
      this.config.motor.targetVelocity = velocity;
    }
  }

  /**
   * Set break force
   */
  public setBreakForce(force: number): void {
    this.config.breakForce = force;
  }

  /**
   * Set break torque
   */
  public setBreakTorque(torque: number): void {
    this.config.breakTorque = torque;
  }

  /**
   * Check if joint is broken
   */
  public isBroken(): boolean {
    return this.state.broken;
  }

  /**
   * Break the joint
   */
  public break(): void {
    if (!this.state.broken) {
      this.state.broken = true;
      this.emit('break', {
        type: 'break',
        joint: this,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Reset joint (repair if broken)
   */
  public reset(): void {
    this.state.broken = false;
    this.state.atLimit = false;
    this.state.angle = undefined;
    this.state.position = undefined;

    this.emit('reset', {
      type: 'reset',
      joint: this,
      timestamp: Date.now(),
    });
  }

  /**
   * Update state (called by physics engine)
   */
  public updateState(state: Partial<JointState>): void {
    const previousAtLimit = this.state.atLimit;

    Object.assign(this.state, state);

    // Emit limit events
    if (!previousAtLimit && this.state.atLimit) {
      this.emit('limitReached', {
        type: 'limitReached',
        joint: this,
        timestamp: Date.now(),
      });
    }

    // Check for break
    if (!this.state.broken && this.config.breakForce) {
      const force = this.state.appliedForce;
      if (force) {
        const magnitude = Math.sqrt(force[0] ** 2 + force[1] ** 2 + force[2] ** 2);
        if (magnitude > this.config.breakForce) {
          this.break();
        }
      }
    }
  }

  /**
   * Get current angle (for hinge joints)
   */
  public getAngle(): number {
    return this.state.angle || 0;
  }

  /**
   * Get current position (for slider joints)
   */
  public getPosition(): number {
    return this.state.position || 0;
  }

  /**
   * Add event listener
   */
  public on(event: string, callback: (event: JointEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: string, callback: (event: JointEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(type: string, event: JointEvent): void {
    const listeners = this.eventListeners.get(type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  /**
   * Serialize for physics engine
   */
  public serialize(): Record<string, unknown> {
    return {
      type: this.config.jointType,
      connectedBody: this.config.connectedBody,
      anchor: this.config.anchor,
      connectedAnchor: this.config.connectedAnchor,
      axis: this.config.axis,
      angularLimits: this.config.angularLimits,
      linearLimits: this.config.linearLimits,
      spring: this.config.spring,
      motor: this.config.motor,
      breakForce: this.config.breakForce,
      breakTorque: this.config.breakTorque,
      enableCollision: this.config.enableCollision,
    };
  }
}

/**
 * Joint event
 */
export interface JointEvent {
  type: string;
  joint: JointTrait;
  timestamp: number;
}

/**
 * HoloScript+ @joint trait factory
 */
export function createJointTrait(config?: Partial<JointConfig>): JointTrait {
  return new JointTrait({
    jointType: 'fixed',
    enableCollision: false,
    ...config,
  });
}

// Re-export type aliases for index.ts
// JointType is already exported at line 21
// JointConfig is already exported at line 72
export type JointLimit = AngularLimits;
export type JointMotor = MotorConfig;
export type JointDrive = DriveConfig;
export type JointSpring = SpringConfig;

export default JointTrait;

// ── Handler (delegates to JointTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const jointHandler = {
  name: 'joint',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new JointTrait(config);
    node.__joint_instance = instance;
    ctx.emit('joint_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__joint_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('joint_detached', { node });
    delete node.__joint_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__joint_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'joint_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('joint_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__joint_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
