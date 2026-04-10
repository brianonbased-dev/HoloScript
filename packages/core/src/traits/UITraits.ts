/**
 * UI Traits for Spatial Computing
 *
 * Traits for UI components that exist in 3D/VR/AR space:
 * - @ui_floating - Panels that follow user gaze with smooth lag
 * - @ui_anchored - UI fixed to world position or entity
 * - @ui_hand_menu - Menu attached to user's hand
 * - @ui_billboard - Always faces the camera/user
 * - @ui_curved - Curved panel following arc radius
 * - @ui_docked - Docked to edge of viewport/space
 * - @ui_keyboard - Virtual keyboard support
 * - @ui_voice - Voice command integration
 *
 * @version 1.0.0
 */

import type { Vector3 } from '../types/HoloScriptPlus';

// =============================================================================
// UI TRAIT TYPES
// =============================================================================

export type UITraitName =
  | 'ui_floating'
  | 'ui_anchored'
  | 'ui_hand_menu'
  | 'ui_billboard'
  | 'ui_curved'
  | 'ui_docked'
  | 'ui_keyboard'
  | 'ui_voice'
  | 'ui_draggable'
  | 'ui_resizable'
  | 'ui_minimizable'
  | 'ui_scrollable';

// =============================================================================
// UI TRAIT CONFIGURATIONS
// =============================================================================

export interface UIFloatingTrait {
  /** Delay in seconds for smooth following (0 = instant) */
  follow_delay?: number;
  /** Distance from user face */
  distance?: number;
  /** Lock Y position (no vertical movement) */
  lock_y?: boolean;
  /** Only follow on X axis */
  lock_horizontal?: boolean;
  /** Maximum angle from center before repositioning */
  max_angle?: number;
  /** Easing function for movement */
  easing?: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';
}

export interface UIAnchoredTrait {
  /** Anchor target: 'world', 'head', 'left_hand', 'right_hand', or entity ID */
  to: 'world' | 'head' | 'left_hand' | 'right_hand' | string;
  /** Offset from anchor point */
  offset?: Vector3;
  /** Maintain orientation relative to anchor */
  maintain_orientation?: boolean;
}

export interface UIHandMenuTrait {
  /** Which hand to attach to */
  hand: 'left' | 'right' | 'dominant';
  /** Trigger to show menu */
  trigger: 'palm_up' | 'pinch' | 'always' | 'gaze';
  /** Offset from hand position */
  offset?: Vector3;
  /** Scale factor */
  scale?: number;
}

export interface UIBillboardTrait {
  /** Axis to lock (null = full billboard) */
  lock_axis?: 'x' | 'y' | 'z' | null;
  /** Smoothing factor (0-1) */
  smoothing?: number;
}

export interface UICurvedTrait {
  /** Curve radius in meters */
  radius: number;
  /** Arc angle in degrees */
  arc_angle?: number;
  /** Orientation: horizontal or vertical curve */
  orientation?: 'horizontal' | 'vertical';
}

export interface UIDockedTrait {
  /** Dock position */
  position:
    | 'top'
    | 'bottom'
    | 'left'
    | 'right'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right';
  /** Padding from edge */
  padding?: number;
  /** Auto-hide when not interacting */
  auto_hide?: boolean;
  /** Animation for show/hide */
  animation?: 'slide' | 'fade' | 'scale' | 'none';
}

export interface UIKeyboardTrait {
  /** Keyboard type */
  type?: 'full' | 'numeric' | 'email' | 'search';
  /** Position relative to input */
  position?: 'below' | 'above' | 'floating';
  /** Size scale */
  scale?: number;
  /** Enable haptic feedback on key press */
  haptics?: boolean;
}

export interface UIVoiceTrait {
  /** Voice commands this element responds to */
  commands?: string[];
  /** Enable dictation input */
  dictation?: boolean;
  /** Language for voice recognition */
  language?: string;
}

export interface UIDraggableTrait {
  /** Constrain movement to axis */
  constrain_axis?: 'x' | 'y' | 'z' | 'xy' | 'xz' | 'yz' | null;
  /** Minimum distance from user */
  min_distance?: number;
  /** Maximum distance from user */
  max_distance?: number;
  /** Snap to grid size (0 = no snap) */
  snap_grid?: number;
}

export interface UIResizableTrait {
  /** Minimum size [width, height] */
  min_size?: [number, number];
  /** Maximum size [width, height] */
  max_size?: [number, number];
  /** Keep aspect ratio */
  keep_aspect?: boolean;
  /** Resize handles */
  handles?: ('corner' | 'edge' | 'all')[];
}

export interface UIMinimizableTrait {
  /** Minimize to position */
  minimize_to?: 'corner' | 'taskbar' | 'icon';
  /** Icon when minimized */
  minimized_icon?: string;
  /** Size when minimized */
  minimized_size?: [number, number];
}

export interface UIScrollableTrait {
  /** Scroll direction */
  direction?: 'vertical' | 'horizontal' | 'both';
  /** Show scrollbar */
  show_scrollbar?: boolean;
  /** Scroll speed multiplier */
  speed?: number;
  /** Enable momentum scrolling */
  momentum?: boolean;
}

// =============================================================================
// TRAIT DEFAULT CONFIGURATIONS
// =============================================================================

export const UI_TRAIT_DEFAULTS: Record<UITraitName, Record<string, unknown>> = {
  ui_floating: {
    follow_delay: 0.3,
    distance: 1.5,
    lock_y: false,
    lock_horizontal: false,
    max_angle: 45,
    easing: 'ease-out',
  },
  ui_anchored: {
    to: 'world',
    offset: [0, 0, 0],
    maintain_orientation: false,
  },
  ui_hand_menu: {
    hand: 'dominant',
    trigger: 'palm_up',
    offset: [0, 0.1, 0],
    scale: 1,
  },
  ui_billboard: {
    lock_axis: 'y',
    smoothing: 0.1,
  },
  ui_curved: {
    radius: 2,
    arc_angle: 120,
    orientation: 'horizontal',
  },
  ui_docked: {
    position: 'bottom',
    padding: 0.1,
    auto_hide: false,
    animation: 'slide',
  },
  ui_keyboard: {
    type: 'full',
    position: 'below',
    scale: 1,
    haptics: true,
  },
  ui_voice: {
    commands: [],
    dictation: false,
    language: 'en-US',
  },
  ui_draggable: {
    constrain_axis: null,
    min_distance: 0.3,
    max_distance: 10,
    snap_grid: 0,
  },
  ui_resizable: {
    min_size: [100, 100],
    max_size: [1000, 1000],
    keep_aspect: false,
    handles: ['corner'],
  },
  ui_minimizable: {
    minimize_to: 'corner',
    minimized_icon: 'default',
    minimized_size: [50, 50],
  },
  ui_scrollable: {
    direction: 'vertical',
    show_scrollbar: true,
    speed: 1,
    momentum: true,
  },
};

// =============================================================================
// TRAIT HANDLER INTERFACE
// =============================================================================

export interface UITraitHandler<TConfig = unknown> {
  name: UITraitName;
  defaultConfig: TConfig;
  validate?: (config: TConfig) => { valid: boolean; errors: string[] };
  apply?: (element: unknown, config: TConfig, context: UITraitContext) => void;
  update?: (element: unknown, config: TConfig, context: UITraitContext, delta: number) => void;
  remove?: (element: unknown, config: TConfig, context: UITraitContext) => void;
}

export interface UITraitContext {
  /** User head position and rotation */
  head: { position: Vector3; rotation: Vector3 };
  /** Left hand position (if tracked) */
  leftHand?: { position: Vector3; rotation: Vector3; gesture?: string };
  /** Right hand position (if tracked) */
  rightHand?: { position: Vector3; rotation: Vector3; gesture?: string };
  /** Current time */
  time: number;
  /** Delta time since last update */
  deltaTime: number;
  /** Emit event function */
  emit: (event: string, payload?: unknown) => void;
}

// =============================================================================
// TRAIT VALIDATION
// =============================================================================

export function validateUITrait(
  name: UITraitName,
  config: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  switch (name) {
    case 'ui_floating':
      if (
        config.follow_delay !== undefined &&
        (typeof config.follow_delay !== 'number' || config.follow_delay < 0)
      ) {
        errors.push('follow_delay must be a non-negative number');
      }
      if (
        config.distance !== undefined &&
        (typeof config.distance !== 'number' || config.distance <= 0)
      ) {
        errors.push('distance must be a positive number');
      }
      break;

    case 'ui_anchored':
      if (!config.to) {
        errors.push("ui_anchored requires 'to' parameter");
      }
      break;

    case 'ui_hand_menu':
      if (config.hand && !['left', 'right', 'dominant'].includes(config.hand as string)) {
        errors.push("hand must be 'left', 'right', or 'dominant'");
      }
      break;

    case 'ui_curved':
      if (
        config.radius !== undefined &&
        (typeof config.radius !== 'number' || config.radius <= 0)
      ) {
        errors.push('radius must be a positive number');
      }
      break;

    case 'ui_docked':
      const validPositions = [
        'top',
        'bottom',
        'left',
        'right',
        'top-left',
        'top-right',
        'bottom-left',
        'bottom-right',
      ];
      if (config.position && !validPositions.includes(config.position as string)) {
        errors.push(`position must be one of: ${validPositions.join(', ')}`);
      }
      break;
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// TRAIT REGISTRATION
// =============================================================================

const registeredUITraits = new Map<UITraitName, UITraitHandler<unknown>>();

export function registerUITrait<T>(handler: UITraitHandler<T>): void {
  registeredUITraits.set(handler.name, handler as UITraitHandler<unknown>);
}

export function getUITrait(name: UITraitName): UITraitHandler<unknown> | undefined {
  return registeredUITraits.get(name);
}

export function getAllUITraits(): UITraitName[] {
  return Array.from(registeredUITraits.keys());
}

// =============================================================================
// EXPORT ALL TRAIT NAMES
// =============================================================================

export const UI_TRAIT_NAMES: UITraitName[] = [
  'ui_floating',
  'ui_anchored',
  'ui_hand_menu',
  'ui_billboard',
  'ui_curved',
  'ui_docked',
  'ui_keyboard',
  'ui_voice',
  'ui_draggable',
  'ui_resizable',
  'ui_minimizable',
  'ui_scrollable',
];
