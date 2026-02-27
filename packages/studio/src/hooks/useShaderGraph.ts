/**
 * Shader Graph State Management Hook
 *
 * Zustand store for managing shader graph state.
 * Uses local interface stubs for @holoscript/core/shader/graph
 * until the core package exports those types.
 */

import { create } from 'zustand';

// ── Local stubs (replace with @holoscript/core/shader/graph once exported) ──

export type ShaderDataType =
  | 'float' | 'vec2' | 'vec3' | 'vec4'
  | 'mat2' | 'mat3' | 'mat4'
  | 'int' | 'ivec2' | 'ivec3' | 'ivec4'
  | 'bool' | 'sampler2D' | 'samplerCube';

export interface IShaderPort {
  id: string;
  name: string;
  type: ShaderDataType;
  direction: 'in' | 'out';
  connected?: boolean;
  defaultValue?: number | number[];
}

export type ShaderNodeCategory =
  | 'input' | 'output' | 'math' | 'vector'
  | 'color' | 'texture' | 'utility' | 'material'
  | 'volumetric' | 'custom' | 'procedural';

export interface IShaderNode {
  id: string;
  type: string;
  name: string;
  category: ShaderNodeCategory;
  position: { x: number; y: number };
  /** @deprecated use ports array */
  ports: IShaderPort[];
  /** Convenience accessors derived from ports */
  inputs: IShaderPort[];
  outputs: IShaderPort[];
  properties: Record<string, unknown>;
  label?: string;
  /** Show a preview swatch for color/texture nodes */
  preview?: boolean;
}

export interface IShaderConnection {
  id: string;
  fromNodeId: string;
  fromPortId: string;
  toNodeId: string;
  toPortId: string;
  /** @deprecated aliases — use fromNodeId/toNodeId/fromPortId/toPortId */
  fromNode: string;
  fromPort: string;
  toNode: string;
  toPort: string;
}

/** Serialized graph shape (used by ShaderEditorService, MaterialLibrary, ShaderTemplates) */
export interface ISerializedShaderGraph {
  id: string;
  name: string;
  description?: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    category: ShaderNodeCategory;
    position: { x: number; y: number };
    properties: Record<string, unknown>;
    ports: IShaderPort[];
    inputs: IShaderPort[];
    outputs: IShaderPort[];
    label?: string;
    preview?: boolean;
  }>;
  connections: Array<{
    id: string;
    fromNodeId: string;
    fromPortId: string;
    toNodeId: string;
    toPortId: string;
  }>;
}

/** Build a connection object with both new-style and legacy alias fields */
function makeConn(
  id: string,
  fromNodeId: string, fromPortId: string,
  toNodeId: string, toPortId: string
): IShaderConnection {
  return {
    id,
    fromNodeId, fromPortId,
    toNodeId, toPortId,
    // legacy aliases
    fromNode: fromNodeId, fromPort: fromPortId,
    toNode:   toNodeId,  toPort:   toPortId,
  };
}

export class ShaderGraph {
  public id: string;
  public name: string;
  public version: number;
  public description: string;
  public createdAt: number;
  public updatedAt: number;

  public nodes: Map<string, IShaderNode> = new Map();
  private _connections: IShaderConnection[] = [];
  private _nodeCounter = 0;
  private _connCounter = 0;

  /** Connections as a live array (supports .find, .length, .filter, spread) */
  get connections(): IShaderConnection[] { return this._connections; }

  constructor(name: string) {
    this.id = `graph_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.name = name;
    this.version = 1;
    this.description = '';
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }

  // ── Node operations ─────────────────────────────────────────────────────────

  createNode(
    type: string,
    position: { x: number; y: number },
    opts?: { name?: string; category?: ShaderNodeCategory }
  ): IShaderNode | null {
    const id = `node_${++this._nodeCounter}`;
    const node: IShaderNode = {
      id, type,
      name: opts?.name ?? type,
      category: opts?.category ?? 'custom',
      position, ports: [], inputs: [], outputs: [],
      properties: {},
    };
    this.nodes.set(id, node);
    this.updatedAt = Date.now();
    return node;
  }

  getNode(id: string): IShaderNode | undefined { return this.nodes.get(id); }

  /** Re-insert a previously deleted node (used by UndoRedoSystem) */
  addCustomNode(node: IShaderNode): void {
    this.nodes.set(node.id, node);
    this.updatedAt = Date.now();
  }

  removeNode(id: string): boolean {
    this._connections = this._connections.filter(
      (c) => c.fromNodeId !== id && c.toNodeId !== id
    );
    const deleted = this.nodes.delete(id);
    if (deleted) this.updatedAt = Date.now();
    return deleted;
  }

  // ── Property operations ────────────────────────────────────────────────────

  setNodeProperty(nodeId: string, key: string, value: unknown): boolean {
    const node = this.nodes.get(nodeId);
    if (!node) return false;
    node.properties[key] = value;
    this.updatedAt = Date.now();
    return true;
  }

  getNodeProperty(nodeId: string, key: string): unknown {
    return this.nodes.get(nodeId)?.properties[key];
  }

  setNodePosition(nodeId: string, x: number, y: number): void {
    const node = this.nodes.get(nodeId);
    if (node) { node.position = { x, y }; this.updatedAt = Date.now(); }
  }

  // ── Connection operations ──────────────────────────────────────────────────

  connect(fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string): IShaderConnection | null {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) return null;
    // Prevent self-connections
    if (fromNodeId === toNodeId) return null;
    // Prevent cycles: check if toNodeId can already reach fromNodeId
    if (this._canReach(toNodeId, fromNodeId)) return null;
    const id = `conn_${++this._connCounter}`;
    const conn = makeConn(id, fromNodeId, fromPortId, toNodeId, toPortId);
    this._connections.push(conn);
    // Mark the destination port as connected
    const toNode = this.nodes.get(toNodeId);
    if (toNode) {
      const port = toNode.inputs.find((p) => p.id === toPortId);
      if (port) port.connected = true;
    }
    this.updatedAt = Date.now();
    return conn;
  }

  /** DFS: returns true if `startId` can reach `targetId` via connections */
  private _canReach(startId: string, targetId: string): boolean {
    const visited = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === targetId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const conn of this._connections) {
        if (conn.fromNodeId === current) stack.push(conn.toNodeId);
      }
    }
    return false;
  }

  disconnectPort(nodeId: string, portId: string): boolean {
    const before = this._connections.length;
    this._connections = this._connections.filter(
      (c) => !((c.fromNodeId === nodeId && c.fromPortId === portId) ||
                (c.toNodeId === nodeId && c.toPortId === portId))
    );
    return this._connections.length < before;
  }

  disconnect(nodeId: string, portId: string): boolean {
    return this.disconnectPort(nodeId, portId);
  }

  /** All connections that involve a given node (as source or target) */
  getNodeConnections(nodeId: string): IShaderConnection[] {
    return this._connections.filter(
      (c) => c.fromNodeId === nodeId || c.toNodeId === nodeId
    );
  }

  // ── Serialization ──────────────────────────────────────────────────────────

  toJSON(): ISerializedShaderGraph {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      nodes: Array.from(this.nodes.values()),
      connections: this._connections.map(({ id, fromNodeId, fromPortId, toNodeId, toPortId }) => ({
        id, fromNodeId, fromPortId, toNodeId, toPortId,
      })),
    };
  }

  static fromJSON(data: ISerializedShaderGraph): ShaderGraph {
    const g = new ShaderGraph(data.name);
    g.id = data.id ?? g.id;
    g.version = data.version ?? 1;
    g.description = data.description ?? '';
    g.createdAt = data.createdAt ?? Date.now();
    g.updatedAt = data.updatedAt ?? Date.now();
    for (const n of data.nodes) g.nodes.set(n.id, n as IShaderNode);
    for (const c of (data.connections ?? [])) {
      g._connections.push(makeConn(c.id, c.fromNodeId, c.fromPortId, c.toNodeId, c.toPortId));
    }
    return g;
  }

  /** Legacy JSON string serialization (used by Zustand history) */
  serialize(): string {
    return JSON.stringify(this.toJSON());
  }

  static deserialize(json: string): ShaderGraph {
    return ShaderGraph.fromJSON(JSON.parse(json) as ISerializedShaderGraph);
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

const _initialGraph = new ShaderGraph('Untitled Shader');
const _initialSerialized = _initialGraph.serialize();

export const useShaderGraph = create<ShaderGraphState>((set, get) => ({
  graph: _initialGraph,
  isDirty: false,
  history: [_initialSerialized],   // Seed with the initial empty-graph state
  historyIndex: 0,                  // Start at index 0 (initial state)
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
    const fresh = new ShaderGraph('Untitled Shader');
    const freshSerialized = fresh.serialize();
    set({ graph: fresh, history: [freshSerialized], historyIndex: 0, isDirty: false });
  },

  markClean: () => set({ isDirty: false }),
  markDirty: () => set({ isDirty: true }),
}));
