/**
 * @holoscript/core Animation Types
 *
 * Shared type definitions for the Animation trait system:
 * clips, states, transitions, parameters, layers, events.
 */

/**
 * Animation wrap mode
 */
export type AnimationWrapMode = 'once' | 'loop' | 'ping-pong' | 'clamp';

/**
 * Animation blend mode
 */
export type AnimationBlendMode = 'override' | 'additive';

/**
 * Animation clip definition
 */
export interface AnimationClipDef {
  /** Clip name */
  name: string;

  /** Asset path/ID */
  asset?: string;

  /** Duration in seconds */
  duration: number;

  /** Wrap mode */
  wrapMode?: AnimationWrapMode;

  /** Blend mode */
  blendMode?: AnimationBlendMode;

  /** Default speed */
  speed?: number;

  /** Events at specific times */
  events?: AnimationEventDef[];

  /** Start time offset */
  startTime?: number;

  /** End time offset */
  endTime?: number;

  /** Root motion */
  rootMotion?: boolean;
}

/**
 * Animation event definition
 */
export interface AnimationEventDef {
  /** Event name */
  name: string;

  /** Time in clip (seconds) */
  time: number;

  /** Event data */
  data?: Record<string, unknown>;

  /** Function to call */
  function?: string;
}

/**
 * Animation state definition
 */
export interface AnimationStateDef {
  /** State name */
  name: string;

  /** Single clip or blend tree */
  clip?: string;

  /** Multiple clips for blend tree */
  clips?: string[];

  /** Blend parameter name */
  parameter?: string;

  /** Thresholds for 1D blend tree */
  thresholds?: number[];

  /** Speed multiplier */
  speed?: number;

  /** Is this a sub-state machine */
  isSubState?: boolean;

  /** Entry state for sub-state machine */
  entryState?: string;

  /** Tags for this state */
  tags?: string[];
}

/**
 * Transition condition
 */
export interface TransitionCondition {
  /** Parameter name */
  parameter: string;

  /** Comparison operator */
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';

  /** Value to compare */
  value: number | boolean | string;

  /** Logical chain */
  chain?: 'and' | 'or';
}

/**
 * Animation transition
 */
export interface AnimationTransition {
  /** Source state (or 'any') */
  from: string | 'any';

  /** Destination state */
  to: string;

  /** Transition conditions */
  conditions?: TransitionCondition[];

  /** Transition duration (seconds) */
  duration?: number;

  /** Exit time (0-1, normalized) */
  exitTime?: number;

  /** Has exit time requirement */
  hasExitTime?: boolean;

  /** Offset into destination clip */
  offset?: number;

  /** Can transition to self */
  canTransitionToSelf?: boolean;

  /** Priority (higher = checked first) */
  priority?: number;
}

/**
 * Active animation instance (internal runtime state)
 */
export interface ActiveAnimation {
  clip: AnimationClipDef;
  state: string;
  time: number;
  normalizedTime: number;
  weight: number;
  speed: number;
  layer: number;
}

/**
 * Crossfade state (internal)
 */
export interface CrossfadeState {
  from: ActiveAnimation;
  to: ActiveAnimation;
  progress: number;
  duration: number;
}

/**
 * Animation parameter
 */
export interface AnimationParameter {
  /** Parameter name */
  name: string;

  /** Parameter type */
  type: 'float' | 'int' | 'bool' | 'trigger';

  /** Current value */
  value: number | boolean;

  /** Default value */
  default?: number | boolean;
}

/**
 * Animation layer
 */
export interface AnimationLayer {
  /** Layer name */
  name: string;

  /** Layer weight (0-1) */
  weight: number;

  /** Blend mode */
  blendMode: AnimationBlendMode;

  /** Avatar mask (body parts affected) */
  mask?: string[];

  /** Is additive */
  additive?: boolean;

  /** Current state */
  currentState?: string;
}

/**
 * Animation event types
 */
export type AnimationEventType =
  | 'clip-start'
  | 'clip-end'
  | 'clip-loop'
  | 'state-enter'
  | 'state-exit'
  | 'transition-start'
  | 'transition-end'
  | 'event';

/**
 * Animation event
 */
export interface AnimationEvent {
  /** Event type */
  type: AnimationEventType;

  /** Clip name */
  clip?: string;

  /** State name */
  state?: string;

  /** From state (for transitions) */
  fromState?: string;

  /** To state (for transitions) */
  toState?: string;

  /** Custom event name */
  eventName?: string;

  /** Event data */
  data?: Record<string, unknown>;

  /** Timestamp */
  timestamp: number;
}

/**
 * Animation configuration
 */
export interface AnimationConfig {
  /** Animation clips */
  clips?: AnimationClipDef[];

  /** Animation states */
  states?: AnimationStateDef[];

  /** Transitions */
  transitions?: AnimationTransition[];

  /** Parameters */
  parameters?: AnimationParameter[];

  /** Layers */
  layers?: AnimationLayer[];

  /** Default state */
  defaultState?: string;

  /** Default layer */
  defaultLayer?: string;

  /** Root motion enabled */
  applyRootMotion?: boolean;

  /** Update mode */
  updateMode?: 'normal' | 'unscaled' | 'fixed';
}

/**
 * Animation event callback
 */
export type AnimationEventCallback = (event: AnimationEvent) => void;
