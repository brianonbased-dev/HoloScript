/**
 * Shader Graph State Management Hook
 *
 * Zustand store for managing shader graph state.
 * Uses local interface stubs for @holoscript/core/shader/graph
 * until the core package exports those types.
 */

import { create } from 'zustand';

// ── Local stubs (replace with @holoscript/core/shader/graph once exported) ──

interface IShaderPort {
  id: string;
  name: string;
  type: string;
  direction: 'in' | 'out';
}

export interface IShaderNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  ports: IShaderPort[];
  properties: Record<string, unknown>;
  label?: string;
}

export interface IShaderConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
}

class ShaderGraph {
  private name: string;
  private nodes: Map<string, IShaderNode> = new Map();
  private connections: Map<string, IShaderConnection> = new Map();
  private _nodeCounter = 0;
  private _connCounter = 0;

  constructor(name: string) { this.name = name; }

  createNode(type: string, position: { x: number; y: number }): IShaderNode | null {
    const id = `node_${++this._nodeCounter}`;
    const node: IShaderNode = { id, type, position, ports: [], properties: {} };
    this.nodes.set(id, node);
    return node;
  }

  getNode(id: string): IShaderNode | undefined { return this.nodes.get(id); }

  removeNode(id: string): boolean {
    // Remove all connections referencing this node
    for (const [cid, c] of this.connections) {
      if (c.fromNodeId === id || c.toNodeId === id) this.connections.delete(cid);
    }
    return this.nodes.delete(id);
  }

  connect(fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string): IShaderConnection | null {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) return null;
    const id = `conn_${++this._connCounter}`;
    const conn: IShaderConnection = { id, fromNodeId, fromPortId, toNodeId, toPortId };
    this.connections.set(id, conn);
    return conn;
  }

  disconnectPort(nodeId: string, portId: string): boolean {
    let found = false;
    for (const [id, c] of this.connections) {
      if ((c.fromNodeId === nodeId && c.fromPortId === portId) ||
          (c.toNodeId === nodeId && c.toPortId === portId)) {
        this.connections.delete(id);
        found = true;
      }
    }
    return found;
  }

  setNodeProperty(nodeId: string, key: string, value: unknown): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.properties[key] = value;
    return true;
  }

  setNodePosition(nodeId: string, x: number, y: number): void {
    const node = this.nodes.get(nodeId);
    if (node) node.position = { x, y };
  }

  serialize(): string {
    return JSON.stringify({
      name: this.name,
      nodes: Object.fromEntries(this.nodes),
      connections: Object.fromEntries(this.connections),
    });
  }

  static deserialize(json: string): ShaderGraph {
    const data = JSON.parse(json) as {
      name: string;
      nodes: Record<string, IShaderNode>;
      connections: Record<string, IShaderConnection>;
    };
    const g = new ShaderGraph(data.name);
    for (const [k, v] of Object.entries(data.nodes)) g.nodes.set(k, v);
    for (const [k, v] of Object.entries(data.connections)) g.connections.set(k, v);
    return g;
  }
}

// ── Zustand store ────────────────────────────────────────────────────────────

interface ShaderGraphState {
  graph: ShaderGraph;
  isDirty: boolean;
  history: string[];
  historyIndex: number;
  maxHistorySize: number;

  createNode: (type: string, position: { x: number; y: number }) => IShaderNode | null;
  updateNode: (nodeId: string, updates: Partial<IShaderNode>) => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;

  connect: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => IShaderConnection | null;
  disconnect: (nodeId: string, portId: string) => void;

  setNodeProperty: (nodeId: string, key: string, value: unknown) => void;
  setNodePosition: (nodeId: string, x: number, y: number) => void;

  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  loadGraph: (serialized: string) => void;
  serializeGraph: () => string;
  clearGraph: () => void;

  markClean: () => void;
  markDirty: () => void;
}

export const useShaderGraph = create<ShaderGraphState>((set, get) => ({
  graph: new ShaderGraph('Untitled Shader'),
  isDirty: false,
  history: [],
  historyIndex: -1,
  maxHistorySize: 50,

  createNode: (type, position) => {
    const { graph, pushHistory } = get();
    const node = graph.createNode(type, position);
    if (node) { pushHistory(); set({ isDirty: true }); }
    return node;
  },

  updateNode: (nodeId, updates) => {
    const { graph, pushHistory } = get();
    const node = graph.getNode(nodeId);
    if (node) { Object.assign(node, updates); pushHistory(); set({ isDirty: true }); }
  },

  deleteNode: (nodeId) => {
    const { graph, pushHistory } = get();
    if (graph.removeNode(nodeId)) { pushHistory(); set({ isDirty: true }); }
  },

  deleteNodes: (nodeIds) => {
    const { graph, pushHistory } = get();
    let deleted = false;
    for (const nodeId of nodeIds) { if (graph.removeNode(nodeId)) deleted = true; }
    if (deleted) { pushHistory(); set({ isDirty: true }); }
  },

  connect: (fromNodeId, fromPortId, toNodeId, toPortId) => {
    const { graph, pushHistory } = get();
    const connection = graph.connect(fromNodeId, fromPortId, toNodeId, toPortId);
    if (connection) { pushHistory(); set({ isDirty: true }); }
    return connection;
  },

  disconnect: (nodeId, portId) => {
    const { graph, pushHistory } = get();
    if (graph.disconnectPort(nodeId, portId)) { pushHistory(); set({ isDirty: true }); }
  },

  setNodeProperty: (nodeId, key, value) => {
    const { graph, pushHistory } = get();
    if (graph.setNodeProperty(nodeId, key, value)) { pushHistory(); set({ isDirty: true }); }
  },

  setNodePosition: (nodeId, x, y) => {
    const { graph } = get();
    graph.setNodePosition(nodeId, x, y);
    set({});
  },

  pushHistory: () => {
    const { graph, history, historyIndex, maxHistorySize } = get();
    const serialized = graph.serialize();
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(serialized);
    if (newHistory.length > maxHistorySize) newHistory.shift();
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const newGraph = ShaderGraph.deserialize(history[newIndex]);
      set({ graph: newGraph, historyIndex: newIndex, isDirty: true });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const newGraph = ShaderGraph.deserialize(history[newIndex]);
      set({ graph: newGraph, historyIndex: newIndex, isDirty: true });
    }
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  loadGraph: (serialized) => {
    const newGraph = ShaderGraph.deserialize(serialized);
    set({ graph: newGraph, history: [serialized], historyIndex: 0, isDirty: false });
  },

  serializeGraph: () => get().graph.serialize(),

  clearGraph: () => {
    set({ graph: new ShaderGraph('Untitled Shader'), history: [], historyIndex: -1, isDirty: false });
  },

  markClean: () => set({ isDirty: false }),
  markDirty: () => set({ isDirty: true }),
}));
