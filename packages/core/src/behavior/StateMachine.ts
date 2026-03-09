/**
 * StateMachine.ts
 *
 * Finite State Machine (FSM) for game logic, NPC AI, and UI state management.
 * Supports:
 * - Named states with enter/update/exit callbacks
 * - Guarded transitions (conditions that must be true to transition)
 * - Transition actions (side effects on transition)
 * - Event-driven and tick-driven transitions
 * - State history tracking
 */

// =============================================================================
// TYPES
// =============================================================================

export interface StateConfig {
  name: string;
  onEnter?: (context: any) => void;
  onUpdate?: (context: any, delta: number) => void;
  onExit?: (context: any) => void;
}

export interface TransitionConfig {
  from: string;
  to: string;
  event?: string; // Trigger on event
  guard?: (context: any) => boolean; // Must return true to allow
  action?: (context: any) => void; // Side effect on transition
}

export interface StateMachineConfig {
  initialState: string;
  states: StateConfig[];
  transitions: TransitionConfig[];
  context?: any;
}

// =============================================================================
// STATE MACHINE
// =============================================================================

export class StateMachine {
  private states: Map<string, StateConfig> = new Map();
  private transitions: TransitionConfig[] = [];
  private currentStateName: string = '';
  private previousStateName: string = '';
  private context: any;
  private history: string[] = [];
  private maxHistory: number = 50;

  constructor(config: StateMachineConfig) {
    this.context = config.context || {};

    for (const state of config.states) {
      this.states.set(state.name, state);
    }

    this.transitions = config.transitions;

    // Enter initial state
    this.enterState(config.initialState);
  }

  /**
   * Get the current state name.
   */
  getCurrentState(): string {
    return this.currentStateName;
  }

  /**
   * Get the previous state name.
   */
  getPreviousState(): string {
    return this.previousStateName;
  }

  /**
   * Get the shared context.
   */
  getContext(): any {
    return this.context;
  }

  /**
   * Get state transition history.
   */
  getHistory(): string[] {
    return [...this.history];
  }

  /**
   * Send an event to the state machine. May trigger a transition.
   */
  send(event: string): boolean {
    const transition = this.transitions.find(
      (t) =>
        t.from === this.currentStateName && t.event === event && (!t.guard || t.guard(this.context))
    );

    if (!transition) return false;

    this.executeTransition(transition);
    return true;
  }

  /**
   * Try to transition based on guards (no event, just check conditions).
   * Called automatically during update, or manually.
   */
  evaluate(): boolean {
    const transition = this.transitions.find(
      (t) => t.from === this.currentStateName && !t.event && t.guard && t.guard(this.context)
    );

    if (!transition) return false;

    this.executeTransition(transition);
    return true;
  }

  /**
   * Force a transition to a specific state (bypasses guards).
   */
  forceTransition(stateName: string): void {
    if (!this.states.has(stateName)) return;

    const currentState = this.states.get(this.currentStateName);
    if (currentState?.onExit) currentState.onExit(this.context);

    this.enterState(stateName);
  }

  /**
   * Update the state machine. Call every frame.
   */
  update(delta: number): void {
    const state = this.states.get(this.currentStateName);
    if (state?.onUpdate) {
      state.onUpdate(this.context, delta);
    }

    // Auto-evaluate guard-based transitions
    this.evaluate();
  }

  /**
   * Check if we're in a specific state.
   */
  isInState(stateName: string): boolean {
    return this.currentStateName === stateName;
  }

  private executeTransition(transition: TransitionConfig): void {
    const fromState = this.states.get(this.currentStateName);
    if (fromState?.onExit) fromState.onExit(this.context);

    if (transition.action) transition.action(this.context);

    this.enterState(transition.to);
  }

  private enterState(stateName: string): void {
    this.previousStateName = this.currentStateName;
    this.currentStateName = stateName;

    this.history.push(stateName);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    const state = this.states.get(stateName);
    if (state?.onEnter) state.onEnter(this.context);
  }
}
