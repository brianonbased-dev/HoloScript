/**
 * Shader Graph Types for Studio
 *
 * Type definitions for shader graph serialization and material configuration.
 * These types support the Material Library feature for custom material creation.
 */

/**
 * Serialized shader graph representation
 * Allows shader graphs to be saved to IndexedDB and reconstructed
 */
export interface ISerializedShaderGraph {
  nodes: ShaderNode[];
  connections: ShaderConnection[];
  metadata?: ShaderGraphMetadata;
}

/**
 * Individual shader node in the graph
 */
export interface ShaderNode {
  id: string;
  type: 'input' | 'output' | 'frag' | 'vert' | 'combine' | 'split' | 'texture' | 'math';
  position: { x: number; y: number };
  properties: Record<string, unknown>;
}

/**
 * Connection between two shader nodes
 */
export interface ShaderConnection {
  fromNodeId: string;
  fromPort: string;
  toNodeId: string;
  toPort: string;
}

/**
 * Metadata about the shader graph
 */
export interface ShaderGraphMetadata {
  name?: string;
  description?: string;
  author?: string;
  version?: string;
  createdAt?: number;
  modifiedAt?: number;
}

/**
 * Shader Graph class for building shader graphs programmatically
 * Placeholder implementation for type safety
 */
export class ShaderGraph {
  private graph: ISerializedShaderGraph;

  constructor(initialGraph?: ISerializedShaderGraph) {
    this.graph = initialGraph || {
      nodes: [],
      connections: [],
    };
  }

  /**
   * Serialize graph to JSON-compatible format
   */
  serialize(): ISerializedShaderGraph {
    return this.graph;
  }

  /**
   * Add a node to the graph
   */
  addNode(node: ShaderNode): void {
    this.graph.nodes.push(node);
  }

  /**
   * Add a connection between nodes
   */
  connect(fromNodeId: string, fromPort: string, toNodeId: string, toPort: string): void {
    this.graph.connections.push({
      fromNodeId,
      fromPort,
      toNodeId,
      toPort,
    });
  }
}
