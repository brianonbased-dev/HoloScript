/**
 * NodeGraphPanel.ts
 *
 * Editor panel for the Visual Logic Editor.
 * Generates 3D UI entities representing nodes and connections.
 *
 * @module editor
 */

import { NodeGraph, LogicNode, LogicConnection } from '../logic/NodeGraph';

// =============================================================================
// TYPES
// =============================================================================

export interface NodeGraphPanelConfig {
  position: [number, number, number];
  nodeWidth: number;
  nodeHeight: number;
  gridSpacing: number;
}

export interface UIEntity {
  id: string;
  type: 'panel' | 'label' | 'port' | 'connection_line';
  position: [number, number, number];
  size?: { width: number; height: number };
  text?: string;
  color?: string;
  data?: Record<string, unknown>;
}

const DEFAULT_CONFIG: NodeGraphPanelConfig = {
  position: [0, 1.5, -1],
  nodeWidth: 0.3,
  nodeHeight: 0.15,
  gridSpacing: 0.05,
};

// =============================================================================
// NODE GRAPH PANEL
// =============================================================================

export class NodeGraphPanel {
  private config: NodeGraphPanelConfig;
  private graph: NodeGraph;
  private entities: UIEntity[] = [];
  private selectedNodeId: string | null = null;

  constructor(graph: NodeGraph, config: Partial<NodeGraphPanelConfig> = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ---------------------------------------------------------------------------
  // UI Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate UI entities for the entire graph.
   */
  generateUI(): UIEntity[] {
    this.entities = [];

    // Background panel
    this.entities.push({
      id: 'graph_background',
      type: 'panel',
      position: { ...this.config.position },
      size: { width: 2, height: 1.5 },
      color: '#1a1a2e',
      data: { role: 'background' },
    });

    // Render nodes
    for (const node of this.graph.getNodes()) {
      this.generateNodeUI(node);
    }

    // Render connections
    for (const conn of this.graph.getConnections()) {
      this.generateConnectionUI(conn);
    }

    return this.entities;
  }

  /**
   * Generate UI entities for a single node.
   */
  private generateNodeUI(node: LogicNode): void {
    const worldX = this.config.position.x + node.position.x * this.config.gridSpacing;
    const worldY = this.config.position.y - node.position.y * this.config.gridSpacing;
    const worldZ = this.config.position.z;

    const isSelected = this.selectedNodeId === node.id;

    // Node body
    this.entities.push({
      id: `node_body_${node.id}`,
      type: 'panel',
      position: [worldX, worldY, worldZ + 0.001],
      size: { width: this.config.nodeWidth, height: this.config.nodeHeight },
      color: isSelected ? '#e94560' : this.getNodeColor(node.type),
      data: { role: 'node', nodeId: node.id, nodeType: node.type },
    });

    // Node title
    this.entities.push({
      id: `node_title_${node.id}`,
      type: 'label',
      position: [worldX, worldY + this.config.nodeHeight * 0.3, worldZ + 0.002],
      text: node.type,
      color: '#ffffff',
      data: { role: 'title', nodeId: node.id },
    });

    // Input ports
    node.inputs.forEach((port, i) => {
      this.entities.push({
        id: `port_in_${node.id}_${port.name}`,
        type: 'port',
        position: [worldX - this.config.nodeWidth * 0.45, worldY - (i + 1) * 0.02, worldZ + 0.002,],
        text: port.name,
        color: this.getPortColor(port.type),
        data: { role: 'input_port', nodeId: node.id, portName: port.name, portType: port.type },
      });
    });

    // Output ports
    node.outputs.forEach((port, i) => {
      this.entities.push({
        id: `port_out_${node.id}_${port.name}`,
        type: 'port',
        position: [worldX + this.config.nodeWidth * 0.45, worldY - (i + 1) * 0.02, worldZ + 0.002,],
        text: port.name,
        color: this.getPortColor(port.type),
        data: { role: 'output_port', nodeId: node.id, portName: port.name, portType: port.type },
      });
    });
  }

  /**
   * Generate UI entity for a connection (line between ports).
   */
  private generateConnectionUI(conn: LogicConnection): void {
    const fromNode = this.graph.getNode(conn.fromNode);
    const toNode = this.graph.getNode(conn.toNode);
    if (!fromNode || !toNode) return;

    const fromX =
      this.config.position.x +
      fromNode.position.x * this.config.gridSpacing +
      this.config.nodeWidth * 0.45;
    const fromY = this.config.position.y - fromNode.position.y * this.config.gridSpacing;
    const toX =
      this.config.position.x +
      toNode.position.x * this.config.gridSpacing -
      this.config.nodeWidth * 0.45;
    const toY = this.config.position.y - toNode.position.y * this.config.gridSpacing;
    const z = this.config.position.z + 0.003;

    this.entities.push({
      id: `conn_line_${conn.id}`,
      type: 'connection_line',
      position: { x: (fromX + toX) / 2, y: (fromY + toY) / 2, z },
      color: '#16c79a',
      data: {
        role: 'connection',
        connectionId: conn.id,
        from: { x: fromX, y: fromY, z },
        to: { x: toX, y: toY, z },
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  selectNode(nodeId: string | null): void {
    this.selectedNodeId = nodeId;
  }

  getSelectedNode(): string | null {
    return this.selectedNodeId;
  }

  // ---------------------------------------------------------------------------
  // Color Helpers
  // ---------------------------------------------------------------------------

  private getNodeColor(type: string): string {
    const colors: Record<string, string> = {
      MathAdd: '#4a90e2',
      MathMultiply: '#4a90e2',
      Compare: '#7b68ee',
      Branch: '#f39c12',
      Not: '#f39c12',
      GetState: '#2ecc71',
      SetState: '#27ae60',
      OnEvent: '#e74c3c',
      EmitEvent: '#c0392b',
      Timer: '#9b59b6',
      Random: '#1abc9c',
      Clamp: '#4a90e2',
    };
    return colors[type] || '#555555';
  }

  private getPortColor(type: string): string {
    const colors: Record<string, string> = {
      number: '#4a90e2',
      string: '#f39c12',
      boolean: '#e74c3c',
      vec3: '#2ecc71',
      any: '#aaaaaa',
      event: '#9b59b6',
    };
    return colors[type] || '#888888';
  }
}
