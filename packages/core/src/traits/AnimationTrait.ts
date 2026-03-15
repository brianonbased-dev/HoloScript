/**
 * @holoscript/core Animation Trait
 *
 * Animation clip management and playback with states,
 * transitions, and events.
 *
 * @example
 * ```hsplus
 * object "Character" {
 *   @animation {
 *     clips: {
 *       idle: { asset: "idle.anim", loop: true },
 *       walk: { asset: "walk.anim", loop: true },
 *       jump: { asset: "jump.anim", loop: false }
 *     },
 *     states: {
 *       locomotion: { clips: ["idle", "walk"], parameter: "speed" },
 *       airborne: { clips: ["jump"] }
 *     },
 *     transitions: [
 *       { from: "locomotion", to: "airborne", condition: "isGrounded == false" }
 *     ]
 *   }
 * }
 * ```
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
 * Active animation instance
 */
interface ActiveAnimation {
  clip: AnimationClipDef;
  state: string;
  time: number;
  normalizedTime: number;
  weight: number;
  speed: number;
  layer: number;
}

/**
 * Crossfade state
 */
interface CrossfadeState {
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
type AnimationEventCallback = (event: AnimationEvent) => void;

/**
 * Animation Trait - Animation clips and state machine
 */
export class AnimationTrait {
  private config: AnimationConfig;
  private clips: Map<string, AnimationClipDef> = new Map();
  private states: Map<string, AnimationStateDef> = new Map();
  private transitions: AnimationTransition[] = [];
  private parameters: Map<string, AnimationParameter> = new Map();
  private layers: Map<string, AnimationLayer> = new Map();
  private activeAnimations: Map<number, ActiveAnimation | null> = new Map();
  private crossfades: Map<number, CrossfadeState | null> = new Map();
  private eventListeners: Map<AnimationEventType, Set<AnimationEventCallback>> = new Map();
  private currentTime: number = 0;

  constructor(config: AnimationConfig = {}) {
    this.config = {
      applyRootMotion: false,
      updateMode: 'normal',
      ...config,
    };

    // Initialize clips
    if (config.clips) {
      for (const clip of config.clips) {
        this.addClip(clip);
      }
    }

    // Initialize states
    if (config.states) {
      for (const state of config.states) {
        this.addState(state);
      }
    }

    // Initialize transitions
    if (config.transitions) {
      this.transitions = [...config.transitions];
      this.sortTransitions();
    }

    // Initialize parameters
    if (config.parameters) {
      for (const param of config.parameters) {
        this.addParameter(param);
      }
    }

    // Initialize layers
    if (config.layers) {
      for (const layer of config.layers) {
        this.layers.set(layer.name, layer);
      }
    } else {
      // Default base layer
      this.layers.set('Base Layer', {
        name: 'Base Layer',
        weight: 1,
        blendMode: 'override',
      });
    }

    // Initialize active animations for each layer
    let layerIndex = 0;
    for (const _layer of this.layers.keys()) {
      this.activeAnimations.set(layerIndex, null);
      this.crossfades.set(layerIndex, null);
      layerIndex++;
    }

    // Start default state
    if (config.defaultState) {
      this.setState(config.defaultState, 0);
    }
  }

  // ============================================================================
  // Core API
  // ============================================================================

  /**
   * Get configuration
   */
  public getConfig(): AnimationConfig {
    return { ...this.config };
  }

  /**
   * Get current time
   */
  public getCurrentTime(): number {
    return this.currentTime;
  }

  // ============================================================================
  // Clip Management
  // ============================================================================

  /**
   * Add an animation clip
   */
  public addClip(clip: AnimationClipDef): void {
    this.clips.set(clip.name, {
      ...clip,
      wrapMode: clip.wrapMode ?? 'once',
      blendMode: clip.blendMode ?? 'override',
      speed: clip.speed ?? 1,
    });
  }

  /**
   * Remove a clip
   */
  public removeClip(name: string): void {
    this.clips.delete(name);
  }

  /**
   * Get a clip
   */
  public getClip(name: string): AnimationClipDef | undefined {
    return this.clips.get(name);
  }

  /**
   * Get all clip names
   */
  public getClipNames(): string[] {
    return Array.from(this.clips.keys());
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Add a state
   */
  public addState(state: AnimationStateDef): void {
    this.states.set(state.name, state);
  }

  /**
   * Remove a state
   */
  public removeState(name: string): void {
    this.states.delete(name);
  }

  /**
   * Get a state
   */
  public getState(name: string): AnimationStateDef | undefined {
    return this.states.get(name);
  }

  /**
   * Get all state names
   */
  public getStateNames(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Set current state (immediate)
   */
  public setState(stateName: string, layer: number = 0): boolean {
    const state = this.states.get(stateName);
    if (!state) return false;

    const layerName = Array.from(this.layers.keys())[layer];
    const layerObj = this.layers.get(layerName);
    if (!layerObj) return false;

    const prevState = layerObj.currentState;
    layerObj.currentState = stateName;

    // Get clip for this state
    const clipName = state.clip ?? state.clips?.[0];
    if (!clipName) return false;

    const clip = this.clips.get(clipName);
    if (!clip) return false;

    // Exit old state
    if (prevState) {
      this.emit({
        type: 'state-exit',
        state: prevState,
        timestamp: Date.now(),
      });
    }

    // Enter new state
    this.activeAnimations.set(layer, {
      clip,
      state: stateName,
      time: 0,
      normalizedTime: 0,
      weight: 1,
      speed: state.speed ?? clip.speed ?? 1,
      layer,
    });

    this.emit({
      type: 'state-enter',
      state: stateName,
      timestamp: Date.now(),
    });

    this.emit({
      type: 'clip-start',
      clip: clipName,
      state: stateName,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Crossfade to state
   */
  public crossfade(stateName: string, duration: number = 0.25, layer: number = 0): boolean {
    const state = this.states.get(stateName);
    if (!state) return false;

    const clipName = state.clip ?? state.clips?.[0];
    if (!clipName) return false;

    const clip = this.clips.get(clipName);
    if (!clip) return false;

    const currentAnim = this.activeAnimations.get(layer);
    if (!currentAnim) {
      // No current animation, just set state
      return this.setState(stateName, layer);
    }

    // Start crossfade
    const newAnim: ActiveAnimation = {
      clip,
      state: stateName,
      time: 0,
      normalizedTime: 0,
      weight: 0,
      speed: state.speed ?? clip.speed ?? 1,
      layer,
    };

    this.crossfades.set(layer, {
      from: currentAnim,
      to: newAnim,
      progress: 0,
      duration,
    });

    this.emit({
      type: 'transition-start',
      fromState: currentAnim.state,
      toState: stateName,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Get current state for layer
   */
  public getCurrentState(layer: number = 0): string | undefined {
    const layerName = Array.from(this.layers.keys())[layer];
    return this.layers.get(layerName)?.currentState;
  }

  // ============================================================================
  // Playback
  // ============================================================================

  /**
   * Play a clip directly
   */
  public play(clipName: string, layer: number = 0): boolean {
    const clip = this.clips.get(clipName);
    if (!clip) return false;

    this.activeAnimations.set(layer, {
      clip,
      state: '',
      time: 0,
      normalizedTime: 0,
      weight: 1,
      speed: clip.speed ?? 1,
      layer,
    });

    this.emit({
      type: 'clip-start',
      clip: clipName,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Stop animation on layer
   */
  public stop(layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) {
      this.emit({
        type: 'clip-end',
        clip: anim.clip.name,
        state: anim.state,
        timestamp: Date.now(),
      });
    }

    this.activeAnimations.set(layer, null);
    this.crossfades.set(layer, null);
  }

  /**
   * Stop all animations
   */
  public stopAll(): void {
    for (let i = 0; i < this.layers.size; i++) {
      this.stop(i);
    }
  }

  /**
   * Pause animation
   */
  public pause(layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) {
      anim.speed = 0;
    }
  }

  /**
   * Resume animation
   */
  public resume(layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) {
      anim.speed = anim.clip.speed ?? 1;
    }
  }

  /**
   * Set playback speed
   */
  public setSpeed(speed: number, layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) {
      anim.speed = speed;
    }
  }

  /**
   * Get playback speed
   */
  public getSpeed(layer: number = 0): number {
    return this.activeAnimations.get(layer)?.speed ?? 1;
  }

  /**
   * Is playing
   */
  public isPlaying(layer?: number): boolean {
    if (layer !== undefined) {
      return this.activeAnimations.get(layer) !== null;
    }

    for (const anim of this.activeAnimations.values()) {
      if (anim !== null) return true;
    }
    return false;
  }

  /**
   * Get current clip name
   */
  public getCurrentClip(layer: number = 0): string | undefined {
    return this.activeAnimations.get(layer)?.clip.name;
  }

  /**
   * Get normalized time (0-1)
   */
  public getNormalizedTime(layer: number = 0): number {
    return this.activeAnimations.get(layer)?.normalizedTime ?? 0;
  }

  // ============================================================================
  // Parameters
  // ============================================================================

  /**
   * Add a parameter
   */
  public addParameter(param: AnimationParameter): void {
    this.parameters.set(param.name, {
      ...param,
      value: param.value ?? param.default ?? (param.type === 'bool' ? false : 0),
    });
  }

  /**
   * Set float parameter
   */
  public setFloat(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'float') {
      param.value = value;
      this.checkTransitions();
    }
  }

  /**
   * Get float parameter
   */
  public getFloat(name: string): number {
    const param = this.parameters.get(name);
    return typeof param?.value === 'number' ? param.value : 0;
  }

  /**
   * Set integer parameter
   */
  public setInteger(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'int') {
      param.value = Math.floor(value);
      this.checkTransitions();
    }
  }

  /**
   * Get integer parameter
   */
  public getInteger(name: string): number {
    const param = this.parameters.get(name);
    return typeof param?.value === 'number' ? Math.floor(param.value) : 0;
  }

  /**
   * Set bool parameter
   */
  public setBool(name: string, value: boolean): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'bool') {
      param.value = value;
      this.checkTransitions();
    }
  }

  /**
   * Get bool parameter
   */
  public getBool(name: string): boolean {
    const param = this.parameters.get(name);
    return typeof param?.value === 'boolean' ? param.value : false;
  }

  /**
   * Set trigger parameter
   */
  public setTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'trigger') {
      param.value = true;
      this.checkTransitions();
      // Triggers reset after being consumed
      param.value = false;
    }
  }

  /**
   * Reset trigger
   */
  public resetTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'trigger') {
      param.value = false;
    }
  }

  // ============================================================================
  // Transitions
  // ============================================================================

  /**
   * Add a transition
   */
  public addTransition(transition: AnimationTransition): void {
    this.transitions.push(transition);
    this.sortTransitions();
  }

  /**
   * Remove transitions
   */
  public removeTransition(from: string, to: string): void {
    this.transitions = this.transitions.filter((t) => !(t.from === from && t.to === to));
  }

  /**
   * Sort transitions by priority
   */
  private sortTransitions(): void {
    this.transitions.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  /**
   * Check transitions
   */
  private checkTransitions(): void {
    let layerIndex = 0;
    for (const layer of this.layers.values()) {
      const currentState = layer.currentState;
      if (!currentState) continue;

      for (const transition of this.transitions) {
        // Check if this transition is applicable
        if (transition.from !== 'any' && transition.from !== currentState) continue;
        if (!transition.canTransitionToSelf && transition.to === currentState) continue;

        // Check conditions
        if (this.evaluateConditions(transition.conditions ?? [])) {
          this.crossfade(transition.to, transition.duration ?? 0.25, layerIndex);
          break;
        }
      }

      layerIndex++;
    }
  }

  /**
   * Evaluate transition conditions
   */
  private evaluateConditions(conditions: TransitionCondition[]): boolean {
    if (conditions.length === 0) return true;

    let result = this.evaluateCondition(conditions[0]);

    for (let i = 1; i < conditions.length; i++) {
      const prev = conditions[i - 1];
      const curr = conditions[i];
      const evalResult = this.evaluateCondition(curr);

      if (prev.chain === 'or') {
        result = result || evalResult;
      } else {
        result = result && evalResult;
      }
    }

    return result;
  }

  /**
   * Evaluate single condition
   */
  private evaluateCondition(condition: TransitionCondition): boolean {
    const param = this.parameters.get(condition.parameter);
    if (!param) return false;

    const value = param.value;
    const target = condition.value;

    switch (condition.operator) {
      case '==':
        return value === target;
      case '!=':
        return value !== target;
      case '>':
        return Number(value) > Number(target);
      case '<':
        return Number(value) < Number(target);
      case '>=':
        return Number(value) >= Number(target);
      case '<=':
        return Number(value) <= Number(target);
      default:
        return false;
    }
  }

  // ============================================================================
  // Layers
  // ============================================================================

  /**
   * Set layer weight
   */
  public setLayerWeight(layerIndex: number, weight: number): void {
    const layerName = Array.from(this.layers.keys())[layerIndex];
    const layer = this.layers.get(layerName);
    if (layer) {
      layer.weight = Math.max(0, Math.min(1, weight));
    }
  }

  /**
   * Get layer weight
   */
  public getLayerWeight(layerIndex: number): number {
    const layerName = Array.from(this.layers.keys())[layerIndex];
    return this.layers.get(layerName)?.weight ?? 0;
  }

  /**
   * Get layer count
   */
  public getLayerCount(): number {
    return this.layers.size;
  }

  /**
   * Get layer name
   */
  public getLayerName(index: number): string | undefined {
    return Array.from(this.layers.keys())[index];
  }

  // ============================================================================
  // Update
  // ============================================================================

  /**
   * Update animation state (call each frame)
   */
  public update(deltaTime: number): void {
    this.currentTime += deltaTime;

    // Update each layer
    let layerIndex = 0;
    for (const _layer of this.layers.values()) {
      this.updateLayer(layerIndex, deltaTime);
      layerIndex++;
    }
  }

  /**
   * Update a single layer
   */
  private updateLayer(layerIndex: number, deltaTime: number): void {
    const crossfade = this.crossfades.get(layerIndex);

    if (crossfade) {
      // Update crossfade
      crossfade.progress += deltaTime / crossfade.duration;

      if (crossfade.progress >= 1) {
        // Crossfade complete
        const layerName = Array.from(this.layers.keys())[layerIndex];
        const layer = this.layers.get(layerName);
        if (layer) {
          layer.currentState = crossfade.to.state;
        }

        this.activeAnimations.set(layerIndex, crossfade.to);
        this.crossfades.set(layerIndex, null);

        this.emit({
          type: 'transition-end',
          toState: crossfade.to.state,
          timestamp: Date.now(),
        });

        this.emit({
          type: 'state-enter',
          state: crossfade.to.state,
          timestamp: Date.now(),
        });
      } else {
        // Update weights
        crossfade.from.weight = 1 - crossfade.progress;
        crossfade.to.weight = crossfade.progress;

        // Update both animations
        this.updateAnimation(crossfade.from, deltaTime);
        this.updateAnimation(crossfade.to, deltaTime);
      }
    } else {
      // Update active animation
      const anim = this.activeAnimations.get(layerIndex);
      if (anim) {
        this.updateAnimation(anim, deltaTime);
      }
    }
  }

  /**
   * Update a single animation
   */
  private updateAnimation(anim: ActiveAnimation, deltaTime: number): void {
    const clip = anim.clip;
    const prevTime = anim.time;

    anim.time += deltaTime * anim.speed;
    anim.normalizedTime = anim.time / clip.duration;

    // Check for events
    this.checkEvents(clip, prevTime, anim.time);

    // Handle wrap mode
    if (anim.time >= clip.duration) {
      switch (clip.wrapMode) {
        case 'loop':
          anim.time %= clip.duration;
          anim.normalizedTime = anim.time / clip.duration;

          this.emit({
            type: 'clip-loop',
            clip: clip.name,
            state: anim.state,
            timestamp: Date.now(),
          });
          break;

        case 'ping-pong':
          anim.speed *= -1;
          anim.time = clip.duration;
          break;

        case 'clamp':
          anim.time = clip.duration;
          anim.normalizedTime = 1;
          break;

        default:
          // once - stop at end
          this.emit({
            type: 'clip-end',
            clip: clip.name,
            state: anim.state,
            timestamp: Date.now(),
          });
          break;
      }
    }
  }

  /**
   * Check for animation events
   */
  private checkEvents(clip: AnimationClipDef, prevTime: number, currTime: number): void {
    if (!clip.events) return;

    for (const event of clip.events) {
      if (event.time > prevTime && event.time <= currTime) {
        this.emit({
          type: 'event',
          clip: clip.name,
          eventName: event.name,
          data: event.data,
          timestamp: Date.now(),
        });
      }
    }
  }

  // ============================================================================
  // Events
  // ============================================================================

  /**
   * Register event listener
   */
  public on(event: AnimationEventType, callback: AnimationEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * Unregister event listener
   */
  public off(event: AnimationEventType, callback: AnimationEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Emit event
   */
  private emit(event: AnimationEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const callback of listeners) {
        try {
          callback(event);
        } catch (e) {
          console.error('Animation event listener error:', e);
        }
      }
    }
  }

  // ============================================================================
  // Serialization
  // ============================================================================

  /**
   * Export current state
   */
  public exportState(): {
    parameters: Record<string, number | boolean>;
    layerStates: Record<string, string | undefined>;
  } {
    const parameters: Record<string, number | boolean> = {};
    for (const [name, param] of this.parameters) {
      parameters[name] = param.value;
    }

    const layerStates: Record<string, string | undefined> = {};
    for (const [name, layer] of this.layers) {
      layerStates[name] = layer.currentState;
    }

    return { parameters, layerStates };
  }

  /**
   * Import state
   */
  public importState(data: {
    parameters?: Record<string, number | boolean>;
    layerStates?: Record<string, string>;
  }): void {
    if (data.parameters) {
      for (const [name, value] of Object.entries(data.parameters)) {
        const param = this.parameters.get(name);
        if (param) {
          param.value = value;
        }
      }
    }

    if (data.layerStates) {
      let layerIndex = 0;
      for (const [layerName, stateName] of Object.entries(data.layerStates)) {
        if (this.layers.has(layerName) && stateName) {
          this.setState(stateName, layerIndex);
        }
        layerIndex++;
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.stopAll();
    this.eventListeners.clear();
  }
}

/**
 * Create an animation trait
 */
export function createAnimationTrait(config?: AnimationConfig): AnimationTrait {
  return new AnimationTrait(config);
}

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const animationHandler = {
  name: 'animation',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__animationState = { active: true, config };
    ctx.emit('animation_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('animation_detached', { node });
    delete node.__animationState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'animation_configure') {
      Object.assign(node.__animationState?.config ?? {}, event.payload ?? {});
      ctx.emit('animation_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
