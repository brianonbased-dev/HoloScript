import { StateMachineNode } from '@holoscript/core';
import { logger } from '@holoscript/core';

export interface StateMachineInstance {
  definition: StateMachineNode;
  currentState: string;
  context: Record<string, any>;
}

/** Hook executor function type — evaluates an onEntry/onExit code block */
export type HookExecutor = (code: string, context: Record<string, any>) => any;

/**
 * Guard evaluator function type — evaluates a transition condition expression.
 * Must return a truthy/falsy value. If no guard evaluator is registered, transitions
 * with conditions are treated as ungated (condition ignored, logged once).
 */
export type GuardEvaluator = (expression: string, context: Record<string, any>) => unknown;

/**
 * StateMachineInterpreter - Handles runtime execution of spatial state machines.
 *
 * The interpreter is pure: it owns state-machine definitions, current state, entry/exit
 * dispatch, and transition resolution. Code execution (onEntry/onExit bodies) and guard
 * expressions are delegated to executor hooks injected by the host runtime. This keeps
 * the interpreter free of any dependency on the expression evaluator.
 *
 * Wiring (done once by HoloScriptRuntime during init):
 *   stateMachineInterpreter.setHookExecutor((code, ctx) => runtime.evaluateExpression(code));
 *   stateMachineInterpreter.setGuardEvaluator((expr, ctx) => runtime.evaluateExpression(expr));
 *
 * Per-instance lifecycle:
 *   createInstance(id, definition, ctx)  -> registers, fires initial onEntry
 *   sendEvent(id, event)                 -> finds transition, checks guard, dispatches
 *   transitionTo(id, targetState)        -> runs exit -> change -> entry
 *   removeInstance(id)                   -> discards (no teardown hook yet)
 */
export class StateMachineInterpreter {
  private instances: Map<string, StateMachineInstance> = new Map();
  private hookExecutor: HookExecutor | null = null;
  private guardEvaluator: GuardEvaluator | null = null;
  private guardMissingWarned = false;

  /**
   * Set the hook executor function (called by runtime during initialization).
   * The executor evaluates onEntry/onExit code blocks in the runtime's expression
   * evaluator scope, augmented with the instance's context.
   */
  public setHookExecutor(executor: HookExecutor): void {
    this.hookExecutor = executor;
  }

  /**
   * Set the guard evaluator function (called by runtime during initialization).
   * The evaluator returns a truthy/falsy value for a transition's optional
   * condition expression. Without it, conditional transitions are treated as
   * ungated (the condition is ignored and a single warning is logged).
   */
  public setGuardEvaluator(evaluator: GuardEvaluator): void {
    this.guardEvaluator = evaluator;
    this.guardMissingWarned = false;
  }

  /**
   * Initialize a new state machine instance
   */
  public createInstance(
    id: string,
    definition: StateMachineNode,
    context: Record<string, any>
  ): StateMachineInstance {
    const instance: StateMachineInstance = {
      definition,
      currentState: definition.initialState,
      context,
    };

    this.instances.set(id, instance);
    logger.debug(
      `[StateMachine] Initialized ${definition.name} for ${id} in state: ${definition.initialState}`
    );

    // Trigger initial state entry if it exists
    const state = definition.states.find((s) => s.name === definition.initialState);
    if (state && state.onEntry) {
      this.executeHook(id, state.onEntry, instance.context);
    }

    return instance;
  }

  /**
   * Process an event and trigger transitions.
   *
   * Resolution:
   *  1. Find transitions matching (currentState, event).
   *  2. For each match, evaluate optional `condition` via the registered guard
   *     evaluator; take the first whose guard is truthy (or that has no guard).
   *  3. If a transition fires, dispatch to transitionTo() which runs
   *     exit-hook -> state change -> entry-hook in that order.
   *  4. If no transition matches (or all guards fail), return false silently —
   *     unmatched events are tolerated, not an error.
   */
  public sendEvent(id: string, event: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;

    const candidates = instance.definition.transitions.filter(
      (t) => t.from === instance.currentState && t.event === event
    );

    for (const transition of candidates) {
      if (!transition.condition) {
        this.transitionTo(id, transition.to);
        return true;
      }
      if (this.evaluateGuard(transition.condition, instance.context)) {
        this.transitionTo(id, transition.to);
        return true;
      }
    }

    return false;
  }

  /**
   * Evaluate a transition guard. Returns truthy/falsy.
   * If no guard evaluator is registered, logs once and treats the guard as passing
   * (condition becomes a no-op) so machines still advance during early-boot/tests.
   */
  private evaluateGuard(expression: string, context: Record<string, any>): boolean {
    if (!this.guardEvaluator) {
      if (!this.guardMissingWarned) {
        logger.warn(
          `[StateMachine] No guard evaluator registered - conditional transitions will fire ungated`
        );
        this.guardMissingWarned = true;
      }
      return true;
    }
    try {
      return Boolean(this.guardEvaluator(expression, context));
    } catch (error: unknown) {
      logger.error(
        `[StateMachine] Guard evaluation failed for "${expression}": ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Force transition to a specific state
   */
  public transitionTo(id: string, targetStateName: string): void {
    const instance = this.instances.get(id);
    if (!instance) return;

    if (instance.currentState === targetStateName) return;

    const currentStateDef = instance.definition.states.find(
      (s) => s.name === instance.currentState
    );
    const targetStateDef = instance.definition.states.find((s) => s.name === targetStateName);

    if (!targetStateDef) {
      logger.error(
        `[StateMachine] Target state ${targetStateName} not found in ${instance.definition.name}`
      );
      return;
    }

    logger.debug(
      `[StateMachine] ${id} transitioning: ${instance.currentState} -> ${targetStateName}`
    );

    // 1. Execute Exit Hook
    if (currentStateDef && currentStateDef.onExit) {
      this.executeHook(id, currentStateDef.onExit, instance.context);
    }

    // 2. Change State
    instance.currentState = targetStateName;

    // 3. Execute Entry Hook
    if (targetStateDef.onEntry) {
      this.executeHook(id, targetStateDef.onEntry, instance.context);
    }
  }

  /**
   * Execute code block using the registered hook executor
   */
  private executeHook(id: string, code: string, context: Record<string, any>): void {
    logger.debug(`[StateMachine] Executing hook for ${id}: ${code.substring(0, 50)}...`);

    if (this.hookExecutor) {
      try {
        this.hookExecutor(code, context);
      } catch (error: unknown) {
        logger.error(
          `[StateMachine] Hook execution failed for ${id}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } else {
      logger.warn(`[StateMachine] No hook executor registered - hook code not executed`);
    }
  }

  public getInstance(id: string): StateMachineInstance | undefined {
    return this.instances.get(id);
  }

  public removeInstance(id: string): void {
    this.instances.delete(id);
  }
}

export const stateMachineInterpreter = new StateMachineInterpreter();
