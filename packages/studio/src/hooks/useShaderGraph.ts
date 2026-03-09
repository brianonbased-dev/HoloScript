'use client';
/**
 * useShaderGraph — Zustand store for node-based shader editing.
 *
 * Works as both a React hook (useShaderGraph()) and a store
 * with direct access (useShaderGraph.getState()).
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

export interface ShaderGraphState {
  graph: ShaderGraph;
  nodes: ShaderNode[];
  connections: ShaderConnection[];
  compiled: CompiledShader | null;
  nodeTypes: string[];

  // Legacy hook API (backwards compatible)
  addNode: (type: string) => ShaderNode | null;
  removeNode: (id: string) => void;
  connect: (fromNode: string, fromPort: string, toNode: string, toPort: string) => void;
  compile: () => CompiledShader;
  buildDemo: () => void;
  clear: () => void;

  // Enriched store API (for shader-graph-artist scenario)
  createNode: (type: string, position: { x: number; y: number }) => ShaderNode | null;
  deleteNodes: (ids: string[]) => void;
  setNodePosition: (id: string, x: number, y: number) => void;
  setNodeProperty: (id: string, key: string, value: unknown) => void;
  clearGraph: () => void;
}

function syncGraph(graph: ShaderGraph) {
  return {
    nodes: graph.getNodes(),
    connections: graph.getConnections(),
  };
}

export const useShaderGraph = create<ShaderGraphState>((set, get) => {
  const graph = new ShaderGraph();

  return {
    graph,
    nodes: [],
    connections: [],
    compiled: null,
    nodeTypes: Object.keys(SHADER_NODES),

    addNode: (type: string) => {
      const { graph } = get();
      const x = Math.random() * 200;
      const y = Math.random() * 200;
      const n = graph.addNode(type, x, y);
      set(syncGraph(graph));
      return n;
    },

    removeNode: (id: string) => {
      const { graph } = get();
      graph.removeNode(id);
      set(syncGraph(graph));
    },

    connect: (fromNode: string, fromPort: string, toNode: string, toPort: string) => {
      const { graph } = get();
      graph.connect(fromNode, fromPort, toNode, toPort);
      set(syncGraph(graph));
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
      set({ graph: newGraph, ...syncGraph(newGraph), compiled });
    },

    clear: () => {
      const newGraph = new ShaderGraph();
      set({ graph: newGraph, nodes: [], connections: [], compiled: null });
    },

    createNode: (type: string, position: { x: number; y: number }) => {
      const { graph } = get();
      const n = graph.createNode(type, position);
      set(syncGraph(graph));
      return n;
    },

    deleteNodes: (ids: string[]) => {
      const { graph } = get();
      for (const id of ids) graph.removeNode(id);
      set(syncGraph(graph));
    },

    setNodePosition: (id: string, x: number, y: number) => {
      const { graph } = get();
      graph.setNodePosition(id, x, y);
      set(syncGraph(graph));
    },

    setNodeProperty: (id: string, key: string, value: unknown) => {
      const { graph } = get();
      graph.setNodeProperty(id, key, value);
      set(syncGraph(graph));
    },

    clearGraph: () => {
      const newGraph = new ShaderGraph();
      set({ graph: newGraph, nodes: [], connections: [], compiled: null });
    },
  };
});
