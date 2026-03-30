/**
 * @holoscript/core Animation State Machine
 *
 * Manages animation states, transitions, condition evaluation,
 * parameters, and layers. Used by AnimationTrait as a delegate.
 */

import type {
  ActiveAnimation,
  AnimationClipDef,
  AnimationLayer,
  AnimationParameter,
  AnimationStateDef,
  AnimationTransition,
  CrossfadeState,
  TransitionCondition,
} from './AnimationTypes';

/**
 * Callback invoked by the state machine when a crossfade is needed.
 */
export type CrossfadeRequestFn = (stateName: string, duration: number, layer: number) => boolean;

/**
 * Animation State Machine — states, transitions, conditions, parameters, layers
 */
export class AnimationStateMachine {
  readonly states: Map<string, AnimationStateDef> = new Map();
  readonly transitions: AnimationTransition[] = [];
  readonly parameters: Map<string, AnimationParameter> = new Map();
  readonly layers: Map<string, AnimationLayer> = new Map();

  private onCrossfade: CrossfadeRequestFn = () => false;

  /** Provide the crossfade callback (set by AnimationTrait after construction) */
  setCrossfadeCallback(fn: CrossfadeRequestFn): void {
    this.onCrossfade = fn;
  }

  // ── States ──────────────────────────────────────────────────────────────

  addState(state: AnimationStateDef): void {
    this.states.set(state.name, state);
  }

  removeState(name: string): void {
    this.states.delete(name);
  }

  getState(name: string): AnimationStateDef | undefined {
    return this.states.get(name);
  }

  getStateNames(): string[] {
    return Array.from(this.states.keys());
  }

  /**
   * Resolve the clip for a given state, looking up from clip registry.
   */
  resolveClipForState(
    stateName: string,
    clips: Map<string, AnimationClipDef>
  ): { state: AnimationStateDef; clip: AnimationClipDef } | null {
    const state = this.states.get(stateName);
    if (!state) return null;

    const clipName = state.clip ?? state.clips?.[0];
    if (!clipName) return null;

    const clip = clips.get(clipName);
    if (!clip) return null;

    return { state, clip };
  }

  // ── Parameters ──────────────────────────────────────────────────────────

  addParameter(param: AnimationParameter): void {
    this.parameters.set(param.name, {
      ...param,
      value: param.value ?? param.default ?? (param.type === 'bool' ? false : 0),
    });
  }

  setFloat(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'float') {
      param.value = value;
      this.checkTransitions();
    }
  }

  getFloat(name: string): number {
    const param = this.parameters.get(name);
    return typeof param?.value === 'number' ? param.value : 0;
  }

  setInteger(name: string, value: number): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'int') {
      param.value = Math.floor(value);
      this.checkTransitions();
    }
  }

  getInteger(name: string): number {
    const param = this.parameters.get(name);
    return typeof param?.value === 'number' ? Math.floor(param.value) : 0;
  }

  setBool(name: string, value: boolean): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'bool') {
      param.value = value;
      this.checkTransitions();
    }
  }

  getBool(name: string): boolean {
    const param = this.parameters.get(name);
    return typeof param?.value === 'boolean' ? param.value : false;
  }

  setTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'trigger') {
      param.value = true;
      this.checkTransitions();
      // Triggers reset after being consumed
      param.value = false;
    }
  }

  resetTrigger(name: string): void {
    const param = this.parameters.get(name);
    if (param && param.type === 'trigger') {
      param.value = false;
    }
  }

  // ── Transitions ─────────────────────────────────────────────────────────

  addTransition(transition: AnimationTransition): void {
    this.transitions.push(transition);
    this.sortTransitions();
  }

  removeTransition(from: string, to: string): void {
    const idx = this.transitions.findIndex((t) => t.from === from && t.to === to);
    if (idx !== -1) this.transitions.splice(idx, 1);
  }

  sortTransitions(): void {
    this.transitions.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  checkTransitions(): void {
    let layerIndex = 0;
    for (const layer of this.layers.values()) {
      const currentState = layer.currentState;
      if (!currentState) {
        layerIndex++;
        continue;
      }

      for (const transition of this.transitions) {
        if (transition.from !== 'any' && transition.from !== currentState) continue;
        if (!transition.canTransitionToSelf && transition.to === currentState) continue;

        if (this.evaluateConditions(transition.conditions ?? [])) {
          this.onCrossfade(transition.to, transition.duration ?? 0.25, layerIndex);
          break;
        }
      }

      layerIndex++;
    }
  }

  evaluateConditions(conditions: TransitionCondition[]): boolean {
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

  evaluateCondition(condition: TransitionCondition): boolean {
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

  // ── Layers ──────────────────────────────────────────────────────────────

  setLayerWeight(layerIndex: number, weight: number): void {
    const layerName = Array.from(this.layers.keys())[layerIndex];
    const layer = this.layers.get(layerName);
    if (layer) {
      layer.weight = Math.max(0, Math.min(1, weight));
    }
  }

  getLayerWeight(layerIndex: number): number {
    const layerName = Array.from(this.layers.keys())[layerIndex];
    return this.layers.get(layerName)?.weight ?? 0;
  }

  getLayerCount(): number {
    return this.layers.size;
  }

  getLayerName(index: number): string | undefined {
    return Array.from(this.layers.keys())[index];
  }

  // ── Layer Update (crossfade + active animation) ─────────────────────────

  updateLayer(
    layerIndex: number,
    deltaTime: number,
    activeAnimations: Map<number, ActiveAnimation | null>,
    crossfades: Map<number, CrossfadeState | null>,
    updateAnimation: (anim: ActiveAnimation, dt: number) => void,
    emit: (event: { type: string; [k: string]: unknown }) => void
  ): void {
    const crossfade = crossfades.get(layerIndex);

    if (crossfade) {
      crossfade.progress += deltaTime / crossfade.duration;

      if (crossfade.progress >= 1) {
        const layerName = Array.from(this.layers.keys())[layerIndex];
        const layer = this.layers.get(layerName);
        if (layer) {
          layer.currentState = crossfade.to.state;
        }

        activeAnimations.set(layerIndex, crossfade.to);
        crossfades.set(layerIndex, null);

        emit({ type: 'transition-end', toState: crossfade.to.state, timestamp: Date.now() });
        emit({ type: 'state-enter', state: crossfade.to.state, timestamp: Date.now() });
      } else {
        crossfade.from.weight = 1 - crossfade.progress;
        crossfade.to.weight = crossfade.progress;
        updateAnimation(crossfade.from, deltaTime);
        updateAnimation(crossfade.to, deltaTime);
      }
    } else {
      const anim = activeAnimations.get(layerIndex);
      if (anim) {
        updateAnimation(anim, deltaTime);
      }
    }
  }

  // ── Serialization Helpers ───────────────────────────────────────────────

  exportParameters(): Record<string, number | boolean> {
    const result: Record<string, number | boolean> = {};
    for (const [name, param] of this.parameters) {
      result[name] = param.value;
    }
    return result;
  }

  exportLayerStates(): Record<string, string | undefined> {
    const result: Record<string, string | undefined> = {};
    for (const [name, layer] of this.layers) {
      result[name] = layer.currentState;
    }
    return result;
  }

  importParameters(data: Record<string, number | boolean>): void {
    for (const [name, value] of Object.entries(data)) {
      const param = this.parameters.get(name);
      if (param) {
        param.value = value;
      }
    }
  }
}
