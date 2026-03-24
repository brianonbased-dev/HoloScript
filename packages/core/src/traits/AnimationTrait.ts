/**
 * @holoscript/core Animation Trait
 *
 * Animation clip management and playback with states,
 * transitions, and events.
 *
 * Split into three modules:
 * - AnimationTypes.ts   — shared type definitions
 * - AnimationStateMachine.ts — state/transition/parameter/layer logic
 * - AnimationTrait.ts   — coordinator: clips, playback, events, serialization
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

// Re-export all types for backwards-compatible imports
export type {
  AnimationWrapMode,
  AnimationBlendMode,
  AnimationClipDef,
  AnimationEventDef,
  AnimationStateDef,
  TransitionCondition,
  AnimationTransition,
  AnimationParameter,
  AnimationLayer,
  AnimationEventType,
  AnimationEvent,
  AnimationConfig,
  AnimationEventCallback,
} from './AnimationTypes';

import type {
  ActiveAnimation,
  AnimationClipDef,
  AnimationConfig,
  AnimationEvent,
  AnimationEventCallback,
  AnimationEventType,
  AnimationParameter,
  AnimationStateDef,
  AnimationTransition,
  CrossfadeState,
} from './AnimationTypes';

import { AnimationStateMachine } from './AnimationStateMachine';

/**
 * Animation Trait — clip playback coordinator with state machine delegate
 */
export class AnimationTrait {
  private config: AnimationConfig;
  private clips: Map<string, AnimationClipDef> = new Map();
  private activeAnimations: Map<number, ActiveAnimation | null> = new Map();
  private crossfades: Map<number, CrossfadeState | null> = new Map();
  private eventListeners: Map<AnimationEventType, Set<AnimationEventCallback>> = new Map();
  private currentTime: number = 0;

  /** Delegate: state machine, transitions, parameters, layers */
  private readonly sm: AnimationStateMachine;

  /** Expose parameters for internal/test access */
  private get parameters(): Map<string, AnimationParameter> {
    return this.sm.parameters;
  }

  constructor(config: AnimationConfig = {}) {
    this.config = {
      applyRootMotion: false,
      updateMode: 'normal',
      ...config,
    };

    this.sm = new AnimationStateMachine();
    this.sm.setCrossfadeCallback((state, dur, layer) => this.crossfade(state, dur, layer));

    // Initialize clips
    if (config.clips) {
      for (const clip of config.clips) {
        this.addClip(clip);
      }
    }

    // Initialize states
    if (config.states) {
      for (const state of config.states) {
        this.sm.addState(state);
      }
    }

    // Initialize transitions
    if (config.transitions) {
      this.sm.transitions.push(...config.transitions);
      this.sm.sortTransitions();
    }

    // Initialize parameters
    if (config.parameters) {
      for (const param of config.parameters) {
        this.sm.addParameter(param);
      }
    }

    // Initialize layers
    if (config.layers) {
      for (const layer of config.layers) {
        this.sm.layers.set(layer.name, layer);
      }
    } else {
      this.sm.layers.set('Base Layer', {
        name: 'Base Layer',
        weight: 1,
        blendMode: 'override',
      });
    }

    // Initialize active animations for each layer
    let layerIndex = 0;
    for (const _layer of this.sm.layers.keys()) {
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

  public getConfig(): AnimationConfig {
    return { ...this.config };
  }

  public getCurrentTime(): number {
    return this.currentTime;
  }

  // ============================================================================
  // Clip Management
  // ============================================================================

  public addClip(clip: AnimationClipDef): void {
    this.clips.set(clip.name, {
      ...clip,
      wrapMode: clip.wrapMode ?? 'once',
      blendMode: clip.blendMode ?? 'override',
      speed: clip.speed ?? 1,
    });
  }

  public removeClip(name: string): void {
    this.clips.delete(name);
  }

  public getClip(name: string): AnimationClipDef | undefined {
    return this.clips.get(name);
  }

  public getClipNames(): string[] {
    return Array.from(this.clips.keys());
  }

  // ============================================================================
  // State Management (delegates to AnimationStateMachine)
  // ============================================================================

  public addState(state: AnimationStateDef): void {
    this.sm.addState(state);
  }

  public removeState(name: string): void {
    this.sm.removeState(name);
  }

  public getState(name: string): AnimationStateDef | undefined {
    return this.sm.getState(name);
  }

  public getStateNames(): string[] {
    return this.sm.getStateNames();
  }

  public setState(stateName: string, layer: number = 0): boolean {
    const resolved = this.sm.resolveClipForState(stateName, this.clips);
    if (!resolved) return false;

    const layerName = Array.from(this.sm.layers.keys())[layer];
    const layerObj = this.sm.layers.get(layerName);
    if (!layerObj) return false;

    const prevState = layerObj.currentState;
    layerObj.currentState = stateName;

    // Exit old state
    if (prevState) {
      this.emit({ type: 'state-exit', state: prevState, timestamp: Date.now() });
    }

    // Enter new state
    this.activeAnimations.set(layer, {
      clip: resolved.clip,
      state: stateName,
      time: 0,
      normalizedTime: 0,
      weight: 1,
      speed: resolved.state.speed ?? resolved.clip.speed ?? 1,
      layer,
    });

    this.emit({ type: 'state-enter', state: stateName, timestamp: Date.now() });
    this.emit({
      type: 'clip-start',
      clip: resolved.clip.name,
      state: stateName,
      timestamp: Date.now(),
    });

    return true;
  }

  public crossfade(stateName: string, duration: number = 0.25, layer: number = 0): boolean {
    const resolved = this.sm.resolveClipForState(stateName, this.clips);
    if (!resolved) return false;

    const currentAnim = this.activeAnimations.get(layer);
    if (!currentAnim) {
      return this.setState(stateName, layer);
    }

    const newAnim: ActiveAnimation = {
      clip: resolved.clip,
      state: stateName,
      time: 0,
      normalizedTime: 0,
      weight: 0,
      speed: resolved.state.speed ?? resolved.clip.speed ?? 1,
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

  public getCurrentState(layer: number = 0): string | undefined {
    const layerName = Array.from(this.sm.layers.keys())[layer];
    return this.sm.layers.get(layerName)?.currentState;
  }

  // ============================================================================
  // Playback
  // ============================================================================

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

    this.emit({ type: 'clip-start', clip: clipName, timestamp: Date.now() });
    return true;
  }

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

  public stopAll(): void {
    for (let i = 0; i < this.sm.layers.size; i++) {
      this.stop(i);
    }
  }

  public pause(layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) anim.speed = 0;
  }

  public resume(layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) anim.speed = anim.clip.speed ?? 1;
  }

  public setSpeed(speed: number, layer: number = 0): void {
    const anim = this.activeAnimations.get(layer);
    if (anim) anim.speed = speed;
  }

  public getSpeed(layer: number = 0): number {
    return this.activeAnimations.get(layer)?.speed ?? 1;
  }

  public isPlaying(layer?: number): boolean {
    if (layer !== undefined) {
      return this.activeAnimations.get(layer) !== null;
    }
    for (const anim of this.activeAnimations.values()) {
      if (anim !== null) return true;
    }
    return false;
  }

  public getCurrentClip(layer: number = 0): string | undefined {
    return this.activeAnimations.get(layer)?.clip.name;
  }

  public getNormalizedTime(layer: number = 0): number {
    return this.activeAnimations.get(layer)?.normalizedTime ?? 0;
  }

  // ============================================================================
  // Parameters (delegates to AnimationStateMachine)
  // ============================================================================

  public addParameter(param: AnimationParameter): void {
    this.sm.addParameter(param);
  }

  public setFloat(name: string, value: number): void {
    this.sm.setFloat(name, value);
  }

  public getFloat(name: string): number {
    return this.sm.getFloat(name);
  }

  public setInteger(name: string, value: number): void {
    this.sm.setInteger(name, value);
  }

  public getInteger(name: string): number {
    return this.sm.getInteger(name);
  }

  public setBool(name: string, value: boolean): void {
    this.sm.setBool(name, value);
  }

  public getBool(name: string): boolean {
    return this.sm.getBool(name);
  }

  public setTrigger(name: string): void {
    this.sm.setTrigger(name);
  }

  public resetTrigger(name: string): void {
    this.sm.resetTrigger(name);
  }

  // ============================================================================
  // Transitions (delegates to AnimationStateMachine)
  // ============================================================================

  public addTransition(transition: AnimationTransition): void {
    this.sm.addTransition(transition);
  }

  public removeTransition(from: string, to: string): void {
    this.sm.removeTransition(from, to);
  }

  // ============================================================================
  // Layers (delegates to AnimationStateMachine)
  // ============================================================================

  public setLayerWeight(layerIndex: number, weight: number): void {
    this.sm.setLayerWeight(layerIndex, weight);
  }

  public getLayerWeight(layerIndex: number): number {
    return this.sm.getLayerWeight(layerIndex);
  }

  public getLayerCount(): number {
    return this.sm.getLayerCount();
  }

  public getLayerName(index: number): string | undefined {
    return this.sm.getLayerName(index);
  }

  // ============================================================================
  // Update
  // ============================================================================

  public update(deltaTime: number): void {
    this.currentTime += deltaTime;

    let layerIndex = 0;
    for (const _layer of this.sm.layers.values()) {
      this.sm.updateLayer(
        layerIndex,
        deltaTime,
        this.activeAnimations,
        this.crossfades,
        (anim, dt) => this.updateAnimation(anim, dt),
        (event) => this.emit(event as AnimationEvent),
      );
      layerIndex++;
    }
  }

  private updateAnimation(anim: ActiveAnimation, deltaTime: number): void {
    const clip = anim.clip;
    const prevTime = anim.time;

    anim.time += deltaTime * anim.speed;
    anim.normalizedTime = anim.time / clip.duration;

    this.checkEvents(clip, prevTime, anim.time);

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

  public on(event: AnimationEventType, callback: AnimationEventCallback): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  public off(event: AnimationEventType, callback: AnimationEventCallback): void {
    this.eventListeners.get(event)?.delete(callback);
  }

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

  public exportState(): {
    parameters: Record<string, number | boolean>;
    layerStates: Record<string, string | undefined>;
  } {
    return {
      parameters: this.sm.exportParameters(),
      layerStates: this.sm.exportLayerStates(),
    };
  }

  public importState(data: {
    parameters?: Record<string, number | boolean>;
    layerStates?: Record<string, string>;
  }): void {
    if (data.parameters) {
      this.sm.importParameters(data.parameters);
    }

    if (data.layerStates) {
      let layerIndex = 0;
      for (const [layerName, stateName] of Object.entries(data.layerStates)) {
        if (this.sm.layers.has(layerName) && stateName) {
          this.setState(stateName, layerIndex);
        }
        layerIndex++;
      }
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

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

// ── Handler (delegates to AnimationTrait) ──
import type { TraitHandler } from './TraitTypes';

export const animationHandler = {
  name: 'animation',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new AnimationTrait(config);
    node.__animation_instance = instance;
    ctx.emit('animation_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__animation_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('animation_detached', { node });
    delete node.__animation_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__animation_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'animation_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('animation_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__animation_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
