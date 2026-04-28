/**
 * Debug executor — extracted from HoloScriptRuntime (W1-T4 slice 31).
 *
 * Builds a debug-info snapshot of runtime internals (variables, functions,
 * connections, call stack, UI elements, animations, recent history) and
 * emits a pyramid hologram marker so the visualizer can show "this orb
 * captured a debug snapshot at this node". Used by the `debug: target`
 * AST node handler.
 *
 * **Pattern**: multi-getter context (pattern 5 variant — same convention
 * as holo-expression.ts / holo-statement-executor.ts). All state is read
 * via getter callbacks so the pure module never touches the runtime
 * object's mutable maps directly. Only the hologramState.set is a write.
 *
 * Behavior LOCKED by HoloScriptRuntime.characterization.test.ts +
 * debug-executor.test.ts co-landed with this slice.
 *
 * **See**: W1-T4 slice 31 — extraction of executeDebug
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1035-1064, ~30 LOC)
 */

import type { ASTNode, ExecutionResult, HologramProperties, HoloScriptValue } from '../types';

/**
 * Readonly accessors + one write sink. The runtime threads live-map
 * references into the getters so snapshots reflect current state.
 */
export interface DebugExecutorContext {
  /** Current (deepest) scope's local variables. */
  readonly scopeVariables: Map<string, HoloScriptValue>;
  /** Global context variables (module-scope). */
  readonly contextVariables: Map<string, HoloScriptValue>;
  /** Names of all registered functions (user-defined + extensions + builtins). */
  readonly functions: Map<string, unknown>;
  /** Live connection list — length is what debug reports. */
  readonly connections: unknown[];
  /** Current call stack (function names, deepest last). */
  readonly callStack: string[];
  /** Registered UI element keys. */
  readonly uiElements: Map<string, unknown>;
  /** Registered animation keys. */
  readonly animations: Map<string, unknown>;
  /** Recent execution results (full list; we take last 10). */
  readonly executionHistory: ExecutionResult[];
  /** Write-through to context.hologramState.set. */
  setHologramState(key: string, hologram: HologramProperties): void;
  /** Log sink — typically `logger.info`. */
  logInfo(message: string, payload: Record<string, unknown>): void;
}

/**
 * Pyramid marker shown in the visualizer when a debug snapshot fires.
 * Extracted as a module-level const so tests can assert its shape
 * without invoking executeDebug (previous inline object was re-created
 * per call — unchanged semantically).
 */
export const DEBUG_HOLOGRAM: HologramProperties = {
  shape: 'pyramid',
  color: '#ff1493',
  size: 0.8,
  glow: true,
  interactive: true,
};

/**
 * Execute a `debug` AST node. Takes a snapshot of runtime internals,
 * writes a pyramid-hologram marker keyed by `debug_<target>`, logs the
 * snapshot at INFO level, and returns the snapshot as the ExecutionResult
 * output. Always succeeds — debug is advisory, not a gate.
 *
 * @param node  the debug AST node; `node.target` scopes the hologram key
 * @param ctx   runtime accessors + write sink
 */
export async function executeDebug(
  node: ASTNode & { target?: string },
  ctx: DebugExecutorContext,
): Promise<ExecutionResult> {
  const debugInfo = {
    variables: Object.fromEntries(ctx.scopeVariables),
    contextVariables: Object.fromEntries(ctx.contextVariables),
    functions: Array.from(ctx.functions.keys()),
    connections: ctx.connections.length,
    callStack: [...ctx.callStack],
    uiElements: Array.from(ctx.uiElements.keys()),
    animations: Array.from(ctx.animations.keys()),
    executionHistory: ctx.executionHistory.slice(-10),
  };

  // DEBUG_HOLOGRAM is shared across calls; cloning keeps tests/callers from
  // mutating the module-level constant by accident.
  const debugOrb: HologramProperties = { ...DEBUG_HOLOGRAM };
  ctx.setHologramState(`debug_${node.target || 'program'}`, debugOrb);

  ctx.logInfo('Debug info', debugInfo);

  return {
    success: true,
    output: debugInfo as unknown as HoloScriptValue,
    hologram: debugOrb,
  };
}
