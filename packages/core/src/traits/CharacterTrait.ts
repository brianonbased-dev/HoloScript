/**
 * @holoscript/core Character Trait
 *
 * First/third person character controller with movement, jumping,
 * crouching, and ground detection.
 *
 * @example
 * ```hsplus
 * object "Player" {
 *   @character {
 *     height: 1.8,
 *     radius: 0.3,
 *     moveSpeed: 5.0,
 *     jumpHeight: 1.5,
 *     gravity: -9.81,
 *     groundLayers: ["ground", "platform"],
 *     canCrouch: true,
 *     canSprint: true
 *   }
 * }
 * ```
 */

/**
 * 3D Vector
 */
export type Vector3 = [number, number, number];

/**
 * 3D Vector as object with x/y/z properties
 */
export type Vector3Object = { x: number; y: number; z: number };

function withVectorAliases(v: [number, number, number]): Vector3 {
  Object.defineProperty(v, 'x', {
    get: () => v[0],
    set: (value: number) => {
      v[0] = value;
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(v, 'y', {
    get: () => v[1],
    set: (value: number) => {
      v[1] = value;
    },
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(v, 'z', {
    get: () => v[2],
    set: (value: number) => {
      v[2] = value;
    },
    enumerable: false,
    configurable: true,
  });
  return v as Vector3;
}

/**
 * Movement mode
 */
export type MovementMode =
  | 'walking'
  | 'running'
  | 'sprinting'
  | 'crouching'
  | 'swimming'
  | 'flying'
  | 'climbing'
  | 'custom';

/**
 * Ground state
 */
export type GroundState = 'grounded' | 'jumping' | 'falling' | 'landing';

/**
 * Movement input
 */
export interface MovementInput {
  /** Forward/backward (-1 to 1) */
  forward: number;

  /** Left/right strafe (-1 to 1) */
  strafe: number;

  /** Look direction (world space) */
  lookDirection?: Vector3;

  /** Jump requested */
  jump?: boolean;

  /** Crouch requested */
  crouch?: boolean;

  /** Sprint requested */
  Sprint?: boolean;
}

/**
 * Ground hit info
 */
export interface GroundHit {
  /** Is grounded */
  grounded: boolean;

  /** Hit point */
  point?: Vector3;

  /** Surface normal */
  normal?: Vector3;

  /** Ground angle (degrees) */
  angle?: number;

  /** Ground layer/tag */
  layer?: string;

  /** Distance from character */
  distance?: number;
}

/**
 * Step info for stairs
 */
export interface StepInfo {
  /** Can step up */
  canStep: boolean;

  /** Step height */
  height: number;

  /** Step direction */
  direction?: Vector3;
}

/**
 * Character state
 */
export interface CharacterState {
  /** Current position */
  position: Vector3;

  /** Current velocity */
  velocity: Vector3;

  /** Current movement mode */
  movementMode: MovementMode;

  /** Ground state */
  groundState: GroundState;

  /** Is crouching */
  isCrouching: boolean;

  /** Is sprinting */
  isSprinting: boolean;

  /** Is moving */
  isMoving: boolean;

  /** Current speed */
  currentSpeed: number;

  /** Time since grounded */
  airTime: number;

  /** Ground info */
  ground?: GroundHit;
}

/**
 * Character event types
 */
export type CharacterEventType =
  | 'jump'
  | 'land'
  | 'crouch-start'
  | 'crouch-end'
  | 'Sprint-start'
  | 'Sprint-end'
  | 'fall-start'
  | 'step'
  | 'mode-change'
  | 'collision';

/**
 * Character event
 */
export interface CharacterEvent {
  /** Event type */
  type: CharacterEventType;

  /** Previous state */
  previousState?: Partial<CharacterState>;

  /** Current state */
  state?: CharacterState;

  /** Collision info (for collision events) */
  collision?: {
    point: Vector3;
    normal: Vector3;
    other?: string;
  };

  /** Timestamp */
  timestamp: number;
}

/**
 * Character configuration
 */
export interface CharacterConfig {
  /** Character height */
  height?: number;

  /** Capsule radius */
  radius?: number;

  /** Walking speed */
  walkSpeed?: number;

  /** Running speed */
  runSpeed?: number;

  /** Sprint speed */
  sprintSpeed?: number;

  /** Crouch speed */
  crouchSpeed?: number;

  /** Jump height */
  jumpHeight?: number;

  /** Jump count (for double jump, etc) */
  maxJumps?: number;

  /** Ground gravity */
  gravity?: number;

  /** Air gravity multiplier */
  airGravityMultiplier?: number;

  /** Acceleration on ground */
  groundAcceleration?: number;

  /** Acceleration in air */
  airAcceleration?: number;

  /** Deceleration on ground */
  groundFriction?: number;

  /** Air resistance */
  airFriction?: number;

  /** Max walkable slope angle */
  maxSlopeAngle?: number;

  /** Step height for stairs */
  stepHeight?: number;

  /** Ground check distance */
  groundCheckDistance?: number;

  /** Ground layers */
  groundLayers?: string[];

  /** Can crouch */
  canCrouch?: boolean;

  /** Crouch height */
  crouchHeight?: number;

  /** Can Sprint */
  canSprint?: boolean;

  /** Sprint stamina cost per second */
  sprintStaminaCost?: number;

  /** Can fly/noclip */
  canFly?: boolean;

  /** Fly speed */
  flySpeed?: number;

  /** Can swim */
  canSwim?: boolean;

  /** Swim speed */
  swimSpeed?: number;

  /** Buoyancy in water */
  buoyancy?: number;

  /** Push force against rigidbodies */
  pushForce?: number;

  /** Mass for physics interactions */
  mass?: number;

  /** Coyote time (grace period after leaving ground) */
  coyoteTime?: number;

  /** Jump buffer time */
  jumpBuffer?: number;
}

/**
 * Character event callback
 */
type CharacterEventCallback = (event: CharacterEvent) => void;

/**
 * Character Trait - Character Controller
 */
export class CharacterTrait {
  private config: CharacterConfig;
  private state: CharacterState;
  private jumpsRemaining: number = 0;
  private coyoteTimer: number = 0;
  private jumpBufferTimer: number = 0;
  private lastGroundTime: number = 0;
  private eventListeners: Map<CharacterEventType, Set<CharacterEventCallback>> = new Map();

  constructor(config: CharacterConfig = {}) {
    this.config = {
      height: 1.8,
      radius: 0.3,
      walkSpeed: 3.0,
      runSpeed: 5.0,
      sprintSpeed: 8.0,
      crouchSpeed: 1.5,
      jumpHeight: 1.2,
      maxJumps: 1,
      gravity: -9.81,
      airGravityMultiplier: 1.0,
      groundAcceleration: 20.0,
      airAcceleration: 5.0,
      groundFriction: 10.0,
      airFriction: 0.5,
      maxSlopeAngle: 45,
      stepHeight: 0.3,
      groundCheckDistance: 0.1,
      groundLayers: ['ground'],
      canCrouch: true,
      crouchHeight: 1.0,
      canSprint: true,
      sprintStaminaCost: 10,
      canFly: false,
      flySpeed: 10.0,
      canSwim: true,
      swimSpeed: 3.0,
      buoyancy: 1.0,
      pushForce: 10.0,
      mass: 70,
      coyoteTime: 0.15,
      jumpBuffer: 0.1,
      ...config,
    };

    this.state = {
      position: [0, 0, 0],
      velocity: [0, 0, 0],
      movementMode: 'walking',
      groundState: 'grounded',
      isCrouching: false,
      isSprinting: false,
      isMoving: false,
      currentSpeed: 0,
      airTime: 0,
    };

    this.jumpsRemaining = this.config.maxJumps ?? 1;
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): CharacterConfig {
    return { ...this.config };
  }

  /**
   * Get current state
   */
  public getState(): CharacterState {
    return { ...this.state };
  }

  /**
   * Get position
   */
  public getPosition(): Vector3 {
    return withVectorAliases([...this.state.position]);
  }

  /**
   * Set position
   */
  public setPosition(position: Vector3): void {
    this.state.position = [...position];
  }

  /**
   * Get velocity
   */
  public getVelocity(): Vector3 {
    return withVectorAliases([...this.state.velocity]);
  }

  /**
   * Set velocity
   */
  public setVelocity(velocity: Vector3): void {
    this.state.velocity = [...velocity];
  }

  // ============================================================================
  // Movement
  // ============================================================================

  /**
   * Process movement input
   */
  public move(input: MovementInput, deltaTime: number): void {
    const prevState = { ...this.state };

    // Update timers
    this.updateTimers(deltaTime);

    // Calculate target velocity
    const targetVelocity = this.calculateTargetVelocity(input);

    // Apply acceleration
    this.applyAcceleration(targetVelocity, deltaTime);

    // Handle jumping
    if (input.jump) {
      this.tryJump();
    }

    // Handle crouching
    this.updateCrouch(input.crouch ?? false);

    // Handle sprinting
    this.updateSprint(input.Sprint ?? false);

    // Apply gravity
    this.applyGravity(deltaTime);

    // Apply position
    this.state.position[0] += this.state.velocity[0] * deltaTime;
    this.state.position[1] += this.state.velocity[1] * deltaTime;
    this.state.position[2] += this.state.velocity[2] * deltaTime;

    // Update state
    this.state.isMoving = Math.abs(input.forward) > 0.01 || Math.abs(input.strafe) > 0.01;
    this.state.currentSpeed = Math.sqrt(this.state.velocity[0] ** 2 + this.state.velocity[2] ** 2);

    // Check for mode changes
    if (prevState.movementMode !== this.state.movementMode) {
      this.emit({
        type: 'mode-change',
        previousState: prevState,
        state: this.getState(),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Calculate target velocity from input
   */
  private calculateTargetVelocity(input: MovementInput): Vector3 {
    let speed = this.config.walkSpeed ?? 5.0;

    if (this.state.isSprinting) {
      speed = this.config.sprintSpeed ?? 8.0;
    } else if (this.state.isCrouching) {
      speed = this.config.crouchSpeed ?? 1.5;
    } else if (this.state.movementMode === 'running') {
      speed = this.config.runSpeed ?? 5.0;
    }

    // In walking mode, use look direction for movement
    // This is a simplified version - real implementation would use camera transform
    return [
      input.strafe * speed,
      0,
      input.forward * speed,
    ];
  }

  /**
   * Apply acceleration toward target velocity
   */
  private applyAcceleration(target: Vector3, deltaTime: number): void {
    const isGrounded = this.state.groundState === 'grounded';
    const acceleration = isGrounded
      ? (this.config.groundAcceleration ?? 20.0)
      : (this.config.airAcceleration ?? 5.0);
    const friction = isGrounded
      ? (this.config.groundFriction ?? 10.0)
      : (this.config.airFriction ?? 0.5);

    // Apply friction
    this.state.velocity[0] -= this.state.velocity[0] * friction * deltaTime;
    this.state.velocity[2] -= this.state.velocity[2] * friction * deltaTime;

    // Accelerate toward target
    const diffX = target[0] - this.state.velocity[0];
    const diffZ = target[2] - this.state.velocity[2];

    this.state.velocity[0] += diffX * acceleration * deltaTime;
    this.state.velocity[2] += diffZ * acceleration * deltaTime;
  }

  /**
   * Apply gravity
   */
  private applyGravity(deltaTime: number): void {
    if (this.state.groundState === 'grounded') return;
    if (this.state.movementMode === 'flying') return;

    const gravity = this.config.gravity ?? -9.81;
    const multiplier = this.config.airGravityMultiplier ?? 1.0;

    this.state.velocity[1] += gravity * multiplier * deltaTime;
  }

  /**
   * Update timers
   */
  private updateTimers(deltaTime: number): void {
    if (this.coyoteTimer > 0) {
      this.coyoteTimer -= deltaTime;
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer -= deltaTime;
    }

    if (this.state.groundState !== 'grounded') {
      this.state.airTime += deltaTime;
    }
  }

  // ============================================================================
  // Jumping
  // ============================================================================

  /**
   * Try to jump
   */
  public tryJump(): boolean {
    // Check if we can jump
    const canJump = this.jumpsRemaining > 0 || this.coyoteTimer > 0;

    if (!canJump) {
      // Buffer the jump
      this.jumpBufferTimer = this.config.jumpBuffer ?? 0.1;
      return false;
    }

    return this.performJump();
  }

  /**
   * Perform jump
   */
  private performJump(): boolean {
    const prevState = this.state.groundState;

    // Calculate jump velocity from height
    const jumpHeight = this.config.jumpHeight ?? 1.2;
    const gravity = Math.abs(this.config.gravity ?? 9.81);
    const jumpVelocity = Math.sqrt(2 * gravity * jumpHeight);

    this.state.velocity[1] = jumpVelocity;
    this.state.groundState = 'jumping';
    this.jumpsRemaining--;
    this.coyoteTimer = 0;

    this.emit({
      type: 'jump',
      previousState: { groundState: prevState },
      state: this.getState(),
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Cancel jump (for variable height jumps)
   */
  public cancelJump(): void {
    if (this.state.velocity[1] > 0) {
      this.state.velocity[1] *= 0.5;
    }
  }

  // ============================================================================
  // Ground Detection
  // ============================================================================

  /**
   * Update ground state
   */
  public setGrounded(grounded: boolean, hit?: GroundHit): void {
    const wasGrounded = this.state.groundState === 'grounded';
    const prevState = this.state.groundState;

    if (grounded) {
      if (!wasGrounded) {
        // Landing
        this.state.groundState = 'landing';

        this.emit({
          type: 'land',
          previousState: { groundState: prevState },
          state: this.getState(),
          timestamp: Date.now(),
        });

        // Reset after brief landing state
        this.state.groundState = 'grounded';
      }

      this.state.ground = hit;
      this.jumpsRemaining = this.config.maxJumps ?? 1;
      this.state.airTime = 0;
      this.lastGroundTime = Date.now();

      // Check for buffered jump
      if (this.jumpBufferTimer > 0) {
        this.jumpBufferTimer = 0;
        this.performJump();
      }
    } else {
      if (wasGrounded) {
        // Start coyote time
        this.coyoteTimer = this.config.coyoteTime ?? 0.15;

        // Check if falling or just walked off edge
        if (this.state.velocity[1] <= 0) {
          this.state.groundState = 'falling';

          this.emit({
            type: 'fall-start',
            previousState: { groundState: prevState },
            state: this.getState(),
            timestamp: Date.now(),
          });
        }
      } else if (this.state.groundState === 'jumping' && this.state.velocity[1] <= 0) {
        this.state.groundState = 'falling';
      }

      this.state.ground = undefined;
    }
  }

  /**
   * Check if grounded
   */
  public isGrounded(): boolean {
    return this.state.groundState === 'grounded';
  }

  /**
   * Get ground info
   */
  public getGroundInfo(): GroundHit | undefined {
    return this.state.ground;
  }

  /**
   * Get time since last grounded (ms)
   */
  public getTimeSinceGrounded(): number {
    if (this.state.groundState === 'grounded') {
      return 0;
    }
    return Date.now() - this.lastGroundTime;
  }

  // ============================================================================
  // Crouching
  // ============================================================================

  /**
   * Update crouch state
   */
  private updateCrouch(wantsCrouch: boolean): void {
    if (!this.config.canCrouch) return;

    if (wantsCrouch && !this.state.isCrouching) {
      this.state.isCrouching = true;

      this.emit({
        type: 'crouch-start',
        timestamp: Date.now(),
      });
    } else if (!wantsCrouch && this.state.isCrouching) {
      // Check if we can stand up (ceiling check would go here)
      this.state.isCrouching = false;

      this.emit({
        type: 'crouch-end',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Is crouching
   */
  public isCrouching(): boolean {
    return this.state.isCrouching;
  }

  /**
   * Get current height
   */
  public getCurrentHeight(): number {
    return this.state.isCrouching ? (this.config.crouchHeight ?? 1.0) : (this.config.height ?? 1.8);
  }

  // ============================================================================
  // Sprinting
  // ============================================================================

  /**
   * Update Sprint state
   */
  private updateSprint(wantsSprint: boolean): void {
    if (!this.config.canSprint) return;

    if (wantsSprint && !this.state.isSprinting && this.state.isMoving && !this.state.isCrouching) {
      this.state.isSprinting = true;

      this.emit({
        type: 'Sprint-start',
        timestamp: Date.now(),
      });
    } else if ((!wantsSprint || !this.state.isMoving) && this.state.isSprinting) {
      this.state.isSprinting = false;

      this.emit({
        type: 'Sprint-end',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Is sprinting
   */
  public isSprinting(): boolean {
    return this.state.isSprinting;
  }

  // ============================================================================
  // Movement Modes
  // ============================================================================

  /**
   * Set movement mode
   */
  public setMovementMode(mode: MovementMode): void {
    const prevMode = this.state.movementMode;
    if (prevMode === mode) return;

    this.state.movementMode = mode;

    this.emit({
      type: 'mode-change',
      previousState: { movementMode: prevMode },
      state: this.getState(),
      timestamp: Date.now(),
    });
  }

  /**
   * Get movement mode
   */
  public getMovementMode(): MovementMode {
    return this.state.movementMode;
  }

  /**
   * Toggle fly mode
   */
  public toggleFly(): boolean {
    if (!this.config.canFly) return false;

    if (this.state.movementMode === 'flying') {
      this.state.movementMode = 'walking';
    } else {
      this.state.movementMode = 'flying';
    }

    return true;
  }

  // ============================================================================
  // Collision
  // ============================================================================

  /**
   * Handle collision
   */
  public onCollision(point: Vector3, normal: Vector3, other?: string): void {
    this.emit({
      type: 'collision',
      collision: { point, normal, other },
      timestamp: Date.now(),
    });

    // Slide along walls
    const dot =
      this.state.velocity[0] * normal[0] +
      this.state.velocity[1] * normal[1] +
      this.state.velocity[2] * normal[2];

    if (dot < 0) {
      this.state.velocity[0] -= normal[0] * dot;
      this.state.velocity[1] -= normal[1] * dot;
      this.state.velocity[2] -= normal[2] * dot;
    }
  }

  /**
   * Check step
   */
  public canStepUp(obstacleHeight: number): boolean {
    return (
      obstacleHeight <= (this.config.stepHeight ?? 0.3) && this.state.groundState === 'grounded'
    );
  }

  // ============================================================================
  // Teleport
  // ============================================================================

  /**
   * Teleport to position
   */
  public teleport(position: Vector3, resetVelocity: boolean = true): void {
    this.state.position = [...position];
    if (resetVelocity) {
      this.state.velocity = [0, 0, 0];
    }
  }

  /**
   * Apply impulse
   */
  public applyImpulse(impulse: Vector3): void {
    const mass = this.config.mass ?? 70;
    this.state.velocity[0] += impulse[0] / mass;
    this.state.velocity[1] += impulse[1] / mass;
    this.state.velocity[2] += impulse[2] / mass;
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: CharacterEventType, callback: CharacterEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: CharacterEventType, callback: CharacterEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: CharacterEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Character event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export state
   */
  public exportState(): CharacterState {
    return this.getState();
  }

  /**
   * Import state
   */
  public importState(state: Partial<CharacterState>): void {
    Object.assign(this.state, state);
  }
}

/**
 * Create a character trait
 */
export function createCharacterTrait(config?: CharacterConfig): CharacterTrait {
  return new CharacterTrait(config);
}

// ── Handler (delegates to CharacterTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const characterHandler = {
  name: 'character',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new CharacterTrait(config);
    node.__character_instance = instance;
    ctx.emit('character_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__character_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('character_detached', { node });
    delete node.__character_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__character_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'character_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('character_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__character_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
