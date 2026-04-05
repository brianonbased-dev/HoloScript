/**
 * @holoscript/core Navigation Engine Interface
 *
 * Defines the @builtin runtime interface for GPU-accelerated pathfinding.
 * Runtimes implement this to bridge with GPU-based flow field generators.
 */
import { Vector3 } from '@holoscript/core';

/**
 * Navigation engine configuration
 */
export interface NavigationConfig {
  /** Backend provider (e.g., 'gpu_flowfield', 'recast', 'custom') */
  backend: string;

  /** Dimensions of the navigation grid */
  gridSize: [number, number, number];

  /** Resolution of the grid (meters per cell) */
  resolution: number;

  /** Height of the navigation floor */
  floorY?: number;
}

/**
 * Destination for flow field generation
 */
export interface NavDestination {
  id: string;
  position: Vector3;
  radius?: number;
}

/**
 * NavigationEngine @builtin Interface
 */
export interface NavigationEngine {
  /** Initialize the engine with config */
  initialize(config: NavigationConfig): Promise<void>;

  /**
   * Generate or update a flow field for a destination.
   * This triggers a GPU compute pass.
   */
  updateFlowField(destination: NavDestination): Promise<void>;

  /**
   * Sample the flow field at a given position.
   * Return a direction vector pointing toward the destination.
   */
  sampleDirection(destinationId: string, position: Vector3): Vector3;

  /** Update obstacles in the navigation grid */
  updateObstacle(id: string, position: Vector3, size: Vector3, active: boolean): void;

  /** Dispose resources */
  dispose(): void;
}

/**
 * Global registry for builtin NavigationEngines
 */
export const navigationEngineRegistry = new Map<string, NavigationEngine>();

/**
 * Register a navigation engine implementation
 */
export function registerNavigationEngine(name: string, engine: NavigationEngine): void {
  navigationEngineRegistry.set(name, engine);
}

/**
 * Get a registered navigation engine
 */
export function getNavigationEngine(name: string): NavigationEngine | undefined {
  return navigationEngineRegistry.get(name);
}

