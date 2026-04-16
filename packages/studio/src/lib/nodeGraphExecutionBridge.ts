/**
 * Node Graph Execution Bridge
 *
 * Lightweight execution bridge for Studio visual node graphs.
 * Produces deterministic execution order + output/state/event snapshots.
 * When the graph only uses mapped math nodes, aligns preview HoloScript with
 * the core NodeGraphPanel.executeGraph evaluator (Phase 2).
 */

import type { GraphNode, GraphEdge } from '@/hooks/useNodeGraph';
import {
  NodeGraph,
  NodeGraphPanel,
  emitPreviewHoloScriptFromNodeGraphExecution,
} from '@holoscript/core';

/**
 * Builds a core NodeGraph from Studio nodes when every node type maps
 * to a built-in logic evaluator. Returns null if any node is unmapped (e.g. output_surface).
 */
export function tryBuildCoreGraphFromStudio(nodes: GraphNode[], edges: GraphEdge[]): NodeGraph | null {
  const typeMap: Record<string, string> = {
    add: 'MathAdd',
    multiply: 'MathMultiply',
    mul: 'MathMultiply',
  };

  const studioIdToCore = new Map<string, string>();
  const graph = new NodeGraph('studio_execution_bridge');

  for (const n of nodes) {
    const coreType = typeMap[n.type.toLowerCase()];
    if (!coreType) return null;
    const coreNode = graph.addNode(coreType, { x: n.x / 120, y: n.y / 120 });
    studioIdToCore.set(n.id, coreNode.id);
    const aIn = coreNode.inputs.find((p) => p.name === 'a');
    const bIn = coreNode.inputs.find((p) => p.name === 'b');
    if (coreType === 'MathAdd' || coreType === 'MathMultiply') {
      if (aIn) aIn.defaultValue = 0;
      if (bIn) bIn.defaultValue = coreType === 'MathMultiply' ? 1 : 0;
    }
  }

  for (const e of edges) {
    const fromCore = studioIdToCore.get(e.fromNodeId);
    const toCore = studioIdToCore.get(e.toNodeId);
    if (!fromCore || !toCore) continue;
    const fromPort = e.fromPortId === 'out' || e.fromPortId === 'Out' ? 'result' : e.fromPortId;
    let toPort = e.toPortId;
    if (toPort === 'in' || toPort === 'In') toPort = 'a';
    if (toPort === 'inA') toPort = 'a';
    if (toPort === 'inB') toPort = 'b';
    graph.connect(fromCore, fromPort, toCore, toPort);
  }

  return graph;
}

/**
 * Result shape returned after graph execution via bridge.
 * Matches core NodeGraphPanel ExecutionResult but context-wrapped for Studio UI.
 */
export interface StudioGraphExecutionResult {
  success: boolean;
  nodeOrder: string[];
  outputs: Record<string, unknown>;
  state: Record<string, unknown>;
  emittedEvents: Array<{ nodeId: string; event: string; data?: unknown }>;
  errorMessage?: string;
  errorNodeId?: string;
  executionTimeMs?: number;
  /** Minimal HoloScript for PlayModeController / Copilot-equivalent preview path (Phase 2). */
  previewHoloScript?: string;
}

/** Minimal HoloScript for the same preview pipeline as core node graphs / Copilot. */
export function emitStudioGraphPreviewHoloScriptFromOrder(nodeOrder: string[]): string {
  let slug =
    nodeOrder
      .join('_')
      .replace(/[^\w]+/g, '')
      .slice(0, 48) || 'Run';
  if (!/^[A-Za-z_]/.test(slug)) slug = `g_${slug}`;
  return `composition "StudioGraph_${slug}" {\n  object "StudioGraphMarker" {\n    position: [0, 1.45, -0.8]\n  }\n}\n`;
}

/**
 * Validates graph connectivity before execution.
 * Returns list of validation errors (empty if valid).
 */
export function validateGraph(nodes: GraphNode[], edges: GraphEdge[]): string[] {
  const errors: string[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Check 1: Each edge source/target must reference existing nodes
  for (const edge of edges) {
    if (!nodeIds.has(edge.fromNodeId)) {
      errors.push(`Edge references non-existent source node: ${edge.fromNodeId}`);
    }
    if (!nodeIds.has(edge.toNodeId)) {
      errors.push(`Edge references non-existent target node: ${edge.toNodeId}`);
    }
  }

  // Check 2: Detect cycles with Kahn's algorithm
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>();

  for (const edge of edges) {
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
    const list = outgoing.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    outgoing.set(edge.fromNodeId, list);
  }

  const queue = nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id);
  let visitedCount = 0;

  while (queue.length) {
    const current = queue.shift()!;
    visitedCount++;
    for (const next of outgoing.get(current) ?? []) {
      const nextDeg = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDeg);
      if (nextDeg === 0) {
        queue.push(next);
      }
    }
  }

  if (visitedCount !== nodes.length) {
    errors.push('Cycle detected in graph');
  }

  // Check 3: Output nodes must have inputs
  const outputNodes = nodes.filter(
    (n) => n.category.toLowerCase() === 'output' || n.type.toLowerCase().includes('output')
  );
  for (const outNode of outputNodes) {
    const incoming = edges.filter((e) => e.toNodeId === outNode.id);
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
  nodes: GraphNode[],
  edges: GraphEdge[],
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

    // Build topological order (deterministic)
    const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
    const outgoing = new Map<string, string[]>();
    for (const edge of edges) {
      inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
      const list = outgoing.get(edge.fromNodeId) ?? [];
      list.push(edge.toNodeId);
      outgoing.set(edge.fromNodeId, list);
    }

    const queue = nodes
      .filter((n) => (inDegree.get(n.id) ?? 0) === 0)
      .map((n) => n.id)
      .sort();

    const nodeOrder: string[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      nodeOrder.push(current);
      for (const next of outgoing.get(current) ?? []) {
        const nextDeg = (inDegree.get(next) ?? 0) - 1;
        inDegree.set(next, nextDeg);
        if (nextDeg === 0) {
          queue.push(next);
          queue.sort();
        }
      }
    }

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const outputs: Record<string, unknown> = {};
    const emittedEvents: Array<{ nodeId: string; event: string; data?: unknown }> = [];
    const state: Record<string, unknown> = {
      ...(initialState ?? {}),
      lastNodeCount: nodes.length,
      lastEdgeCount: edges.length,
    };

    for (const nodeId of nodeOrder) {
      const node = nodeById.get(nodeId);
      if (!node) continue;

      const incoming = edges
        .filter((e) => e.toNodeId === nodeId)
        .map((e) => ({
          fromNodeId: e.fromNodeId,
          fromPortId: e.fromPortId,
          value: outputs[`${e.fromNodeId}.${e.fromPortId}`],
        }));

      for (const outPort of node.outputs) {
        outputs[`${nodeId}.${outPort.id}`] = {
          nodeType: node.type,
          from: incoming.map((i) => `${i.fromNodeId}.${i.fromPortId}`),
          value: incoming.length ? incoming[0].value ?? `${node.type}:${outPort.id}` : `${node.type}:${outPort.id}`,
        };
      }

      if (node.type.toLowerCase().includes('event') || node.type.toLowerCase().includes('trigger')) {
        emittedEvents.push({
          nodeId,
          event: `${node.type}:executed`,
          data: { inputCount: incoming.length },
        });
      }
    }

    const outputNodes = nodes.filter(
      (n) => n.category.toLowerCase() === 'output' || n.type.toLowerCase().includes('output')
    );
    for (const outNode of outputNodes) {
      const incoming = edges.filter((e) => e.toNodeId === outNode.id);
      state[`output:${outNode.id}`] = incoming.map((e) => outputs[`${e.fromNodeId}.${e.fromPortId}`]);
    }

    // Map core result back to Studio shape
    const executionTimeMs = performance.now() - startTime;

    let previewHoloScript = emitStudioGraphPreviewHoloScriptFromOrder(nodeOrder);
    try {
      const coreGraph = tryBuildCoreGraphFromStudio(nodes, edges);
      if (coreGraph) {
        const corePanel = new NodeGraphPanel(coreGraph);
        const coreExec = corePanel.executeGraph();
        previewHoloScript = emitPreviewHoloScriptFromNodeGraphExecution(coreExec, coreGraph);
      }
    } catch {
      /* keep studio-derived preview */
    }

    return {
      success: true,
      nodeOrder,
      outputs,
      state,
      emittedEvents,
      executionTimeMs,
      previewHoloScript,
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
