/**
 * IParentRuntime — Interface for parent runtime methods needed by agent runtimes.
 * Extracted to avoid circular dependency between HoloScriptRuntime and HoloScriptAgentRuntime.
 *
 * @module runtime/IParentRuntime
 */
import type { ExecutionResult, HoloScriptValue } from '@holoscript/core';

/**
 * Scope interface definition
 */
export interface Scope {
  variables: Map<string, HoloScriptValue>;
  parent?: Scope;
}

/**
 * Interface defining the parent runtime methods required by HoloScriptAgentRuntime.
 * This allows AgentRuntime to depend on an interface instead of the concrete
 * HoloScriptRuntime class, breaking the circular dependency.
 */
export interface IParentRuntime {
  /**
   * Call a global function
   */
  callFunction(functionName: string, args: HoloScriptValue[]): Promise<ExecutionResult>;

  /**
   * Get the root scope of the runtime
   */
  getRootScope(): Scope;

  /**
   * Get a variable from the runtime
   */
  getVariable(name: string): HoloScriptValue | undefined;

  /**
   * Execute a program/expression
   */
  executeProgram(nodes: unknown, maxDepth: number): Promise<ExecutionResult[]>;

  /**
   * Emit an event
   */
  emit(eventName: string, data?: unknown): Promise<unknown>;

  /**
   * Execute a HoloScript program with a specific scope
   */
  executeHoloProgram(program: unknown, scope?: Scope): Promise<ExecutionResult[]>;

  /**
   * Evaluate an expression
   */
  evaluateExpression(expr: unknown): HoloScriptValue;
}
