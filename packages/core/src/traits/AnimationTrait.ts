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
  AnimationTrackKeyframe,
  AnimationTrackDef,
  AnimationStateDef,
  TransitionCondition,
  AnimationTransition,
  AnimationParameter,
  AnimationLayer,
  AnimationEventType,
  AnimationEvent,
  AnimationConfig,
  AnimationEventCallback,
  ActiveBlendChild,
  ActiveBlendTree,
  AnimationClipWeight,
  AnimationChannelContribution,
  AnimationResolvedChannel,
  AnimationOutputSnapshot,
  AnimationTransitionInspection,
  AnimationLayerInspection,
  AnimationInspectionSnapshot,
} from './AnimationTypes';
export { animationConfigFromStateMachine } from './AnimationStateMachineAuthoring';

import type {
  ActiveAnimation,
  ActiveBlendChild,
  ActiveBlendTree,
  AnimationClipDef,
  AnimationConfig,
  AnimationOutputSnapshot,
  AnimationResolvedChannel,
  AnimationEvent,
  AnimationEventCallback,
  AnimationEventType,
  AnimationLayer,
  AnimationParameter,
  AnimationStateDef,
  AnimationTrackDef,
  AnimationTransition,
  AnimationClipWeight,
  AnimationInspectionSnapshot,
  CrossfadeState,
} from './AnimationTypes';

import { AnimationStateMachine } from './AnimationStateMachine';
import { applyEasing } from '../runtime/easing';
import { sampleTrack } from '../animation/sequencer';

type OutputContribution = {
  layer: number;
  layerName?: string;
  state: string;
  stateDef?: AnimationStateDef;
  clip: AnimationClipDef;
  track: AnimationTrackDef;
  time: number;
  weight: number;
};

type PendingChannel = {
  target: string;
  baseline: number;
  blendMode: 'override' | 'additive';
  totalWeight: number;
  weightedValue: number;
  additiveDelta: number;
  contributions: AnimationResolvedChannel['contributions'];
};

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
    this.sm.setCrossfadeCallback((state, dur, layer, easing, pauseWhenExiting) =>
      this.crossfade(state, dur, layer, easing, pauseWhenExiting)
    );
    this.sm.setLayerPhaseCallback(
      (layer) => this.activeAnimations.get(layer)?.normalizedTime ?? 0
    );
    this.sm.setLayerTransitioningCallback((layer) => Boolean(this.crossfades.get(layer)));

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
    this.activeAnimations.set(
      layer,
      this.createActiveAnimation(stateName, resolved.state, resolved.clip, layer, 1)
    );

    this.emit({ type: 'state-enter', state: stateName, timestamp: Date.now() });
    this.emit({
      type: 'clip-start',
      clip: resolved.clip.name,
      state: stateName,
      timestamp: Date.now(),
    });

    return true;
  }

  public crossfade(
    stateName: string,
    duration: number = 0.25,
    layer: number = 0,
    easing?: string,
    pauseWhenExiting?: boolean
  ): boolean {
    const resolved = this.sm.resolveClipForState(stateName, this.clips);
    if (!resolved) return false;

    const currentAnim = this.activeAnimations.get(layer);
    if (!currentAnim) {
      return this.setState(stateName, layer);
    }

    const newAnim = this.createActiveAnimation(stateName, resolved.state, resolved.clip, layer, 0);

    this.crossfades.set(layer, {
      from: currentAnim,
      to: newAnim,
      progress: 0,
      duration,
      easing,
      pauseWhenExiting,
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

  public getParameterValues(): Record<string, number | boolean> {
    return this.sm.exportParameters();
  }

  public getBlendWeights(layer: number = 0): AnimationClipWeight[] {
    const crossfade = this.crossfades.get(layer);
    if (crossfade) {
      return [
        ...this.collectClipWeights(crossfade.from, crossfade.from.weight),
        ...this.collectClipWeights(crossfade.to, crossfade.to.weight),
      ];
    }

    const anim = this.activeAnimations.get(layer);
    return anim ? this.collectClipWeights(anim, anim.weight) : [];
  }

  public resolveOutputs(): AnimationOutputSnapshot {
    const channelValues = new Map<string, number>();
    const channelDetails = new Map<string, AnimationResolvedChannel>();
    const layers = this.getOrderedLayerEntries();

    for (const layerEntry of layers) {
      const layerWeight = this.clamp01(layerEntry.layer.weight);
      if (layerWeight <= 0) continue;

      const pendingChannels = this.collectLayerChannels(
        layerEntry.index,
        layerEntry.layerName,
        layerEntry.layer,
        layerWeight
      );

      for (const pending of pendingChannels.values()) {
        const previous = channelValues.get(pending.target) ?? pending.baseline;
        const totalWeight = this.clamp01(pending.totalWeight);
        const nextValue =
          pending.blendMode === 'additive'
            ? previous + pending.additiveDelta
            : previous * (1 - totalWeight) + pending.weightedValue;

        channelValues.set(pending.target, nextValue);

        const details =
          channelDetails.get(pending.target) ??
          ({
            target: pending.target,
            value: previous,
            contributions: [],
          } satisfies AnimationResolvedChannel);

        details.value = nextValue;
        details.contributions.push(...pending.contributions);
        channelDetails.set(pending.target, details);
      }
    }

    return {
      time: this.currentTime,
      channels: Object.fromEntries(
        Array.from(channelValues.entries()).sort(([a], [b]) => a.localeCompare(b))
      ),
      details: Array.from(channelDetails.values()).sort((a, b) => a.target.localeCompare(b.target)),
    };
  }

  public getResolvedOutputs(): AnimationOutputSnapshot {
    return this.resolveOutputs();
  }

  public inspect(): AnimationInspectionSnapshot {
    const outputs = this.resolveOutputs();
    const layers = Array.from(this.sm.layers.entries()).map(([layerName, layer], index) => {
      const anim = this.activeAnimations.get(index);
      const crossfade = this.crossfades.get(index);
      const transition = crossfade
        ? {
            fromState: crossfade.from.state,
            toState: crossfade.to.state,
            progress: crossfade.progress,
            easedProgress: applyEasing(crossfade.progress, crossfade.easing ?? 'linear'),
            duration: crossfade.duration,
            easing: crossfade.easing,
            pauseWhenExiting: crossfade.pauseWhenExiting,
          }
        : undefined;

      return {
        layer: index,
        layerName,
        currentState: layer.currentState,
        currentClip: anim?.clip.name,
        normalizedTime: anim?.normalizedTime ?? 0,
        clipWeights: this.getBlendWeights(index),
        transition,
      };
    });

    return {
      time: this.currentTime,
      parameters: this.getParameterValues(),
      layers,
      outputs,
    };
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
        (event) => this.emit({ ...event, timestamp: Date.now() } as unknown as AnimationEvent)
      );
      layerIndex++;
    }
    this.sm.checkTransitions();
  }

  private updateAnimation(anim: ActiveAnimation, deltaTime: number): void {
    if (anim.blendTree) {
      this.updateBlendTree(anim, deltaTime);
      return;
    }

    this.advanceAnimationPlayback(anim, deltaTime);
  }

  private getOrderedLayerEntries(): Array<{
    index: number;
    layerName: string;
    layer: AnimationLayer;
  }> {
    return Array.from(this.sm.layers.entries())
      .map(([layerName, layer], index) => ({ index, layerName, layer }))
      .sort((a, b) => {
        const priorityDelta = (a.layer.priority ?? 0) - (b.layer.priority ?? 0);
        return priorityDelta !== 0 ? priorityDelta : a.index - b.index;
      });
  }

  private collectLayerChannels(
    layer: number,
    layerName: string,
    layerDef: AnimationLayer,
    layerWeight: number
  ): Map<string, PendingChannel> {
    const pending = new Map<string, PendingChannel>();
    const crossfade = this.crossfades.get(layer);
    const sources = crossfade
      ? [
          ...this.collectOutputContributions(
            crossfade.from,
            crossfade.from.weight * layerWeight,
            layer,
            layerName,
            layerDef
          ),
          ...this.collectOutputContributions(
            crossfade.to,
            crossfade.to.weight * layerWeight,
            layer,
            layerName,
            layerDef
          ),
        ]
      : this.collectOutputContributions(
          this.activeAnimations.get(layer),
          (this.activeAnimations.get(layer)?.weight ?? 0) * layerWeight,
          layer,
          layerName,
          layerDef
        );

    for (const source of sources) {
      const sampledValue = sampleTrack(source.track.keyframes, source.time);
      const baseline = this.getTrackBaseline(source.stateDef, source.track);
      const blendMode = this.getContributionBlendMode(layerDef, source.stateDef, source.clip);
      const existing =
        pending.get(source.track.target) ??
        ({
          target: source.track.target,
          baseline,
          blendMode,
          totalWeight: 0,
          weightedValue: 0,
          additiveDelta: 0,
          contributions: [],
        } satisfies PendingChannel);

      existing.baseline = existing.baseline ?? baseline;
      existing.blendMode =
        existing.blendMode === 'additive' || blendMode === 'additive' ? 'additive' : 'override';
      existing.totalWeight += source.weight;
      existing.weightedValue += sampledValue * source.weight;
      existing.additiveDelta += (sampledValue - baseline) * source.weight;
      existing.contributions.push({
        layer: source.layer,
        layerName: source.layerName,
        state: source.state,
        clip: source.clip.name,
        target: source.track.target,
        weight: source.weight,
        sampledValue,
        baseline,
        blendMode,
      });

      pending.set(source.track.target, existing);
    }

    return pending;
  }

  private collectOutputContributions(
    anim: ActiveAnimation | null | undefined,
    parentWeight: number,
    layer: number,
    layerName: string,
    layerDef: AnimationLayer
  ): OutputContribution[] {
    if (!anim || parentWeight <= 0) return [];

    const stateDef = this.sm.states.get(anim.state);
    const mask = this.mergeMasks(layerDef.mask, stateDef?.mask);
    const sources = this.collectWeightedClipSources(anim, parentWeight);
    const contributions: OutputContribution[] = [];

    for (const source of sources) {
      for (const track of source.clip.tracks ?? []) {
        if (!this.isTargetAllowed(track.target, mask)) continue;
        contributions.push({
          layer,
          layerName,
          state: anim.state,
          stateDef,
          clip: source.clip,
          track,
          time: source.time,
          weight: source.weight,
        });
      }
    }

    return contributions;
  }

  private collectWeightedClipSources(
    anim: ActiveAnimation,
    parentWeight: number
  ): Array<{ clip: AnimationClipDef; time: number; weight: number }> {
    if (!anim.blendTree) {
      return [{ clip: anim.clip, time: anim.time, weight: parentWeight }];
    }

    this.refreshBlendTreeWeights(anim);
    return anim.blendTree.children.map((child) => ({
      clip: child.clip,
      time: child.time,
      weight: child.weight * parentWeight,
    }));
  }

  private mergeMasks(layerMask?: string[], stateMask?: string[]): string[] | undefined {
    if (!layerMask && !stateMask) return undefined;
    if (layerMask && stateMask) {
      const stateSet = new Set(stateMask);
      return layerMask.filter((target) => stateSet.has(target));
    }
    return layerMask ?? stateMask;
  }

  private isTargetAllowed(target: string, mask?: string[]): boolean {
    if (!mask || mask.length === 0) return true;
    return mask.some((entry) => target === entry || target.startsWith(`${entry}.`));
  }

  private getTrackBaseline(state: AnimationStateDef | undefined, track: AnimationTrackDef): number {
    return state?.baseline?.[track.target] ?? track.defaultValue ?? 0;
  }

  private getContributionBlendMode(
    layer: AnimationLayer,
    state: AnimationStateDef | undefined,
    clip: AnimationClipDef
  ): 'override' | 'additive' {
    if (layer.additive || layer.blendMode === 'additive') return 'additive';
    if (state?.blendMode === 'additive') return 'additive';
    return clip.blendMode === 'additive' ? 'additive' : 'override';
  }

  private clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
  }

  private createActiveAnimation(
    stateName: string,
    state: AnimationStateDef,
    fallbackClip: AnimationClipDef,
    layer: number,
    weight: number
  ): ActiveAnimation {
    const anim: ActiveAnimation = {
      clip: fallbackClip,
      state: stateName,
      time: 0,
      normalizedTime: 0,
      weight,
      speed: state.speed ?? fallbackClip.speed ?? 1,
      layer,
      blendTree: this.createBlendTree(state),
    };
    this.refreshBlendTreeWeights(anim);
    this.syncAnimationToDominantBlendChild(anim);
    return anim;
  }

  private createBlendTree(state: AnimationStateDef): ActiveBlendTree | undefined {
    if (!state.clips || state.clips.length < 2) return undefined;

    const clips = state.clips
      .map((clipName) => this.clips.get(clipName))
      .filter((clip): clip is AnimationClipDef => Boolean(clip));
    if (clips.length < 2) return undefined;

    const type =
      state.blendType ?? (state.parameters && state.parameters.length > 0 ? 'direct' : '1d');
    const thresholds =
      state.thresholds && state.thresholds.length === clips.length
        ? state.thresholds
        : clips.map((_, index) => index);

    return {
      type,
      parameter: state.parameter,
      parameters: state.parameters,
      children: clips.map((clip, index) => ({
        clip,
        weight: index === 0 ? 1 : 0,
        time: 0,
        normalizedTime: 0,
        speed: state.speed ?? clip.speed ?? 1,
        threshold: thresholds[index],
        parameter: state.parameters?.[index],
      })),
    };
  }

  private updateBlendTree(anim: ActiveAnimation, deltaTime: number): void {
    if (!anim.blendTree) return;

    this.refreshBlendTreeWeights(anim);
    for (const child of anim.blendTree.children) {
      this.advanceBlendChildPlayback(anim.state, child, deltaTime);
    }
    this.syncAnimationToDominantBlendChild(anim);
  }

  private refreshBlendTreeWeights(anim: ActiveAnimation): void {
    const blendTree = anim.blendTree;
    if (!blendTree) return;

    if (blendTree.type === 'direct') {
      const rawWeights = blendTree.children.map((child) =>
        Math.max(0, this.getNumericParameter(child.parameter ?? ''))
      );
      const sum = rawWeights.reduce((total, weight) => total + weight, 0);
      blendTree.children.forEach((child, index) => {
        child.weight = sum > 0 ? (rawWeights[index] ?? 0) / sum : index === 0 ? 1 : 0;
      });
      return;
    }

    const parameterValue = this.getNumericParameter(blendTree.parameter ?? '');
    const children = blendTree.children;
    children.forEach((child) => {
      child.weight = 0;
    });

    const first = children[0];
    if (!first) return;

    if (parameterValue <= (first.threshold ?? 0)) {
      first.weight = 1;
      return;
    }

    const last = children[children.length - 1];
    if (!last) return;
    if (parameterValue >= (last.threshold ?? children.length - 1)) {
      last.weight = 1;
      return;
    }

    for (let index = 0; index < children.length - 1; index++) {
      const current = children[index];
      const next = children[index + 1];
      if (!current || !next) continue;
      const currentThreshold = current.threshold ?? index;
      const nextThreshold = next.threshold ?? index + 1;
      if (parameterValue >= currentThreshold && parameterValue <= nextThreshold) {
        const span = nextThreshold - currentThreshold;
        const alpha = span === 0 ? 0 : (parameterValue - currentThreshold) / span;
        current.weight = 1 - alpha;
        next.weight = alpha;
        return;
      }
    }
  }

  private getNumericParameter(name: string): number {
    const value = this.sm.parameters.get(name)?.value;
    return typeof value === 'number' ? value : 0;
  }

  private collectClipWeights(anim: ActiveAnimation, parentWeight: number): AnimationClipWeight[] {
    if (!anim.blendTree) {
      return [{ clip: anim.clip.name, weight: parentWeight }];
    }

    this.refreshBlendTreeWeights(anim);
    return anim.blendTree.children.map((child) => ({
      clip: child.clip.name,
      weight: child.weight * parentWeight,
      threshold: child.threshold,
      parameter: child.parameter,
    }));
  }

  private syncAnimationToDominantBlendChild(anim: ActiveAnimation): void {
    if (!anim.blendTree) return;
    const dominant = anim.blendTree.children.reduce((best, child) =>
      child.weight > best.weight ? child : best
    );
    anim.clip = dominant.clip;
    anim.time = dominant.time;
    anim.normalizedTime = dominant.normalizedTime;
    anim.speed = dominant.speed;
  }

  private advanceBlendChildPlayback(
    stateName: string,
    child: ActiveBlendChild,
    deltaTime: number
  ): void {
    const clip = child.clip;
    const prevTime = child.time;

    child.time += deltaTime * child.speed;
    child.normalizedTime = child.time / clip.duration;

    if (child.weight > 0) this.checkEvents(clip, prevTime, child.time);

    if (child.time >= clip.duration) {
      switch (clip.wrapMode) {
        case 'loop':
          child.time %= clip.duration;
          child.normalizedTime = child.time / clip.duration;
          if (child.weight > 0) {
            this.emit({
              type: 'clip-loop',
              clip: clip.name,
              state: stateName,
              timestamp: Date.now(),
            });
          }
          break;

        case 'ping-pong':
          child.speed *= -1;
          child.time = clip.duration;
          break;

        case 'clamp':
          child.time = clip.duration;
          child.normalizedTime = 1;
          break;

        default:
          if (child.weight > 0) {
            this.emit({
              type: 'clip-end',
              clip: clip.name,
              state: stateName,
              timestamp: Date.now(),
            });
          }
          break;
      }
    }
  }

  private advanceAnimationPlayback(anim: ActiveAnimation, deltaTime: number): void {
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
import type {
  TraitHandler,
  HSPlusNode,
  TraitContext,
  TraitEvent,
  TraitInstanceDelegate,
} from './TraitTypes';

export const animationHandler = {
  name: 'animation',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    // @ts-expect-error
    const instance = new AnimationTrait(config);
    node.__animation_instance = instance;
    ctx.emit('animation_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__animation_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('animation_detached', { node });
    delete node.__animation_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__animation_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'animation_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('animation_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__animation_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
