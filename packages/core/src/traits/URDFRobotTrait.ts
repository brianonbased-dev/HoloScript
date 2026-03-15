/**
 * @holoscript/core URDF Robot Trait
 *
 * Enables URDF robot model embedding in HoloScript compositions.
 * When applied to a composition or object, this trait:
 *   - Loads a URDF model (inline XML or file reference)
 *   - Converts the URDF joint hierarchy to a scene graph
 *   - Generates USDZ-compatible output for visionOS web preview
 *   - Supports interactive joint state visualization
 *
 * @example
 * ```hsplus
 * object "MyRobot" {
 *   @urdf_robot {
 *     urdf_source: "package://my_robot/urdf/robot.urdf",
 *     preview_format: "usdz",
 *     interactive_joints: true,
 *     up_axis: "Y",
 *     scale: 1.0
 *   }
 * }
 * ```
 *
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

/** Preview format for the robot model */
export type RobotPreviewFormat = 'usdz' | 'usda' | 'gltf' | 'urdf';

/** Joint visualization mode */
export type JointVisualizationMode = 'none' | 'axes' | 'limits' | 'full';

/**
 * Configuration for the @urdf_robot trait
 */
export interface URDFRobotConfig {
  /** URDF source: file path, package:// URL, or inline XML */
  urdf_source: string;

  /** Inline URDF XML (alternative to urdf_source) */
  urdf_inline?: string;

  /** Robot name override (defaults to URDF robot name) */
  robot_name?: string;

  /** Output preview format for web display */
  preview_format: RobotPreviewFormat;

  /** Enable interactive joint manipulation in preview */
  interactive_joints: boolean;

  /** USD up axis (Y for visionOS, Z for robotics) */
  up_axis: 'Y' | 'Z';

  /** Uniform scale factor */
  scale: number;

  /** Include visual meshes in output */
  include_visual: boolean;

  /** Include collision geometry (as invisible bounds) */
  include_collision: boolean;

  /** Include physics/inertial data */
  include_physics: boolean;

  /** Joint visualization mode */
  joint_visualization: JointVisualizationMode;

  /** Default material color [r, g, b] 0-1 range */
  default_color: [number, number, number];

  /** Mesh path remapping prefix (e.g., "meshes/" to remap package:// paths) */
  mesh_path_prefix?: string;

  /** Apply coordinate transform (URDF Z-up to USD Y-up) */
  apply_coordinate_transform: boolean;

  /** Enable visionOS Safari <model> element output */
  visionos_model_element: boolean;

  /** Alt text for the <model> element */
  model_alt_text?: string;
}

/**
 * Runtime state for the @urdf_robot trait
 */
export interface URDFRobotState {
  /** Whether the URDF has been successfully loaded and parsed */
  isLoaded: boolean;

  /** Number of links in the model */
  linkCount: number;

  /** Number of joints in the model */
  jointCount: number;

  /** Current joint positions (name -> angle/position) */
  jointPositions: Map<string, number>;

  /** Robot name from URDF */
  robotName: string;

  /** Generated USDA content (cached) */
  generatedUSDA: string | null;

  /** Errors encountered during loading */
  errors: string[];
}

/**
 * Joint state change event
 */
export interface URDFRobotJointEvent {
  type: 'joint_change';
  jointName: string;
  position: number;
  timestamp: number;
}

/**
 * Events emitted by the @urdf_robot trait
 */
export type URDFRobotEvent =
  | { type: 'urdf_loaded'; robotName: string; linkCount: number; jointCount: number }
  | { type: 'urdf_error'; error: string }
  | URDFRobotJointEvent
  | { type: 'usdz_generated'; size: number }
  | { type: 'preview_ready'; format: RobotPreviewFormat };

// =============================================================================
// URDF ROBOT TRAIT CLASS
// =============================================================================

/**
 * URDFRobotTrait - Enables URDF robot model embedding in compositions.
 *
 * This trait bridges the robotics world (URDF) with the spatial computing
 * world (USDZ/visionOS), enabling robot models to be previewed in AR/VR
 * contexts and embedded in web experiences via Safari's <model> element.
 */
export class URDFRobotTrait {
  private config: URDFRobotConfig;
  private state: URDFRobotState;
  private eventListeners: Map<string, ((event: URDFRobotEvent) => void)[]> = new Map();

  constructor(config: Partial<URDFRobotConfig> = {}) {
    this.config = {
      urdf_source: config.urdf_source ?? '',
      urdf_inline: config.urdf_inline,
      robot_name: config.robot_name,
      preview_format: config.preview_format ?? 'usdz',
      interactive_joints: config.interactive_joints ?? true,
      up_axis: config.up_axis ?? 'Y',
      scale: config.scale ?? 1.0,
      include_visual: config.include_visual ?? true,
      include_collision: config.include_collision ?? false,
      include_physics: config.include_physics ?? false,
      joint_visualization: config.joint_visualization ?? 'none',
      default_color: config.default_color ?? [0.8, 0.8, 0.8],
      mesh_path_prefix: config.mesh_path_prefix,
      apply_coordinate_transform: config.apply_coordinate_transform ?? true,
      visionos_model_element: config.visionos_model_element ?? true,
      model_alt_text: config.model_alt_text,
    };

    this.state = {
      isLoaded: false,
      linkCount: 0,
      jointCount: 0,
      jointPositions: new Map(),
      robotName: '',
      generatedUSDA: null,
      errors: [],
    };
  }

  /** Get current configuration */
  getConfig(): URDFRobotConfig {
    return { ...this.config };
  }

  /** Get current state */
  getState(): URDFRobotState {
    return {
      ...this.state,
      jointPositions: new Map(this.state.jointPositions),
      errors: [...this.state.errors],
    };
  }

  /** Check if the model has been loaded */
  isLoaded(): boolean {
    return this.state.isLoaded;
  }

  /** Get the robot name */
  getRobotName(): string {
    return this.state.robotName;
  }

  /** Get link count */
  getLinkCount(): number {
    return this.state.linkCount;
  }

  /** Get joint count */
  getJointCount(): number {
    return this.state.jointCount;
  }

  /**
   * Set a joint position value.
   * Emits a 'joint_change' event.
   */
  setJointPosition(jointName: string, position: number): void {
    this.state.jointPositions.set(jointName, position);
    this.state.generatedUSDA = null; // Invalidate cached output

    this.emit({
      type: 'joint_change',
      jointName,
      position,
      timestamp: Date.now(),
    });
  }

  /** Get a specific joint position */
  getJointPosition(jointName: string): number | undefined {
    return this.state.jointPositions.get(jointName);
  }

  /** Get all joint positions as a plain object */
  getJointPositionsObject(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [name, pos] of this.state.jointPositions) {
      result[name] = pos;
    }
    return result;
  }

  /**
   * Mark the model as loaded with parsed information.
   * Called by the converter after successful URDF parsing.
   */
  setLoadedState(
    robotName: string,
    linkCount: number,
    jointCount: number,
    jointNames: string[]
  ): void {
    this.state.isLoaded = true;
    this.state.robotName = robotName;
    this.state.linkCount = linkCount;
    this.state.jointCount = jointCount;
    this.state.errors = [];

    // Initialize joint positions to 0
    for (const name of jointNames) {
      if (!this.state.jointPositions.has(name)) {
        this.state.jointPositions.set(name, 0);
      }
    }

    this.emit({
      type: 'urdf_loaded',
      robotName,
      linkCount,
      jointCount,
    });
  }

  /**
   * Set an error state.
   */
  setError(error: string): void {
    this.state.errors.push(error);
    this.emit({ type: 'urdf_error', error });
  }

  /**
   * Cache the generated USDA output.
   */
  setCachedUSDA(usda: string): void {
    this.state.generatedUSDA = usda;
    this.emit({ type: 'usdz_generated', size: usda.length });
  }

  /** Get cached USDA (or null if invalidated) */
  getCachedUSDA(): string | null {
    return this.state.generatedUSDA;
  }

  /** Add event listener */
  on(event: string, callback: (event: URDFRobotEvent) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)!.push(callback);
  }

  /** Remove event listener */
  off(event: string, callback: (event: URDFRobotEvent) => void): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /** Emit event */
  private emit(event: URDFRobotEvent): void {
    const listeners = this.eventListeners.get(event.type) || [];
    for (const callback of listeners) {
      callback(event);
    }

    // Also emit to wildcard listeners
    const wildcardListeners = this.eventListeners.get('*') || [];
    for (const callback of wildcardListeners) {
      callback(event);
    }
  }

  /**
   * Serialize for storage/transmission.
   */
  serialize(): Record<string, unknown> {
    return {
      urdf_source: this.config.urdf_source,
      robot_name: this.config.robot_name,
      preview_format: this.config.preview_format,
      interactive_joints: this.config.interactive_joints,
      up_axis: this.config.up_axis,
      scale: this.config.scale,
      include_visual: this.config.include_visual,
      include_collision: this.config.include_collision,
      include_physics: this.config.include_physics,
      joint_visualization: this.config.joint_visualization,
      default_color: this.config.default_color,
      visionos_model_element: this.config.visionos_model_element,
      model_alt_text: this.config.model_alt_text,
    };
  }
}

// =============================================================================
// TRAIT HANDLER (for HoloScript+ runtime integration)
// =============================================================================

/**
 * HoloScript+ trait handler for @urdf_robot
 */
export const urdfRobotHandler: TraitHandler<URDFRobotConfig> = {
  name: 'urdf_robot',

  defaultConfig: {
    urdf_source: '',
    preview_format: 'usdz',
    interactive_joints: true,
    up_axis: 'Y',
    scale: 1.0,
    include_visual: true,
    include_collision: false,
    include_physics: false,
    joint_visualization: 'none',
    default_color: [0.8, 0.8, 0.8],
    apply_coordinate_transform: true,
    visionos_model_element: true,
  },

  onAttach(node: HSPlusNode, config: URDFRobotConfig, context: TraitContext): void {
    const trait = new URDFRobotTrait(config);
    (node as any).__urdfRobotTrait = trait;

    // Emit attachment event
    context.emit('urdf_robot:attached', {
      source: config.urdf_source,
      format: config.preview_format,
    });
  },

  onDetach(node: HSPlusNode, _config: URDFRobotConfig, context: TraitContext): void {
    delete (node as any).__urdfRobotTrait;
    context.emit('urdf_robot:detached', {});
  },

  onUpdate(
    node: HSPlusNode,
    _config: URDFRobotConfig,
    _context: TraitContext,
    _delta: number
  ): void {
    const trait = (node as any).__urdfRobotTrait as URDFRobotTrait | undefined;
    if (!trait) return;

    // No continuous update needed for static model display
    // Joint animations would be driven by events, not per-frame updates
  },
};

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new @urdf_robot trait instance.
 *
 * @param config - Partial configuration (defaults applied)
 * @returns Configured URDFRobotTrait
 *
 * @example
 * ```typescript
 * const robotTrait = createURDFRobotTrait({
 *   urdf_source: 'package://my_robot/urdf/robot.urdf',
 *   preview_format: 'usdz',
 *   up_axis: 'Y',
 * });
 * ```
 */
export function createURDFRobotTrait(config?: Partial<URDFRobotConfig>): URDFRobotTrait {
  return new URDFRobotTrait(config);
}

export default URDFRobotTrait;
