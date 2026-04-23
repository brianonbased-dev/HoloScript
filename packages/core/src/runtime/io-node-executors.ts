/**
 * IO node executors — extracted from HoloScriptRuntime (W1-T4 slice 32).
 *
 * Three sibling dispatchers for server/database/fetch AST nodes, all of
 * which share the same shape:
 *   1. Security gate: in 'public' mode → immediate SecurityViolation reject.
 *   2. Log the invocation at INFO.
 *   3. Return a success ExecutionResult carrying the node's hologram.
 *
 * These are intentionally STUBBED — the actual IO (server listen / DB
 * query / HTTP fetch) is not performed here; the runtime just emits a
 * provenance-style trail. Keeping them together documents the shared
 * security contract and lets AUDIT-mode reviewers verify the public-mode
 * gate on one inspection instead of three.
 *
 * **Pattern**: 2-callback context — `isPublicMode` + `logInfo`. Short
 * enough to inline, but the context shape matches the convention for
 * other runtime/ modules so extending to real IO bindings later doesn't
 * require a signature change.
 *
 * Behavior LOCKED by HoloScriptRuntime.characterization.test.ts + the
 * unit tests in io-node-executors.test.ts co-landed with this slice.
 *
 * **See**: W1-T4 slice 32 — extraction of executeServerNode /
 *         executeDatabaseNode / executeFetchNode
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 1881-1936, ~56 LOC total)
 */

import type { ExecutionResult } from '../types';

/** Minimal shape — caller passes an object carrying a port. */
export interface ServerNodeLike {
  port: number;
  hologram?: unknown;
}

/** Minimal shape — caller passes an object carrying a query. */
export interface DatabaseNodeLike {
  query: string;
  hologram?: unknown;
}

/** Minimal shape — caller passes an object carrying a URL. */
export interface FetchNodeLike {
  url: string;
  hologram?: unknown;
}

/** Runtime accessors the IO executors need. */
export interface IoNodeContext {
  /** True iff runtime is in 'public' mode (IO is blocked for security). */
  readonly isPublicMode: boolean;
  /** Log sink — typically `logger.info`. */
  logInfo(message: string): void;
}

/**
 * Execute a `server: { port }` AST node.
 * Blocks in public mode. Stub — doesn't actually bind a port.
 */
export async function executeServerNode(
  node: ServerNodeLike,
  ctx: IoNodeContext,
): Promise<ExecutionResult> {
  if (ctx.isPublicMode) {
    return {
      success: false,
      error: 'SecurityViolation: Server creation blocked in public mode.',
      executionTime: 0,
    };
  }
  ctx.logInfo(`Starting server on port ${node.port}`);
  return {
    success: true,
    output: `Server listening on port ${node.port}`,
    hologram: node.hologram as ExecutionResult['hologram'],
    executionTime: 0,
  };
}

/**
 * Execute a `database: { query }` AST node.
 * Blocks in public mode. Stub — doesn't actually execute the query.
 */
export async function executeDatabaseNode(
  node: DatabaseNodeLike,
  ctx: IoNodeContext,
): Promise<ExecutionResult> {
  if (ctx.isPublicMode) {
    return {
      success: false,
      error: 'SecurityViolation: DB access blocked in public mode.',
      executionTime: 0,
    };
  }
  ctx.logInfo(`Executing Query: ${node.query}`);
  return {
    success: true,
    output: `Query executed: ${node.query}`,
    hologram: node.hologram as ExecutionResult['hologram'],
    executionTime: 0,
  };
}

/**
 * Execute a `fetch: { url }` AST node.
 * Blocks in public mode. Stub — doesn't actually issue a network request.
 */
export async function executeFetchNode(
  node: FetchNodeLike,
  ctx: IoNodeContext,
): Promise<ExecutionResult> {
  if (ctx.isPublicMode) {
    return {
      success: false,
      error: 'SecurityViolation: External fetch blocked in public mode.',
      executionTime: 0,
    };
  }
  ctx.logInfo(`Fetching: ${node.url}`);
  return {
    success: true,
    output: `Fetched data from ${node.url}`,
    hologram: node.hologram as ExecutionResult['hologram'],
    executionTime: 0,
  };
}
