/**
 * NodeGraph.ts
 *
 * Visual Logic Editor — Core graph data structure.
 * Supports typed ports, topological evaluation, and built-in logic nodes.
 *
 * @module logic
 */

// =============================================================================
// TYPES
// =============================================================================

export type PortType = 'number' | 'string' | 'boolean' | 'vec3' | 'any' | 'event';

export interface PortDefinition {
  name: string;
  type: PortType;
  defaultValue?: unknown;
}

export interface LogicNode {
  id: string;
  type: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface LogicConnection {
  id: string;
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

export interface EvaluationContext {
  state: Record<string, unknown>;
  deltaTime: number;
  events: Map<string, unknown[]>;
  emittedEvents: Map<string, unknown[]>;
}

export type NodeEvaluator = (
  node: LogicNode,
  inputs: Record<string, unknown>,
  context: EvaluationContext
) => Record<string, unknown>;

// =============================================================================
// BUILT-IN NODE TYPES
// =============================================================================

export const BUILT_IN_NODE_TYPES: Record<
  string,
  {
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    evaluate: NodeEvaluator;
  }
> = {
  // --- Math ---
  MathAdd: {
    inputs: [
      { name: 'a', type: 'number', defaultValue: 0 },
      { name: 'b', type: 'number', defaultValue: 0 },
    ],
    outputs: [{ name: 'result', type: 'number' }],
    evaluate: (_node, inputs) => ({
      result: (Number(inputs.a) || 0) + (Number(inputs.b) || 0),
    }),
  },

  MathMultiply: {
    inputs: [
      { name: 'a', type: 'number', defaultValue: 0 },
      { name: 'b', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ name: 'result', type: 'number' }],
    evaluate: (_node, inputs) => ({
      result: (Number(inputs.a) || 0) * (Number(inputs.b) || 1),
    }),
  },

  Compare: {
    inputs: [
      { name: 'a', type: 'number', defaultValue: 0 },
      { name: 'b', type: 'number', defaultValue: 0 },
    ],
    outputs: [
      { name: 'equal', type: 'boolean' },
      { name: 'greater', type: 'boolean' },
      { name: 'less', type: 'boolean' },
    ],
    evaluate: (_node, inputs) => {
      const a = Number(inputs.a) || 0;
      const b = Number(inputs.b) || 0;
      return { equal: a === b, greater: a > b, less: a < b };
    },
  },

  // --- Logic ---
  Branch: {
    inputs: [
      { name: 'condition', type: 'boolean', defaultValue: false },
      { name: 'ifTrue', type: 'any' },
      { name: 'ifFalse', type: 'any' },
    ],
    outputs: [{ name: 'result', type: 'any' }],
    evaluate: (_node, inputs) => ({
      result: inputs.condition ? inputs.ifTrue : inputs.ifFalse,
    }),
  },

  Not: {
    inputs: [{ name: 'value', type: 'boolean', defaultValue: false }],
    outputs: [{ name: 'result', type: 'boolean' }],
    evaluate: (_node, inputs) => ({ result: !inputs.value }),
  },

  // --- State ---
  GetState: {
    inputs: [{ name: 'key', type: 'string', defaultValue: '' }],
    outputs: [{ name: 'value', type: 'any' }],
    evaluate: (_node, inputs, ctx) => ({
      value: ctx.state[String(inputs.key)] ?? null,
    }),
  },

  SetState: {
    inputs: [
      { name: 'key', type: 'string', defaultValue: '' },
      { name: 'value', type: 'any' },
    ],
    outputs: [{ name: 'value', type: 'any' }],
    evaluate: (_node, inputs, ctx) => {
      const key = String(inputs.key);
      if (key) ctx.state[key] = inputs.value;
      return { value: inputs.value };
    },
  },

  // --- Events ---
  OnEvent: {
    inputs: [{ name: 'eventName', type: 'string', defaultValue: 'tick' }],
    outputs: [
      { name: 'triggered', type: 'boolean' },
      { name: 'payload', type: 'any' },
    ],
    evaluate: (_node, inputs, ctx) => {
      const name = String(inputs.eventName);
      const events = ctx.events.get(name) || [];
      return {
        triggered: events.length > 0,
        payload: events[events.length - 1] ?? null,
      };
    },
  },

  EmitEvent: {
    inputs: [
      { name: 'eventName', type: 'string', defaultValue: '' },
      { name: 'payload', type: 'any' },
      { name: 'trigger', type: 'boolean', defaultValue: false },
    ],
    outputs: [],
    evaluate: (_node, inputs, ctx) => {
      if (inputs.trigger && inputs.eventName) {
        const name = String(inputs.eventName);
        if (!ctx.emittedEvents.has(name)) ctx.emittedEvents.set(name, []);
        ctx.emittedEvents.get(name)!.push(inputs.payload);
      }
      return {};
    },
  },

  // --- Utility ---
  Timer: {
    inputs: [
      { name: 'duration', type: 'number', defaultValue: 1 },
      { name: 'loop', type: 'boolean', defaultValue: false },
    ],
    outputs: [
      { name: 'progress', type: 'number' },
      { name: 'completed', type: 'boolean' },
    ],
    evaluate: (node, inputs, ctx) => {
      const duration = Number(inputs.duration) || 1;
      const elapsed = (Number(node.data._elapsed) || 0) + ctx.deltaTime;
      const progress = Math.min(elapsed / duration, 1);
      const completed = progress >= 1;

      node.data._elapsed = inputs.loop && completed ? 0 : elapsed;

      return { progress, completed };
    },
  },

  Random: {
    inputs: [
      { name: 'min', type: 'number', defaultValue: 0 },
      { name: 'max', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ name: 'value', type: 'number' }],
    evaluate: (_node, inputs) => {
      const min = Number(inputs.min) || 0;
      const max = Number(inputs.max) || 1;
      return { value: min + Math.random() * (max - min) };
    },
  },

  Clamp: {
    inputs: [
      { name: 'value', type: 'number', defaultValue: 0 },
      { name: 'min', type: 'number', defaultValue: 0 },
      { name: 'max', type: 'number', defaultValue: 1 },
    ],
    outputs: [{ name: 'result', type: 'number' }],
    evaluate: (_node, inputs) => ({
      result: Math.max(
        Number(inputs.min) || 0,
        Math.min(Number(inputs.max) || 1, Number(inputs.value) || 0)
      ),
    }),
  },
};

// =============================================================================
// NODE GRAPH CLASS
// =============================================================================

let _nextNodeId = 0;
let _nextConnectionId = 0;

export class NodeGraph {
  readonly id: string;
  private nodes: Map<string, LogicNode> = new Map();
  private connections: LogicConnection[] = [];
  private evaluators: Map<string, NodeEvaluator> = new Map();
  private _sortedOrder: string[] | null = null;

  constructor(id?: string) {
    this.id = id || `graph_${Date.now()}`;
    // Register built-in evaluators
    for (const [type, def] of Object.entries(BUILT_IN_NODE_TYPES)) {
      this.evaluators.set(type, def.evaluate);
    }
  }

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  addNode(
    type: string,
    position: { x: number; y: number } = { x: 0, y: 0 },
    data: Record<string, unknown> = {}
  ): LogicNode {
    const builtIn = BUILT_IN_NODE_TYPES[type];
    const node: LogicNode = {
      id: `node_${_nextNodeId++}`,
      type,
      inputs: builtIn ? [...builtIn.inputs.map((p) => ({ ...p }))] : [],
      outputs: builtIn ? [...builtIn.outputs.map((p) => ({ ...p }))] : [],
      position: { ...position },
      data: { ...data },
    };
    this.nodes.set(node.id, node);
    this._sortedOrder = null;
    return node;
  }

  removeNode(nodeId: string): boolean {
    if (!this.nodes.has(nodeId)) return false;
    this.nodes.delete(nodeId);
    this.connections = this.connections.filter((c) => c.fromNode !== nodeId && c.toNode !== nodeId);
    this._sortedOrder = null;
    return true;
  }

  getNode(nodeId: string): LogicNode | undefined {
    return this.nodes.get(nodeId);
  }

  getNodes(): LogicNode[] {
    return Array.from(this.nodes.values());
  }

  // ---------------------------------------------------------------------------
  // Connection Management
  // ---------------------------------------------------------------------------

  connect(
    fromNode: string,
    fromPort: string,
    toNode: string,
    toPort: string
  ): LogicConnection | null {
    // Validate nodes exist
    const source = this.nodes.get(fromNode);
    const target = this.nodes.get(toNode);
    if (!source || !target) return null;

    // Validate ports exist
    const outPort = source.outputs.find((p) => p.name === fromPort);
    const inPort = target.inputs.find((p) => p.name === toPort);
    if (!outPort || !inPort) return null;

    // Type compatibility check (any matches everything)
    if (outPort.type !== 'any' && inPort.type !== 'any' && outPort.type !== inPort.type) {
      return null;
    }

    // Prevent self-connection
    if (fromNode === toNode) return null;

    // Prevent duplicate connections to the same input port
    const existingIdx = this.connections.findIndex(
      (c) => c.toNode === toNode && c.toPort === toPort
    );
    if (existingIdx >= 0) {
      this.connections.splice(existingIdx, 1);
    }

    const connection: LogicConnection = {
      id: `conn_${_nextConnectionId++}`,
      fromNode,
      fromPort,
      toNode,
      toPort,
    };
    this.connections.push(connection);
    this._sortedOrder = null;
    return connection;
  }

  disconnect(connectionId: string): boolean {
    const idx = this.connections.findIndex((c) => c.id === connectionId);
    if (idx < 0) return false;
    this.connections.splice(idx, 1);
    this._sortedOrder = null;
    return true;
  }

  getConnections(): LogicConnection[] {
    return [...this.connections];
  }

  getConnectionsFrom(nodeId: string): LogicConnection[] {
    return this.connections.filter((c) => c.fromNode === nodeId);
  }

  getConnectionsTo(nodeId: string): LogicConnection[] {
    return this.connections.filter((c) => c.toNode === nodeId);
  }

  // ---------------------------------------------------------------------------
  // Topological Sort (Kahn's Algorithm)
  // ---------------------------------------------------------------------------

  topologicalSort(): string[] {
    if (this._sortedOrder) return this._sortedOrder;

    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, Set<string>>();

    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
      adjacency.set(nodeId, new Set());
    }

    for (const conn of this.connections) {
      adjacency.get(conn.fromNode)?.add(conn.toNode);
      inDegree.set(conn.toNode, (inDegree.get(conn.toNode) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(nodeId);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of adjacency.get(current) || []) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // If sorted.length !== node count, there's a cycle
    if (sorted.length !== this.nodes.size) {
      throw new Error(`[NodeGraph] Cycle detected in graph "${this.id}". Cannot evaluate.`);
    }

    this._sortedOrder = sorted;
    return sorted;
  }

  hasCycle(): boolean {
    try {
      this.topologicalSort();
      return false;
    } catch {
      return true;
    }
  }

  // ---------------------------------------------------------------------------
  // Evaluation
  // ---------------------------------------------------------------------------

  evaluate(context: EvaluationContext): Map<string, Record<string, unknown>> {
    const order = this.topologicalSort();
    const nodeOutputs = new Map<string, Record<string, unknown>>();

    for (const nodeId of order) {
      const node = this.nodes.get(nodeId)!;
      const evaluator = this.evaluators.get(node.type);
      if (!evaluator) {
        nodeOutputs.set(nodeId, {});
        continue;
      }

      // Gather inputs: use connected values or defaults
      const inputs: Record<string, unknown> = {};
      for (const port of node.inputs) {
        inputs[port.name] = port.defaultValue ?? null;
      }

      // Override with connected outputs
      for (const conn of this.connections) {
        if (conn.toNode === nodeId) {
          const sourceOutputs = nodeOutputs.get(conn.fromNode);
          if (sourceOutputs && conn.fromPort in sourceOutputs) {
            inputs[conn.toPort] = sourceOutputs[conn.fromPort];
          }
        }
      }

      const outputs = evaluator(node, inputs, context);
      nodeOutputs.set(nodeId, outputs);
    }

    return nodeOutputs;
  }

  // ---------------------------------------------------------------------------
  // Custom Node Registration
  // ---------------------------------------------------------------------------

  registerNodeType(
    type: string,
    inputs: PortDefinition[],
    outputs: PortDefinition[],
    evaluate: NodeEvaluator
  ): void {
    BUILT_IN_NODE_TYPES[type] = { inputs, outputs, evaluate };
    this.evaluators.set(type, evaluate);
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  toJSON(): { id: string; nodes: LogicNode[]; connections: LogicConnection[] } {
    return {
      id: this.id,
      nodes: this.getNodes(),
      connections: this.getConnections(),
    };
  }

  static fromJSON(json: {
    id: string;
    nodes: LogicNode[];
    connections: LogicConnection[];
  }): NodeGraph {
    const graph = new NodeGraph(json.id);
    for (const node of json.nodes) {
      graph.nodes.set(node.id, node);
    }
    graph.connections.push(...json.connections);
    return graph;
  }
}
