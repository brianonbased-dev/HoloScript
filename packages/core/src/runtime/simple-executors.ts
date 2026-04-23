/**
 * Simple executors — extracted from HoloScriptRuntime (W1-T4 slice 17)
 *
 * Six small AST-node executors that are either pure state-container
 * ops or one-line delegations:
 *
 *   - `executeStateMachine`    — register in stateMachines Map
 *   - `executeExpressionStatement` — eval an expression, wrap in envelope
 *   - `executeCall`            — delegate to callFunction
 *   - `executeEnvironment`     — merge settings into environment record
 *   - `executeHoloTemplate`    — register template in templates Map
 *   - `executeFocus`           — push focusHistory + execute body
 *
 * All six are dispatch-only or have exactly one internal caller.
 * Private methods deleted; dispatch calls the pure functions inline
 * with a shared SimpleExecutorContext.
 *
 * **Pattern**: minimal state-mutator context (pattern 4 variant).
 * One context object exposes the state containers / callbacks each
 * executor needs; most executors use only 1-2 fields.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 17 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1567, 1576, 1584, 2474, 2484, 2554)
 */

import type {
  ASTNode,
  EnvironmentNode,
  ExecutionResult,
  FocusNode,
  HologramProperties,
  HoloScriptValue,
  StateMachineNode,
} from '../types';

/**
 * Narrow context — lets simple executors mutate runtime state
 * without `this` binding. Each executor uses only a subset.
 */
export interface SimpleExecutorContext {
  /** State machine registry (executeStateMachine). */
  stateMachines: Map<string, StateMachineNode>;
  /** Template registry (executeHoloTemplate). */
  templates: Map<string, unknown>;
  /** Environment settings read (executeEnvironment). */
  getEnvironment: () => Record<string, unknown>;
  /** Environment reassignment — the executor replaces the whole
   *  environment object, so a setter closure is needed to propagate
   *  the new reference back into the runtime's context. */
  setEnvironment: (env: Record<string, unknown>) => void;
  /** Focus history stack (executeFocus). */
  focusHistory: string[];
  /** Execution stack depth, used for executeFocus body program depth. */
  executionStackDepth: () => number;
  /** Expression evaluator (executeExpressionStatement). */
  evaluateExpression: (expr: string) => HoloScriptValue;
  /** Function invocation (executeCall). */
  callFunction: (name: string, args: HoloScriptValue[]) => Promise<ExecutionResult>;
  /** Variable writer (executeAssignment). Mirrors HSR's setVariable. */
  setVariable: (name: string, value: HoloScriptValue) => void;
  /** Program executor for body blocks (executeFocus). */
  executeProgram: (nodes: ASTNode[], depth: number) => Promise<ExecutionResult[]>;
}

/**
 * Register a state machine in the runtime's stateMachines map.
 * Returns an envelope with the registered name.
 */
export async function executeStateMachine(
  node: StateMachineNode,
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  ctx.stateMachines.set(node.name, node);
  return {
    success: true,
    output: { registered: node.name },
  };
}

/**
 * Evaluate a bare expression statement (e.g. `foo + 1`) and return
 * the value in a success envelope.
 */
export async function executeExpressionStatement(
  node: { expression: string },
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  const value = ctx.evaluateExpression(node.expression);
  return {
    success: true,
    output: value,
  };
}

/**
 * Execute a `call` AST node — invoke the named function with the
 * node's args. Return value of `callFunction` is returned as-is.
 */
export async function executeCall(
  node: ASTNode & { target?: string; args?: unknown[] },
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  const funcName = node.target || '';
  const args = node.args || [];
  return ctx.callFunction(funcName, args as HoloScriptValue[]);
}

/**
 * Execute an `environment` AST node — merge its settings into the
 * runtime's environment record.
 */
export async function executeEnvironment(
  node: EnvironmentNode,
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  ctx.setEnvironment({
    ...ctx.getEnvironment(),
    ...(node.settings as Record<string, unknown>),
  });
  return { success: true, output: 'Environment updated' };
}

/**
 * Execute a `holoTemplate` AST node — register it in the templates
 * map so subsequent holoObject nodes can reference it.
 */
export async function executeHoloTemplate(
  node: { name: string } & Record<string, unknown>,
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  ctx.templates.set(node.name, node);
  return { success: true, output: `Template ${node.name} registered` };
}

// ──────────────────────────────────────────────────────────────────
// Structural / value-flow executors (added in slice 19)
// ──────────────────────────────────────────────────────────────────

/** Default hologram for `nexus` structural nodes. */
const NEXUS_HOLOGRAM: HologramProperties = {
  shape: 'sphere',
  color: '#9b59b6',
  size: 3,
  glow: true,
  interactive: true,
};

/** Default hologram for all other structural nodes (buildings etc.). */
const STRUCTURE_HOLOGRAM: HologramProperties = {
  shape: 'cube',
  color: '#e74c3c',
  size: 4,
  glow: true,
  interactive: true,
};

/**
 * Execute a `structure` AST node — produce a hologram envelope for
 * nexus / building / other structural elements. Uses node.hologram
 * if provided, else defaults based on node.type.
 */
export async function executeStructure(node: ASTNode): Promise<ExecutionResult> {
  const hologram = node.hologram || (node.type === 'nexus' ? NEXUS_HOLOGRAM : STRUCTURE_HOLOGRAM);

  return {
    success: true,
    output: { type: node.type, created: true },
    hologram,
    spatialPosition: node.position,
  };
}

/**
 * Execute an `assignment` AST node — evaluate the value expression
 * and write it through the setVariable callback.
 */
export async function executeAssignment(
  node: ASTNode & { name: string; value: unknown },
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  const value = ctx.evaluateExpression(String(node.value));
  ctx.setVariable(node.name, value);

  return {
    success: true,
    output: { assigned: node.name, value },
  };
}

/**
 * Execute a `return` AST node — evaluate node.value OR node.expression,
 * whichever is present; empty string if both absent.
 */
export async function executeReturn(
  node: ASTNode & { value?: unknown; expression?: string },
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  const expr = String(node.value || node.expression || '');
  const value = ctx.evaluateExpression(expr);

  return {
    success: true,
    output: value,
  };
}

/**
 * Execute a `focus` AST node — push the focus target onto the
 * focusHistory stack and execute the body, returning the
 * aggregated success/failure.
 */
export async function executeFocus(
  node: FocusNode,
  ctx: SimpleExecutorContext,
): Promise<ExecutionResult> {
  ctx.focusHistory.push(node.target);
  const results = await ctx.executeProgram(node.body, ctx.executionStackDepth());

  return {
    success: results.every((r) => r.success),
    output: `Focused on ${node.target}`,
  };
}
