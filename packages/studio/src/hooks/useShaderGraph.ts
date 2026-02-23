/**
 * Shader Graph State Management Hook
 *
 * Zustand store for managing shader graph state
 */

import { create } from 'zustand';
import { ShaderGraph } from '@holoscript/core/shader/graph';
import type { IShaderNode, IShaderConnection } from '@holoscript/core/shader/graph/ShaderGraphTypes';

interface ShaderGraphState {
  // Graph instance
  graph: ShaderGraph;

  // Dirty flag for auto-save
  isDirty: boolean;

  // History for undo/redo
  history: string[];
  historyIndex: number;
  maxHistorySize: number;

  // Actions
  createNode: (type: string, position: { x: number; y: number }) => IShaderNode | null;
  updateNode: (nodeId: string, updates: Partial<IShaderNode>) => void;
  deleteNode: (nodeId: string) => void;
  deleteNodes: (nodeIds: string[]) => void;

  connect: (fromNodeId: string, fromPortId: string, toNodeId: string, toPortId: string) => IShaderConnection | null;
  disconnect: (nodeId: string, portId: string) => void;

  setNodeProperty: (nodeId: string, key: string, value: unknown) => void;
  setNodePosition: (nodeId: string, x: number, y: number) => void;

  // History actions
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Graph operations
  loadGraph: (serialized: string) => void;
  serializeGraph: () => string;
  clearGraph: () => void;

  // Utility
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
    if (node) {
      pushHistory();
      set({ isDirty: true });
    }
    return node;
  },

  updateNode: (nodeId, updates) => {
    const { graph, pushHistory } = get();
    const node = graph.getNode(nodeId);
    if (node) {
      Object.assign(node, updates);
      pushHistory();
      set({ isDirty: true });
    }
  },

  deleteNode: (nodeId) => {
    const { graph, pushHistory } = get();
    if (graph.removeNode(nodeId)) {
      pushHistory();
      set({ isDirty: true });
    }
  },

  deleteNodes: (nodeIds) => {
    const { graph, pushHistory } = get();
    let deleted = false;
    for (const nodeId of nodeIds) {
      if (graph.removeNode(nodeId)) {
        deleted = true;
      }
    }
    if (deleted) {
      pushHistory();
      set({ isDirty: true });
    }
  },

  connect: (fromNodeId, fromPortId, toNodeId, toPortId) => {
    const { graph, pushHistory } = get();
    const connection = graph.connect(fromNodeId, fromPortId, toNodeId, toPortId);
    if (connection) {
      pushHistory();
      set({ isDirty: true });
    }
    return connection;
  },

  disconnect: (nodeId, portId) => {
    const { graph, pushHistory } = get();
    if (graph.disconnectPort(nodeId, portId)) {
      pushHistory();
      set({ isDirty: true });
    }
  },

  setNodeProperty: (nodeId, key, value) => {
    const { graph, pushHistory } = get();
    if (graph.setNodeProperty(nodeId, key, value)) {
      pushHistory();
      set({ isDirty: true });
    }
  },

  setNodePosition: (nodeId, x, y) => {
    const { graph } = get();
    graph.setNodePosition(nodeId, x, y);
    // Don't push to history or mark dirty for position changes
    set({}); // Force re-render
  },

  pushHistory: () => {
    const { graph, history, historyIndex, maxHistorySize } = get();
    const serialized = graph.serialize();

    // Remove future history if we're not at the end
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(serialized);

    // Limit history size
    if (newHistory.length > maxHistorySize) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const serialized = history[newIndex];
      const newGraph = ShaderGraph.deserialize(serialized);
      set({
        graph: newGraph,
        historyIndex: newIndex,
        isDirty: true,
      });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const serialized = history[newIndex];
      const newGraph = ShaderGraph.deserialize(serialized);
      set({
        graph: newGraph,
        historyIndex: newIndex,
        isDirty: true,
      });
    }
  },

  canUndo: () => {
    const { historyIndex } = get();
    return historyIndex > 0;
  },

  canRedo: () => {
    const { history, historyIndex } = get();
    return historyIndex < history.length - 1;
  },

  loadGraph: (serialized) => {
    const newGraph = ShaderGraph.deserialize(serialized);
    set({
      graph: newGraph,
      history: [serialized],
      historyIndex: 0,
      isDirty: false,
    });
  },

  serializeGraph: () => {
    const { graph } = get();
    return graph.serialize();
  },

  clearGraph: () => {
    const newGraph = new ShaderGraph('Untitled Shader');
    set({
      graph: newGraph,
      history: [],
      historyIndex: -1,
      isDirty: false,
    });
  },

  markClean: () => {
    set({ isDirty: false });
  },

  markDirty: () => {
    set({ isDirty: true });
  },
}));
