/**
 * @holoscript/core Rigidbody Trait
 *
 * Enables physics simulation for objects with mass, velocity, and forces.
 * Supports kinematic and dynamic bodies with collision detection.
 *
 * @example
 * ```hsplus
 * object "Ball" {
 *   @rigidbody {
 *     mass: 1.0,
 *     drag: 0.1,
 *     angularDrag: 0.05,
 *     useGravity: true,
 *     constraints: { freezeRotationX: true }
 *   }
 * }
 * ```
 */

/**
 * 3D Vector
 */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Body type determines physics behavior
 */
export type BodyType = 'dynamic' | 'kinematic' | 'static';

/**
 * Collision detection mode
 */
export type CollisionDetectionMode =
  | 'discrete'
  | 'continuous'
  | 'continuous-dynamic'
  | 'continuous-speculative';

/**
 * Interpolation mode for smooth rendering
 */
export type InterpolationMode = 'none' | 'interpolate' | 'extrapolate';

/**
 * Force application mode
 */
export type ForceMode = 'force' | 'impulse' | 'velocity-change' | 'acceleration';

/**
 * Rigidbody constraints
 */
export interface RigidbodyConstraints {
  /** Freeze X-axis position */
  freezePositionX?: boolean;
  /** Freeze Y-axis position */
  freezePositionY?: boolean;
  /** Freeze Z-axis position */
  freezePositionZ?: boolean;
  /** Freeze X-axis rotation */
  freezeRotationX?: boolean;
  /** Freeze Y-axis rotation */
  freezeRotationY?: boolean;
  /** Freeze Z-axis rotation */
  freezeRotationZ?: boolean;
}

/**
 * Collision shape types
 */
export type ColliderShape = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'mesh' | 'convex-hull';

/**
 * Collider configuration
 */
export interface ColliderConfig {
  /** Shape type */
  shape: ColliderShape;

  /** Is trigger (no physical response) */
  isTrigger?: boolean;

  /** Physics material */
  material?: PhysicsMaterialConfig;

  /** Center offset */
  center?: Vector3;

  /** Size (for box) */
  size?: Vector3;

  /** Radius (for sphere, capsule) */
  radius?: number;

  /** Height (for capsule, cylinder) */
  height?: number;

  /** Collision layer */
  layer?: number;

  /** Layer mask for collision detection */
  layerMask?: number;
}

/**
 * Physics material properties
 */
export interface PhysicsMaterialConfig {
  /** Dynamic friction (0-1) */
  dynamicFriction?: number;

  /** Static friction (0-1) */
  staticFriction?: number;

  /** Bounciness (0-1) */
  bounciness?: number;

  /** Friction combine mode */
  frictionCombine?: 'average' | 'minimum' | 'maximum' | 'multiply';

  /** Bounce combine mode */
  bounceCombine?: 'average' | 'minimum' | 'maximum' | 'multiply';
}

/**
 * Rigidbody configuration
 */
export interface RigidbodyConfig {
  /** Body type: dynamic, kinematic, or static */
  bodyType?: BodyType;

  /** Mass in kilograms (dynamic only) */
  mass?: number;

  /** Linear drag coefficient */
  drag?: number;

  /** Angular drag coefficient */
  angularDrag?: number;

  /** Whether gravity affects this body */
  useGravity?: boolean;

  /** Kinematic body (moved via transform, not forces) */
  isKinematic?: boolean;

  /** Collision detection mode */
  collisionDetection?: CollisionDetectionMode;

  /** Interpolation for rendering */
  interpolation?: InterpolationMode;

  /** Movement constraints */
  constraints?: RigidbodyConstraints;

  /** Center of mass offset */
  centerOfMass?: Vector3;

  /** Inertia tensor override */
  inertiaTensor?: Vector3;

  /** Maximum angular velocity (rad/s) */
  maxAngularVelocity?: number;

  /** Maximum depenetration velocity */
  maxDepenetrationVelocity?: number;

  /** Sleep threshold (energy below which body sleeps) */
  sleepThreshold?: number;

  /** Solver iterations (higher = more accurate) */
  solverIterations?: number;

  /** Attached colliders */
  colliders?: ColliderConfig[];

  /** Initial velocity */
  velocity?: Vector3;

  /** Initial angular velocity */
  angularVelocity?: Vector3;
}

/**
 * Rigidbody state
 */
export interface RigidbodyState {
  /** Current position */
  position: Vector3;

  /** Current rotation (quaternion) */
  rotation: { x: number; y: number; z: number; w: number };

  /** Current velocity */
  velocity: Vector3;

  /** Current angular velocity */
  angularVelocity: Vector3;

  /** Is sleeping (no movement) */
  isSleeping: boolean;

  /** Accumulated force this frame */
  force: Vector3;

  /** Accumulated torque this frame */
  torque: Vector3;
}

/**
 * Collision event
 */
export interface CollisionEvent {
  type:
    | 'collision-enter'
    | 'collision-stay'
    | 'collision-exit'
    | 'trigger-enter'
    | 'trigger-stay'
    | 'trigger-exit';
  other: string;
  contactPoint?: Vector3;
  contactNormal?: Vector3;
  relativeVelocity?: Vector3;
  impulse?: number;
  timestamp: number;
}

/**
 * Event listener callback
 */
type EventCallback = (event: CollisionEvent) => void;

/**
 * Rigidbody Trait - Physics simulation
 */
export class RigidbodyTrait {
  private config: RigidbodyConfig;
  private state: RigidbodyState;
  private eventListeners: Map<string, EventCallback[]> = new Map();
  private enabled: boolean = true;

  constructor(config: Partial<RigidbodyConfig> = {}) {
    this.config = {
      bodyType: config.bodyType ?? 'dynamic',
      mass: config.mass ?? 1.0,
      drag: config.drag ?? 0.0,
      angularDrag: config.angularDrag ?? 0.05,
      useGravity: config.useGravity ?? true,
      isKinematic: config.isKinematic ?? false,
      collisionDetection: config.collisionDetection ?? 'discrete',
      interpolation: config.interpolation ?? 'none',
      constraints: config.constraints,
      centerOfMass: config.centerOfMass,
      inertiaTensor: config.inertiaTensor,
      maxAngularVelocity: config.maxAngularVelocity ?? 50,
      maxDepenetrationVelocity: config.maxDepenetrationVelocity ?? 10,
      sleepThreshold: config.sleepThreshold ?? 0.005,
      solverIterations: config.solverIterations ?? 6,
      colliders: config.colliders ?? [],
      velocity: config.velocity,
      angularVelocity: config.angularVelocity,
    };

    this.state = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      velocity: config.velocity ?? { x: 0, y: 0, z: 0 },
      angularVelocity: config.angularVelocity ?? { x: 0, y: 0, z: 0 },
      isSleeping: false,
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
    };
  }

  // ============================================================================
  // Configuration
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): RigidbodyConfig {
    return { ...this.config };
  }

  /**
   * Get current state
   */
  public getState(): RigidbodyState {
    return { ...this.state };
  }

  /**
   * Set mass
   */
  public setMass(mass: number): void {
    this.config.mass = Math.max(0.0001, mass);
  }

  /**
   * Get mass
   */
  public getMass(): number {
    return this.config.mass ?? 1.0;
  }

  /**
   * Set drag
   */
  public setDrag(drag: number): void {
    this.config.drag = Math.max(0, drag);
  }

  /**
   * Set angular drag
   */
  public setAngularDrag(angularDrag: number): void {
    this.config.angularDrag = Math.max(0, angularDrag);
  }

  /**
   * Set gravity usage
   */
  public setUseGravity(useGravity: boolean): void {
    this.config.useGravity = useGravity;
  }

  /**
   * Set kinematic mode
   */
  public setKinematic(isKinematic: boolean): void {
    this.config.isKinematic = isKinematic;
  }

  /**
   * Is kinematic
   */
  public isKinematic(): boolean {
    return this.config.isKinematic ?? false;
  }

  /**
   * Set constraints
   */
  public setConstraints(constraints: RigidbodyConstraints): void {
    this.config.constraints = { ...this.config.constraints, ...constraints };
  }

  // ============================================================================
  // Forces & Motion
  // ============================================================================

  /**
   * Apply force at center of mass
   */
  public addForce(force: Vector3, mode: ForceMode = 'force'): void {
    if (this.config.isKinematic) return;

    const mass = this.config.mass ?? 1.0;

    switch (mode) {
      case 'force':
        // Add force (will be integrated over time)
        this.state.force.x += force.x;
        this.state.force.y += force.y;
        this.state.force.z += force.z;
        break;
      case 'impulse':
        // Instant velocity change (F = mv, so v = F/m)
        this.state.velocity.x += force.x / mass;
        this.state.velocity.y += force.y / mass;
        this.state.velocity.z += force.z / mass;
        break;
      case 'velocity-change':
        // Direct velocity change (ignores mass)
        this.state.velocity.x += force.x;
        this.state.velocity.y += force.y;
        this.state.velocity.z += force.z;
        break;
      case 'acceleration':
        // Add acceleration (multiply by mass to get force)
        this.state.force.x += force.x * mass;
        this.state.force.y += force.y * mass;
        this.state.force.z += force.z * mass;
        break;
    }

    this.wakeUp();
  }

  /**
   * Apply force at a world position
   */
  public addForceAtPosition(force: Vector3, position: Vector3, mode: ForceMode = 'force'): void {
    // Apply force
    this.addForce(force, mode);

    // Calculate torque from offset
    const offset = {
      x: position.x - this.state.position.x,
      y: position.y - this.state.position.y,
      z: position.z - this.state.position.z,
    };

    // Cross product: torque = offset x force
    const torque = {
      x: offset.y * force.z - offset.z * force.y,
      y: offset.z * force.x - offset.x * force.z,
      z: offset.x * force.y - offset.y * force.x,
    };

    this.addTorque(torque, mode);
  }

  /**
   * Apply torque
   */
  public addTorque(torque: Vector3, mode: ForceMode = 'force'): void {
    if (this.config.isKinematic) return;

    const inertia = this.config.inertiaTensor ?? { x: 1, y: 1, z: 1 };

    switch (mode) {
      case 'force':
        this.state.torque.x += torque.x;
        this.state.torque.y += torque.y;
        this.state.torque.z += torque.z;
        break;
      case 'impulse':
        this.state.angularVelocity.x += torque.x / inertia.x;
        this.state.angularVelocity.y += torque.y / inertia.y;
        this.state.angularVelocity.z += torque.z / inertia.z;
        break;
      case 'velocity-change':
        this.state.angularVelocity.x += torque.x;
        this.state.angularVelocity.y += torque.y;
        this.state.angularVelocity.z += torque.z;
        break;
      case 'acceleration':
        this.state.torque.x += torque.x * inertia.x;
        this.state.torque.y += torque.y * inertia.y;
        this.state.torque.z += torque.z * inertia.z;
        break;
    }

    this.wakeUp();
  }

  /**
   * Set velocity directly
   */
  public setVelocity(velocity: Vector3): void {
    this.state.velocity = { ...velocity };
    this.wakeUp();
  }

  /**
   * Get velocity
   */
  public getVelocity(): Vector3 {
    return { ...this.state.velocity };
  }

  /**
   * Set angular velocity
   */
  public setAngularVelocity(angularVelocity: Vector3): void {
    this.state.angularVelocity = { ...angularVelocity };
    this.wakeUp();
  }

  /**
   * Get angular velocity
   */
  public getAngularVelocity(): Vector3 {
    return { ...this.state.angularVelocity };
  }

  /**
   * Move to position (kinematic)
   */
  public movePosition(position: Vector3): void {
    if (this.config.isKinematic) {
      this.state.position = { ...position };
    }
  }

  /**
   * Rotate (kinematic)
   */
  public moveRotation(rotation: { x: number; y: number; z: number; w: number }): void {
    if (this.config.isKinematic) {
      this.state.rotation = { ...rotation };
    }
  }

  /**
   * Get position
   */
  public getPosition(): Vector3 {
    return { ...this.state.position };
  }

  // ============================================================================
  // Sleep Control
  // ============================================================================

  /**
   * Wake up the rigidbody
   */
  public wakeUp(): void {
    this.state.isSleeping = false;
  }

  /**
   * Put to sleep
   */
  public sleep(): void {
    this.state.isSleeping = true;
    this.state.velocity = { x: 0, y: 0, z: 0 };
    this.state.angularVelocity = { x: 0, y: 0, z: 0 };
  }

  /**
   * Check if sleeping
   */
  public isSleepingState(): boolean {
    return this.state.isSleeping;
  }

  // ============================================================================
  // Colliders
  // ============================================================================

  /**
   * Add collider
   */
  public addCollider(collider: ColliderConfig): void {
    if (!this.config.colliders) {
      this.config.colliders = [];
    }
    this.config.colliders.push(collider);
  }

  /**
   * Get colliders
   */
  public getColliders(): ColliderConfig[] {
    return [...(this.config.colliders ?? [])];
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  /**
   * Enable/disable physics
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.sleep();
    }
  }

  /**
   * Is enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Add event listener
   */
  public on(event: string, callback: EventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: string, callback: EventCallback): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit event (called by physics engine)
   */
  public emit(event: CollisionEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        callback(event);
      }
    }
  }

  // ============================================================================
  // Physics Step (called by physics engine)
  // ============================================================================

  /**
   * Update state (called by physics engine each step)
   */
  public updateState(newState: Partial<RigidbodyState>): void {
    Object.assign(this.state, newState);
  }

  /**
   * Clear accumulated forces (called after physics step)
   */
  public clearForces(): void {
    this.state.force = { x: 0, y: 0, z: 0 };
    this.state.torque = { x: 0, y: 0, z: 0 };
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Serialize for physics engine
   */
  public serialize(): Record<string, unknown> {
    return {
      bodyType: this.config.bodyType,
      mass: this.config.mass,
      drag: this.config.drag,
      angularDrag: this.config.angularDrag,
      useGravity: this.config.useGravity,
      isKinematic: this.config.isKinematic,
      collisionDetection: this.config.collisionDetection,
      interpolation: this.config.interpolation,
      constraints: this.config.constraints,
      centerOfMass: this.config.centerOfMass,
      maxAngularVelocity: this.config.maxAngularVelocity,
      sleepThreshold: this.config.sleepThreshold,
      colliders: this.config.colliders,
      state: this.state,
      enabled: this.enabled,
    };
  }
}

/**
 * Factory function
 */
export function createRigidbodyTrait(config: Partial<RigidbodyConfig> = {}): RigidbodyTrait {
  return new RigidbodyTrait(config);
}

// Type aliases for re-export
export type RigidbodyBodyType = BodyType;
export type RigidbodyCollisionMode = CollisionDetectionMode;
export type RigidbodyInterpolation = InterpolationMode;
export type RigidbodyForceMode = ForceMode;
export type RigidbodyColliderShape = ColliderShape;

// ── Handler (delegates to RigidbodyTrait) ──
import type { TraitHandler } from './TraitTypes';

export const rigidbodyHandler = {
  name: 'rigidbody',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new RigidbodyTrait(config);
    node.__rigidbody_instance = instance;
    ctx.emit('rigidbody_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__rigidbody_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('rigidbody_detached', { node });
    delete node.__rigidbody_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__rigidbody_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'rigidbody_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('rigidbody_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__rigidbody_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
