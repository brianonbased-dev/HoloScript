/**
 * StateMachine.ts
 *
 * Hierarchical state machine: states with enter/exit/update hooks,
 * transitions with guards, sub-state machines, and event dispatch.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export type StateAction = (context: Record<string, unknown>) => void;
export type GuardFn = (context: Record<string, unknown>) => boolean;

export interface StateConfig {
  id: string;
  onEnter?: StateAction;
  onExit?: StateAction;
  onUpdate?: StateAction;
  parent?: string; // Parent state ID for hierarchy
}

export interface TransitionConfig {
  from: string;
  to: string;
  event: string;
  guard?: GuardFn;
  action?: StateAction;
}

// =============================================================================
// STATE MACHINE
// =============================================================================

export class StateMachine {
  private states: Map<string, StateConfig> = new Map();
  private transitions: TransitionConfig[] = [];
  private currentStateId: string | null = null;
  private context: Record<string, unknown> = {};
  private history: string[] = [];
  private maxHistory = 50;

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  addState(config: StateConfig): void {
    this.states.set(config.id, config);
  }
  removeState(id: string): void {
    this.states.delete(id);
  }

  setInitialState(id: string): void {
    this.currentStateId = id;
    const chain = this.getStateChain(id);
    for (const stateId of chain) {
      const state = this.states.get(stateId);
      if (state?.onEnter) state.onEnter(this.context);
    }
    this.history.push(id);
  }

  getCurrentState(): string | null {
    return this.currentStateId;
  }

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  addTransition(config: TransitionConfig): void {
    this.transitions.push(config);
  }

  send(event: string): boolean {
    if (!this.currentStateId) return false;

    // Check transitions from current state (and parent states)
    const candidates = this.getTransitionsFor(this.currentStateId, event);

    for (const transition of candidates) {
      if (transition.guard && !transition.guard(this.context)) continue;

      const fromChain = this.getStateChain(this.currentStateId);
      const toChain = this.getStateChain(transition.to);

      let lcaIndex = 0;
      while (
        lcaIndex < fromChain.length &&
        lcaIndex < toChain.length &&
        fromChain[lcaIndex] === toChain[lcaIndex]
      ) {
        lcaIndex++;
      }

      // Exit states up to Lowest Common Ancestor
      for (let i = fromChain.length - 1; i >= lcaIndex; i--) {
        const state = this.states.get(fromChain[i]);
        if (state?.onExit) state.onExit(this.context);
      }

      // Run transition action
      if (transition.action) transition.action(this.context);

      // Enter new states from LCA down to target
      for (let i = lcaIndex; i < toChain.length; i++) {
        const state = this.states.get(toChain[i]);
        if (state?.onEnter) state.onEnter(this.context);
      }

      this.currentStateId = transition.to;

      this.history.push(transition.to);
      if (this.history.length > this.maxHistory) this.history.shift();

      return true;
    }

    return false;
  }

  private getTransitionsFor(stateId: string, event: string): TransitionConfig[] {
    const result: TransitionConfig[] = [];

    // Direct transitions
    result.push(...this.transitions.filter((t) => t.from === stateId && t.event === event));

    // Check parent state transitions (hierarchy)
    const state = this.states.get(stateId);
    if (state?.parent) {
      result.push(...this.getTransitionsFor(state.parent, event));
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Enter/Exit with Hierarchy (Chained)
  // ---------------------------------------------------------------------------

  private getStateChain(id: string): string[] {
    const chain: string[] = [];
    let currentId: string | undefined = id;
    while (currentId) {
      chain.unshift(currentId);
      currentId = this.states.get(currentId)?.parent;
    }
    return chain;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(): void {
    if (!this.currentStateId) return;
    const state = this.states.get(this.currentStateId);
    if (state?.onUpdate) state.onUpdate(this.context);
  }

  // ---------------------------------------------------------------------------
  // Context
  // ---------------------------------------------------------------------------

  setContext(key: string, value: unknown): void {
    this.context[key] = value;
  }
  getContext(key: string): unknown {
    return this.context[key];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getStateCount(): number {
    return this.states.size;
  }
  getHistory(): string[] {
    return [...this.history];
  }
  isInState(id: string): boolean {
    return this.currentStateId === id;
  }

  getChildStates(parentId: string): string[] {
    const children: string[] = [];
    for (const [id, state] of this.states) {
      if (state.parent === parentId) children.push(id);
    }
    return children;
  }
}
