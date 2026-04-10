/**
 * NodeGraph — Visual scripting node graph
 *
 * Defines nodes with typed input/output ports, wire connections,
 * and topological evaluation.
 *
 * @version 1.0.0
 */

export type PortType = 'number' | 'string' | 'boolean' | 'vector' | 'any' | 'exec';

export interface Port {
  id: string;
  name: string;
  type: PortType;
  direction: 'input' | 'output';
  defaultValue?: unknown;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  ports: Port[];
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface Wire {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

export class NodeGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private wires: Map<string, Wire> = new Map();
  private wireId: number = 0;

  addNode(node: GraphNode): void {
    this.nodes.set(node.id, node);
  }

  removeNode(nodeId: string): boolean {
    if (!this.nodes.delete(nodeId)) return false;
    // Remove connected wires
    for (const [wId, wire] of this.wires) {
      if (wire.fromNodeId === nodeId || wire.toNodeId === nodeId) {
        this.wires.delete(wId);
      }
    }
    return true;
  }

  connect(
    fromNodeId: string,
    fromPortId: string,
    toNodeId: string,
    toPortId: string
  ): string | null {
    const fromNode = this.nodes.get(fromNodeId);
    const toNode = this.nodes.get(toNodeId);
    if (!fromNode || !toNode) return null;

    const fromPort = fromNode.ports.find((p) => p.id === fromPortId && p.direction === 'output');
    const toPort = toNode.ports.find((p) => p.id === toPortId && p.direction === 'input');
    if (!fromPort || !toPort) return null;

    // Type compatibility check
    if (fromPort.type !== toPort.type && fromPort.type !== 'any' && toPort.type !== 'any')
      return null;

    const id = `wire_${this.wireId++}`;
    this.wires.set(id, { id, fromNodeId, fromPortId, toNodeId, toPortId });
    return id;
  }

  disconnect(wireId: string): boolean {
    return this.wires.delete(wireId);
  }

  /**
   * Get topological order of nodes
   */
  getTopologicalOrder(): string[] {
    const inDegree = new Map<string, number>();
    for (const id of this.nodes.keys()) inDegree.set(id, 0);

    for (const wire of this.wires.values()) {
      inDegree.set(wire.toNodeId, (inDegree.get(wire.toNodeId) || 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);
      for (const wire of this.wires.values()) {
        if (wire.fromNodeId === nodeId) {
          const newDeg = (inDegree.get(wire.toNodeId) || 1) - 1;
          inDegree.set(wire.toNodeId, newDeg);
          if (newDeg === 0) queue.push(wire.toNodeId);
        }
      }
    }

    return order;
  }

  /**
   * Detect cycles in the graph
   */
  hasCycle(): boolean {
    return this.getTopologicalOrder().length !== this.nodes.size;
  }

  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }
  getNodeCount(): number {
    return this.nodes.size;
  }
  getWireCount(): number {
    return this.wires.size;
  }
  getWiresForNode(nodeId: string): Wire[] {
    return [...this.wires.values()].filter((w) => w.fromNodeId === nodeId || w.toNodeId === nodeId);
  }
  getAllNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }
}
