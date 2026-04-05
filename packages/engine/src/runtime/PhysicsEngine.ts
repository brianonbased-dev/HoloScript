/**
 * @holoscript/core Physics Engine Interface
 *
 * Defines the @builtin runtime interface for GPU-accelerated mass physics.
 * Runtimes implement this to bridge with WebGPU, PhysX, or Bullet backends.
 */

/**
 * Physics engine configuration
 */
export interface PhysicsConfig {
  /** Backend provider (e.g., 'webgpu', 'physx-gpu', 'bullet') */
  backend: string;

  /** Gravity vector */
  gravity: [number, number, number];

  /** Global simulation parameters */
  parameters?: {
    substeps?: number;
    solverIterations?: number;
    broadphase?: 'sap' | 'bvh' | 'grid';
    gpuMemoryLimitMB?: number;
  };
}

/**
 * Rigid body properties
 */
export interface BodyProps {
  type: 'dynamic' | 'static' | 'kinematic';
  mass: number;
  position: [number, number, number];
  rotation: [number, number, number, number]; // Quaternion [x, y, z, w]
  velocity?: [number, number, number];
  angularVelocity?: [number, number, number];
  shape: 'box' | 'sphere' | 'capsule' | 'mesh';
  shapeParams?: number[]; // [sizeX, sizeY, sizeZ] for box, [radius] for sphere, etc.
  friction?: number;
  restitution?: number;
  linearDamping?: number;
  angularDamping?: number;
}

/**
 * Current state of a rigid body synced from GPU
 */
export interface BodyState {
  position: [number, number, number];
  rotation: [number, number, number, number];
  velocity: [number, number, number];
  angularVelocity: [number, number, number];
  isSleeping: boolean;
}

/**
 * PhysicsEngine @builtin Interface
 */
export interface PhysicsEngine {
  /** Initialize the engine with config */
  initialize(config: PhysicsConfig): Promise<void>;

  /** Add a body to the simulation */
  addBody(id: string, props: BodyProps): void;

  /** Remove a body from the simulation */
  removeBody(id: string): void;

  /** Update body properties (e.g., teleport, change velocity) */
  updateBody(id: string, props: Partial<BodyProps>): void;

  /** Apply a force or impulse to a body */
  applyForce(id: string, force: [number, number, number], point?: [number, number, number]): void;

  /** Step the simulation */
  step(dt: number): void;

  /**
   * Get the current state of all bodies.
   * This is typically called once per frame to sync GPU state back to CPU objects.
   */
  getStates(): Record<string, BodyState>;

  /** Dispose resources */
  dispose(): void;
}

/**
 * Global registry for builtin PhysicsEngines
 */
export const physicsEngineRegistry = new Map<string, PhysicsEngine>();

/**
 * Register a physics engine implementation
 */
export function registerPhysicsEngine(name: string, engine: PhysicsEngine): void {
  physicsEngineRegistry.set(name, engine);
}

/**
 * Get a registered physics engine
 */
export function getPhysicsEngine(name: string): PhysicsEngine | undefined {
  return physicsEngineRegistry.get(name);
}
