/**
 * AnimationStateMachine — states, transitions, blend times.
 * Self-contained. No external dependencies.
 */

export type AnimationState = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'die' | string;

export interface AnimationTransition {
  from: AnimationState;
  to: AnimationState;
  /** Blend time in seconds for cross-fade. */
  blendTime: number;
  /** Optional guard — transition only proceeds if this returns true. */
  condition?: () => boolean;
}

export interface AnimationStateConfig {
  name: AnimationState;
  /** Whether this state loops. Default true. */
  loop?: boolean;
  /** Duration in seconds (for non-looping states). */
  duration?: number;
  /** Callback when entering this state. */
  onEnter?: () => void;
  /** Callback when exiting this state. */
  onExit?: () => void;
}

export class AnimationStateMachine {
  private _states: Map<AnimationState, AnimationStateConfig> = new Map();
  private _transitions: AnimationTransition[] = [];
  private _currentState: AnimationState;
  private _previousState: AnimationState | null = null;
  private _blendProgress: number = 1; // 1 = fully in current state
  private _blendDuration: number = 0;
  private _stateTime: number = 0;
  private _locked: boolean = false;

  constructor(initialState: AnimationState = 'idle') {
    this._currentState = initialState;
  }

  get currentState(): AnimationState {
    return this._currentState;
  }

  get previousState(): AnimationState | null {
    return this._previousState;
  }

  get blendProgress(): number {
    return this._blendProgress;
  }

  get stateTime(): number {
    return this._stateTime;
  }

  get isBlending(): boolean {
    return this._blendProgress < 1;
  }

  get isLocked(): boolean {
    return this._locked;
  }

  /** Register an animation state. */
  addState(config: AnimationStateConfig): void {
    this._states.set(config.name, config);
  }

  /** Register a directional transition. */
  addTransition(transition: AnimationTransition): void {
    this._transitions.push({ ...transition });
  }

  /**
   * Convenience: register all default character states and transitions.
   * Provides idle, walk, run, jump, attack, die with sensible blend times.
   */
  addDefaultStates(): void {
    this.addState({ name: 'idle', loop: true });
    this.addState({ name: 'walk', loop: true });
    this.addState({ name: 'run', loop: true });
    this.addState({ name: 'jump', loop: false, duration: 0.8 });
    this.addState({ name: 'attack', loop: false, duration: 0.6 });
    this.addState({ name: 'die', loop: false, duration: 1.5 });

    const defaultTransitions: Array<[AnimationState, AnimationState, number]> = [
      ['idle', 'walk', 0.2],
      ['idle', 'run', 0.2],
      ['idle', 'jump', 0.1],
      ['idle', 'attack', 0.1],
      ['idle', 'die', 0.1],
      ['walk', 'idle', 0.2],
      ['walk', 'run', 0.15],
      ['walk', 'jump', 0.1],
      ['walk', 'attack', 0.1],
      ['walk', 'die', 0.1],
      ['run', 'idle', 0.25],
      ['run', 'walk', 0.15],
      ['run', 'jump', 0.1],
      ['run', 'attack', 0.1],
      ['run', 'die', 0.1],
      ['jump', 'idle', 0.2],
      ['jump', 'walk', 0.2],
      ['jump', 'run', 0.2],
      ['attack', 'idle', 0.2],
      ['attack', 'walk', 0.2],
      ['attack', 'run', 0.2],
    ];

    for (const [from, to, blend] of defaultTransitions) {
      this.addTransition({ from, to, blendTime: blend });
    }
  }

  /**
   * Request a transition to a new state.
   * Returns true if the transition was accepted.
   */
  transitionTo(state: AnimationState): boolean {
    if (this._locked) return false;
    if (state === this._currentState) return false;

    // Find matching transition
    const t = this._transitions.find(
      (tr) => tr.from === this._currentState && tr.to === state,
    );

    // Check condition guard
    if (t?.condition && !t.condition()) return false;

    const blendTime = t?.blendTime ?? 0.2; // fallback blend time

    // Exit current state
    const currentConfig = this._states.get(this._currentState);
    currentConfig?.onExit?.();

    // Enter new state
    this._previousState = this._currentState;
    this._currentState = state;
    this._blendProgress = 0;
    this._blendDuration = blendTime;
    this._stateTime = 0;

    const newConfig = this._states.get(state);
    newConfig?.onEnter?.();

    return true;
  }

  /**
   * Force-transition ignoring locks and missing transitions.
   * Useful for death or forced interruptions.
   */
  forceState(state: AnimationState): void {
    this._locked = false;
    const currentConfig = this._states.get(this._currentState);
    currentConfig?.onExit?.();

    this._previousState = this._currentState;
    this._currentState = state;
    this._blendProgress = 1;
    this._blendDuration = 0;
    this._stateTime = 0;

    const newConfig = this._states.get(state);
    newConfig?.onEnter?.();
  }

  /** Lock the state machine (prevents transitions until unlocked). */
  lock(): void {
    this._locked = true;
  }

  /** Unlock the state machine. */
  unlock(): void {
    this._locked = false;
  }

  /** Advance blend and state time. Auto-transitions non-looping states back to idle on completion. */
  update(deltaTime: number): void {
    if (deltaTime <= 0) return;

    this._stateTime += deltaTime;

    // Advance blend
    if (this._blendProgress < 1 && this._blendDuration > 0) {
      this._blendProgress = Math.min(1, this._blendProgress + deltaTime / this._blendDuration);
    }

    // Check for non-looping state completion
    const config = this._states.get(this._currentState);
    if (config && config.loop === false && config.duration !== undefined) {
      if (this._stateTime >= config.duration) {
        // Auto-return to idle
        this.transitionTo('idle');
      }
    }
  }

  /** Get all registered state names. */
  getStateNames(): AnimationState[] {
    return Array.from(this._states.keys());
  }

  /** Check if a transition from current state to target exists. */
  canTransitionTo(state: AnimationState): boolean {
    if (this._locked) return false;
    if (state === this._currentState) return false;
    const t = this._transitions.find(
      (tr) => tr.from === this._currentState && tr.to === state,
    );
    if (!t) return false;
    if (t.condition && !t.condition()) return false;
    return true;
  }
}
