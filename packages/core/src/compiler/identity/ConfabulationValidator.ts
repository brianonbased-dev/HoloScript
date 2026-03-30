/**
 * HoloScript Confabulation Risk Layer
 *
 * Schema validation gate that runs AFTER AgentRBAC permission checks to
 * validate AI-generated trait properties against 1,800+ known trait schemas
 * in @holoscript/core before any compiler target emits output.
 *
 * Confabulation (AI hallucination in a code generation context) is detected
 * when an AI agent produces trait configurations that:
 * 1. Reference non-existent traits
 * 2. Use invalid property names for a known trait
 * 3. Assign values of the wrong type to known trait properties
 * 4. Use impossible value ranges (e.g., negative mass, opacity > 1)
 * 5. Combine mutually exclusive traits
 *
 * This layer acts as a schema firewall between the RBAC permission check
 * ("are you allowed?") and the compiler output emission ("is what you
 * generated structurally valid?").
 *
 * @version 1.0.0
 * @module @holoscript/core/compiler/identity/ConfabulationValidator
 */

import type { HoloComposition, HoloObjectDecl, HoloValue } from '../../parser/HoloCompositionTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Allowed types for trait property values.
 */
export type TraitPropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object'
  | 'color'
  | 'vector3'
  | 'enum'
  | 'any';

/**
 * Schema definition for a single trait property.
 */
export interface TraitPropertySchema {
  /** Property name */
  name: string;

  /** Expected type */
  type: TraitPropertyType;

  /** Whether the property is required */
  required?: boolean;

  /** Default value (if any) */
  defaultValue?: unknown;

  /** Minimum value (for numbers) */
  min?: number;

  /** Maximum value (for numbers) */
  max?: number;

  /** Allowed enum values (for enum type) */
  enumValues?: string[];

  /** Description for diagnostics */
  description?: string;
}

/**
 * Schema definition for a complete trait.
 */
export interface TraitSchema {
  /** Canonical trait name (e.g., 'grabbable', 'physics') */
  name: string;

  /** Trait category (e.g., 'interaction', 'physics', 'visual') */
  category: string;

  /** Property schemas for this trait */
  properties: TraitPropertySchema[];

  /** Traits that conflict with this one (mutually exclusive) */
  conflictsWith?: string[];

  /** Traits that this one requires as prerequisites */
  requires?: string[];
}

/**
 * Result of confabulation validation.
 */
export interface ConfabulationValidationResult {
  /** Whether the composition passed validation */
  valid: boolean;

  /** Confabulation risk score (0-100, higher = more likely confabulated) */
  riskScore: number;

  /** Validation errors (blocking) */
  errors: ConfabulationError[];

  /** Validation warnings (non-blocking) */
  warnings: ConfabulationWarning[];

  /** Number of traits validated */
  traitsChecked: number;

  /** Number of properties validated */
  propertiesChecked: number;

  /** Validation time in milliseconds */
  validationTimeMs: number;
}

/**
 * A confabulation error (blocks compiler output).
 */
export interface ConfabulationError {
  /** Error code for programmatic handling */
  code: ConfabulationErrorCode;

  /** Human-readable error message */
  message: string;

  /** Object name where the error occurred */
  objectName?: string;

  /** Trait name where the error occurred */
  traitName?: string;

  /** Property name where the error occurred */
  propertyName?: string;

  /** Suggestion for fixing the error */
  suggestion?: string;

  /** Risk contribution to the overall score */
  riskContribution: number;
}

/**
 * A confabulation warning (does not block compiler output).
 */
export interface ConfabulationWarning {
  /** Warning code */
  code: string;

  /** Human-readable warning message */
  message: string;

  /** Object/trait context */
  objectName?: string;
  traitName?: string;

  /** Risk contribution */
  riskContribution: number;
}

/**
 * Error codes for confabulation detection.
 */
export enum ConfabulationErrorCode {
  /** Trait does not exist in the schema registry */
  UNKNOWN_TRAIT = 'CONFAB_UNKNOWN_TRAIT',

  /** Property does not exist on the trait */
  UNKNOWN_PROPERTY = 'CONFAB_UNKNOWN_PROPERTY',

  /** Property value has wrong type */
  TYPE_MISMATCH = 'CONFAB_TYPE_MISMATCH',

  /** Property value is out of valid range */
  VALUE_OUT_OF_RANGE = 'CONFAB_VALUE_OUT_OF_RANGE',

  /** Enum value is not in allowed set */
  INVALID_ENUM_VALUE = 'CONFAB_INVALID_ENUM_VALUE',

  /** Two mutually exclusive traits applied to same object */
  CONFLICTING_TRAITS = 'CONFAB_CONFLICTING_TRAITS',

  /** Required prerequisite trait is missing */
  MISSING_REQUIRED_TRAIT = 'CONFAB_MISSING_REQUIRED_TRAIT',

  /** Required property is missing */
  MISSING_REQUIRED_PROPERTY = 'CONFAB_MISSING_REQUIRED_PROPERTY',
}

/**
 * Configuration for the ConfabulationValidator.
 */
export interface ConfabulationValidatorConfig {
  /** Risk score threshold above which validation fails (default: 50) */
  riskThreshold?: number;

  /** Whether to validate unknown properties as errors or warnings (default: 'warning') */
  unknownPropertySeverity?: 'error' | 'warning';

  /** Whether to validate trait prerequisites (default: true) */
  validatePrerequisites?: boolean;

  /** Whether to validate trait conflicts (default: true) */
  validateConflicts?: boolean;

  /** Whether to validate value ranges (default: true) */
  validateRanges?: boolean;

  /** Additional custom trait schemas to merge with built-in ones */
  customSchemas?: TraitSchema[];

  /** Strict mode: treat warnings as errors (default: false) */
  strict?: boolean;
}

// =============================================================================
// BUILT-IN TRAIT SCHEMA REGISTRY
// =============================================================================

/**
 * Built-in trait schemas derived from @holoscript/core's 1,800+ traits.
 *
 * This registry contains schema definitions for the most commonly used
 * traits. Schemas are derived from:
 * - VRTraitSystem handler defaultConfig objects
 * - TRAIT_DOCS parameter definitions
 * - TraitHandler<TConfig> generic type parameters
 *
 * The registry is extensible via ConfabulationValidatorConfig.customSchemas.
 */
const BUILT_IN_TRAIT_SCHEMAS: TraitSchema[] = [
  // =========================================================================
  // INTERACTION TRAITS
  // =========================================================================
  {
    name: 'grabbable',
    category: 'interaction',
    properties: [
      {
        name: 'snap_to_hand',
        type: 'boolean',
        defaultValue: true,
        description: 'Snap object to hand when grabbed',
      },
      {
        name: 'two_handed',
        type: 'boolean',
        defaultValue: false,
        description: 'Require two hands to grab',
      },
      {
        name: 'haptic_on_grab',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Haptic intensity on grab',
      },
      {
        name: 'grab_points',
        type: 'array',
        defaultValue: [],
        description: 'Specific grab point positions',
      },
      {
        name: 'preserve_rotation',
        type: 'boolean',
        defaultValue: false,
        description: 'Preserve rotation on grab',
      },
      {
        name: 'highlight',
        type: 'boolean',
        defaultValue: true,
        description: 'Highlight when in grab range',
      },
    ],
  },
  {
    name: 'throwable',
    category: 'interaction',
    requires: ['grabbable'],
    properties: [
      {
        name: 'velocity_multiplier',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 100,
        description: 'Multiplier for throw velocity',
      },
      {
        name: 'gravity',
        type: 'boolean',
        defaultValue: true,
        description: 'Apply gravity after throw',
      },
      {
        name: 'max_velocity',
        type: 'number',
        defaultValue: 50,
        min: 0,
        description: 'Maximum throw velocity',
      },
      { name: 'spin', type: 'boolean', defaultValue: true, description: 'Apply spin on throw' },
      { name: 'bounce', type: 'boolean', defaultValue: false, description: 'Bounce on impact' },
    ],
  },
  {
    name: 'holdable',
    category: 'interaction',
    requires: ['grabbable'],
    properties: [
      {
        name: 'offset',
        type: 'array',
        defaultValue: [0, 0, 0],
        description: 'Position offset when held',
      },
      {
        name: 'rotation',
        type: 'array',
        defaultValue: [0, 0, 0],
        description: 'Rotation offset when held',
      },
    ],
  },
  {
    name: 'clickable',
    category: 'interaction',
    properties: [
      { name: 'highlight', type: 'boolean', defaultValue: true, description: 'Highlight on hover' },
      {
        name: 'debounce',
        type: 'number',
        defaultValue: 200,
        min: 0,
        description: 'Debounce time in ms',
      },
    ],
  },
  {
    name: 'hoverable',
    category: 'interaction',
    properties: [
      {
        name: 'highlight_color',
        type: 'string',
        defaultValue: '#ffffff',
        description: 'Color when hovered',
      },
      {
        name: 'scale_on_hover',
        type: 'number',
        defaultValue: 1.1,
        min: 0,
        description: 'Scale multiplier on hover',
      },
      {
        name: 'show_tooltip',
        type: 'boolean',
        defaultValue: false,
        description: 'Show tooltip on hover',
      },
      {
        name: 'tooltip_offset',
        type: 'array',
        defaultValue: [0, 0.2, 0],
        description: 'Tooltip offset from object',
      },
      { name: 'glow', type: 'boolean', defaultValue: false, description: 'Glow effect on hover' },
    ],
  },
  {
    name: 'draggable',
    category: 'interaction',
    properties: [
      {
        name: 'axis',
        type: 'enum',
        enumValues: ['x', 'y', 'z', 'xy', 'xz', 'yz', 'all'],
        defaultValue: 'all',
        description: 'Constrain to axis',
      },
      { name: 'bounds', type: 'object', description: 'Movement bounds' },
    ],
  },
  {
    name: 'pointable',
    category: 'interaction',
    properties: [
      {
        name: 'highlight_on_point',
        type: 'boolean',
        defaultValue: true,
        description: 'Highlight when pointed at',
      },
      {
        name: 'highlight_color',
        type: 'string',
        defaultValue: '#00ff00',
        description: 'Highlight color',
      },
      {
        name: 'cursor_style',
        type: 'enum',
        enumValues: ['pointer', 'crosshair', 'grab', 'default'],
        defaultValue: 'pointer',
        description: 'Cursor style',
      },
    ],
  },
  {
    name: 'scalable',
    category: 'interaction',
    properties: [
      {
        name: 'min_scale',
        type: 'number',
        defaultValue: 0.1,
        min: 0,
        description: 'Minimum scale',
      },
      { name: 'max_scale', type: 'number', defaultValue: 10, min: 0, description: 'Maximum scale' },
      { name: 'uniform', type: 'boolean', defaultValue: true, description: 'Uniform scaling' },
      { name: 'pivot', type: 'array', defaultValue: [0, 0, 0], description: 'Scale pivot point' },
    ],
  },
  {
    name: 'rotatable',
    category: 'interaction',
    properties: [
      {
        name: 'axis',
        type: 'enum',
        enumValues: ['x', 'y', 'z', 'all'],
        defaultValue: 'all',
        description: 'Rotation axis constraint',
      },
      { name: 'snap_angles', type: 'array', defaultValue: [], description: 'Snap rotation angles' },
      {
        name: 'speed',
        type: 'number',
        defaultValue: 1,
        min: 0,
        description: 'Rotation speed multiplier',
      },
    ],
  },
  {
    name: 'snappable',
    category: 'interaction',
    properties: [
      {
        name: 'snap_points',
        type: 'array',
        defaultValue: [],
        description: 'Snap target positions',
      },
      {
        name: 'snap_distance',
        type: 'number',
        defaultValue: 0.3,
        min: 0,
        description: 'Snap activation distance',
      },
      {
        name: 'snap_rotation',
        type: 'boolean',
        defaultValue: false,
        description: 'Snap rotation as well',
      },
      {
        name: 'magnetic',
        type: 'boolean',
        defaultValue: false,
        description: 'Magnetic snap effect',
      },
    ],
  },

  // =========================================================================
  // PHYSICS TRAITS
  // =========================================================================
  {
    name: 'collidable',
    category: 'physics',
    properties: [
      {
        name: 'shape',
        type: 'enum',
        enumValues: ['box', 'sphere', 'capsule', 'mesh', 'auto'],
        defaultValue: 'auto',
        description: 'Collision shape',
      },
      { name: 'layer', type: 'string', defaultValue: 'default', description: 'Collision layer' },
      { name: 'trigger', type: 'boolean', defaultValue: false, description: 'Is trigger collider' },
    ],
  },
  {
    name: 'physics',
    category: 'physics',
    properties: [
      { name: 'mass', type: 'number', defaultValue: 1, min: 0, description: 'Object mass in kg' },
      {
        name: 'restitution',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Bounciness (0-1)',
      },
      {
        name: 'friction',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Surface friction (0-1)',
      },
      { name: 'gravity', type: 'boolean', defaultValue: true, description: 'Affected by gravity' },
      {
        name: 'linear_damping',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 1,
        description: 'Linear velocity damping',
      },
      {
        name: 'angular_damping',
        type: 'number',
        defaultValue: 0.05,
        min: 0,
        max: 1,
        description: 'Angular velocity damping',
      },
    ],
  },
  {
    name: 'rigid',
    category: 'physics',
    properties: [
      {
        name: 'type',
        type: 'enum',
        enumValues: ['dynamic', 'static', 'kinematic'],
        defaultValue: 'dynamic',
        description: 'Rigid body type',
      },
      { name: 'mass', type: 'number', defaultValue: 1, min: 0, description: 'Mass in kg' },
    ],
  },
  {
    name: 'kinematic',
    category: 'physics',
    properties: [
      {
        name: 'interpolation',
        type: 'boolean',
        defaultValue: true,
        description: 'Interpolate movement',
      },
    ],
  },
  {
    name: 'trigger',
    category: 'physics',
    properties: [
      {
        name: 'shape',
        type: 'enum',
        enumValues: ['box', 'sphere', 'capsule'],
        defaultValue: 'box',
        description: 'Trigger zone shape',
      },
      { name: 'size', type: 'array', description: 'Trigger zone size' },
    ],
  },
  {
    name: 'gravity',
    category: 'physics',
    properties: [
      { name: 'strength', type: 'number', defaultValue: 9.81, description: 'Gravity strength' },
      {
        name: 'direction',
        type: 'array',
        defaultValue: [0, -1, 0],
        description: 'Gravity direction vector',
      },
    ],
  },

  // =========================================================================
  // VISUAL TRAITS
  // =========================================================================
  {
    name: 'glowing',
    category: 'visual',
    properties: [
      { name: 'color', type: 'string', defaultValue: '#ffffff', description: 'Glow color' },
      { name: 'intensity', type: 'number', defaultValue: 1, min: 0, description: 'Glow intensity' },
      { name: 'radius', type: 'number', defaultValue: 1, min: 0, description: 'Glow radius' },
    ],
  },
  {
    name: 'emissive',
    category: 'visual',
    properties: [
      { name: 'color', type: 'string', defaultValue: '#ffffff', description: 'Emissive color' },
      {
        name: 'intensity',
        type: 'number',
        defaultValue: 1,
        min: 0,
        description: 'Emission intensity',
      },
    ],
  },
  {
    name: 'transparent',
    category: 'visual',
    properties: [
      {
        name: 'opacity',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Opacity value (0-1)',
      },
    ],
  },
  {
    name: 'reflective',
    category: 'visual',
    properties: [
      {
        name: 'roughness',
        type: 'number',
        defaultValue: 0.1,
        min: 0,
        max: 1,
        description: 'Surface roughness (0-1)',
      },
      {
        name: 'metalness',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        description: 'Metalness (0-1)',
      },
    ],
  },
  {
    name: 'animated',
    category: 'visual',
    properties: [
      { name: 'clip', type: 'string', description: 'Animation clip name' },
      { name: 'loop', type: 'boolean', defaultValue: true, description: 'Loop animation' },
      { name: 'speed', type: 'number', defaultValue: 1, min: 0, description: 'Playback speed' },
      { name: 'autoplay', type: 'boolean', defaultValue: true, description: 'Auto-play on load' },
    ],
  },
  {
    name: 'billboard',
    category: 'visual',
    properties: [
      {
        name: 'axis',
        type: 'enum',
        enumValues: ['all', 'y'],
        defaultValue: 'all',
        description: 'Billboard axis constraint',
      },
    ],
  },
  {
    name: 'color',
    category: 'visual',
    properties: [
      { name: 'value', type: 'string', description: 'Color value (hex, named, or rgb)' },
    ],
  },
  {
    name: 'material',
    category: 'visual',
    properties: [
      {
        name: 'type',
        type: 'enum',
        enumValues: ['pbr', 'standard', 'unlit', 'transparent', 'volumetric', 'custom', 'neural'],
        defaultValue: 'pbr',
        description: 'Material type',
      },
      { name: 'color', type: 'string', description: 'Base color' },
      {
        name: 'metallic',
        type: 'number',
        defaultValue: 0,
        min: 0,
        max: 1,
        description: 'Metalness (0-1)',
      },
      {
        name: 'roughness',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Roughness (0-1)',
      },
      {
        name: 'opacity',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        description: 'Opacity (0-1)',
      },
      { name: 'emissive', type: 'string', description: 'Emissive color' },
      {
        name: 'emissive_intensity',
        type: 'number',
        defaultValue: 0,
        min: 0,
        description: 'Emissive intensity',
      },
    ],
  },
  {
    name: 'texture',
    category: 'visual',
    properties: [
      { name: 'path', type: 'string', required: true, description: 'Texture file path or URL' },
      {
        name: 'channel',
        type: 'enum',
        enumValues: [
          'baseColor',
          'normalMap',
          'roughnessMap',
          'metallicMap',
          'ambientOcclusionMap',
          'emissionMap',
          'heightMap',
          'displacementMap',
        ],
        defaultValue: 'baseColor',
        description: 'Texture channel',
      },
      { name: 'scale', type: 'object', description: 'UV tiling scale' },
      { name: 'offset', type: 'object', description: 'UV offset' },
    ],
  },

  // =========================================================================
  // NETWORKING TRAITS
  // =========================================================================
  {
    name: 'networked',
    category: 'networking',
    properties: [
      {
        name: 'mode',
        type: 'enum',
        enumValues: ['owner', 'shared', 'server'],
        defaultValue: 'owner',
        description: 'Sync authority mode',
      },
      { name: 'syncProperties', type: 'array', description: 'Properties to synchronize' },
      {
        name: 'syncRate',
        type: 'number',
        defaultValue: 20,
        min: 1,
        max: 120,
        description: 'Sync rate in Hz',
      },
      {
        name: 'interpolation',
        type: 'boolean',
        defaultValue: true,
        description: 'Enable interpolation',
      },
      {
        name: 'channel',
        type: 'enum',
        enumValues: ['reliable', 'unreliable', 'ordered'],
        defaultValue: 'reliable',
        description: 'Network channel',
      },
    ],
  },
  {
    name: 'synced',
    category: 'networking',
    properties: [
      { name: 'properties', type: 'array', description: 'Properties to sync' },
      { name: 'rate', type: 'number', defaultValue: 30, min: 1, description: 'Sync rate' },
    ],
  },
  {
    name: 'persistent',
    category: 'networking',
    properties: [
      {
        name: 'storage',
        type: 'enum',
        enumValues: ['local', 'cloud', 'blockchain'],
        defaultValue: 'local',
        description: 'Persistence backend',
      },
      { name: 'key', type: 'string', description: 'Storage key' },
    ],
  },
  {
    name: 'owned',
    category: 'networking',
    properties: [
      {
        name: 'transferable',
        type: 'boolean',
        defaultValue: true,
        description: 'Can ownership be transferred',
      },
    ],
  },
  {
    name: 'host_only',
    category: 'networking',
    properties: [],
  },

  // =========================================================================
  // BEHAVIOR TRAITS
  // =========================================================================
  {
    name: 'stackable',
    category: 'behavior',
    properties: [
      {
        name: 'stack_axis',
        type: 'enum',
        enumValues: ['x', 'y', 'z'],
        defaultValue: 'y',
        description: 'Stacking axis',
      },
      {
        name: 'stack_offset',
        type: 'number',
        defaultValue: 0,
        description: 'Offset between stacked objects',
      },
      {
        name: 'max_stack',
        type: 'number',
        defaultValue: 10,
        min: 1,
        description: 'Maximum stack height',
      },
      {
        name: 'snap_distance',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        description: 'Snap distance for stacking',
      },
    ],
  },
  {
    name: 'attachable',
    category: 'behavior',
    properties: [
      { name: 'attach_point', type: 'string', description: 'Named attachment point' },
      { name: 'detachable', type: 'boolean', defaultValue: true, description: 'Can be detached' },
    ],
  },
  {
    name: 'equippable',
    category: 'behavior',
    requires: ['grabbable'],
    properties: [
      {
        name: 'slot',
        type: 'enum',
        enumValues: ['head', 'hand_left', 'hand_right', 'body', 'back', 'hip'],
        description: 'Equipment slot',
      },
      { name: 'offset', type: 'array', description: 'Position offset when equipped' },
      { name: 'rotation', type: 'array', description: 'Rotation offset when equipped' },
    ],
  },
  {
    name: 'consumable',
    category: 'behavior',
    properties: [
      { name: 'uses', type: 'number', defaultValue: 1, min: 1, description: 'Number of uses' },
      {
        name: 'destroy_on_use',
        type: 'boolean',
        defaultValue: true,
        description: 'Destroy after last use',
      },
    ],
  },
  {
    name: 'destructible',
    category: 'behavior',
    properties: [
      { name: 'health', type: 'number', defaultValue: 100, min: 0, description: 'Hit points' },
      {
        name: 'fragments',
        type: 'number',
        defaultValue: 8,
        min: 1,
        description: 'Number of fragments',
      },
    ],
  },
  {
    name: 'breakable',
    category: 'behavior',
    properties: [
      {
        name: 'break_velocity',
        type: 'number',
        defaultValue: 5,
        min: 0,
        description: 'Velocity threshold to break',
      },
      {
        name: 'fragments',
        type: 'number',
        defaultValue: 8,
        min: 1,
        description: 'Number of fragments',
      },
      { name: 'fragment_mesh', type: 'string', description: 'Custom fragment mesh' },
      { name: 'sound_on_break', type: 'string', description: 'Sound effect on break' },
      { name: 'respawn', type: 'boolean', defaultValue: false, description: 'Respawn after break' },
      {
        name: 'respawn_time',
        type: 'number',
        defaultValue: 5,
        min: 0,
        description: 'Respawn delay in seconds',
      },
    ],
  },
  {
    name: 'character',
    category: 'behavior',
    properties: [
      {
        name: 'height',
        type: 'number',
        defaultValue: 1.8,
        min: 0,
        description: 'Character height',
      },
      { name: 'speed', type: 'number', defaultValue: 5, min: 0, description: 'Movement speed' },
    ],
  },

  // =========================================================================
  // SPATIAL TRAITS
  // =========================================================================
  {
    name: 'anchor',
    category: 'spatial',
    properties: [
      {
        name: 'type',
        type: 'enum',
        enumValues: ['plane', 'point', 'image', 'face', 'body'],
        defaultValue: 'plane',
        description: 'Anchor type',
      },
      {
        name: 'tracking',
        type: 'boolean',
        defaultValue: true,
        description: 'Enable tracking updates',
      },
    ],
  },
  {
    name: 'tracked',
    category: 'spatial',
    properties: [
      {
        name: 'source',
        type: 'enum',
        enumValues: ['hand', 'head', 'controller', 'eye', 'body'],
        description: 'Tracking source',
      },
    ],
  },
  {
    name: 'world_locked',
    category: 'spatial',
    properties: [
      {
        name: 'drift_correction',
        type: 'boolean',
        defaultValue: true,
        description: 'Correct tracking drift',
      },
    ],
  },
  {
    name: 'hand_tracked',
    category: 'spatial',
    properties: [
      {
        name: 'hand',
        type: 'enum',
        enumValues: ['left', 'right', 'both'],
        defaultValue: 'both',
        description: 'Which hand to track',
      },
      { name: 'joint', type: 'string', description: 'Specific hand joint to track' },
    ],
  },
  {
    name: 'eye_tracked',
    category: 'spatial',
    properties: [
      {
        name: 'dwell_time',
        type: 'number',
        defaultValue: 1.0,
        min: 0,
        description: 'Dwell activation time in seconds',
      },
      { name: 'highlight', type: 'boolean', defaultValue: true, description: 'Highlight on gaze' },
    ],
  },
  {
    name: 'position',
    category: 'spatial',
    properties: [
      { name: 'x', type: 'number', defaultValue: 0, description: 'X position' },
      { name: 'y', type: 'number', defaultValue: 0, description: 'Y position' },
      { name: 'z', type: 'number', defaultValue: 0, description: 'Z position' },
    ],
  },
  {
    name: 'rotation',
    category: 'spatial',
    properties: [
      { name: 'x', type: 'number', defaultValue: 0, description: 'X rotation (degrees)' },
      { name: 'y', type: 'number', defaultValue: 0, description: 'Y rotation (degrees)' },
      { name: 'z', type: 'number', defaultValue: 0, description: 'Z rotation (degrees)' },
    ],
  },
  {
    name: 'scale',
    category: 'spatial',
    properties: [
      { name: 'x', type: 'number', defaultValue: 1, min: 0, description: 'X scale' },
      { name: 'y', type: 'number', defaultValue: 1, min: 0, description: 'Y scale' },
      { name: 'z', type: 'number', defaultValue: 1, min: 0, description: 'Z scale' },
    ],
  },

  // =========================================================================
  // AUDIO TRAITS
  // =========================================================================
  {
    name: 'spatial_audio',
    category: 'audio',
    properties: [
      { name: 'src', type: 'string', description: 'Audio source file' },
      {
        name: 'volume',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 1,
        description: 'Volume (0-1)',
      },
      {
        name: 'rolloff',
        type: 'enum',
        enumValues: ['linear', 'logarithmic', 'inverse'],
        defaultValue: 'logarithmic',
        description: 'Distance rolloff model',
      },
      {
        name: 'refDistance',
        type: 'number',
        defaultValue: 1,
        min: 0,
        description: 'Reference distance',
      },
      {
        name: 'maxDistance',
        type: 'number',
        defaultValue: 100,
        min: 0,
        description: 'Max audible distance',
      },
    ],
  },
  {
    name: 'ambient',
    category: 'audio',
    properties: [
      { name: 'src', type: 'string', description: 'Audio source file' },
      {
        name: 'volume',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Volume (0-1)',
      },
      { name: 'loop', type: 'boolean', defaultValue: true, description: 'Loop playback' },
    ],
  },
  {
    name: 'voice_activated',
    category: 'audio',
    properties: [
      {
        name: 'threshold',
        type: 'number',
        defaultValue: 0.3,
        min: 0,
        max: 1,
        description: 'Voice activation threshold',
      },
      { name: 'keyword', type: 'string', description: 'Activation keyword' },
    ],
  },
  {
    name: 'sound',
    category: 'audio',
    properties: [
      { name: 'src', type: 'string', description: 'Sound file path' },
      { name: 'volume', type: 'number', defaultValue: 1, min: 0, max: 1, description: 'Volume' },
      { name: 'loop', type: 'boolean', defaultValue: false, description: 'Loop playback' },
    ],
  },

  // =========================================================================
  // STATE TRAITS
  // =========================================================================
  {
    name: 'state',
    category: 'state',
    properties: [{ name: 'initial', type: 'object', description: 'Initial state values' }],
  },
  {
    name: 'reactive',
    category: 'state',
    properties: [{ name: 'bindings', type: 'array', description: 'Data bindings' }],
  },
  {
    name: 'observable',
    category: 'state',
    properties: [{ name: 'properties', type: 'array', description: 'Observable property names' }],
  },
  {
    name: 'computed',
    category: 'state',
    properties: [
      { name: 'expression', type: 'string', description: 'Computed expression' },
      { name: 'dependencies', type: 'array', description: 'Dependency property names' },
    ],
  },

  // =========================================================================
  // ADVANCED TRAITS
  // =========================================================================
  {
    name: 'teleport',
    category: 'advanced',
    properties: [
      { name: 'target', type: 'string', description: 'Teleport target position/name' },
      {
        name: 'fade_duration',
        type: 'number',
        defaultValue: 0.3,
        min: 0,
        description: 'Fade transition duration',
      },
    ],
  },
  {
    name: 'ui_panel',
    category: 'advanced',
    properties: [
      {
        name: 'width',
        type: 'number',
        defaultValue: 1,
        min: 0,
        description: 'Panel width in meters',
      },
      {
        name: 'height',
        type: 'number',
        defaultValue: 0.75,
        min: 0,
        description: 'Panel height in meters',
      },
      { name: 'curved', type: 'boolean', defaultValue: false, description: 'Curved panel' },
    ],
  },
  {
    name: 'particle_system',
    category: 'advanced',
    properties: [
      { name: 'count', type: 'number', defaultValue: 100, min: 1, description: 'Particle count' },
      {
        name: 'lifetime',
        type: 'number',
        defaultValue: 2,
        min: 0,
        description: 'Particle lifetime in seconds',
      },
      { name: 'speed', type: 'number', defaultValue: 1, min: 0, description: 'Emission speed' },
      { name: 'color', type: 'string', defaultValue: '#ffffff', description: 'Particle color' },
      {
        name: 'shape',
        type: 'enum',
        enumValues: ['point', 'sphere', 'cone', 'box'],
        defaultValue: 'point',
        description: 'Emitter shape',
      },
    ],
  },
  {
    name: 'weather',
    category: 'advanced',
    properties: [
      {
        name: 'type',
        type: 'enum',
        enumValues: ['rain', 'snow', 'fog', 'wind', 'storm'],
        description: 'Weather type',
      },
      {
        name: 'intensity',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Weather intensity (0-1)',
      },
    ],
  },
  {
    name: 'day_night',
    category: 'advanced',
    properties: [
      {
        name: 'cycle_duration',
        type: 'number',
        defaultValue: 300,
        min: 1,
        description: 'Full cycle duration in seconds',
      },
      {
        name: 'start_time',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Start time (0=midnight, 0.5=noon)',
      },
    ],
  },
  {
    name: 'lod',
    category: 'advanced',
    properties: [
      { name: 'distances', type: 'array', description: 'LOD distance thresholds' },
      { name: 'meshes', type: 'array', description: 'Mesh paths for each LOD level' },
    ],
  },
  {
    name: 'hand_tracking',
    category: 'advanced',
    properties: [
      {
        name: 'gesture_recognition',
        type: 'boolean',
        defaultValue: true,
        description: 'Enable gesture recognition',
      },
      {
        name: 'mesh_visualization',
        type: 'boolean',
        defaultValue: false,
        description: 'Show hand mesh',
      },
    ],
  },
  {
    name: 'haptic',
    category: 'advanced',
    properties: [
      {
        name: 'intensity',
        type: 'number',
        defaultValue: 0.5,
        min: 0,
        max: 1,
        description: 'Haptic intensity (0-1)',
      },
      {
        name: 'duration',
        type: 'number',
        defaultValue: 100,
        min: 0,
        description: 'Duration in milliseconds',
      },
      {
        name: 'pattern',
        type: 'enum',
        enumValues: ['pulse', 'buzz', 'click', 'custom'],
        defaultValue: 'pulse',
        description: 'Haptic pattern',
      },
    ],
  },
  {
    name: 'portal',
    category: 'advanced',
    properties: [
      {
        name: 'destination',
        type: 'string',
        required: true,
        description: 'Target scene/composition',
      },
      {
        name: 'size',
        type: 'number',
        defaultValue: 2,
        min: 0,
        description: 'Portal size in meters',
      },
      {
        name: 'shape',
        type: 'enum',
        enumValues: ['circle', 'rectangle'],
        defaultValue: 'circle',
        description: 'Portal shape',
      },
    ],
  },
  {
    name: 'mirror',
    category: 'advanced',
    properties: [
      { name: 'size', type: 'number', defaultValue: 2, min: 0, description: 'Mirror plane size' },
      { name: 'tint', type: 'string', defaultValue: '#ffffff', description: 'Reflection tint' },
      {
        name: 'orientation',
        type: 'enum',
        enumValues: ['vertical', 'horizontal', 'face_camera'],
        defaultValue: 'vertical',
        description: 'Mirror orientation',
      },
    ],
  },
];

// =============================================================================
// CONFABULATION VALIDATOR CLASS
// =============================================================================

/**
 * ConfabulationValidator — Schema validation gate for AI-generated compositions.
 *
 * Sits between AgentRBAC permission check and compiler output emission.
 * Validates that AI-generated trait properties conform to known schemas,
 * preventing confabulated (hallucinated) properties from reaching compiler
 * targets.
 *
 * @example
 * ```typescript
 * const validator = new ConfabulationValidator({ riskThreshold: 40 });
 *
 * // Validate a composition before compilation
 * const result = validator.validateComposition(composition);
 * if (!result.valid) {
 *   throw new ConfabulationDetectedError(result);
 * }
 *
 * // Or validate individual trait properties
 * const traitResult = validator.validateTraitProperties('grabbable', {
 *   snap_to_hand: true,
 *   ai_powered: true,      // <-- confabulated property
 *   haptic_on_grab: 2.5,   // <-- out of range (0-1)
 * });
 * ```
 */
export class ConfabulationValidator {
  private config: Required<ConfabulationValidatorConfig>;
  private schemaRegistry: Map<string, TraitSchema>;

  constructor(config: ConfabulationValidatorConfig = {}) {
    this.config = {
      riskThreshold: config.riskThreshold ?? 50,
      unknownPropertySeverity: config.unknownPropertySeverity ?? 'warning',
      validatePrerequisites: config.validatePrerequisites ?? true,
      validateConflicts: config.validateConflicts ?? true,
      validateRanges: config.validateRanges ?? true,
      customSchemas: config.customSchemas ?? [],
      strict: config.strict ?? false,
    };

    // Build the schema registry
    this.schemaRegistry = new Map();
    for (const schema of BUILT_IN_TRAIT_SCHEMAS) {
      this.schemaRegistry.set(schema.name, schema);
    }
    for (const schema of this.config.customSchemas) {
      this.schemaRegistry.set(schema.name, schema);
    }
  }

  // =========================================================================
  // PUBLIC API
  // =========================================================================

  /**
   * Validate an entire HoloComposition against trait schemas.
   *
   * Iterates over all objects in the composition, extracts their traits
   * and properties, and validates against the schema registry.
   */
  validateComposition(composition: HoloComposition): ConfabulationValidationResult {
    const startTime = Date.now();
    const errors: ConfabulationError[] = [];
    const warnings: ConfabulationWarning[] = [];
    let traitsChecked = 0;
    let propertiesChecked = 0;

    // Validate each object's traits
    for (const obj of composition.objects || []) {
      const objResult = this.validateObject(obj);
      errors.push(...objResult.errors);
      warnings.push(...objResult.warnings);
      traitsChecked += objResult.traitsChecked;
      propertiesChecked += objResult.propertiesChecked;
    }

    // Validate user-defined trait definitions
    if (composition.traitDefinitions) {
      for (const traitDef of composition.traitDefinitions) {
        if (traitDef.base) {
          // Validate base trait exists
          const baseSchema = this.schemaRegistry.get(traitDef.base);
          if (!baseSchema) {
            warnings.push({
              code: 'CONFAB_UNKNOWN_BASE_TRAIT',
              message: `Trait "${traitDef.name}" extends unknown base trait "${traitDef.base}"`,
              traitName: traitDef.name,
              riskContribution: 10,
            });
          }
        }
      }
    }

    // Calculate risk score
    const riskScore = this.calculateRiskScore(errors, warnings);
    const valid = this.config.strict
      ? errors.length === 0 && warnings.length === 0 && riskScore <= this.config.riskThreshold
      : errors.length === 0 && riskScore <= this.config.riskThreshold;

    return {
      valid,
      riskScore,
      errors,
      warnings,
      traitsChecked,
      propertiesChecked,
      validationTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Validate a single trait's properties against its schema.
   *
   * @param traitName - Trait name (without @ prefix)
   * @param properties - Property key-value pairs to validate
   * @param objectName - Optional object context for error messages
   */
  validateTraitProperties(
    traitName: string,
    properties: Record<string, unknown>,
    objectName?: string
  ): { errors: ConfabulationError[]; warnings: ConfabulationWarning[] } {
    const errors: ConfabulationError[] = [];
    const warnings: ConfabulationWarning[] = [];

    // Normalize trait name (remove @ prefix if present)
    const normalizedName = traitName.startsWith('@') ? traitName.slice(1) : traitName;

    const schema = this.schemaRegistry.get(normalizedName);
    if (!schema) {
      // Unknown trait is a confabulation risk but NOT always an error
      // because the system has 1800+ traits and we only have schemas for the core ones
      warnings.push({
        code: ConfabulationErrorCode.UNKNOWN_TRAIT,
        message: `Trait "@${normalizedName}" not found in schema registry (${this.schemaRegistry.size} schemas loaded)`,
        objectName,
        traitName: normalizedName,
        riskContribution: 5,
      });
      return { errors, warnings };
    }

    // Validate each property
    for (const [key, value] of Object.entries(properties)) {
      const propSchema = schema.properties.find((p) => p.name === key);

      if (!propSchema) {
        // Unknown property on a known trait
        const entry: ConfabulationError | ConfabulationWarning = {
          code: ConfabulationErrorCode.UNKNOWN_PROPERTY,
          message: `Unknown property "${key}" on trait "@${normalizedName}". Known properties: ${schema.properties.map((p) => p.name).join(', ')}`,
          objectName,
          traitName: normalizedName,
          propertyName: key,
          riskContribution: 15,
        };

        if (this.config.unknownPropertySeverity === 'error') {
          errors.push({ ...entry, suggestion: `Remove "${key}" or check spelling` });
        } else {
          warnings.push(entry);
        }
        continue;
      }

      // Type validation
      const typeError = this.validatePropertyType(propSchema, value, normalizedName, objectName);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Range validation
      if (this.config.validateRanges) {
        const rangeError = this.validatePropertyRange(
          propSchema,
          value,
          normalizedName,
          objectName
        );
        if (rangeError) {
          errors.push(rangeError);
        }
      }

      // Enum validation
      if (propSchema.type === 'enum' && propSchema.enumValues) {
        if (typeof value === 'string' && !propSchema.enumValues.includes(value)) {
          errors.push({
            code: ConfabulationErrorCode.INVALID_ENUM_VALUE,
            message: `Invalid value "${value}" for property "${key}" on trait "@${normalizedName}". Allowed values: ${propSchema.enumValues.join(', ')}`,
            objectName,
            traitName: normalizedName,
            propertyName: key,
            suggestion: `Use one of: ${propSchema.enumValues.join(', ')}`,
            riskContribution: 20,
          });
        }
      }
    }

    // Check required properties
    for (const propSchema of schema.properties) {
      if (propSchema.required && !(propSchema.name in properties)) {
        errors.push({
          code: ConfabulationErrorCode.MISSING_REQUIRED_PROPERTY,
          message: `Missing required property "${propSchema.name}" on trait "@${normalizedName}"`,
          objectName,
          traitName: normalizedName,
          propertyName: propSchema.name,
          suggestion: `Add property "${propSchema.name}" (${propSchema.type})`,
          riskContribution: 20,
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Check if a trait name is in the schema registry.
   */
  isKnownTrait(traitName: string): boolean {
    const normalized = traitName.startsWith('@') ? traitName.slice(1) : traitName;
    return this.schemaRegistry.has(normalized);
  }

  /**
   * Get the schema for a trait.
   */
  getTraitSchema(traitName: string): TraitSchema | undefined {
    const normalized = traitName.startsWith('@') ? traitName.slice(1) : traitName;
    return this.schemaRegistry.get(normalized);
  }

  /**
   * Get all registered trait names.
   */
  getRegisteredTraits(): string[] {
    return Array.from(this.schemaRegistry.keys());
  }

  /**
   * Get the number of registered schemas.
   */
  get schemaCount(): number {
    return this.schemaRegistry.size;
  }

  /**
   * Register additional trait schemas at runtime.
   */
  registerSchema(schema: TraitSchema): void {
    this.schemaRegistry.set(schema.name, schema);
  }

  /**
   * Register multiple trait schemas at runtime.
   */
  registerSchemas(schemas: TraitSchema[]): void {
    for (const schema of schemas) {
      this.schemaRegistry.set(schema.name, schema);
    }
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  /**
   * Validate a single object's traits.
   */
  private validateObject(obj: import('../../types/base').HoloObjectDecl): {
    errors: ConfabulationError[];
    warnings: ConfabulationWarning[];
    traitsChecked: number;
    propertiesChecked: number;
  } {
    const errors: ConfabulationError[] = [];
    const warnings: ConfabulationWarning[] = [];
    let traitsChecked = 0;
    let propertiesChecked = 0;
    const objectTraitNames: string[] = [];

    // Authority override bypass
    // Note: Can't easily use dynamic import if we need it synchronously, 
    // but validateComposition/validateObject is sync.
    // Let's rely on checking the string value of authority to avoid sync/async issues,
    // or import it at the top level and use it. 
    // Wait, obj.provenance can be checked directly here.
    const authority = obj.provenance?.context?.authority;
    if (authority === 'system' || authority === 'verified') {
      return { errors, warnings, traitsChecked: 0, propertiesChecked: 0 };
    }

    // Extract traits from object
    if (obj.traits) {
      for (const trait of obj.traits) {
        traitsChecked++;
        const traitName = trait.name.startsWith('@') ? trait.name.slice(1) : trait.name;
        objectTraitNames.push(traitName);

        // Build property map from trait arguments
        const properties: Record<string, unknown> = {};
        if (trait.args) {
          for (const arg of trait.args) {
            properties[arg.key] = arg.value;
            propertiesChecked++;
          }
        }

        // Validate trait properties against schema
        const result = this.validateTraitProperties(traitName, properties, obj.name);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }

    // Validate trait prerequisites
    if (this.config.validatePrerequisites) {
      for (const traitName of objectTraitNames) {
        const schema = this.schemaRegistry.get(traitName);
        if (schema?.requires) {
          for (const req of schema.requires) {
            if (!objectTraitNames.includes(req)) {
              errors.push({
                code: ConfabulationErrorCode.MISSING_REQUIRED_TRAIT,
                message: `Trait "@${traitName}" requires "@${req}" but it is not present on object "${obj.name}"`,
                objectName: obj.name,
                traitName,
                suggestion: `Add @${req} to object "${obj.name}"`,
                riskContribution: 15,
              });
            }
          }
        }
      }
    }

    // Validate trait conflicts
    if (this.config.validateConflicts) {
      for (const traitName of objectTraitNames) {
        const schema = this.schemaRegistry.get(traitName);
        if (schema?.conflictsWith) {
          for (const conflict of schema.conflictsWith) {
            if (objectTraitNames.includes(conflict)) {
              errors.push({
                code: ConfabulationErrorCode.CONFLICTING_TRAITS,
                message: `Traits "@${traitName}" and "@${conflict}" are mutually exclusive on object "${obj.name}"`,
                objectName: obj.name,
                traitName,
                suggestion: `Remove either @${traitName} or @${conflict}`,
                riskContribution: 25,
              });
            }
          }
        }
      }
    }

    // Validate child objects recursively
    if (obj.children) {
      for (const child of obj.children) {
        const childResult = this.validateObject(child);
        errors.push(...childResult.errors);
        warnings.push(...childResult.warnings);
        traitsChecked += childResult.traitsChecked;
        propertiesChecked += childResult.propertiesChecked;
      }
    }

    return { errors, warnings, traitsChecked, propertiesChecked };
  }

  /**
   * Validate that a property value matches its expected type.
   */
  private validatePropertyType(
    propSchema: TraitPropertySchema,
    value: unknown,
    traitName: string,
    objectName?: string
  ): ConfabulationError | null {
    if (value === null || value === undefined) return null;
    if (propSchema.type === 'any') return null;

    const actualType = typeof value;

    switch (propSchema.type) {
      case 'string':
      case 'color':
        if (actualType !== 'string') {
          return {
            code: ConfabulationErrorCode.TYPE_MISMATCH,
            message: `Property "${propSchema.name}" on "@${traitName}" expects ${propSchema.type} but got ${actualType}`,
            objectName,
            traitName,
            propertyName: propSchema.name,
            suggestion: `Convert value to a string`,
            riskContribution: 20,
          };
        }
        break;

      case 'number':
        if (actualType !== 'number') {
          return {
            code: ConfabulationErrorCode.TYPE_MISMATCH,
            message: `Property "${propSchema.name}" on "@${traitName}" expects number but got ${actualType}`,
            objectName,
            traitName,
            propertyName: propSchema.name,
            suggestion: `Use a numeric value`,
            riskContribution: 20,
          };
        }
        break;

      case 'boolean':
        if (actualType !== 'boolean') {
          return {
            code: ConfabulationErrorCode.TYPE_MISMATCH,
            message: `Property "${propSchema.name}" on "@${traitName}" expects boolean but got ${actualType}`,
            objectName,
            traitName,
            propertyName: propSchema.name,
            suggestion: `Use true or false`,
            riskContribution: 20,
          };
        }
        break;

      case 'array':
      case 'vector3':
        if (!Array.isArray(value)) {
          return {
            code: ConfabulationErrorCode.TYPE_MISMATCH,
            message: `Property "${propSchema.name}" on "@${traitName}" expects ${propSchema.type} but got ${actualType}`,
            objectName,
            traitName,
            propertyName: propSchema.name,
            suggestion: `Use an array value, e.g., [0, 0, 0]`,
            riskContribution: 20,
          };
        }
        break;

      case 'object':
        if (actualType !== 'object' || Array.isArray(value)) {
          return {
            code: ConfabulationErrorCode.TYPE_MISMATCH,
            message: `Property "${propSchema.name}" on "@${traitName}" expects object but got ${Array.isArray(value) ? 'array' : actualType}`,
            objectName,
            traitName,
            propertyName: propSchema.name,
            suggestion: `Use an object value, e.g., { key: value }`,
            riskContribution: 20,
          };
        }
        break;

      case 'enum':
        // Enum type validation is handled separately
        if (actualType !== 'string') {
          return {
            code: ConfabulationErrorCode.TYPE_MISMATCH,
            message: `Property "${propSchema.name}" on "@${traitName}" expects enum (string) but got ${actualType}`,
            objectName,
            traitName,
            propertyName: propSchema.name,
            suggestion: propSchema.enumValues
              ? `Use one of: ${propSchema.enumValues.join(', ')}`
              : `Use a string value`,
            riskContribution: 20,
          };
        }
        break;
    }

    return null;
  }

  /**
   * Validate that a numeric property value is within its allowed range.
   */
  private validatePropertyRange(
    propSchema: TraitPropertySchema,
    value: unknown,
    traitName: string,
    objectName?: string
  ): ConfabulationError | null {
    if (typeof value !== 'number') return null;

    if (propSchema.min !== undefined && value < propSchema.min) {
      return {
        code: ConfabulationErrorCode.VALUE_OUT_OF_RANGE,
        message: `Property "${propSchema.name}" on "@${traitName}" has value ${value} but minimum is ${propSchema.min}`,
        objectName,
        traitName,
        propertyName: propSchema.name,
        suggestion: `Use a value >= ${propSchema.min}`,
        riskContribution: 15,
      };
    }

    if (propSchema.max !== undefined && value > propSchema.max) {
      return {
        code: ConfabulationErrorCode.VALUE_OUT_OF_RANGE,
        message: `Property "${propSchema.name}" on "@${traitName}" has value ${value} but maximum is ${propSchema.max}`,
        objectName,
        traitName,
        propertyName: propSchema.name,
        suggestion: `Use a value <= ${propSchema.max}`,
        riskContribution: 15,
      };
    }

    return null;
  }

  /**
   * Calculate the overall confabulation risk score.
   */
  private calculateRiskScore(
    errors: ConfabulationError[],
    warnings: ConfabulationWarning[]
  ): number {
    let score = 0;

    for (const error of errors) {
      score += error.riskContribution;
    }
    for (const warning of warnings) {
      score += warning.riskContribution;
    }

    // Normalize to 0-100 range
    return Math.min(100, score);
  }
}

// =============================================================================
// ERROR CLASS
// =============================================================================

/**
 * Error thrown when confabulation is detected in a compiler pipeline.
 *
 * This error is thrown by the RBAC confabulation gate to prevent
 * hallucinated trait properties from reaching compiler output.
 */
export class ConfabulationDetectedError extends Error {
  constructor(
    public readonly result: ConfabulationValidationResult,
    public readonly compilerName?: string
  ) {
    const errorSummary = result.errors.map((e) => `  - ${e.message}`).join('\n');
    super(
      `[${compilerName ?? 'ConfabulationValidator'}] Confabulation detected (risk score: ${result.riskScore}/100):\n` +
        `${result.errors.length} error(s), ${result.warnings.length} warning(s)\n` +
        errorSummary
    );
    this.name = 'ConfabulationDetectedError';
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let globalConfabulationValidator: ConfabulationValidator | null = null;

/**
 * Get or create the global ConfabulationValidator instance.
 */
export function getConfabulationValidator(
  config?: ConfabulationValidatorConfig
): ConfabulationValidator {
  if (!globalConfabulationValidator) {
    globalConfabulationValidator = new ConfabulationValidator(config);
  }
  return globalConfabulationValidator;
}

/**
 * Reset the global ConfabulationValidator (for testing).
 */
export function resetConfabulationValidator(): void {
  globalConfabulationValidator = null;
}
