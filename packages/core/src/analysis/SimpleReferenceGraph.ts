export interface SimpleGraphNode {
  id: string;
  kind: string;
  name: string;
  filePath: string;
  line?: number;
}

export class SimpleReferenceGraph {
  private nodes = new Map();
  private edges = new Map();
  private reverseEdges = new Map();

  addNode(node: SimpleGraphNode): void {
    this.nodes.set(node.id, node);
    if (this.edges.has(node.id) === false) this.edges.set(node.id, new Set());
    if (this.reverseEdges.has(node.id) === false) this.reverseEdges.set(node.id, new Set());
  }
  addReference(fromId: string, toId: string): void {
    if (this.edges.has(fromId) === false) this.edges.set(fromId, new Set());
    if (this.reverseEdges.has(toId) === false) this.reverseEdges.set(toId, new Set());
    this.edges.get(fromId).add(toId);
    this.reverseEdges.get(toId).add(fromId);
  }
  getReferences(id: string): string[] {
    return Array.from(this.edges.get(id) ?? []);
  }
  getReferencedBy(id: string): string[] {
    return Array.from(this.reverseEdges.get(id) ?? []);
  }
  getAllNodes(): SimpleGraphNode[] {
    return Array.from(this.nodes.values());
  }
  getUnreachable(entryPoints: string[]): SimpleGraphNode[] {
    const visited = new Set(entryPoints);
    const queue = [...entryPoints];
    let head = 0;
    while (head < queue.length) {
      const current = queue[head++];
      for (const nb of this.edges.get(current) ?? []) {
        if (visited.has(nb) === false) {
          visited.add(nb);
          queue.push(nb);
        }
      }
    }
    return Array.from(this.nodes.values()).filter((n) => visited.has(n.id) === false);
  }
}
