/**
 * HoloScript Visual - Graph Store
 *
 * Zustand store for managing the visual graph state with undo/redo support.
 */

import { create } from 'zustand';
import {
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from 'reactflow';
import type { HoloNode, HoloEdge, VisualGraph, HistoryEntry, GraphMetadata } from '../types';
import { getNodeDefinition } from '../nodes/nodeRegistry';

/**
 * Maximum undo history entries
 */
const MAX_HISTORY = 50;

/**
 * Graph store state interface
 */
interface GraphState {
  // Graph data
  nodes: HoloNode[];
  edges: HoloEdge[];
  metadata: GraphMetadata;

  // Selection
  selectedNodes: string[];
  selectedEdges: string[];

  // History for undo/redo
  history: HistoryEntry[];
  historyIndex: number;

  // Actions
  setNodes: (nodes: HoloNode[]) => void;
  setEdges: (edges: HoloEdge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Node operations
  addNode: (type: string, position: { x: number; y: number }) => string;
  removeNode: (nodeId: string) => void;
  updateNodeProperty: (nodeId: string, property: string, value: unknown) => void;
  duplicateNodes: (nodeIds: string[]) => void;

  // Selection
  setSelectedNodes: (nodeIds: string[]) => void;
  setSelectedEdges: (edgeIds: string[]) => void;
  selectAll: () => void;
  deselectAll: () => void;

  // History
  undo: () => void;
  redo: () => void;
  pushHistory: (description: string) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Graph operations
  clear: () => void;
  loadGraph: (graph: VisualGraph) => void;
  exportGraph: () => VisualGraph;
  setMetadata: (metadata: Partial<GraphMetadata>) => void;
}

/**
 * Generate unique node ID
 */
function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique edge ID
 */
function generateEdgeId(source: string, target: string): string {
  return `edge_${source}_${target}_${Date.now()}`;
}

/**
 * Create default metadata
 */
function createDefaultMetadata(): GraphMetadata {
  const now = new Date().toISOString();
  return {
    name: 'Untitled Graph',
    description: '',
    version: '1.0.0',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Graph store
 */
export const useGraphStore = create<GraphState>((set, get) => ({
  // Initial state
  nodes: [],
  edges: [],
  metadata: createDefaultMetadata(),
  selectedNodes: [],
  selectedEdges: [],
  history: [],
  historyIndex: -1,

  // Set nodes directly
  setNodes: (nodes) => set({ nodes }),

  // Set edges directly
  setEdges: (edges) => set({ edges }),

  // Handle node changes from React Flow
  onNodesChange: (changes) => {
    set((state) => ({
      nodes: applyNodeChanges(changes, state.nodes) as HoloNode[],
    }));
  },

  // Handle edge changes from React Flow
  onEdgesChange: (changes) => {
    set((state) => ({
      edges: applyEdgeChanges(changes, state.edges) as HoloEdge[],
    }));
  },

  // Handle new connection
  onConnect: (connection) => {
    set((state) => {
      const newEdge: HoloEdge = {
        ...connection,
        id: generateEdgeId(connection.source!, connection.target!),
        data: {
          sourcePort: connection.sourceHandle || 'default',
          targetPort: connection.targetHandle || 'default',
          flowType: 'flow',
        },
      } as HoloEdge;

      return {
        edges: addEdge(newEdge, state.edges) as HoloEdge[],
      };
    });

    get().pushHistory('Connect nodes');
  },

  // Add a new node
  addNode: (type, position) => {
    const definition = getNodeDefinition(type);
    if (!definition) {
      console.error(`Unknown node type: ${type}`);
      return '';
    }

    const id = generateNodeId();
    const newNode: HoloNode = {
      id,
      type: 'holoNode', // Custom node component type
      position,
      data: {
        type: definition.type,
        label: definition.label,
        category: definition.category,
        properties:
          definition.properties?.reduce<Record<string, unknown>>((acc, prop) => {
            acc[prop.id] = prop.default ?? '';
            return acc;
          }, {}) ?? {},
        inputs: definition.inputs,
        outputs: definition.outputs,
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));

    get().pushHistory(`Add ${definition.label}`);
    return id;
  },

  // Remove a node
  removeNode: (nodeId) => {
    set((state) => ({
      nodes: state.nodes.filter((n) => n.id !== nodeId),
      edges: state.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));

    get().pushHistory('Remove node');
  },

  // Update a node property
  updateNodeProperty: (nodeId, property, value) => {
    set((state) => ({
      nodes: state.nodes.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              properties: {
                ...node.data.properties,
                [property]: value,
              },
            },
          };
        }
        return node;
      }),
    }));

    get().pushHistory(`Update ${property}`);
  },

  // Duplicate selected nodes
  duplicateNodes: (nodeIds) => {
    const state = get();
    const nodesToDuplicate = state.nodes.filter((n) => nodeIds.includes(n.id));
    const offset = { x: 50, y: 50 };

    const newNodes = nodesToDuplicate.map((node) => ({
      ...node,
      id: generateNodeId(),
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      data: { ...node.data },
    }));

    set((state) => ({
      nodes: [...state.nodes, ...newNodes],
      selectedNodes: newNodes.map((n) => n.id),
    }));

    get().pushHistory('Duplicate nodes');
  },

  // Selection
  setSelectedNodes: (nodeIds) => set({ selectedNodes: nodeIds }),
  setSelectedEdges: (edgeIds) => set({ selectedEdges: edgeIds }),

  selectAll: () => {
    const state = get();
    set({
      selectedNodes: state.nodes.map((n) => n.id),
      selectedEdges: state.edges.map((e) => e.id),
    });
  },

  deselectAll: () => set({ selectedNodes: [], selectedEdges: [] }),

  // Push to history
  pushHistory: (description) => {
    const state = get();
    const entry: HistoryEntry = {
      nodes: JSON.parse(JSON.stringify(state.nodes)),
      edges: JSON.parse(JSON.stringify(state.edges)),
      timestamp: Date.now(),
      description,
    };

    // Truncate redo history if we're not at the end
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(entry);

    // Limit history size
    while (newHistory.length > MAX_HISTORY) {
      newHistory.shift();
    }

    set({
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  // Undo
  undo: () => {
    const state = get();
    if (state.historyIndex > 0) {
      const entry = state.history[state.historyIndex - 1];
      set({
        nodes: JSON.parse(JSON.stringify(entry.nodes)),
        edges: JSON.parse(JSON.stringify(entry.edges)),
        historyIndex: state.historyIndex - 1,
      });
    }
  },

  // Redo
  redo: () => {
    const state = get();
    if (state.historyIndex < state.history.length - 1) {
      const entry = state.history[state.historyIndex + 1];
      set({
        nodes: JSON.parse(JSON.stringify(entry.nodes)),
        edges: JSON.parse(JSON.stringify(entry.edges)),
        historyIndex: state.historyIndex + 1,
      });
    }
  },

  canUndo: () => get().historyIndex > 0,
  canRedo: () => get().historyIndex < get().history.length - 1,

  // Clear the graph
  clear: () => {
    set({
      nodes: [],
      edges: [],
      metadata: createDefaultMetadata(),
      selectedNodes: [],
      selectedEdges: [],
      history: [],
      historyIndex: -1,
    });
  },

  // Load a graph
  loadGraph: (graph) => {
    set({
      nodes: graph.nodes,
      edges: graph.edges,
      metadata: graph.metadata,
      selectedNodes: [],
      selectedEdges: [],
      history: [],
      historyIndex: -1,
    });

    get().pushHistory('Load graph');
  },

  // Export the graph
  exportGraph: () => {
    const state = get();
    return {
      nodes: state.nodes,
      edges: state.edges,
      metadata: {
        ...state.metadata,
        updatedAt: new Date().toISOString(),
      },
    };
  },

  // Update metadata
  setMetadata: (metadata) => {
    set((state) => ({
      metadata: {
        ...state.metadata,
        ...metadata,
        updatedAt: new Date().toISOString(),
      },
    }));
  },
}));
