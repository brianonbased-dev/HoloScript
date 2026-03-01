/**
 * shaderGraph.ts — Visual Shader Graph Engine
 *
 * Node-based shader composition for non-programmers.
 */

// Re-export canonical ShaderGraph class and related types
export * from './shader/shaderGraph';

export interface ShaderNode {
  id: string;
  type: ShaderNodeType;
  label: string;
  position: { x: number; y: number };
  inputs: ShaderPort[];
  outputs: ShaderPort[];
  params: Record<string, number | string | boolean>;
}

export interface ShaderPort {
  name: string;
  dataType: 'float' | 'vec2' | 'vec3' | 'vec4' | 'texture' | 'sampler';
  connected: boolean;
  defaultValue?: number[];
}

export interface ShaderEdge {
  id: string;
  from: { nodeId: string; port: string };
  to: { nodeId: string; port: string };
}

/** Legacy data-only shader graph shape (see ShaderGraph class for full implementation) */
export interface ShaderGraphData {
  id: string;
  name: string;
  nodes: ShaderNode[];
  edges: ShaderEdge[];
  outputNodeId: string;
}

export type ShaderNodeType =
  | 'output' | 'color' | 'texture-sample' | 'uv'
  | 'multiply' | 'add' | 'mix' | 'normalize'
  | 'fresnel' | 'noise' | 'time' | 'step'
  | 'split' | 'combine' | 'clamp' | 'dot';

/**
 * Create a default empty shader graph.
 */
export function createShaderGraph(name: string): ShaderGraphData {
  const outputNode: ShaderNode = {
    id: 'output-0',
    type: 'output',
    label: 'Material Output',
    position: { x: 500, y: 200 },
    inputs: [
      { name: 'albedo', dataType: 'vec3', connected: false, defaultValue: [1, 1, 1] },
      { name: 'normal', dataType: 'vec3', connected: false, defaultValue: [0, 0, 1] },
      { name: 'metallic', dataType: 'float', connected: false, defaultValue: [0] },
      { name: 'roughness', dataType: 'float', connected: false, defaultValue: [0.5] },
      { name: 'emission', dataType: 'vec3', connected: false, defaultValue: [0, 0, 0] },
      { name: 'alpha', dataType: 'float', connected: false, defaultValue: [1] },
    ],
    outputs: [],
    params: {},
  };

  return { id: `graph-${Date.now().toString(36)}`, name, nodes: [outputNode], edges: [], outputNodeId: outputNode.id };
}

/**
 * Add a node to the graph.
 */
export function addNode(graph: ShaderGraphData, node: ShaderNode): ShaderGraphData {
  return { ...graph, nodes: [...graph.nodes, node] };
}

/**
 * Connect two ports.
 */
export function connectPorts(
  graph: ShaderGraphData,
  fromNodeId: string, fromPort: string,
  toNodeId: string, toPort: string
): ShaderGraphData {
  const edge: ShaderEdge = {
    id: `edge-${Date.now().toString(36)}`,
    from: { nodeId: fromNodeId, port: fromPort },
    to: { nodeId: toNodeId, port: toPort },
  };
  return { ...graph, edges: [...graph.edges, edge] };
}

/**
 * Remove a node (and its edges) from the graph.
 */
export function removeNode(graph: ShaderGraphData, nodeId: string): ShaderGraphData {
  return {
    ...graph,
    nodes: graph.nodes.filter(n => n.id !== nodeId),
    edges: graph.edges.filter(e => e.from.nodeId !== nodeId && e.to.nodeId !== nodeId),
  };
}

/**
 * Check if the graph has cycles (invalid for shader compilation).
 */
export function hasCycles(graph: ShaderGraphData): boolean {
  const adj = new Map<string, string[]>();
  for (const node of graph.nodes) adj.set(node.id, []);
  for (const edge of graph.edges) {
    adj.get(edge.from.nodeId)?.push(edge.to.nodeId);
  }

  const visited = new Set<string>();
  const stack = new Set<string>();

  function dfs(nodeId: string): boolean {
    visited.add(nodeId);
    stack.add(nodeId);
    for (const neighbor of adj.get(nodeId) ?? []) {
      if (stack.has(neighbor)) return true;
      if (!visited.has(neighbor) && dfs(neighbor)) return true;
    }
    stack.delete(nodeId);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node.id) && dfs(node.id)) return true;
  }
  return false;
}

/**
 * Count total connections in the graph.
 */
export function connectionCount(graph: ShaderGraphData): number {
  return graph.edges.length;
}

/**
 * Get unconnected input ports (potential issues).
 */
export function unconnectedInputs(graph: ShaderGraphData): Array<{ nodeId: string; port: string }> {
  const connected = new Set(graph.edges.map(e => `${e.to.nodeId}:${e.to.port}`));
  const unconnected: Array<{ nodeId: string; port: string }> = [];
  for (const node of graph.nodes) {
    for (const input of node.inputs) {
      if (!connected.has(`${node.id}:${input.name}`)) {
        unconnected.push({ nodeId: node.id, port: input.name });
      }
    }
  }
  return unconnected;
}
