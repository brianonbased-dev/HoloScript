/**
 * HoloScript Visual - Node Type Definitions
 *
 * Types for the node-based visual programming interface.
 */

import type { Node, Edge } from 'reactflow';

/**
 * Node categories matching the ROADMAP spec
 */
export type NodeCategory = 'event' | 'action' | 'logic' | 'data';

/**
 * Category colors
 */
export const CATEGORY_COLORS: Record<NodeCategory, string> = {
  event: '#22c55e', // Green
  action: '#3b82f6', // Blue
  logic: '#eab308', // Yellow
  data: '#a855f7', // Purple
};

/**
 * Port type for connections
 */
export type PortType = 'flow' | 'string' | 'number' | 'boolean' | 'any' | 'object' | 'array';

/**
 * Port definition for node inputs/outputs
 */
export interface PortDefinition {
  id: string;
  label: string;
  type: PortType;
  multiple?: boolean; // Allow multiple connections
}

/**
 * Node type definition
 */
export interface NodeTypeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  description: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  properties?: PropertyDefinition[];
  icon?: string;
}

/**
 * Property definition for node configuration
 */
export interface PropertyDefinition {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'color';
  default?: string | number | boolean;
  options?: { label: string; value: string }[];
}

/**
 * Extended node data for HoloScript nodes
 */
export interface HoloNodeData {
  type: string;
  label: string;
  category: NodeCategory;
  properties: Record<string, any>;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
}

/**
 * HoloScript visual node (React Flow compatible)
 */
export type HoloNode = Node<HoloNodeData>;

/**
 * HoloScript visual edge
 */
export type HoloEdge = Edge<{
  sourcePort: string;
  targetPort: string;
  flowType: PortType;
}>;

/**
 * Visual graph structure
 */
export interface VisualGraph {
  nodes: HoloNode[];
  edges: HoloEdge[];
  metadata: GraphMetadata;
}

/**
 * Graph metadata
 */
export interface GraphMetadata {
  name: string;
  description?: string;
  version: string;
  createdAt: string;
  updatedAt: string;
  targetObject?: string; // The object this graph controls
}

/**
 * Code generation result
 */
export interface CodeGenResult {
  code: string;
  format: 'hs' | 'hsplus' | 'holo';
  errors: CodeGenError[];
  warnings: string[];
}

/**
 * Code generation error
 */
export interface CodeGenError {
  nodeId: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * History entry for undo/redo
 */
export interface HistoryEntry {
  nodes: HoloNode[];
  edges: HoloEdge[];
  timestamp: number;
  description: string;
}
