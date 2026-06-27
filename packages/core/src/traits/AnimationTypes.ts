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

  /** Numeric output tracks written to runtime/render channels */
  tracks?: AnimationTrackDef[];
}

export interface AnimationTrackKeyframe {
  /** Position along the clip timeline in seconds */
  time: number;

  /** Numeric channel value at this keyframe */
  value: number;

  /** Optional easing for the segment arriving at this keyframe */
  easing?: string;
}

export interface AnimationTrackDef {
  /** Runtime/render channel, e.g. "hips.x" or "material.opacity" */
  target: string;

  /** Sampled numeric keyframes */
  keyframes: AnimationTrackKeyframe[];

  /** Baseline pose/value used by additive blending */
  defaultValue?: number;
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

  /** Direct blend parameter names, one per clip */
  parameters?: string[];

  /** Thresholds for 1D blend tree */
  thresholds?: number[];

  /** Blend tree mode */
  blendType?: '1d' | 'direct';

  /** Override or additive output composition for this state */
  blendMode?: AnimationBlendMode;

  /** Optional per-state output channel mask */
  mask?: string[];

  /** Baseline/default pose values used by additive output channels */
  baseline?: Record<string, number>;

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

  /** Freeze the source animation while blending to the destination. */
  pauseWhenExiting?: boolean;

  /**
   * Crossfade easing curve name — reuses the shipped `applyEasing` vocabulary
   * (`linear` / `easeIn` / `easeOut` / `easeInOut` / `spring` / `bounce` /
   * `smoothstep`). Default `linear` (preserves prior crossfade behavior).
   */
  easing?: string;
}

export type AnimationInputBindingAction = 'set' | 'fire' | 'reset';

export interface AnimationInputBinding {
  /** Trait/event type that drives the binding */
  event: string;

  /** Animation input parameter to mutate */
  parameter: string;

  /** Binding action. Defaults to set. */
  action?: AnimationInputBindingAction;

  /** Literal assignment value */
  value?: number | boolean | string;

  /** Event/payload path used as the assignment value, e.g. value or payload.speed */
  source?: string;
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
  blendTree?: ActiveBlendTree;
}

/**
 * Runtime child clip inside a blend tree.
 */
export interface ActiveBlendChild {
  clip: AnimationClipDef;
  weight: number;
  time: number;
  normalizedTime: number;
  speed: number;
  threshold?: number;
  parameter?: string;
}

/**
 * Runtime blend tree state.
 */
export interface ActiveBlendTree {
  type: '1d' | 'direct';
  parameter?: string;
  parameters?: string[];
  children: ActiveBlendChild[];
}

/**
 * Crossfade state (internal)
 */
export interface CrossfadeState {
  from: ActiveAnimation;
  to: ActiveAnimation;
  progress: number;
  duration: number;
  /** Easing curve for the blend weight (see AnimationTransition.easing). */
  easing?: string;
  /** Freeze the source animation while blending to the destination. */
  pauseWhenExiting?: boolean;
}

export interface AnimationClipWeight {
  clip: string;
  weight: number;
  threshold?: number;
  parameter?: string;
}

export interface AnimationTransitionInspection {
  fromState: string;
  toState: string;
  progress: number;
  easedProgress: number;
  duration: number;
  easing?: string;
  pauseWhenExiting?: boolean;
}

export interface AnimationLayerInspection {
  layer: number;
  layerName?: string;
  currentState?: string;
  currentClip?: string;
  normalizedTime: number;
  clipWeights: AnimationClipWeight[];
  transition?: AnimationTransitionInspection;
}

export interface AnimationInspectionSnapshot {
  time: number;
  parameters: Record<string, number | boolean>;
  layers: AnimationLayerInspection[];
  outputs: AnimationOutputSnapshot;
}

export interface AnimationChannelContribution {
  layer: number;
  layerName?: string;
  state: string;
  clip: string;
  target: string;
  weight: number;
  sampledValue: number;
  baseline: number;
  blendMode: AnimationBlendMode;
}

export interface AnimationResolvedChannel {
  target: string;
  value: number;
  contributions: AnimationChannelContribution[];
}

export interface AnimationOutputSnapshot {
  time: number;
  channels: Record<string, number>;
  details: AnimationResolvedChannel[];
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

  /** Composition priority. Higher priority resolves after lower priority. */
  priority?: number;

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

  /** Event/listener bindings that mutate typed animation inputs */
  inputBindings?: AnimationInputBinding[];

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
