/**
 * @holoscript/core Property Annotations
 *
 * Pre-built semantic annotations for common HoloScript property types.
 * Provides ready-to-use annotations for spatial, visual, physical, and AI properties.
 */

import { SemanticCategory, createAnnotation, createDefaultFlags } from './SemanticAnnotation';
import type { SemanticAnnotation } from './SemanticAnnotation';

// ============================================================================
// Annotation Presets
// ============================================================================

/**
 * Preset for position properties (x, y, z coordinates)
 */
export function positionAnnotation(
  propertyPath: string,
  options: {
    label?: string;
    unit?: 'meters' | 'units' | 'pixels';
    min?: number;
    max?: number;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, options.label ?? 'Position', 'spatial', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      animatable: true,
      affectsRender: true,
      affectsPhysics: true,
      inspectable: true,
    },
    constraints: {
      min: options.min ?? -Infinity,
      max: options.max ?? Infinity,
    },
    unit: options.unit ?? 'meters',
    editorWidget: 'vector3',
    aiHint: 'World-space position coordinates. Affects where entity appears in 3D space.',
    tags: ['transform', 'position', 'spatial'],
  });
}

/**
 * Preset for rotation properties (euler angles or quaternion)
 */
export function rotationAnnotation(
  propertyPath: string,
  options: {
    label?: string;
    format?: 'euler' | 'quaternion';
    unit?: 'degrees' | 'radians';
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, options.label ?? 'Rotation', 'spatial', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      animatable: true,
      affectsRender: true,
      affectsPhysics: true,
      inspectable: true,
    },
    constraints: {
      min: options.unit === 'degrees' ? -360 : -Math.PI * 2,
      max: options.unit === 'degrees' ? 360 : Math.PI * 2,
    },
    unit: options.unit ?? 'degrees',
    displayFormat: options.format ?? 'euler',
    editorWidget: options.format === 'quaternion' ? 'quaternion' : 'euler',
    aiHint: 'Orientation in 3D space. Affects which direction entity faces.',
    tags: ['transform', 'rotation', 'spatial'],
  });
}

/**
 * Preset for scale properties
 */
export function scaleAnnotation(
  propertyPath: string,
  options: {
    label?: string;
    uniform?: boolean;
    min?: number;
    max?: number;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, options.label ?? 'Scale', 'spatial', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      animatable: true,
      affectsRender: true,
      affectsPhysics: true,
      inspectable: true,
    },
    constraints: {
      min: options.min ?? 0.001,
      max: options.max ?? 1000,
      step: 0.01,
    },
    editorWidget: options.uniform ? 'slider' : 'vector3',
    aiHint: 'Size multiplier. Values < 1 shrink, > 1 enlarge the entity.',
    tags: ['transform', 'scale', 'spatial'],
  });
}

/**
 * Preset for color properties
 */
export function colorAnnotation(
  propertyPath: string,
  options: {
    label?: string;
    includeAlpha?: boolean;
    format?: 'rgb' | 'hsl' | 'hex';
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, options.label ?? 'Color', 'visual', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      animatable: true,
      affectsRender: true,
      inspectable: true,
    },
    constraints: {
      min: 0,
      max: 1,
    },
    displayFormat: options.format ?? 'rgb',
    editorWidget: options.includeAlpha ? 'colorAlpha' : 'color',
    aiHint: 'Visual color. Can be animated for effects like pulsing or fading.',
    tags: ['visual', 'color', 'appearance'],
  });
}

/**
 * Preset for opacity/alpha properties
 */
export function opacityAnnotation(
  propertyPath: string,
  options: {
    label?: string;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, options.label ?? 'Opacity', 'visual', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      animatable: true,
      affectsRender: true,
      inspectable: true,
    },
    constraints: {
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 1,
    },
    editorWidget: 'slider',
    aiHint: 'Transparency level. 0 = invisible, 1 = fully opaque.',
    tags: ['visual', 'opacity', 'transparency'],
  });
}

/**
 * Preset for boolean toggle properties
 */
export function toggleAnnotation(
  propertyPath: string,
  label: string,
  category: SemanticCategory,
  options: {
    defaultValue?: boolean;
    aiHint?: string;
    networked?: boolean;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, label, category, {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: options.networked ?? false,
      inspectable: true,
    },
    constraints: {
      defaultValue: options.defaultValue ?? false,
    },
    editorWidget: 'toggle',
    aiHint: options.aiHint ?? `Toggle ${label} on or off.`,
    tags: ['toggle', 'boolean'],
  });
}

/**
 * Preset for enum/select properties
 */
export function enumAnnotation(
  propertyPath: string,
  label: string,
  category: SemanticCategory,
  allowedValues: string[],
  options: {
    defaultValue?: string;
    aiHint?: string;
    descriptions?: Record<string, string>;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, label, category, {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      inspectable: true,
    },
    constraints: {
      allowedValues,
      defaultValue: options.defaultValue ?? allowedValues[0],
    },
    editorWidget: 'select',
    aiHint: options.aiHint ?? `Choose ${label} from available options.`,
    metadata: options.descriptions ? { valueDescriptions: options.descriptions } : {},
    tags: ['enum', 'select'],
  });
}

/**
 * Preset for numeric range properties
 */
export function rangeAnnotation(
  propertyPath: string,
  label: string,
  category: SemanticCategory,
  options: {
    min: number;
    max: number;
    step?: number;
    defaultValue?: number;
    unit?: string;
    aiHint?: string;
  }
): SemanticAnnotation {
  return createAnnotation(propertyPath, label, category, {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      animatable: true,
      inspectable: true,
    },
    constraints: {
      min: options.min,
      max: options.max,
      step: options.step ?? (options.max - options.min) / 100,
      defaultValue: options.defaultValue ?? options.min,
    },
    unit: options.unit,
    editorWidget: 'slider',
    aiHint: options.aiHint ?? `Numeric value between ${options.min} and ${options.max}.`,
    tags: ['numeric', 'range'],
  });
}

/**
 * Preset for text/string properties
 */
export function textAnnotation(
  propertyPath: string,
  label: string,
  options: {
    category?: SemanticCategory;
    multiline?: boolean;
    maxLength?: number;
    pattern?: string;
    placeholder?: string;
    aiHint?: string;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, label, options.category ?? 'identity', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      inspectable: true,
    },
    constraints: {
      maxLength: options.maxLength,
      pattern: options.pattern,
    },
    editorWidget: options.multiline ? 'textarea' : 'text',
    aiHint: options.aiHint ?? `Text value for ${label}.`,
    metadata: options.placeholder ? { placeholder: options.placeholder } : {},
    tags: ['text', 'string'],
  });
}

/**
 * Preset for reference/asset properties
 */
export function referenceAnnotation(
  propertyPath: string,
  label: string,
  targetType: string,
  options: {
    required?: boolean;
    multiple?: boolean;
    aiHint?: string;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, label, 'identity', {
    intent: 'reference',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      required: options.required ?? false,
      inspectable: true,
    },
    relations: [
      {
        type: 'references',
        target: targetType,
        required: options.required ?? false,
        cardinality: options.multiple ? 'many' : 'one',
      },
    ],
    editorWidget: options.multiple ? 'assetList' : 'assetPicker',
    aiHint: options.aiHint ?? `Reference to ${targetType} asset.`,
    tags: ['reference', 'asset', targetType.toLowerCase()],
  });
}

// ============================================================================
// Physics Annotations
// ============================================================================

/**
 * Preset for mass property
 */
export function massAnnotation(
  propertyPath: string,
  options: {
    min?: number;
    max?: number;
    unit?: 'kg' | 'lbs';
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Mass', 'physical', {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      affectsPhysics: true,
      inspectable: true,
    },
    constraints: {
      min: options.min ?? 0,
      max: options.max ?? 10000,
      defaultValue: 1,
    },
    unit: options.unit ?? 'kg',
    editorWidget: 'number',
    aiHint: 'Physical mass affects gravity, collisions, and momentum.',
    tags: ['physics', 'mass', 'rigidbody'],
  });
}

/**
 * Preset for velocity property
 */
export function velocityAnnotation(
  propertyPath: string,
  options: {
    max?: number;
    unit?: 'm/s' | 'km/h';
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Velocity', 'physical', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      affectsPhysics: true,
      affectsRender: true,
      inspectable: true,
    },
    constraints: {
      max: options.max ?? Infinity,
    },
    unit: options.unit ?? 'm/s',
    editorWidget: 'vector3',
    aiHint: 'Current movement speed and direction.',
    tags: ['physics', 'velocity', 'motion'],
  });
}

/**
 * Preset for friction property
 */
export function frictionAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Friction', 'physical', {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      affectsPhysics: true,
      inspectable: true,
    },
    constraints: {
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0.5,
    },
    editorWidget: 'slider',
    aiHint: 'Surface friction. 0 = frictionless (ice), 1 = maximum grip.',
    tags: ['physics', 'friction', 'material'],
  });
}

/**
 * Preset for restitution/bounciness property
 */
export function restitutionAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Bounciness', 'physical', {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      affectsPhysics: true,
      inspectable: true,
    },
    constraints: {
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 0,
    },
    editorWidget: 'slider',
    aiHint: 'Bounce factor. 0 = no bounce, 1 = perfect elastic bounce.',
    tags: ['physics', 'restitution', 'bounce'],
  });
}

// ============================================================================
// AI/Behavior Annotations
// ============================================================================

/**
 * Preset for AI state properties
 */
export function aiStateAnnotation(
  propertyPath: string,
  states: string[],
  options: {
    defaultState?: string;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, 'AI State', 'ai', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      inspectable: true,
    },
    constraints: {
      allowedValues: states,
      defaultValue: options.defaultState ?? states[0],
    },
    editorWidget: 'stateMachine',
    aiHint: 'Current AI behavior state. Changes trigger behavior transitions.',
    tags: ['ai', 'state', 'behavior'],
  });
}

/**
 * Preset for AI goal properties
 */
export function aiGoalAnnotation(
  propertyPath: string,
  options: {
    goals?: string[];
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, 'AI Goal', 'ai', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      inspectable: true,
    },
    constraints: {
      allowedValues: options.goals,
    },
    editorWidget: 'goalSelector',
    aiHint: 'Current objective the AI is working toward.',
    tags: ['ai', 'goal', 'goap'],
  });
}

/**
 * Preset for emotion/mood properties
 */
export function emotionAnnotation(
  propertyPath: string,
  emotions: string[] = ['neutral', 'happy', 'sad', 'angry', 'fearful', 'surprised']
): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Emotion', 'ai', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      animatable: true,
      inspectable: true,
    },
    constraints: {
      allowedValues: emotions,
      defaultValue: 'neutral',
    },
    editorWidget: 'emotionWheel',
    aiHint: 'Current emotional state. Affects facial expressions, voice, and behavior.',
    tags: ['ai', 'emotion', 'character'],
  });
}

/**
 * Preset for dialog properties
 */
export function dialogAnnotation(
  propertyPath: string,
  options: {
    maxLength?: number;
    multiline?: boolean;
  } = {}
): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Dialog', 'narrative', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      inspectable: true,
    },
    constraints: {
      maxLength: options.maxLength ?? 500,
    },
    editorWidget: options.multiline ? 'dialogEditor' : 'text',
    aiHint: 'Text spoken by character. Can include emotion tags and SSML.',
    tags: ['dialog', 'speech', 'narrative'],
  });
}

// ============================================================================
// Network Annotations
// ============================================================================

/**
 * Preset for network sync priority
 */
export function syncPriorityAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Sync Priority', 'network', {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: false,
      inspectable: true,
    },
    constraints: {
      allowedValues: ['critical', 'high', 'normal', 'low', 'eventual'],
      defaultValue: 'normal',
    },
    editorWidget: 'select',
    aiHint: 'How urgently this property syncs across network. Higher = more bandwidth.',
    tags: ['network', 'sync', 'multiplayer'],
  });
}

/**
 * Preset for ownership properties
 */
export function ownershipAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Owner', 'network', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      networked: true,
      inspectable: true,
    },
    editorWidget: 'playerSelector',
    aiHint: 'Player/client that owns and controls this entity.',
    tags: ['network', 'ownership', 'authority'],
  });
}

// ============================================================================
// Audio Annotations
// ============================================================================

/**
 * Preset for volume properties
 */
export function volumeAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Volume', 'audio', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      animatable: true,
      inspectable: true,
    },
    constraints: {
      min: 0,
      max: 1,
      step: 0.01,
      defaultValue: 1,
    },
    editorWidget: 'slider',
    aiHint: 'Audio volume level. 0 = silent, 1 = full volume.',
    tags: ['audio', 'volume', 'sound'],
  });
}

/**
 * Preset for pitch properties
 */
export function pitchAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Pitch', 'audio', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      animatable: true,
      inspectable: true,
    },
    constraints: {
      min: 0.1,
      max: 3,
      step: 0.01,
      defaultValue: 1,
    },
    editorWidget: 'slider',
    aiHint: 'Audio pitch multiplier. < 1 = lower, > 1 = higher.',
    tags: ['audio', 'pitch', 'sound'],
  });
}

/**
 * Preset for spatial audio distance
 */
export function audioDistanceAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Audio Distance', 'audio', {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      affectsRender: true,
      inspectable: true,
    },
    constraints: {
      min: 0,
      max: 1000,
      step: 1,
      defaultValue: 10,
    },
    unit: 'meters',
    editorWidget: 'number',
    aiHint: 'Maximum distance at which audio can be heard.',
    tags: ['audio', 'spatial', 'distance'],
  });
}

// ============================================================================
// Accessibility Annotations
// ============================================================================

/**
 * Preset for alt text/description
 */
export function altTextAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'Alt Text', 'accessibility', {
    intent: 'state',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      inspectable: true,
    },
    constraints: {
      maxLength: 500,
    },
    editorWidget: 'textarea',
    aiHint: 'Accessibility description for screen readers and alt-text.',
    tags: ['accessibility', 'a11y', 'description'],
  });
}

/**
 * Preset for ARIA role
 */
export function ariaRoleAnnotation(propertyPath: string): SemanticAnnotation {
  return createAnnotation(propertyPath, 'ARIA Role', 'accessibility', {
    intent: 'config',
    flags: {
      ...createDefaultFlags(),
      mutable: true,
      inspectable: true,
    },
    constraints: {
      allowedValues: [
        'button',
        'checkbox',
        'dialog',
        'gridcell',
        'link',
        'menuitem',
        'progressbar',
        'radio',
        'slider',
        'switch',
        'tab',
        'textbox',
        'none',
      ],
    },
    editorWidget: 'select',
    aiHint: 'Semantic role for accessibility tree.',
    tags: ['accessibility', 'a11y', 'aria'],
  });
}

// ============================================================================
// Export Annotation Collection
// ============================================================================

export const PropertyAnnotations = {
  // Spatial
  position: positionAnnotation,
  rotation: rotationAnnotation,
  scale: scaleAnnotation,

  // Visual
  color: colorAnnotation,
  opacity: opacityAnnotation,

  // Generic
  toggle: toggleAnnotation,
  enum: enumAnnotation,
  range: rangeAnnotation,
  text: textAnnotation,
  reference: referenceAnnotation,

  // Physics
  mass: massAnnotation,
  velocity: velocityAnnotation,
  friction: frictionAnnotation,
  restitution: restitutionAnnotation,

  // AI
  aiState: aiStateAnnotation,
  aiGoal: aiGoalAnnotation,
  emotion: emotionAnnotation,
  dialog: dialogAnnotation,

  // Network
  syncPriority: syncPriorityAnnotation,
  ownership: ownershipAnnotation,

  // Audio
  volume: volumeAnnotation,
  pitch: pitchAnnotation,
  audioDistance: audioDistanceAnnotation,

  // Accessibility
  altText: altTextAnnotation,
  ariaRole: ariaRoleAnnotation,
};
