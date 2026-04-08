/**
 * PhysicsActivation.ts
 *
 * Sleep/Wake activation system for character cloth and hair simulation.
 * Determines WHEN physics solvers run (not HOW they run), providing massive
 * performance savings for idle characters.
 *
 * 4-state machine: SLEEPING -> WAKING -> ACTIVE -> SETTLING -> SLEEPING
 *
 * Trigger sources: character velocity, wind force, external collision,
 * animation events, gravity changes.
 *
 * Integrates with:
 * - WeatherBlackboard (environment/WeatherBlackboard.ts) for global wind
 * - ClothSim (physics/ClothSim.ts) for PBD cloth
 * - PBDSolver (physics/PBDSolver.ts) for unified PBD pipeline
 * - Spring-chain hair and strand-based GPU hair (wraps around existing solvers)
 *
 * Vision: research/2026-03-26_holoscript-characters-as-code-vision.md Section 8D
 * Patterns: P.CHAR.005 (Physics Sleep/Wake), P.CHAR.006 (Environment Wind Zones)
 * Gotchas: G.CHAR.005 (no pop on wake), G.CHAR.006 (EMA smoothing for self-wind)
 *
 * @module physics
 */

import type { IVector3 } from './PhysicsTypes';
import type { WeatherBlackboardState } from '@holoscript/core';

// =============================================================================
// Enums
// =============================================================================

/**
 * Physics activation state machine states.
 *
 * SLEEPING  — Baked rest pose, zero simulation cost.
 * WAKING   — Blending from rest pose to simulated state (0.2-0.5s).
 * ACTIVE   — Full physics simulation running.
 * SETTLING — Sim continues with high damping (3-5x), capturing rest pose on sleep.
 */
export enum PhysicsActivationState {
  /** Baked rest pose. Zero sim cost. Hair/cloth perfectly still. */
  SLEEPING = 'SLEEPING',
  /** Smoothly blend FROM rest pose TO sim over wake_blend duration. Prevents pop. */
  WAKING = 'WAKING',
  /** Full physics simulation. PBD cloth, spring-chain hair, wind response. */
  ACTIVE = 'ACTIVE',
  /** Sim runs with cranked damping. When all vertices < epsilon, capture rest pose -> SLEEPING. */
  SETTLING = 'SETTLING',
}

/**
 * Types of triggers that can wake a sleeping simulation.
 */
export enum ActivationTriggerType {
  /** Character root bone velocity exceeds threshold */
  VELOCITY = 'velocity',
  /** Wind force on any vertex exceeds threshold */
  WIND = 'wind',
  /** External collision contact detected */
  COLLISION = 'collision',
  /** Animation state machine fires a wake event */
  ANIMATION = 'animation',
  /** Gravity vector changes */
  GRAVITY = 'gravity',
}

/**
 * Wind zone types for localized wind sources.
 */
export enum WindZoneType {
  /** Radiates from a point (e.g., fireplace updraft) */
  POINT = 'point',
  /** Directional cone (e.g., open window, vent) */
  DIRECTIONAL = 'directional',
  /** Uniform across entire scene (e.g., battlefield wind) */
  GLOBAL = 'global',
}

// =============================================================================
// Interfaces — Trigger Configuration
// =============================================================================

/**
 * Threshold-based trigger config (velocity, wind, gravity).
 */
export interface ThresholdTriggerConfig {
  /** Force/velocity magnitude that causes a wake from SLEEPING */
  wake: number;
  /** Force/velocity magnitude below which the trigger is considered inactive */
  sleep: number;
  /** How long the value must stay below `sleep` before trigger is considered cleared (seconds) */
  sleepDelay: number;
}

/**
 * Collision trigger config (any contact = wake).
 */
export interface CollisionTriggerConfig {
  /** true = any collision wakes (default). false = disabled */
  wake: boolean;
  /** Seconds after last contact before collision trigger clears */
  sleepDelay: number;
}

/**
 * Animation event trigger config.
 */
export interface AnimationTriggerConfig {
  /** Animation state machine events that trigger a wake */
  events: string[];
}

/**
 * Combined trigger configuration block.
 * All fields are optional — if omitted, that trigger source is disabled.
 */
export interface ActivationTriggers {
  velocity?: ThresholdTriggerConfig;
  wind?: ThresholdTriggerConfig;
  collision?: CollisionTriggerConfig;
  animation?: AnimationTriggerConfig;
  gravity?: ThresholdTriggerConfig;
}

// =============================================================================
// Interfaces — Locomotion Intensity
// =============================================================================

/**
 * A single point on the locomotion intensity curve.
 * Speed in m/s, intensity 0-1.
 */
export interface IntensityCurvePoint {
  speed: number;
  intensity: number;
}

/**
 * Default intensity curve from vision doc:
 * idle=0, walk(1.4)=0.2, jog(3.0)=0.5, run(5.0)=0.7, Sprint(8.0)=1.0
 */
export const DEFAULT_INTENSITY_CURVE: IntensityCurvePoint[] = [
  { speed: 0, intensity: 0 },
  { speed: 1.4, intensity: 0.2 },
  { speed: 3.0, intensity: 0.5 },
  { speed: 5.0, intensity: 0.7 },
  { speed: 8.0, intensity: 1.0 },
];

/**
 * Locomotion-driven physics intensity configuration.
 */
export interface LocomotionConfig {
  /** Enable self-wind from character movement (headwind opposing motion) */
  selfWind: boolean;
  /** Scale factor for self-wind (0-1). 0.6 = 60% of velocity as opposing wind */
  selfWindScale: number;
  /** Intensity curve mapping velocity to sim intensity 0-1 */
  intensityCurve: IntensityCurvePoint[];
  /** EMA alpha for velocity smoothing (G.CHAR.006). Lower = smoother. Default 0.1 */
  emaAlpha: number;
}

/**
 * Default locomotion config.
 */
export const DEFAULT_LOCOMOTION_CONFIG: LocomotionConfig = {
  selfWind: true,
  selfWindScale: 0.6,
  intensityCurve: DEFAULT_INTENSITY_CURVE,
  emaAlpha: 0.1,
};

// =============================================================================
// Interfaces — Wind Zones
// =============================================================================

/**
 * Gust cycle configuration for periodic wind surges.
 */
export interface GustConfig {
  /** Time between gusts in seconds */
  interval: number;
  /** Peak force multiplier during gust */
  strength: number;
  /** How long each gust lasts in seconds */
  duration: number;
}

/**
 * An environment wind zone (localized or global wind source).
 */
export interface WindZone {
  /** Unique identifier */
  id: string;
  /** Zone type */
  type: WindZoneType;
  /** World-space position (for POINT and DIRECTIONAL) */
  position?: IVector3;
  /** Force direction (normalized for DIRECTIONAL/GLOBAL) */
  direction: IVector3;
  /** Base force magnitude */
  force: number;
  /** Effective radius (for POINT zones) */
  radius?: number;
  /** Cone half-angle in radians (for DIRECTIONAL zones) */
  coneAngle?: number;
  /** Turbulence amount 0-1 (adds noise to force) */
  turbulence: number;
  /** Optional gust cycle */
  gust?: GustConfig;
  /** Whether zone is active */
  enabled: boolean;
}

// =============================================================================
// Interfaces — Activation Controller Config
// =============================================================================

/**
 * Full physics activation controller configuration.
 *
 * HoloScript syntax maps directly:
 * ```holoscript
 * activation {
 *   mode: trigger_based
 *   rest_pose: "cape_rest.glb"
 *   triggers { velocity: {wake: 0.1, sleep: 0.05, sleep_delay: 0.5s} ... }
 *   wake_blend: 0.3s
 *   settle_damping: 3.0
 *   settle_threshold: 0.001
 * }
 * ```
 */
export interface PhysicsActivationConfig {
  /** Activation mode: 'trigger_based' for sleep/wake, 'always_on' to skip activation */
  mode: 'trigger_based' | 'always_on';

  /** Trigger configuration */
  triggers: ActivationTriggers;

  /** Duration of WAKING blend from rest pose to sim (seconds). Default 0.3 */
  wakeBlendDuration: number;

  /** Damping multiplier during SETTLING state. Default 3.0 */
  settleDamping: number;

  /** Velocity epsilon below which all vertices are considered at rest. Default 0.001 */
  settleThreshold: number;

  /** Maximum SETTLING duration before forcing sleep (seconds). Default 2.0 */
  maxSettleDuration: number;

  /** Locomotion-driven intensity config (optional) */
  locomotion?: LocomotionConfig;
}

/**
 * Default activation config.
 */
export const DEFAULT_ACTIVATION_CONFIG: PhysicsActivationConfig = {
  mode: 'trigger_based',
  triggers: {
    velocity: { wake: 0.1, sleep: 0.05, sleepDelay: 0.5 },
    wind: { wake: 0.3, sleep: 0.1, sleepDelay: 1.0 },
    collision: { wake: true, sleepDelay: 0.5 },
    animation: { events: ['jump', 'attack', 'dodge', 'turn_sharp'] },
  },
  wakeBlendDuration: 0.3,
  settleDamping: 3.0,
  settleThreshold: 0.001,
  maxSettleDuration: 2.0,
  locomotion: DEFAULT_LOCOMOTION_CONFIG,
};

// =============================================================================
// Internal — Trigger State Tracking
// =============================================================================

interface TriggerState {
  active: boolean;
  /** Time remaining on sleep delay (counts down when below sleep threshold) */
  sleepDelayRemaining: number;
}

// =============================================================================
// Wind Zone Manager
// =============================================================================

/**
 * Manages environment wind zones and computes aggregate wind force at a point.
 * Connects to WeatherBlackboard for global/ambient wind.
 */
export class WindZoneManager {
  private zones: Map<string, WindZone> = new Map();
  private time = 0;

  /**
   * Add or update a wind zone.
   */
  addZone(zone: WindZone): void {
    this.zones.set(zone.id, { ...zone });
  }

  /**
   * Remove a wind zone by ID.
   */
  removeZone(id: string): boolean {
    return this.zones.delete(id);
  }

  /**
   * Get a wind zone by ID.
   */
  getZone(id: string): WindZone | undefined {
    return this.zones.get(id);
  }

  /**
   * Get all registered wind zones.
   */
  getAllZones(): WindZone[] {
    return Array.from(this.zones.values());
  }

  /**
   * Advance internal time (for gust cycles).
   */
  advanceTime(dt: number): void {
    this.time += dt;
  }

  /**
   * Get the current internal time.
   */
  getTime(): number {
    return this.time;
  }

  /**
   * Compute the aggregate wind force at a world-space position,
   * combining all active wind zones + optional WeatherBlackboard ambient wind.
   *
   * @param worldPos - Sample point in world space
   * @param weather - Optional WeatherBlackboard state for ambient wind
   * @returns Aggregate wind force vector
   */
  computeWindAt(worldPos: IVector3, weather?: WeatherBlackboardState): IVector3 {
    let wx = 0,
      wy = 0,
      wz = 0;

    // Add ambient wind from WeatherBlackboard
    if (weather) {
      wx += weather.wind_vector[0];
      wy += weather.wind_vector[1];
      wz += weather.wind_vector[2];
    }

    // Accumulate all zone contributions
    for (const zone of this.zones.values()) {
      if (!zone.enabled) continue;

      const contribution = this.computeZoneContribution(zone, worldPos);
      wx += contribution.x;
      wy += contribution.y;
      wz += contribution.z;
    }

    return { x: wx, y: wy, z: wz };
  }

  /**
   * Compute a single zone's contribution at a point.
   */
  private computeZoneContribution(zone: WindZone, pos: IVector3): IVector3 {
    let forceMagnitude = zone.force;

    // Apply gust cycle
    if (zone.gust) {
      const cyclePos = this.time % zone.gust.interval;
      if (cyclePos < zone.gust.duration) {
        // Inside gust — ramp up and down with sine curve
        const gustT = cyclePos / zone.gust.duration;
        const gustMultiplier = Math.sin(gustT * Math.PI);
        forceMagnitude *= 1.0 + (zone.gust.strength - 1.0) * gustMultiplier;
      }
    }

    // Add turbulence (deterministic noise based on time)
    if (zone.turbulence > 0) {
      const noiseScale = zone.turbulence * 0.3;
      // Simple deterministic turbulence using sin waves
      const tx = Math.sin(this.time * 2.17 + pos.x * 0.5) * noiseScale;
      const ty = Math.sin(this.time * 1.83 + pos.y * 0.5) * noiseScale;
      const tz = Math.sin(this.time * 3.07 + pos.z * 0.5) * noiseScale;
      forceMagnitude *= 1.0 + tx + ty + tz;
    }

    switch (zone.type) {
      case WindZoneType.GLOBAL:
        return {
          x: zone.direction.x * forceMagnitude,
          y: zone.direction.y * forceMagnitude,
          z: zone.direction.z * forceMagnitude,
        };

      case WindZoneType.POINT: {
        if (!zone.position || !zone.radius) {
          return { x: 0, y: 0, z: 0 };
        }
        const dx = pos.x - zone.position.x;
        const dy = pos.y - zone.position.y;
        const dz = pos.z - zone.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > zone.radius || dist < 0.001) {
          return { x: 0, y: 0, z: 0 };
        }

        // Falloff: linear from center to radius
        const falloff = 1.0 - dist / zone.radius;
        const f = forceMagnitude * falloff;

        // Direction: zone.direction (e.g., updraft = [0,1,0])
        return {
          x: zone.direction.x * f,
          y: zone.direction.y * f,
          z: zone.direction.z * f,
        };
      }

      case WindZoneType.DIRECTIONAL: {
        if (!zone.position || zone.coneAngle === undefined) {
          return { x: 0, y: 0, z: 0 };
        }
        const toPosX = pos.x - zone.position.x;
        const toPosY = pos.y - zone.position.y;
        const toPosZ = pos.z - zone.position.z;
        const toDist = Math.sqrt(toPosX * toPosX + toPosY * toPosY + toPosZ * toPosZ);

        if (toDist < 0.001) {
          return {
            x: zone.direction.x * forceMagnitude,
            y: zone.direction.y * forceMagnitude,
            z: zone.direction.z * forceMagnitude,
          };
        }

        // Normalize direction to point
        const normX = toPosX / toDist;
        const normY = toPosY / toDist;
        const normZ = toPosZ / toDist;

        // Dot product with zone direction = cosine of angle
        const dot = normX * zone.direction.x + normY * zone.direction.y + normZ * zone.direction.z;
        const cosCone = Math.cos(zone.coneAngle);

        if (dot < cosCone) {
          return { x: 0, y: 0, z: 0 }; // Outside cone
        }

        // Smooth falloff from cone center to edge
        const coneFalloff = (dot - cosCone) / (1.0 - cosCone);
        // Distance falloff (uses radius if provided, else no distance falloff)
        const distFalloff = zone.radius ? Math.max(0, 1.0 - toDist / zone.radius) : 1.0;
        const f = forceMagnitude * coneFalloff * distFalloff;

        return {
          x: zone.direction.x * f,
          y: zone.direction.y * f,
          z: zone.direction.z * f,
        };
      }

      default:
        return { x: 0, y: 0, z: 0 };
    }
  }
}

// =============================================================================
// Velocity Smoother (EMA — Exponential Moving Average)
// =============================================================================

/**
 * Smooths a 3D velocity vector using Exponential Moving Average.
 * Prevents hair/cloth whip on instant direction changes (G.CHAR.006).
 *
 * EMA formula: smoothed = alpha * current + (1 - alpha) * previous
 * Lower alpha = smoother (more lag), higher alpha = more responsive.
 */
export class VelocitySmoother {
  private smoothedX = 0;
  private smoothedY = 0;
  private smoothedZ = 0;
  private initialized = false;
  private readonly alpha: number;

  constructor(alpha: number = 0.1) {
    this.alpha = Math.max(0.001, Math.min(1.0, alpha));
  }

  /**
   * Update with a new raw velocity sample and return smoothed result.
   */
  update(raw: IVector3): IVector3 {
    if (!this.initialized) {
      this.smoothedX = raw.x;
      this.smoothedY = raw.y;
      this.smoothedZ = raw.z;
      this.initialized = true;
    } else {
      this.smoothedX = this.alpha * raw.x + (1 - this.alpha) * this.smoothedX;
      this.smoothedY = this.alpha * raw.y + (1 - this.alpha) * this.smoothedY;
      this.smoothedZ = this.alpha * raw.z + (1 - this.alpha) * this.smoothedZ;
    }

    return { x: this.smoothedX, y: this.smoothedY, z: this.smoothedZ };
  }

  /**
   * Get current smoothed velocity without updating.
   */
  getCurrent(): IVector3 {
    return { x: this.smoothedX, y: this.smoothedY, z: this.smoothedZ };
  }

  /**
   * Get the magnitude of the current smoothed velocity.
   */
  getSpeed(): number {
    return Math.sqrt(
      this.smoothedX * this.smoothedX +
        this.smoothedY * this.smoothedY +
        this.smoothedZ * this.smoothedZ
    );
  }

  /**
   * Reset to uninitialized state.
   */
  reset(): void {
    this.smoothedX = 0;
    this.smoothedY = 0;
    this.smoothedZ = 0;
    this.initialized = false;
  }
}

// =============================================================================
// Locomotion Intensity Evaluator
// =============================================================================

/**
 * Evaluates the physics intensity (0-1) from a speed value using
 * the configured intensity curve (piecewise linear interpolation).
 */
export function evaluateIntensityCurve(speed: number, curve: IntensityCurvePoint[]): number {
  if (curve.length === 0) return 0;
  if (speed <= curve[0].speed) return curve[0].intensity;
  if (speed >= curve[curve.length - 1].speed) return curve[curve.length - 1].intensity;

  // Find the two bracketing points
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (speed >= a.speed && speed <= b.speed) {
      const t = (speed - a.speed) / (b.speed - a.speed);
      return a.intensity + t * (b.intensity - a.intensity);
    }
  }

  return curve[curve.length - 1].intensity;
}

/**
 * Compute the self-wind vector from character velocity.
 * Self-wind opposes movement direction (headwind effect).
 *
 * @param smoothedVelocity - EMA-smoothed character velocity
 * @param scale - Self-wind scale factor (0-1)
 * @returns Opposing wind force vector
 */
export function computeSelfWind(smoothedVelocity: IVector3, scale: number): IVector3 {
  return {
    x: -smoothedVelocity.x * scale,
    y: -smoothedVelocity.y * scale,
    z: -smoothedVelocity.z * scale,
  };
}

// =============================================================================
// Interfaces — Update Input
// =============================================================================

/**
 * Per-frame input to the activation controller.
 */
export interface ActivationUpdateInput {
  /** Character root bone velocity (raw, will be EMA-smoothed internally) */
  characterVelocity?: IVector3;
  /** External wind force at simulation position */
  windForce?: IVector3;
  /** Current gravity vector (for gravity change detection) */
  gravity?: IVector3;
}

// =============================================================================
// Physics Activation Controller
// =============================================================================

/**
 * Per-simulation activation controller.
 *
 * One controller per cloth/hair simulation instance. Manages the 4-state
 * sleep/wake machine, evaluates triggers, computes locomotion intensity,
 * and provides blending parameters for the owning solver.
 *
 * The controller does NOT run physics itself. It tells the solver:
 * - Whether to simulate this frame (isSimulating())
 * - What damping to use (getEffectiveDamping())
 * - What wind force to apply (getEffectiveWind())
 * - The current blend weight for WAKING transitions (getBlendWeight())
 * - The current physics intensity from locomotion (getIntensity())
 *
 * Usage:
 * ```typescript
 * const ctrl = new PhysicsActivationController(config);
 * // Each frame:
 * ctrl.update(dt, { characterVelocity, windForce, ... });
 * if (ctrl.isSimulating()) {
 *   solver.setDamping(ctrl.getEffectiveDamping(baseDamping));
 *   solver.setWind(ctrl.getEffectiveWind());
 *   solver.step(dt);
 * }
 * ```
 */
export class PhysicsActivationController {
  private state: PhysicsActivationState = PhysicsActivationState.SLEEPING;
  private config: PhysicsActivationConfig;

  // State timing
  private stateTime = 0;

  // Trigger states
  private triggerStates: Map<ActivationTriggerType, TriggerState> = new Map();

  // Locomotion
  private velocitySmoother: VelocitySmoother;
  private currentIntensity = 0;
  private selfWindVector: IVector3 = { x: 0, y: 0, z: 0 };

  // Wind
  private currentWindForce: IVector3 = { x: 0, y: 0, z: 0 };

  // Settling
  private maxVertexVelocity = 0;

  // Previous gravity (for gravity change trigger)
  private previousGravity: IVector3 = { x: 0, y: -9.81, z: 0 };

  // Active animation events this frame
  private activeAnimationEvents: Set<string> = new Set();

  constructor(config?: Partial<PhysicsActivationConfig>) {
    // Determine locomotion config: explicit undefined = disabled, object = merge with defaults
    const hasExplicitLocomotion = config && 'locomotion' in config;
    const locomotionConfig = hasExplicitLocomotion
      ? config!.locomotion
        ? { ...DEFAULT_LOCOMOTION_CONFIG, ...config!.locomotion }
        : undefined
      : DEFAULT_LOCOMOTION_CONFIG;

    this.config = {
      ...DEFAULT_ACTIVATION_CONFIG,
      ...config,
      triggers: {
        ...DEFAULT_ACTIVATION_CONFIG.triggers,
        ...config?.triggers,
      },
      locomotion: locomotionConfig,
    };

    const emaAlpha = this.config.locomotion?.emaAlpha ?? 0.1;
    this.velocitySmoother = new VelocitySmoother(emaAlpha);

    // Initialize trigger states
    if (this.config.triggers.velocity) {
      this.triggerStates.set(ActivationTriggerType.VELOCITY, {
        active: false,
        sleepDelayRemaining: 0,
      });
    }
    if (this.config.triggers.wind) {
      this.triggerStates.set(ActivationTriggerType.WIND, {
        active: false,
        sleepDelayRemaining: 0,
      });
    }
    if (this.config.triggers.collision) {
      this.triggerStates.set(ActivationTriggerType.COLLISION, {
        active: false,
        sleepDelayRemaining: 0,
      });
    }
    if (this.config.triggers.animation) {
      this.triggerStates.set(ActivationTriggerType.ANIMATION, {
        active: false,
        sleepDelayRemaining: 0,
      });
    }
    if (this.config.triggers.gravity) {
      this.triggerStates.set(ActivationTriggerType.GRAVITY, {
        active: false,
        sleepDelayRemaining: 0,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Public — State queries
  // ---------------------------------------------------------------------------

  /**
   * Get the current activation state.
   */
  getState(): PhysicsActivationState {
    return this.state;
  }

  /**
   * Whether the physics solver should run this frame.
   * SLEEPING = false, all others = true.
   * If mode is 'always_on', always returns true.
   */
  isSimulating(): boolean {
    if (this.config.mode === 'always_on') return true;
    return this.state !== PhysicsActivationState.SLEEPING;
  }

  /**
   * Get the current blend weight for WAKING transitions.
   * 0.0 = fully rest pose, 1.0 = fully simulated.
   * Returns 1.0 for ACTIVE and SETTLING states.
   */
  getBlendWeight(): number {
    if (this.config.mode === 'always_on') return 1.0;

    switch (this.state) {
      case PhysicsActivationState.SLEEPING:
        return 0.0;
      case PhysicsActivationState.WAKING: {
        const t = Math.min(1.0, this.stateTime / this.config.wakeBlendDuration);
        // Smooth step for natural blending (no linear pop)
        return t * t * (3 - 2 * t);
      }
      case PhysicsActivationState.ACTIVE:
        return 1.0;
      case PhysicsActivationState.SETTLING:
        return 1.0;
    }
  }

  /**
   * Get the effective damping multiplier.
   * During SETTLING, damping is multiplied by settleDamping (3-5x).
   * Otherwise returns 1.0 (no modification to base damping).
   */
  getEffectiveDampingMultiplier(): number {
    if (this.state === PhysicsActivationState.SETTLING) {
      return this.config.settleDamping;
    }
    return 1.0;
  }

  /**
   * Apply the activation damping multiplier to a base damping value.
   * Clamps result to [0, 1].
   */
  getEffectiveDamping(baseDamping: number): number {
    if (this.state === PhysicsActivationState.SETTLING) {
      // During settling, increase damping toward 1.0 (full damping)
      return Math.min(
        1.0,
        baseDamping + (1.0 - baseDamping) * (1.0 - 1.0 / this.config.settleDamping)
      );
    }
    return baseDamping;
  }

  /**
   * Get current physics intensity from locomotion (0-1).
   * Controls stiffness reduction, wind multiplier, inertia response.
   */
  getIntensity(): number {
    return this.currentIntensity;
  }

  /**
   * Get the current self-wind vector from character locomotion.
   * Opposes movement direction (headwind effect).
   */
  getSelfWind(): IVector3 {
    return { ...this.selfWindVector };
  }

  /**
   * Get the last computed external wind force at the simulation's position.
   */
  getWindForce(): IVector3 {
    return { ...this.currentWindForce };
  }

  /**
   * Get the total effective wind = external wind + self-wind.
   */
  getEffectiveWind(): IVector3 {
    return {
      x: this.currentWindForce.x + this.selfWindVector.x,
      y: this.currentWindForce.y + this.selfWindVector.y,
      z: this.currentWindForce.z + this.selfWindVector.z,
    };
  }

  /**
   * Get how long the controller has been in the current state (seconds).
   */
  getStateTime(): number {
    return this.stateTime;
  }

  /**
   * Check if any trigger is currently active.
   */
  hasActiveTrigger(): boolean {
    for (const ts of this.triggerStates.values()) {
      if (ts.active) return true;
    }
    return false;
  }

  /**
   * Check if a specific trigger type is currently active.
   */
  isTriggerActive(type: ActivationTriggerType): boolean {
    return this.triggerStates.get(type)?.active ?? false;
  }

  /**
   * Get the configuration.
   */
  getConfig(): Readonly<PhysicsActivationConfig> {
    return this.config;
  }

  // ---------------------------------------------------------------------------
  // Public — External events
  // ---------------------------------------------------------------------------

  /**
   * Notify the controller of an animation event (e.g., "jump", "attack").
   * If the event matches a configured trigger, it activates.
   */
  notifyAnimationEvent(eventName: string): void {
    this.activeAnimationEvents.add(eventName);
  }

  /**
   * Notify the controller of a collision event.
   */
  notifyCollision(): void {
    const ts = this.triggerStates.get(ActivationTriggerType.COLLISION);
    if (ts && this.config.triggers.collision?.wake) {
      ts.active = true;
      ts.sleepDelayRemaining = this.config.triggers.collision.sleepDelay;
    }
  }

  /**
   * Provide the maximum vertex velocity for SETTLING convergence check.
   * The solver should call this each frame with the max velocity across all particles.
   */
  reportMaxVertexVelocity(velocity: number): void {
    this.maxVertexVelocity = velocity;
  }

  /**
   * Force an immediate transition to a specific state.
   * Use with caution — typically the state machine manages transitions.
   */
  forceState(state: PhysicsActivationState): void {
    this.state = state;
    this.stateTime = 0;
  }

  // ---------------------------------------------------------------------------
  // Public — Main update
  // ---------------------------------------------------------------------------

  /**
   * Main update. Call once per frame before running the physics solver.
   *
   * @param dt - Delta time in seconds
   * @param input - Frame input (velocity, wind, gravity)
   */
  update(dt: number, input: ActivationUpdateInput = {}): void {
    if (this.config.mode === 'always_on') {
      this.updateLocomotion(input.characterVelocity);
      this.currentWindForce = input.windForce ?? { x: 0, y: 0, z: 0 };
      return;
    }

    this.stateTime += dt;

    // Update triggers
    this.updateVelocityTrigger(input.characterVelocity);
    this.updateWindTrigger(input.windForce);
    this.updateAnimationTrigger();
    this.updateGravityTrigger(input.gravity);
    this.updateCollisionTriggerDecay(dt);

    // Update locomotion
    this.updateLocomotion(input.characterVelocity);

    // Store wind force
    this.currentWindForce = input.windForce ?? { x: 0, y: 0, z: 0 };

    // Run state machine
    this.updateStateMachine(dt);

    // Clear per-frame event sets
    this.activeAnimationEvents.clear();
  }

  // ---------------------------------------------------------------------------
  // Private — Trigger evaluation
  // ---------------------------------------------------------------------------

  private updateVelocityTrigger(velocity?: IVector3): void {
    const ts = this.triggerStates.get(ActivationTriggerType.VELOCITY);
    const cfg = this.config.triggers.velocity;
    if (!ts || !cfg) return;

    const speed = velocity
      ? Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z)
      : 0;

    if (speed >= cfg.wake) {
      ts.active = true;
      ts.sleepDelayRemaining = cfg.sleepDelay;
    } else if (speed < cfg.sleep) {
      // Below sleep threshold — start countdown
      if (ts.active && ts.sleepDelayRemaining <= 0) {
        ts.active = false;
      }
    } else {
      // Between sleep and wake — maintain current state but reset delay if active
      if (ts.active) {
        ts.sleepDelayRemaining = cfg.sleepDelay;
      }
    }
  }

  private updateWindTrigger(windForce?: IVector3): void {
    const ts = this.triggerStates.get(ActivationTriggerType.WIND);
    const cfg = this.config.triggers.wind;
    if (!ts || !cfg) return;

    const magnitude = windForce
      ? Math.sqrt(windForce.x * windForce.x + windForce.y * windForce.y + windForce.z * windForce.z)
      : 0;

    if (magnitude >= cfg.wake) {
      ts.active = true;
      ts.sleepDelayRemaining = cfg.sleepDelay;
    } else if (magnitude < cfg.sleep) {
      if (ts.active && ts.sleepDelayRemaining <= 0) {
        ts.active = false;
      }
    } else {
      if (ts.active) {
        ts.sleepDelayRemaining = cfg.sleepDelay;
      }
    }
  }

  private updateAnimationTrigger(): void {
    const ts = this.triggerStates.get(ActivationTriggerType.ANIMATION);
    const cfg = this.config.triggers.animation;
    if (!ts || !cfg) return;

    // Check if any active animation event matches configured events
    let matched = false;
    for (const evt of this.activeAnimationEvents) {
      if (cfg.events.includes(evt)) {
        matched = true;
        break;
      }
    }

    if (matched) {
      ts.active = true;
      ts.sleepDelayRemaining = 0.5; // Animation events clear after 0.5s
    } else if (ts.active && ts.sleepDelayRemaining <= 0) {
      ts.active = false;
    }
  }

  private updateGravityTrigger(gravity?: IVector3): void {
    const ts = this.triggerStates.get(ActivationTriggerType.GRAVITY);
    const cfg = this.config.triggers.gravity;
    if (!ts || !cfg || !gravity) return;

    const dx = gravity.x - this.previousGravity.x;
    const dy = gravity.y - this.previousGravity.y;
    const dz = gravity.z - this.previousGravity.z;
    const delta = Math.sqrt(dx * dx + dy * dy + dz * dz);

    this.previousGravity = { ...gravity };

    if (delta >= cfg.wake) {
      ts.active = true;
      ts.sleepDelayRemaining = cfg.sleepDelay;
    } else if (delta < cfg.sleep) {
      if (ts.active && ts.sleepDelayRemaining <= 0) {
        ts.active = false;
      }
    }
  }

  private updateCollisionTriggerDecay(dt: number): void {
    const ts = this.triggerStates.get(ActivationTriggerType.COLLISION);
    if (!ts) return;

    // Collision trigger has no per-frame value — it's event-driven.
    // Decay the sleep delay timer.
    if (ts.active && ts.sleepDelayRemaining > 0) {
      ts.sleepDelayRemaining -= dt;
      if (ts.sleepDelayRemaining <= 0) {
        ts.active = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — Sleep delay countdown (for threshold triggers)
  // ---------------------------------------------------------------------------

  private decayTriggerDelays(dt: number): void {
    for (const [type, ts] of this.triggerStates.entries()) {
      if (type === ActivationTriggerType.COLLISION) continue; // Handled separately
      if (ts.active && ts.sleepDelayRemaining > 0) {
        ts.sleepDelayRemaining -= dt;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private — Locomotion
  // ---------------------------------------------------------------------------

  private updateLocomotion(velocity?: IVector3): void {
    const loco = this.config.locomotion;
    if (!loco) {
      this.currentIntensity = 0;
      this.selfWindVector = { x: 0, y: 0, z: 0 };
      return;
    }

    // Smooth velocity with EMA
    const raw = velocity ?? { x: 0, y: 0, z: 0 };
    const smoothed = this.velocitySmoother.update(raw);
    const speed = this.velocitySmoother.getSpeed();

    // Evaluate intensity curve
    this.currentIntensity = evaluateIntensityCurve(speed, loco.intensityCurve);

    // Compute self-wind
    if (loco.selfWind) {
      this.selfWindVector = computeSelfWind(smoothed, loco.selfWindScale);
    } else {
      this.selfWindVector = { x: 0, y: 0, z: 0 };
    }
  }

  // ---------------------------------------------------------------------------
  // Private — State machine transitions
  // ---------------------------------------------------------------------------

  private updateStateMachine(dt: number): void {
    // Decay sleep delays for threshold-based triggers
    this.decayTriggerDelays(dt);

    const anyActive = this.hasActiveTrigger();

    switch (this.state) {
      case PhysicsActivationState.SLEEPING:
        if (anyActive) {
          this.transitionTo(PhysicsActivationState.WAKING);
        }
        break;

      case PhysicsActivationState.WAKING:
        if (this.stateTime >= this.config.wakeBlendDuration) {
          this.transitionTo(PhysicsActivationState.ACTIVE);
        }
        break;

      case PhysicsActivationState.ACTIVE:
        if (!anyActive) {
          this.transitionTo(PhysicsActivationState.SETTLING);
        }
        break;

      case PhysicsActivationState.SETTLING:
        // Check if all vertices have settled
        if (this.maxVertexVelocity < this.config.settleThreshold) {
          this.transitionTo(PhysicsActivationState.SLEEPING);
        }
        // Force sleep after max settle duration
        else if (this.stateTime >= this.config.maxSettleDuration) {
          this.transitionTo(PhysicsActivationState.SLEEPING);
        }
        // Re-activate if new trigger appears
        else if (anyActive) {
          this.transitionTo(PhysicsActivationState.ACTIVE);
        }
        break;
    }
  }

  private transitionTo(newState: PhysicsActivationState): void {
    this.state = newState;
    this.stateTime = 0;
  }
}

