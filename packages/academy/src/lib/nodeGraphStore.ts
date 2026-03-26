/**
 * nodeGraphStore — Zustand store for the visual node graph editor
 *
 * Stores React Flow nodes + edges, and the compiled GLSL output.
 * Persists graph JSON to sceneStore so it round-trips through .holo files.
 */

import { create } from 'zustand';
import type { Node, Edge } from 'reactflow';

// ─── Node data shapes ─────────────────────────────────────────────────────────

export interface ConstantNodeData {
  type: 'constant';
  label: string;
  value: number;
}

export interface MathNodeData {
  type: 'math';
  label: string;
  op:
    | 'add'
    | 'sub'
    | 'mul'
    | 'div'
    | 'pow'
    | 'sin'
    | 'cos'
    | 'max'
    | 'min'
    | 'mix'
    | 'dot'
    | 'length'
    | 'voronoi'
    | 'gradient'
    | 'fract'
    | 'smoothstep';
}

export interface TextureNodeData {
  type: 'texture';
  label: string;
  uniformName: string; // e.g. uTexture0
}

export interface UVNodeData {
  type: 'uv';
  label: string;
  channel: number;
}

export interface TimeNodeData {
  type: 'time';
  label: string;
}

export interface OutputNodeData {
  type: 'output';
  label: string;
  outputType: 'fragColor' | 'albedo' | 'emission';
}

export type GNodeData =
  | ConstantNodeData
  | MathNodeData
  | TextureNodeData
  | UVNodeData
  | TimeNodeData
  | OutputNodeData;

export type GNode = Node<GNodeData>;
export type GEdge = Edge;

// ─── Default starter graph ────────────────────────────────────────────────────

const DEFAULT_NODES: GNode[] = [
  {
    id: 'uv',
    type: 'uvNode',
    position: { x: 60, y: 140 },
    data: { type: 'uv', label: 'UV', channel: 0 },
  },
  {
    id: 'time',
    type: 'timeNode',
    position: { x: 60, y: 260 },
    data: { type: 'time', label: 'Time' },
  },
  {
    id: 'sin',
    type: 'mathNode',
    position: { x: 320, y: 180 },
    data: { type: 'math', label: 'Sin', op: 'sin' },
  },
  {
    id: 'out',
    type: 'outputNode',
    position: { x: 560, y: 160 },
    data: { type: 'output', label: 'Fragment Color', outputType: 'fragColor' },
  },
];

const DEFAULT_EDGES: GEdge[] = [
  { id: 'e-time-sin', source: 'time', target: 'sin', sourceHandle: 'out', targetHandle: 'a' },
  { id: 'e-sin-out', source: 'sin', target: 'out', sourceHandle: 'out', targetHandle: 'rgb' },
];

// ─── Store ────────────────────────────────────────────────────────────────────

interface NodeGraphState {
  nodes: GNode[];
  edges: GEdge[];
  compiledGLSL: string;
  setNodes: (nodes: GNode[] | ((prev: GNode[]) => GNode[])) => void;
  setEdges: (edges: GEdge[] | ((prev: GEdge[]) => GEdge[])) => void;
  setCompiledGLSL: (glsl: string) => void;
  reset: () => void;
}

export const useNodeGraphStore = create<NodeGraphState>((set) => ({
  nodes: DEFAULT_NODES,
  edges: DEFAULT_EDGES,
  compiledGLSL: '',

  setNodes: (nodes) =>
    set((s) => ({
      nodes: typeof nodes === 'function' ? nodes(s.nodes) : nodes,
    })),

  setEdges: (edges) =>
    set((s) => ({
      edges: typeof edges === 'function' ? edges(s.edges) : edges,
    })),

  setCompiledGLSL: (compiledGLSL) => set({ compiledGLSL }),

  reset: () => set({ nodes: DEFAULT_NODES, edges: DEFAULT_EDGES, compiledGLSL: '' }),
}));
