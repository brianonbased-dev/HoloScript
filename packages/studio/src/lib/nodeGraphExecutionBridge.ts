/**
 * Node Graph Execution Bridge
 *
 * Maps Studio visual node graph (GraphNode/GraphEdge) to core executable node graph runtime.
 * Enables one-click "Run Graph" execution with deterministic output + error handling.
 *
 * @packageDocumentation
 */

import type { NodeType, NodeInput, NodeOutput, GNode, GEdge } from './nodeGraphStore';
import type { ExecutionResult, NodeGraphExecutionState } from '@holoscript/core/editor';

/**
 * Result shape returned after graph execution via bridge.
 * Matches core NodeGraphPanel ExecutionResult but context-wrapped for Studio UI.
 */
export interface StudioGraphExecutionResult {
  success: boolean;
  nodeOrder: string[];
  outputs: Record<string, unknown>;
  state: NodeGraphExecutionState;
  emittedEvents: Array<{ nodeId: string; event: string; data?: unknown }>;
  errorMessage?: string;
  errorNodeId?: string;
  executionTimeMs?: number;
}

/**
 * Validates graph connectivity before execution.
 * Returns list of validation errors (empty if valid).
 */
export function validateGraph(nodes: GNode[], edges: GEdge[]): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Check 1: Each edge source/target must reference existing nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge references non-existent source node: ${edge.source}`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge references non-existent target node: ${edge.target}`);
    }
  }

  // Check 2: Detect cycles (simplified: DFS from each node)
  for (const node of nodes) {
    const visited = new Set<string>();
    const stack = [node.id];
    let hasCycle = false;

    while (stack.length && !hasCycle) {
      const current = stack.pop()!;
      if (visited.has(current)) {
        hasCycle = true;
        break;
      }
      visited.add(current);

      for (const edge of edges) {
        if (edge.source === current && !visited.has(edge.target)) {
          stack.push(edge.target);
        }
      }
    }

    if (hasCycle) {
      errors.push(`Cycle detected starting from node: ${node.id}`);
    }
  }

  // Check 3: Output nodes must have inputs
  const outputNodes = nodes.filter((n) => n.type === 'output');
  for (const outNode of outputNodes) {
    const incoming = edges.filter((e) => e.target === outNode.id);
    if (incoming.length === 0) {
      errors.push(`Output node "${outNode.id}" has no incoming connections`);
    }
  }

  return errors;
}

/**
 * Executes a visual node graph using core runtime.
 *
 * Converts Studio GNode/GEdge → core graph format → executeGraph()
 * Returns result with outputs, state, and emitted events.
 *
 * @param nodes - Visual node graph nodes
 * @param edges - Visual node graph edges
 * @param initialState - Optional initial execution state
 * @returns Execution result with outputs, node order, and events
 *
 * @throws Error if graph validation fails (cycles, disconnected nodes, etc.)
 */
export async function executeStudioGraph(
  nodes: GNode[],
  edges: GEdge[],
  initialState?: Record<string, unknown>,
): Promise<StudioGraphExecutionResult> {
  const startTime = performance.now();

  try {
    // Validation: ensure graph is acyclic and well-formed
    const validationErrors = validateGraph(nodes, edges);
    if (validationErrors.length > 0) {
      return {
        success: false,
        nodeOrder: [],
        outputs: {},
        state: initialState || {},
        emittedEvents: [],
        errorMessage: `Graph validation failed: ${validationErrors.join('; ')}`,
      };
    }

    // Import core runtime (lazy to avoid circular deps)
    const { executeGraph } = await import('@holoscript/core/editor/NodeGraphPanel');

    // Convert Studio graph format to core format
    // Studio nodes have: id, type, position, data (contains inputs/outputs)
    // Core graph expects: nodes[], edges[], computeFunctions
    const coreGraph = {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        inputs: n.data?.inputs || {},
        outputs: n.data?.outputs || {},
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || 'default',
        targetHandle: e.targetHandle || 'default',
      })),
    };

    // Execute via core runtime
    const coreResult = await executeGraph(coreGraph, initialState);

    // Map core result back to Studio shape
    const executionTimeMs = performance.now() - startTime;

    return {
      success: true,
      nodeOrder: coreResult.nodeOrder,
      outputs: coreResult.outputs,
      state: coreResult.state,
      emittedEvents: coreResult.emittedEvents || [],
      executionTimeMs,
    };
  } catch (error) {
    const executionTimeMs = performance.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      nodeOrder: [],
      outputs: {},
      state: initialState || {},
      emittedEvents: [],
      errorMessage: `Execution error: ${errorMessage}`,
      executionTimeMs,
    };
  }
}

/**
 * Formats execution result for display in Studio UI.
 * Truncates large outputs, formats events readably, highlights errors.
 */
export function formatExecutionResult(result: StudioGraphExecutionResult): {
  summary: string;
  details: string;
  isError: boolean;
} {
  if (!result.success) {
    return {
      summary: '❌ Execution failed',
      details: result.errorMessage || 'Unknown error',
      isError: true,
    };
  }

  const outputCount = Object.keys(result.outputs).length;
  const eventCount = result.emittedEvents?.length || 0;
  const timeStr = result.executionTimeMs ? `${result.executionTimeMs.toFixed(1)}ms` : '';

  return {
    summary: `✓ Executed in ${timeStr} (${result.nodeOrder.length} nodes)`,
    details: [
      `Outputs: ${outputCount}`,
      `Events: ${eventCount}`,
      `State keys: ${Object.keys(result.state).length}`,
    ].join(' | '),
    isError: false,
  };
}
