import { StateMachineNode } from '../types';
import { logger } from '../logger';

export interface StateMachineInstance {
  definition: StateMachineNode;
  currentState: string;
  context: Record<string, any>;
}

/** Hook executor function type */
export type HookExecutor = (code: string, context: Record<string, any>) => any;

/**
 * StateMachineInterpreter - Handles runtime execution of spatial state machines
 */
export class StateMachineInterpreter {
  private instances: Map<string, StateMachineInstance> = new Map();
  private hookExecutor: HookExecutor | null = null;

  /**
   * Set the hook executor function (called by runtime during initialization)
   */
  public setHookExecutor(executor: HookExecutor): void {
    this.hookExecutor = executor;
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
   * Process an event and trigger transitions
   */
  public sendEvent(id: string, event: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;

    const transition = instance.definition.transitions.find(
      (t) => t.from === instance.currentState && t.event === event
    );

    if (transition) {
      this.transitionTo(id, transition.to);
      return true;
    }

    return false;
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
        logger.error(`[StateMachine] Hook execution failed for ${id}: ${error instanceof Error ? error.message : String(error)}`);
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
