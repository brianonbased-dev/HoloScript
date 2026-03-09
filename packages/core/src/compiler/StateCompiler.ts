/**
 * StateCompiler — HoloScript+ Per-Node Reactive State
 *
 * Walks an HSPlusAST and extracts per-node `stateBlock` declarations,
 * turning them into `ReactiveStateShape` descriptors that the runtime
 * can use to instantiate a `ReactiveState<T>` for each node.
 *
 * Design decisions:
 *  - Pure data transformation: no runtime dependencies (safe to run in Workers).
 *  - Recursive: handles nested node trees.
 *  - Non-destructive: original AST nodes are not mutated; results are indexed by node.name.
 *
 * @module StateCompiler
 * @version 1.0.0
 */

import type { HSPlusNode, HSPlusAST } from '../types/HoloScriptPlus';
import { getRBAC, ResourceType, type AccessDecision } from './identity/AgentRBAC';
import { WorkflowStep } from './identity/AgentIdentity';

// =============================================================================
// TYPES
// =============================================================================

/**
 * The extracted shape of a single state variable.
 */
export interface StateVarDescriptor {
  /** Variable name as written in source (e.g. `hp`, `count`) */
  name: string;
  /** Initial value as parsed by the HS+ parser */
  initialValue: unknown;
  /** Source location for diagnostics (line/column if available) */
  loc?: { line: number; column: number };
}

/**
 * The full reactive state shape for one AST node.
 * Ready to be passed to `new ReactiveState(shape.initialState)` at runtime.
 */
export interface ReactiveStateShape {
  /** Node name / id this shape belongs to */
  nodeId: string;
  /** Map of variable name → initial value  */
  initialState: Record<string, unknown>;
  /** Full descriptors (for tooling / error messages) */
  vars: StateVarDescriptor[];
}

/**
 * Map of node name → its reactive state shape.
 * Returned by `StateCompiler.compile()`.
 */
export type StateShapeMap = Map<string, ReactiveStateShape>;

// =============================================================================
// COMPILER
// =============================================================================

export class StateCompiler {
  /**
   * Walk an entire HSPlusAST and extract all per-node stateBlocks.
   *
   * @param ast - The parse result returned by HoloScriptPlusParser.
   * @param agentToken - JWT token proving agent identity (optional for backwards compatibility).
   * @returns A StateShapeMap keyed by node.name (or a generated id).
   * @throws UnauthorizedStateCompilerAccessError if token is provided but invalid.
   */
  compile(ast: HSPlusAST, agentToken?: string): StateShapeMap {
    this.validateAccess(agentToken);
    const shapes: StateShapeMap = new Map();
    this.walkNode(ast.root, shapes);
    return shapes;
  }

  // ---------------------------------------------------------------------------
  // RBAC enforcement
  // ---------------------------------------------------------------------------

  /**
   * Validate agent has permission to compile state blocks.
   * Skips validation when no token is provided (backwards compatibility / testing).
   */
  private validateAccess(agentToken?: string): void {
    if (!agentToken) return;

    const rbac = getRBAC();
    const decision = rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });

    if (!decision.allowed) {
      throw new UnauthorizedStateCompilerAccessError(decision, 'StateCompiler');
    }
  }

  /**
   * Compile a single HSPlusNode subtree.
   * Useful when only a portion of the AST is being (re-)compiled.
   */
  compileNode(node: HSPlusNode): ReactiveStateShape | null {
    if (!node.stateBlock || Object.keys(node.stateBlock).length === 0) {
      return null;
    }
    return this.buildShape(node);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private walkNode(node: HSPlusNode, out: StateShapeMap): void {
    if (!node) return;

    if (node.stateBlock && Object.keys(node.stateBlock).length > 0) {
      const shape = this.buildShape(node);
      out.set(shape.nodeId, shape);
    }

    // Recurse into children
    if (Array.isArray(node.children)) {
      for (const child of node.children) {
        this.walkNode(child, out);
      }
    }

    // Recurse into body (code-block nodes)
    if (node.body && typeof node.body === 'object' && !Array.isArray(node.body)) {
      if ((node.body as HSPlusNode).type) {
        this.walkNode(node.body as HSPlusNode, out);
      }
    }
  }

  private buildShape(node: HSPlusNode): ReactiveStateShape {
    const nodeId = this.resolveNodeId(node);
    const stateBlock = node.stateBlock ?? {};
    const vars: StateVarDescriptor[] = [];
    const initialState: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(stateBlock)) {
      // Skip internal spread markers
      if (key.startsWith('__spread_')) continue;

      vars.push({ name: key, initialValue: value });
      initialState[key] = value;
    }

    return { nodeId, initialState, vars };
  }

  private resolveNodeId(node: HSPlusNode): string {
    if (node.name) return node.name;
    // Fall back to type + loc for anonymous nodes
    const loc = node.loc;
    if (loc) return `${node.type}@${loc.start.line}:${loc.start.column}`;
    return `${node.type}_${Math.random().toString(36).slice(2, 7)}`;
  }
}

// =============================================================================
// ERRORS
// =============================================================================

/**
 * Error thrown when agent lacks required permissions for state compilation.
 */
export class UnauthorizedStateCompilerAccessError extends Error {
  constructor(
    public readonly decision: AccessDecision,
    public readonly compilerName: string
  ) {
    super(
      `[${compilerName}] Unauthorized access: ${decision.reason || 'Access denied'}\n` +
        `Agent Role: ${decision.agentRole || 'unknown'}\n` +
        `Required Permission: ${decision.requiredPermission || 'unknown'}`
    );
    this.name = 'UnauthorizedStateCompilerAccessError';
  }
}
