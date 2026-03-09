/**
 * AudioGraph.ts
 *
 * Node-based audio processing graph: connections, parameter
 * automation, processing order, and mix routing.
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export type AudioNodeType =
  | 'source'
  | 'gain'
  | 'filter'
  | 'delay'
  | 'reverb'
  | 'compressor'
  | 'output'
  | 'mixer';

export interface AudioGraphNode {
  id: string;
  type: AudioNodeType;
  params: Map<string, number>;
  inputs: string[]; // Connected node IDs
  outputs: string[];
  bypassed: boolean;
}

export interface AudioConnection {
  id: string;
  sourceId: string;
  targetId: string;
  sourcePort: number;
  targetPort: number;
}

export interface AutomationPoint {
  time: number;
  value: number;
  curve: 'linear' | 'exponential' | 'step';
}

export interface ParameterAutomation {
  nodeId: string;
  paramName: string;
  points: AutomationPoint[];
}

// =============================================================================
// AUDIO GRAPH
// =============================================================================

let _nodeId = 0;
let _connId = 0;

export class AudioGraph {
  private nodes: Map<string, AudioGraphNode> = new Map();
  private connections: Map<string, AudioConnection> = new Map();
  private automations: ParameterAutomation[] = [];
  private processingOrder: string[] = [];
  private dirty = true;

  // ---------------------------------------------------------------------------
  // Node Management
  // ---------------------------------------------------------------------------

  addNode(type: AudioNodeType, params?: Record<string, number>): AudioGraphNode {
    const id = `anode_${_nodeId++}`;
    const node: AudioGraphNode = {
      id,
      type,
      params: new Map(Object.entries(params ?? {})),
      inputs: [],
      outputs: [],
      bypassed: false,
    };
    this.nodes.set(id, node);
    this.dirty = true;

    // Default params
    switch (type) {
      case 'gain':
        if (!node.params.has('gain')) node.params.set('gain', 1);
        break;
      case 'filter':
        if (!node.params.has('cutoff')) node.params.set('cutoff', 1000);
        break;
      case 'delay':
        if (!node.params.has('time')) node.params.set('time', 0.5);
        break;
      case 'reverb':
        if (!node.params.has('decay')) node.params.set('decay', 1.5);
        break;
      case 'compressor':
        if (!node.params.has('threshold')) node.params.set('threshold', -24);
        break;
    }

    return node;
  }

  removeNode(id: string): boolean {
    // Remove connections
    for (const [connId, conn] of this.connections) {
      if (conn.sourceId === id || conn.targetId === id) {
        this.disconnect(connId);
      }
    }
    this.dirty = true;
    return this.nodes.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Connections
  // ---------------------------------------------------------------------------

  connect(sourceId: string, targetId: string, sourcePort = 0, targetPort = 0): string | null {
    const source = this.nodes.get(sourceId);
    const target = this.nodes.get(targetId);
    if (!source || !target) return null;

    const id = `conn_${_connId++}`;
    this.connections.set(id, { id, sourceId, targetId, sourcePort, targetPort });
    source.outputs.push(targetId);
    target.inputs.push(sourceId);
    this.dirty = true;
    return id;
  }

  disconnect(connId: string): boolean {
    const conn = this.connections.get(connId);
    if (!conn) return false;

    const source = this.nodes.get(conn.sourceId);
    const target = this.nodes.get(conn.targetId);
    if (source) source.outputs = source.outputs.filter((id) => id !== conn.targetId);
    if (target) target.inputs = target.inputs.filter((id) => id !== conn.sourceId);

    this.dirty = true;
    return this.connections.delete(connId);
  }

  // ---------------------------------------------------------------------------
  // Automation
  // ---------------------------------------------------------------------------

  automate(nodeId: string, paramName: string, points: AutomationPoint[]): void {
    this.automations.push({
      nodeId,
      paramName,
      points: [...points].sort((a, b) => a.time - b.time),
    });
  }

  applyAutomation(time: number): void {
    for (const auto of this.automations) {
      const node = this.nodes.get(auto.nodeId);
      if (!node) continue;

      const value = this.evaluateAutomation(auto.points, time);
      if (value !== null) node.params.set(auto.paramName, value);
    }
  }

  private evaluateAutomation(points: AutomationPoint[], time: number): number | null {
    if (points.length === 0) return null;
    if (time <= points[0].time) return points[0].value;
    if (time >= points[points.length - 1].time) return points[points.length - 1].value;

    for (let i = 0; i < points.length - 1; i++) {
      if (time >= points[i].time && time < points[i + 1].time) {
        const t = (time - points[i].time) / (points[i + 1].time - points[i].time);
        switch (points[i + 1].curve) {
          case 'step':
            return points[i].value;
          case 'exponential':
            return points[i].value * Math.pow(points[i + 1].value / points[i].value, t);
          case 'linear':
          default:
            return points[i].value + (points[i + 1].value - points[i].value) * t;
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Processing Order (topological sort)
  // ---------------------------------------------------------------------------

  getProcessingOrder(): string[] {
    if (!this.dirty) return [...this.processingOrder];

    const visited = new Set<string>();
    const order: string[] = [];

    const visit = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.nodes.get(id);
      if (node) for (const inputId of node.inputs) visit(inputId);
      order.push(id);
    };

    for (const id of this.nodes.keys()) visit(id);
    this.processingOrder = order;
    this.dirty = false;
    return [...order];
  }

  // ---------------------------------------------------------------------------
  // Node Controls
  // ---------------------------------------------------------------------------

  setParam(nodeId: string, param: string, value: number): void {
    this.nodes.get(nodeId)?.params.set(param, value);
  }

  getParam(nodeId: string, param: string): number | undefined {
    return this.nodes.get(nodeId)?.params.get(param);
  }

  bypass(nodeId: string, bypassed: boolean): void {
    const node = this.nodes.get(nodeId);
    if (node) node.bypassed = bypassed;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getNode(id: string): AudioGraphNode | undefined {
    return this.nodes.get(id);
  }
  getNodeCount(): number {
    return this.nodes.size;
  }
  getConnectionCount(): number {
    return this.connections.size;
  }
}
