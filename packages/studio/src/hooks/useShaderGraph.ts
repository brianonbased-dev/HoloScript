'use client';
/**
 * useShaderGraph — Zustand store for node-based shader editing.
 *
 * Works as both a React hook (useShaderGraph()) and a store
 * with direct access (useShaderGraph.getState()).
 *
 * Features: undo/redo, dirty tracking, serialization, cycle-safe connections.
 */
import { create } from 'zustand';
import {
  ShaderGraph,
  SHADER_NODES,
  type ShaderNode,
  type ShaderConnection,
  type CompiledShader,
} from '@holoscript/core';

// Re-export ShaderGraph for consumers
export { ShaderGraph };
export type { ShaderNode, ShaderConnection, CompiledShader };

/** Snapshot of graph state for undo/redo. */
interface GraphSnapshot {
  json: string;
}

const MAX_HISTORY_SIZE = 50;

export interface ShaderGraphState {
  graph: ShaderGraph;
  nodes: ShaderNode[];
  connections: ShaderConnection[];
  compiled: CompiledShader | null;
  nodeTypes: string[];

  // Dirty tracking
  isDirty: boolean;
  markDirty: () => void;
  markClean: () => void;

  // History / undo-redo
  history: GraphSnapshot[];
  historyIndex: number;
  maxHistorySize: number;
  canUndo: () => boolean;
  canRedo: () => boolean;
  undo: () => void;
  redo: () => void;

  // Legacy hook API (backwards compatible)
  addNode: (type: string) => ShaderNode | null;
  removeNode: (id: string) => void;
  connect: (fromNode: string, fromPort: string, toNode: string, toPort: string) => void;
  compile: () => CompiledShader;
  buildDemo: () => void;
  clear: () => void;

  // Enriched store API
  createNode: (type: string, position: { x: number; y: number }) => ShaderNode | null;
  deleteNode: (id: string) => void;
  deleteNodes: (ids: string[]) => void;
  updateNode: (id: string, props: Record<string, unknown>) => void;
  setNodePosition: (id: string, x: number, y: number) => void;
  setNodeProperty: (id: string, key: string, value: unknown) => void;
  disconnect: (nodeId: string, portId: string) => void;
  clearGraph: () => void;

  // Serialization
  serializeGraph: () => string;
  loadGraph: (json: string) => void;
}

function syncGraph(graph: ShaderGraph) {
  return {
    nodes: graph.getNodes(),
    connections: graph.getConnections(),
  };
}

function takeSnapshot(graph: ShaderGraph): GraphSnapshot {
  return { json: graph.serialize() };
}

function restoreSnapshot(snapshot: GraphSnapshot): ShaderGraph {
  return ShaderGraph.deserialize(snapshot.json);
}

export const useShaderGraph = create<ShaderGraphState>((set, get) => {
  const graph = new ShaderGraph('Untitled Shader');
  const initialSnapshot = takeSnapshot(graph);

  /** Push a history entry (call after state-changing mutations, NOT position). */
  function pushHistory() {
    const state = get();
    const snapshot = takeSnapshot(state.graph);
    // Trim any redo history beyond current index
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(snapshot);
    // Cap at max size
    if (newHistory.length > MAX_HISTORY_SIZE) {
      newHistory.shift();
    }
    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isDirty: true,
    });
  }

  return {
    graph,
    nodes: [],
    connections: [],
    compiled: null,
    nodeTypes: Object.keys(SHADER_NODES),

    // Dirty state
    isDirty: false,
    markDirty: () => set({ isDirty: true }),
    markClean: () => set({ isDirty: false }),

    // History
    history: [initialSnapshot],
    historyIndex: 0,
    maxHistorySize: MAX_HISTORY_SIZE,

    canUndo: () => {
      const { historyIndex } = get();
      return historyIndex > 0;
    },

    canRedo: () => {
      const { history, historyIndex } = get();
      return historyIndex < history.length - 1;
    },

    undo: () => {
      const { history, historyIndex } = get();
      if (historyIndex <= 0) return;
      const newIndex = historyIndex - 1;
      const restored = restoreSnapshot(history[newIndex]);
      set({
        graph: restored,
        ...syncGraph(restored),
        historyIndex: newIndex,
        isDirty: true,
      });
    },

    redo: () => {
      const { history, historyIndex } = get();
      if (historyIndex >= history.length - 1) return;
      const newIndex = historyIndex + 1;
      const restored = restoreSnapshot(history[newIndex]);
      set({
        graph: restored,
        ...syncGraph(restored),
        historyIndex: newIndex,
        isDirty: true,
      });
    },

    // Legacy API
    addNode: (type: string) => {
      const { graph } = get();
      const x = Math.random() * 200;
      const y = Math.random() * 200;
      const n = graph.addNode(type, x, y);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
      return n;
    },

    removeNode: (id: string) => {
      const { graph } = get();
      graph.removeNode(id);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
    },

    connect: (fromNode: string, fromPort: string, toNode: string, toPort: string) => {
      const { graph } = get();
      const conn = graph.connect(fromNode, fromPort, toNode, toPort);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
      return conn;
    },

    compile: () => {
      const { graph } = get();
      const result = graph.compile();
      set({ compiled: result });
      return result;
    },

    buildDemo: () => {
      const newGraph = new ShaderGraph('demo');
      const color = newGraph.addNode('Color', 0, 0, { color: [0.2, 0.5, 1.0, 1.0] });
      const tex = newGraph.addNode('Texture', 200, 0);
      const fresnel = newGraph.addNode('Fresnel', 200, 200);
      const output = newGraph.addNode('Output', 600, 100);
      if (color && tex && fresnel && output) {
        newGraph.connect(color.id, 'rgba', output.id, 'albedo');
      }
      const compiled = newGraph.compile();
      set({ graph: newGraph, ...syncGraph(newGraph), compiled, isDirty: true });
    },

    clear: () => {
      const newGraph = new ShaderGraph('Untitled Shader');
      const snapshot = takeSnapshot(newGraph);
      set({
        graph: newGraph, nodes: [], connections: [], compiled: null,
        isDirty: false, history: [snapshot], historyIndex: 0,
      });
    },

    // Enriched API
    createNode: (type: string, position: { x: number; y: number }) => {
      const { graph } = get();
      const n = graph.createNode(type, position);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
      return n;
    },

    deleteNode: (id: string) => {
      const { graph } = get();
      graph.removeNode(id);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
    },

    deleteNodes: (ids: string[]) => {
      const { graph } = get();
      for (const id of ids) graph.removeNode(id);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
    },

    updateNode: (id: string, props: Record<string, unknown>) => {
      const { graph } = get();
      const node = graph.getNode(id);
      if (!node) return;
      Object.assign(node, props);
      graph.version++;
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
    },

    setNodePosition: (id: string, x: number, y: number) => {
      const { graph } = get();
      graph.setNodePosition(id, x, y);
      // Position updates do NOT push history (avoid spam)
      set(syncGraph(graph));
    },

    setNodeProperty: (id: string, key: string, value: unknown) => {
      const { graph } = get();
      graph.setNodeProperty(id, key, value);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
    },

    disconnect: (nodeId: string, portId: string) => {
      const { graph } = get();
      graph.disconnectPort(nodeId, portId);
      set({ ...syncGraph(graph), isDirty: true });
      pushHistory();
    },

    clearGraph: () => {
      const newGraph = new ShaderGraph('Untitled Shader');
      const snapshot = takeSnapshot(newGraph);
      set({
        graph: newGraph, nodes: [], connections: [], compiled: null,
        isDirty: false, history: [snapshot], historyIndex: 0,
      });
    },

    // Serialization
    serializeGraph: () => {
      const { graph } = get();
      const nodes = graph.getNodes();
      const connections = graph.getConnections();
      return JSON.stringify({ name: graph.name, nodes, connections });
    },

    loadGraph: (json: string) => {
      const data = JSON.parse(json);
      const newGraph = new ShaderGraph(data.name ?? 'Untitled Shader');
      for (const node of data.nodes ?? []) {
        newGraph.addCustomNode(node);
      }
      newGraph.connections = data.connections ?? [];
      const snapshot = takeSnapshot(newGraph);
      set({
        graph: newGraph,
        ...syncGraph(newGraph),
        isDirty: false,
        history: [snapshot],
        historyIndex: 0,
      });
    },
  };
});
