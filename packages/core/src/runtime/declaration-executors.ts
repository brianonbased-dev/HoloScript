/**
 * Declaration-node executors — extracted from HoloScriptRuntime (W1-T4 slice 33).
 *
 * Two sibling executors for declaration-style AST nodes:
 *
 *   - `executeStateDeclaration` — processes the `state` directive on a
 *     state-declaration node and updates the reactive state store. No-op
 *     if the node carries no `state` directive (preserves original HSR
 *     behavior exactly — no throw, just silent success).
 *
 *   - `executeMemoryDefinition` — evaluates property expressions on a
 *     semantic/episodic/procedural memory-definition node and returns a
 *     `{ type, config }` record. Strings are passed through the runtime's
 *     expression evaluator; non-string values pass through as-is.
 *
 * **Pattern**: 2-callback context — `updateState` + `evaluateExpression`.
 * Small, but follows the slice 30/31/32 convention for consistency.
 *
 * Behavior LOCKED by HoloScriptRuntime.characterization.test.ts +
 * declaration-executors.test.ts co-landed with this slice.
 *
 * **See**: W1-T4 slice 33 — extraction of executeStateDeclaration +
 *         executeMemoryDefinition
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1940-1948 + 2044-2070, ~36 LOC total)
 */

import type { ASTNode } from '../parser/types';
import type { ExecutionResult, HoloScriptValue } from '../types';

/** Narrow view of the HSPlusDirective shape the state executor cares about. */
interface DirectiveLike {
  type: string;
  body?: unknown;
}

/** Runtime callbacks the declaration executors need. */
export interface DeclarationContext {
  /** Apply a state-directive body to the reactive state store. */
  updateState(body: Record<string, HoloScriptValue>): void;
  /** Evaluate an expression string to a HoloScriptValue (string-typed values only). */
  evaluateExpression(expr: string): HoloScriptValue;
}

/** Node shape the state executor operates on. */
export type StateDeclarationNode = ASTNode & {
  directives?: DirectiveLike[];
};

/**
 * Execute a state-declaration node. Finds the first `state` directive in
 * `node.directives` and forwards its body to the runtime state store.
 * Returns `{ success: true, output: 'State updated' }` regardless of
 * whether a directive was found — mirrors HSR's original no-throw
 * semantics (empty directives are not an error).
 */
export async function executeStateDeclaration(
  node: StateDeclarationNode,
  ctx: DeclarationContext,
): Promise<ExecutionResult> {
  const stateDirective = node.directives?.find((d) => d.type === 'state');
  if (stateDirective) {
    ctx.updateState(stateDirective.body as Record<string, HoloScriptValue>);
  }
  return { success: true, output: 'State updated' };
}

/** Common shape for semantic / episodic / procedural memory-def nodes. */
export interface MemoryDefinitionNodeLike {
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Execute a memory-definition node (semantic / episodic / procedural).
 * Iterates `node.properties`, runs string-typed values through the
 * runtime expression evaluator, and returns a `{ type, config }` record
 * carrying the fully-evaluated configuration.
 *
 * Preserves HSR's rule: non-string values (numbers, booleans, objects,
 * arrays) pass through evaluation — only strings are expression-evaluated.
 * This avoids re-evaluating numeric literals or nested structures.
 */
export async function executeMemoryDefinition(
  node: MemoryDefinitionNodeLike,
  ctx: DeclarationContext,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  const config: Record<string, HoloScriptValue> = {};
  for (const [key, val] of Object.entries(node.properties || {})) {
    if (typeof val === 'string') {
      config[key] = ctx.evaluateExpression(val);
    } else {
      config[key] = val as HoloScriptValue;
    }
  }
  return {
    success: true,
    output: {
      type: node.type,
      config,
    } as unknown as HoloScriptValue,
    executionTime: Date.now() - startTime,
  };
}
