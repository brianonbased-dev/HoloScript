/**
 * Shader Graph
 *
 * Node-based visual shader programming system for HoloScript
 */

import type {
  IShaderGraph,
  IShaderNode,
  IShaderConnection,
  INodeTemplate,
  NodeCategory,
} from './ShaderGraphTypes';
import { getNodeTemplate, areTypesCompatible, ALL_NODE_TEMPLATES } from './ShaderGraphTypes';

// ============================================================================
// Serialization Types
// ============================================================================

/**
 * Serialized shader graph representation
 */
export interface ISerializedShaderGraph {
  id: string;
  name: string;
  description?: string;
  version?: string;
  metadata?: Record<string, unknown>;
  nodes: IShaderNode[];
  connections?: IShaderConnection[];
}

// ============================================================================
// Shader Graph Builder
// ============================================================================

/**
 * Shader graph builder for creating and editing shader graphs
 */
export class ShaderGraph implements IShaderGraph {
  id: string;
  name: string;
  description?: string;
  nodes: Map<string, IShaderNode>;
  connections: IShaderConnection[];
  version: string = '1.0.0';
  metadata?: Record<string, unknown>;

  private nodeCounter = 0;
  private connectionCounter = 0;

  constructor(name?: string, id?: string) {
    this.id = id ?? this.generateId('graph');
    this.name = name ?? 'Untitled Shader';
    this.nodes = new Map();
    this.connections = [];
  }

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create a node from a template
   */
  createNode(
    type: string,
    position: { x: number; y: number } = { x: 0, y: 0 }
  ): IShaderNode | null {
    const template = getNodeTemplate(type);
    if (!template) {
      console.warn(`Unknown node type: ${type}`);
      return null;
    }

    const nodeId = `node_${++this.nodeCounter}`;

    const node: IShaderNode = {
      id: nodeId,
      type: template.type,
      name: template.name,
      category: template.category,
      inputs: template.inputs.map((input) => ({
        ...input,
        direction: 'input' as const,
      })),
      outputs: template.outputs.map((output) => ({
        ...output,
        direction: 'output' as const,
      })),
      position,
      properties: template.defaultProperties ? { ...template.defaultProperties } : undefined,
    };

    this.nodes.set(nodeId, node);
    return node;
  }

  /**
   * Add a custom node
   */
  addCustomNode(node: Omit<IShaderNode, 'id'>): IShaderNode {
    const nodeId = `node_${++this.nodeCounter}`;
    const fullNode: IShaderNode = {
      ...node,
      id: nodeId,
    };
    this.nodes.set(nodeId, fullNode);
    return fullNode;
  }

  /**
   * Get a node by ID
   */
  getNode(nodeId: string): IShaderNode | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Remove a node by ID
   */
  removeNode(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Remove all connections to/from this node
    this.connections = this.connections.filter(
      (conn) => conn.fromNode !== nodeId && conn.toNode !== nodeId
    );

    return this.nodes.delete(nodeId);
  }

  /**
   * Update node position
   */
  setNodePosition(nodeId: string, x: number, y: number): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.position = { x, y };
    return true;
  }

  /**
   * Update node property
   */
  setNodeProperty(nodeId: string, key: string, value: unknown): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    if (!node.properties) node.properties = {};
    node.properties[key] = value;
    return true;
  }

  /**
   * Get node property
   */
  getNodeProperty(nodeId: string, key: string): unknown {
    const node = this.nodes.get(nodeId);
    return node?.properties?.[key];
  }

  /**
   * Connect two ports
   */
  connect(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string
  ): IShaderConnection | null {
    // Validate nodes exist
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);

    if (!fromNode || !toNode) {
      console.warn('Invalid node IDs for connection');
      return null;
    }

    // Find ports
    const fromPort = fromNode.outputs.find((p) => p.id === fromPortId);
    const toPort = toNode.inputs.find((p) => p.id === toPortId);

    if (!fromPort || !toPort) {
      console.warn('Invalid port IDs for connection');
      return null;
    }

    // Check type compatibility
    if (!areTypesCompatible(fromPort.type, toPort.type)) {
      console.warn(`Type mismatch: ${fromPort.type} -> ${toPort.type}`);
      return null;
    }

    // Check for existing connection to this input
    const existingIdx = this.connections.findIndex(
      (c) => c.toNode === toNodeId && c.toPort === toPortId
    );
    if (existingIdx >= 0) {
      // Remove existing connection
      const existing = this.connections[existingIdx];
      this.disconnectPort(existing.toNode, existing.toPort);
      this.connections.splice(existingIdx, 1);
    }

    // Check for cycles
    if (this.wouldCreateCycle(fromNodeId, toNodeId)) {
      console.warn('Connection would create a cycle');
      return null;
    }

    // Create connection
    const connection: IShaderConnection = {
      id: `conn_${++this.connectionCounter}`,
      fromNode: fromNodeId,
      fromPort: fromPortId,
      toNode: toNodeId,
      toPort: toPortId,
    };

    this.connections.push(connection);

    // Update port references
    toPort.connected = {
      nodeId: fromNodeId,
      portId: fromPortId,
    };

    return connection;
  }

  /**
   * Disconnect a port
   */
  disconnectPort(nodeId: string, portId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;

    // Find and clear input port connection
    const inputPort = node.inputs.find((p) => p.id === portId);
    if (inputPort) {
      inputPort.connected = undefined;
    }

    // Remove connections
    const initialLength = this.connections.length;
    this.connections = this.connections.filter(
      (c) =>
        !(c.toNode === nodeId && c.toPort === portId) &&
        !(c.fromNode === nodeId && c.fromPort === portId)
    );

    return this.connections.length !== initialLength;
  }

  /**
   * Get all connections for a node
   */
  getNodeConnections(nodeId: string): IShaderConnection[] {
    return this.connections.filter((c) => c.fromNode === nodeId || c.toNode === nodeId);
  }

  /**
   * Get input connections for a node
   */
  getInputConnections(nodeId: string): IShaderConnection[] {
    return this.connections.filter((c) => c.toNode === nodeId);
  }

  /**
   * Get output connections for a node
   */
  getOutputConnections(nodeId: string): IShaderConnection[] {
    return this.connections.filter((c) => c.fromNode === nodeId);
  }

  /**
   * Check if connection would create a cycle
   */
  private wouldCreateCycle(fromNodeId: string, toNodeId: string): boolean {
    // If connecting to same node, it's a cycle
    if (fromNodeId === toNodeId) return true;

    // BFS to check if toNode can reach fromNode
    const visited = new Set<string>();
    const queue = [toNodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === fromNodeId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Get outputs from current node
      const outputConnections = this.getOutputConnections(current);
      for (const conn of outputConnections) {
        queue.push(conn.toNode);
      }
    }

    return false;
  }

  /**
   * Get nodes by category
   */
  getNodesByCategory(category: NodeCategory): IShaderNode[] {
    return Array.from(this.nodes.values()).filter((n) => n.category === category);
  }

  /**
   * Get all output nodes
   */
  getOutputNodes(): IShaderNode[] {
    return this.getNodesByCategory('output');
  }

  /**
   * Get topologically sorted nodes (dependency order)
   */
  getTopologicalOrder(): IShaderNode[] {
    const sorted: IShaderNode[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (nodeId: string): boolean => {
      if (visited.has(nodeId)) return true;
      if (visiting.has(nodeId)) return false; // Cycle detected

      visiting.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) return true;

      // Visit dependencies (input connections)
      const inputConns = this.getInputConnections(nodeId);
      for (const conn of inputConns) {
        if (!visit(conn.fromNode)) return false;
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      sorted.push(node);
      return true;
    };

    // Start from output nodes
    const outputNodes = this.getOutputNodes();
    for (const output of outputNodes) {
      visit(output.id);
    }

    // Visit any remaining nodes
    for (const node of this.nodes.values()) {
      visit(node.id);
    }

    return sorted;
  }

  /**
   * Validate the graph
   */
  validate(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for output nodes
    const outputNodes = this.getOutputNodes();
    if (outputNodes.length === 0) {
      errors.push('Graph has no output nodes');
    }

    // Check for disconnected required inputs
    for (const node of this.nodes.values()) {
      for (const input of node.inputs) {
        if (input.required && !input.connected && input.defaultValue === undefined) {
          errors.push(
            `Node "${node.name}" (${node.id}): Required input "${input.name}" is not connected`
          );
        }
      }
    }

    // Check for orphan nodes (no connections)
    for (const node of this.nodes.values()) {
      if (node.category !== 'output') {
        const connections = this.getNodeConnections(node.id);
        if (connections.length === 0) {
          warnings.push(`Node "${node.name}" (${node.id}) is not connected to anything`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.connections = [];
    this.nodeCounter = 0;
    this.connectionCounter = 0;
  }

  /**
   * Duplicate a node
   */
  duplicateNode(nodeId: string, offset = { x: 50, y: 50 }): IShaderNode | null {
    const original = this.nodes.get(nodeId);
    if (!original) return null;

    const duplicate: Omit<IShaderNode, 'id'> = {
      type: original.type,
      name: original.name,
      category: original.category,
      inputs: original.inputs.map((i) => ({ ...i, connected: undefined })),
      outputs: original.outputs.map((o) => ({ ...o })),
      position: {
        x: original.position.x + offset.x,
        y: original.position.y + offset.y,
      },
      properties: original.properties ? { ...original.properties } : undefined,
      preview: original.preview,
    };

    return this.addCustomNode(duplicate);
  }

  /**
   * Get available node templates
   */
  static getAvailableNodeTemplates(): INodeTemplate[] {
    return ALL_NODE_TEMPLATES;
  }

  /**
   * Get node templates by category
   */
  static getNodeTemplatesByCategory(category: NodeCategory): INodeTemplate[] {
    return ALL_NODE_TEMPLATES.filter((t) => t.category === category);
  }

  /**
   * Serialize to JSON
   */
  toJSON(): ISerializedShaderGraph {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      metadata: this.metadata,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => {
        const { id: _nodeId, ...rest } = node;
        return {
          id,
          ...rest,
        };
      }),
      connections: this.connections,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromJSON(json: ISerializedShaderGraph): ShaderGraph {
    const graph = new ShaderGraph(json.name, json.id);
    graph.description = json.description;
    graph.version = json.version ?? '1.0.0';
    graph.metadata = json.metadata;

    for (const nodeData of json.nodes) {
      graph.nodes.set(nodeData.id, nodeData);
    }

    graph.connections = json.connections ?? [];

    return graph;
  }

  /**
   * Serialize to JSON string
   */
  serialize(): string {
    return JSON.stringify(this.toJSON(), null, 2);
  }

  /**
   * Deserialize from JSON string
   */
  static deserialize(json: string): ShaderGraph {
    return ShaderGraph.fromJSON(JSON.parse(json));
  }
}
