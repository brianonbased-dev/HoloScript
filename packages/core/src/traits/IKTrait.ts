import type { Vector3 } from '../types';
/**
 * @holoscript/core IK Trait (Inverse Kinematics)
 *
 * Enables procedural animation through inverse kinematics.
 * Supports FABRIK and CCD solvers for skeletal animation.
 *
 * @example
 * ```hsplus
 * object "Robot" {
 *   @ik {
 *     chain: "RightArm",
 *     target: "TargetSphere",
 *     poleTarget: "ElbowHint",
 *     chainLength: 3,
 *     iterations: 10,
 *     weight: 1.0
 *   }
 * }
 * ```
 */

export type IKSolverType = 'fabrik' | 'ccd' | 'two-bone' | 'full-body';

/**
 * 3D Vector
 */


/**
 * Quaternion rotation — canonical 4-tuple definition lives at
 * packages/core/src/types/HoloScriptPlus.ts:26. Founder ruling (2026-04-28):
 * single source of truth (this file's previous local
 * `type Quaternion = [number, number, number, number]` was the same shape
 * but a separate declaration; importing eliminates the cross-file drift
 * that produced HumanoidLoader.ts:115 + SkeletonTrait.ts:35 object-form
 * divergence).
 */
import type { Quaternion } from '../types/HoloScriptPlus';
export type { Quaternion };

/**
 * Transform
 */
export interface Transform {
  position: Vector3;
  rotation: Quaternion;
  scale?: Vector3;
}

/**
 * Bone definition
 */
export interface IKBone {
  /** Bone name */
  name: string;

  /** Bone length */
  length: number;

  /** Parent bone name */
  parent?: string;

  /** Local rotation constraints */
  constraints?: BoneConstraints;

  /** Bone transform */
  transform?: Transform;

  /** Weight for this bone (0-1) */
  weight?: number;
}

/**
 * Bone rotation constraints
 */
export interface BoneConstraints {
  /** Min/max X rotation (twist) */
  xRotation?: { min: number; max: number };

  /** Min/max Y rotation */
  yRotation?: { min: number; max: number };

  /** Min/max Z rotation */
  zRotation?: { min: number; max: number };

  /** Lock specific axes */
  locked?: ('x' | 'y' | 'z')[];

  /** Stiffness (resistance to movement) */
  stiffness?: number;
}

/**
 * IK chain definition
 */
export interface IKChain {
  /** Chain name */
  name: string;

  /** Bones in the chain (root to tip) */
  bones: IKBone[];

  /** Solver type */
  solver?: IKSolverType;

  /** Target object/transform */
  target?: string | Transform;

  /** Pole target for bend direction */
  poleTarget?: string | Vector3;

  /** Weight (0-1) */
  weight?: number;
}

/**
 * IK configuration
 */
export interface IKConfig {
  /** Chain name or definition */
  chain: string | IKChain;

  /** Target object ID */
  target?: string;

  /** Target position (if not using object) */
  targetPosition?: Vector3;

  /** Pole target for elbow/knee direction */
  poleTarget?: string;

  /** Pole target position (if not using object) */
  polePosition?: Vector3;

  /** Chain length (number of bones, auto-detect if not specified) */
  chainLength?: number;

  /** Solver iterations */
  iterations?: number;

  /** Solver tolerance (stop if reached) */
  tolerance?: number;

  /** IK weight (0-1, for blending with animation) */
  weight?: number;

  /** Solver type */
  solver?: IKSolverType;

  /** Enable stretching */
  stretch?: boolean;

  /** Max stretch ratio */
  maxStretch?: number;

  /** Pin root (don't move first bone) */
  pinRoot?: boolean;

  /** Update mode */
  updateMode?: 'update' | 'lateUpdate' | 'fixedUpdate';
}

/**
 * IK solve result
 */
export interface IKSolveResult {
  /** Whether target was reached */
  reached: boolean;

  /** Final distance to target */
  distanceToTarget: number;

  /** Iterations used */
  iterationsUsed: number;

  /** Bone transforms after solve */
  boneTransforms: Map<string, Transform>;

  /** Solve time in ms */
  solveTimeMs: number;
}

// ============================================================================
// IKTrait Class
// ============================================================================

/**
 * IKTrait - Enables inverse kinematics for skeletal animation
 */
export class IKTrait {
  private config: IKConfig;
  private chain: IKChain | null = null;
  private lastResult: IKSolveResult | null = null;
  private enabled: boolean = true;
  // Foot-lock state — driven by NeuralAnimationTrait on_foot_contact events
  // (idea-run-3 WIRE-1 seam). Runtime IK solver reads getFootLockState() to
  // pin foot effectors when locked=true.
  private footLockState: { left: boolean; right: boolean } = { left: false, right: false };

  /** Set foot-lock state for one side. Called from on_foot_contact handler. */
  public setFootLock(side: 'left' | 'right', locked: boolean): void {
    this.footLockState[side] = locked;
  }

  /** Read current foot-lock state. Runtime IK solver consults this each tick. */
  public getFootLockState(): { left: boolean; right: boolean } {
    return { ...this.footLockState };
  }

  constructor(config: IKConfig) {
    this.config = {
      iterations: 10,
      tolerance: 0.001,
      weight: 1.0,
      solver: 'fabrik',
      stretch: false,
      maxStretch: 1.5,
      pinRoot: true,
      updateMode: 'lateUpdate',
      ...config,
    };

    // Initialize chain if provided as object
    if (typeof config.chain === 'object') {
      this.chain = config.chain;
    }
  }

  /**
   * Get configuration
   */
  public getConfig(): IKConfig {
    return { ...this.config };
  }

  /**
   * Set IK chain
   */
  public setChain(chain: IKChain): void {
    this.chain = chain;
  }

  /**
   * Get IK chain
   */
  public getChain(): IKChain | null {
    return this.chain;
  }

  /**
   * Set target position
   */
  public setTarget(target: string | Vector3): void {
    if (typeof target === 'string') {
      this.config.target = target;
      this.config.targetPosition = undefined;
    } else {
      this.config.targetPosition = target;
      this.config.target = undefined;
    }
  }

  /**
   * Set pole target
   */
  public setPoleTarget(pole: string | Vector3): void {
    if (typeof pole === 'string') {
      this.config.poleTarget = pole;
      this.config.polePosition = undefined;
    } else {
      this.config.polePosition = pole;
      this.config.poleTarget = undefined;
    }
  }

  /**
   * Set weight
   */
  public setWeight(weight: number): void {
    this.config.weight = Math.max(0, Math.min(1, weight));
  }

  /**
   * Get weight
   */
  public getWeight(): number {
    return this.config.weight ?? 1.0;
  }

  /**
   * Enable/disable IK
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if enabled
   */
  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Solve IK (FABRIK algorithm)
   */
  public solve(targetPosition: Vector3): IKSolveResult {
    const startTime = performance.now();

    if (!this.chain || this.chain.bones.length === 0) {
      return {
        reached: false,
        distanceToTarget: Infinity,
        iterationsUsed: 0,
        boneTransforms: new Map(),
        solveTimeMs: performance.now() - startTime,
      };
    }

    // Get chain length
    const chainLength = this.config.chainLength || this.chain.bones.length;
    const bones = this.chain.bones.slice(0, chainLength);

    // Calculate total chain length
    const totalLength = bones.reduce((sum, bone) => sum + bone.length, 0);

    // Get root position
    const rootPos = bones[0].transform?.position || [0, 0, 0 ];

    // Calculate distance to target
    const distToTarget = this.distance(rootPos, targetPosition);

    // Check if target is reachable
    if (!this.config.stretch && distToTarget > totalLength) {
      // Target unreachable - stretch toward it
      const result = this.stretchTowardTarget(bones, targetPosition);
      return {
        reached: false,
        distanceToTarget: distToTarget - totalLength,
        iterationsUsed: 1,
        boneTransforms: result,
        solveTimeMs: performance.now() - startTime,
      };
    }

    // FABRIK solve
    const bonePositions = this.fabrikSolve(bones, targetPosition);

    // Calculate final distance
    const tipPos = bonePositions[bonePositions.length - 1];
    const finalDist = this.distance(tipPos, targetPosition);

    // Convert positions to transforms
    const transforms = this.positionsToTransforms(bones, bonePositions);

    this.lastResult = {
      reached: finalDist < (this.config.tolerance || 0.001),
      distanceToTarget: finalDist,
      iterationsUsed: this.config.iterations || 10,
      boneTransforms: transforms,
      solveTimeMs: performance.now() - startTime,
    };

    return this.lastResult;
  }

  /**
   * FABRIK (Forward And Backward Reaching Inverse Kinematics) solver
   */
  private fabrikSolve(bones: IKBone[], target: Vector3): Vector3[] {
    const positions: Vector3[] = [];

    // Initialize positions (chain along +Y by default)
    let currentPos = bones[0].transform?.position || ([0, 0, 0] as Vector3);
    positions.push([currentPos[0], currentPos[1], currentPos[2]]);

    for (let i = 0; i < bones.length; i++) {
      const dir = [0, 1, 0] as Vector3;
      positions.push([
        currentPos[0] + dir[0] * bones[i].length,
        currentPos[1] + dir[1] * bones[i].length,
        currentPos[2] + dir[2] * bones[i].length,
      ]);
      currentPos = positions[positions.length - 1];
    }

    const rootPos = positions[0];
    const tolerance = this.config.tolerance || 0.001;
    const maxIterations = this.config.iterations || 10;

    for (let iter = 0; iter < maxIterations; iter++) {
      const tipPos = positions[positions.length - 1];
      if (this.distance(tipPos, target) < tolerance) {
        break;
      }

      positions[positions.length - 1] = [target[0], target[1], target[2]];

      for (let i = bones.length - 1; i >= 0; i--) {
        const p1 = positions[i + 1];
        const p0 = positions[i];
        const length = bones[i].length;
        const dir = this.normalize(this.subtract(p0, p1));
        positions[i] = [
          p1[0] + dir[0] * length,
          p1[1] + dir[1] * length,
          p1[2] + dir[2] * length,
        ];
      }

      if (this.config.pinRoot) {
        positions[0] = [rootPos[0], rootPos[1], rootPos[2]];
      }

      for (let i = 0; i < bones.length; i++) {
        const p0 = positions[i];
        const p1 = positions[i + 1];
        const length = bones[i].length;
        const dir = this.normalize(this.subtract(p1, p0));
        positions[i + 1] = [
          p0[0] + dir[0] * length,
          p0[1] + dir[1] * length,
          p0[2] + dir[2] * length,
        ];
      }
    }

    return positions;
  }

  /**
   * Stretch chain toward unreachable target
   */
  private stretchTowardTarget(bones: IKBone[], target: Vector3): Map<string, Transform> {
    const transforms = new Map<string, Transform>();
    const rootPos = bones[0].transform?.position || ([0, 0, 0] as Vector3);

    const dir = this.normalize(this.subtract(target, rootPos));
    let currentPos: Vector3 = [rootPos[0], rootPos[1], rootPos[2]];

    for (const bone of bones) {
      const nextPos: Vector3 = [
        currentPos[0] + dir[0] * bone.length,
        currentPos[1] + dir[1] * bone.length,
        currentPos[2] + dir[2] * bone.length,
      ];

      transforms.set(bone.name, {
        position: [currentPos[0], currentPos[1], currentPos[2]],
        rotation: this.lookRotation(dir),
      });

      currentPos = nextPos;
    }

    return transforms;
  }

  /**
   * Convert positions to transforms
   */
  private positionsToTransforms(bones: IKBone[], positions: Vector3[]): Map<string, Transform> {
    const transforms = new Map<string, Transform>();

    for (let i = 0; i < bones.length; i++) {
      const bonePos = positions[i];
      const nextPos = positions[i + 1];
      const dir = this.normalize(this.subtract(nextPos, bonePos));

      transforms.set(bones[i].name, {
        position: bonePos,
        rotation: this.lookRotation(dir),
      });
    }

    return transforms;
  }

  /**
   * Calculate distance between two points
   */
  private distance(a: Vector3, b: Vector3): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Subtract two vectors
   */
  private subtract(a: Vector3, b: Vector3): Vector3 {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  /**
   * Normalize a vector
   */
  private normalize(v: Vector3): Vector3 {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    if (len === 0) return [0, 1, 0];
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  /**
   * Create rotation that looks in a direction
   */
  private lookRotation(forward: Vector3): Quaternion {
    // Simplified look rotation (proper implementation would be more complex)
    const up = [0, 1, 0 ];

    // Cross product for right vector
    const right = this.normalize(
      [
        up[1] * forward[2] - up[2] * forward[1],
        up[2] * forward[0] - up[0] * forward[2],
        up[0] * forward[1] - up[1] * forward[0],
      ] as Vector3
    );

    // Recalculate up
    const newUp = this.normalize(
      [
        forward[1] * right[2] - forward[2] * right[1],
        forward[2] * right[0] - forward[0] * right[2],
        forward[0] * right[1] - forward[1] * right[0],
      ] as Vector3
    );

    // Convert rotation matrix to quaternion (simplified)
    const trace = right[0] + newUp[1] + forward[2];
    let w: number, x: number, y: number, z: number;

    if (trace > 0) {
      const s = 0.5 / Math.sqrt(trace + 1.0);
      w = 0.25 / s;
      x = (newUp[2] - forward[1]) * s;
      y = (forward[0] - right[2]) * s;
      z = (right[1] - newUp[0]) * s;
    } else {
      w = 1;
      x = 0;
      y = 0;
      z = 0;
    }

    return [x, y, z, w];
  }

  /**
   * Get last solve result
   */
  public getLastResult(): IKSolveResult | null {
    return this.lastResult;
  }

  /**
   * Serialize for animation system
   */
  public serialize(): Record<string, unknown> {
    return {
      chain: typeof this.config.chain === 'string' ? this.config.chain : this.chain?.name,
      target: this.config.target,
      targetPosition: this.config.targetPosition,
      poleTarget: this.config.poleTarget,
      polePosition: this.config.polePosition,
      weight: this.config.weight,
      iterations: this.config.iterations,
      solver: this.config.solver,
    };
  }
}

/**
 * HoloScript+ @ik trait factory
 */
export function createIKTrait(config?: Partial<IKConfig>): IKTrait {
  return new IKTrait({
    chain: '',
    target: '',
    solver: 'fabrik',
    iterations: 10,
    weight: 1.0,
    tolerance: 0.001,
    ...config,
  });
}

// Re-export type aliases for index.ts
// IKSolverType is already exported at line 21
// IKConfig is already exported at its definition
// IKChain is already exported at its definition
export type BoneConstraint = BoneConstraints;
export type IKTarget = string;

export default IKTrait;

// ── Handler (delegates to IKTrait) ──
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const iKHandler = {
  name: 'i_k',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new IKTrait(config);
    node.__i_k_instance = instance;
    ctx.emit('i_k_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__i_k_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('i_k_detached', { node });
    delete node.__i_k_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__i_k_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'i_k_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('i_k_configured', { node });
    }
    // WIRE-1: NeuralAnimationTrait foot-contact bridge (idea-run-3)
    // When neural locomotion reports a foot contact transition, mirror it
    // into IKTrait's foot-lock state so the runtime solver can pin/release
    // the effector on the correct side.
    if (event.type === 'on_foot_contact') {
      const ikInstance = instance as TraitInstanceDelegate & {
        setFootLock?: (side: 'left' | 'right', locked: boolean) => void;
      };
      const side = event.side as 'left' | 'right' | undefined;
      const locked = event.state as boolean | undefined;
      if (typeof ikInstance.setFootLock === 'function' && (side === 'left' || side === 'right') && typeof locked === 'boolean') {
        ikInstance.setFootLock(side, locked);
        ctx.emit('i_k_foot_lock_changed', { node, side, locked });
      }
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__i_k_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
