import type { TropicalCSRGraph } from './TropicalShortestPaths.js';

export const TROPICAL_INF = 1e30;

export interface WeightedEdge {
  from: number;
  to: number;
  weight: number;
}

/** Validate CSR graph shape and bounds. Throws with actionable details on mismatch. */
export function assertGraphShape(graph: TropicalCSRGraph): void {
  const n = graph.rowPtr.length - 1;
  if (n < 0) {
    throw new Error('rowPtr must contain at least one element');
  }
  if (graph.colIdx.length !== graph.values.length) {
    throw new Error(
      `colIdx length (${graph.colIdx.length}) must equal values length (${graph.values.length})`
    );
  }
  if (graph.rowPtr.length === 0 || graph.rowPtr[0] !== 0) {
    throw new Error('rowPtr must start at 0');
  }
  for (let i = 0; i < graph.rowPtr.length - 1; i++) {
    if (graph.rowPtr[i] > graph.rowPtr[i + 1]) {
      throw new Error(`rowPtr must be non-decreasing; violation at index ${i}`);
    }
  }
  if (graph.rowPtr[n] !== graph.colIdx.length) {
    throw new Error(
      `rowPtr[last] (${graph.rowPtr[n]}) must equal edge count (${graph.colIdx.length})`
    );
  }
  for (let edge = 0; edge < graph.colIdx.length; edge++) {
    const col = graph.colIdx[edge];
    if (col < 0 || col >= n) {
      throw new Error(`colIdx[${edge}] out of bounds: ${col} not in [0, ${n - 1}]`);
    }
  }
}

/**
 * Normalize an adjacency matrix for tropical shortest paths.
 *
 * - Diagonal forced to 0
 * - Non-finite entries replaced with INF sentinel
 */
export function normalizeAdjacency(adjacency: Float32Array, n: number): Float32Array {
  if (adjacency.length !== n * n) {
    throw new Error(`adjacency length (${adjacency.length}) must equal n*n (${n * n})`);
  }

  const out = new Float32Array(adjacency.length);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const idx = i * n + j;
      if (i === j) {
        out[idx] = 0;
      } else {
        const value = adjacency[idx];
        out[idx] = Number.isFinite(value) ? value : TROPICAL_INF;
      }
    }
  }
  return out;
}

/** Dense (row-major) adjacency matrix -> CSR graph. */
export function denseToCSR(adjacency: Float32Array, n: number): TropicalCSRGraph {
  if (adjacency.length !== n * n) {
    throw new Error(`adjacency length (${adjacency.length}) must equal n*n (${n * n})`);
  }

  const rowPtr = new Uint32Array(n + 1);
  const colIdx: number[] = [];
  const values: number[] = [];

  for (let row = 0; row < n; row++) {
    rowPtr[row] = colIdx.length;
    for (let col = 0; col < n; col++) {
      if (row === col) continue;
      const weight = adjacency[row * n + col];
      if (Number.isFinite(weight) && weight < TROPICAL_INF) {
        colIdx.push(col);
        values.push(weight);
      }
    }
  }

  rowPtr[n] = colIdx.length;

  return {
    rowPtr,
    colIdx: new Uint32Array(colIdx),
    values: new Float32Array(values),
  };
}

/** Build CSR from edge list. Duplicate edges keep the smallest weight. */
export function fromEdges(nodeCount: number, edges: WeightedEdge[]): TropicalCSRGraph {
  const minWeightByEdge = new Map<string, number>();

  for (const edge of edges) {
    if (edge.from < 0 || edge.from >= nodeCount || edge.to < 0 || edge.to >= nodeCount) {
      throw new Error(
        `Edge out of bounds: (${edge.from} -> ${edge.to}) for nodeCount=${nodeCount}`
      );
    }
    if (!Number.isFinite(edge.weight) || edge.weight < 0) {
      throw new Error(`Edge weight must be finite and non-negative: ${edge.weight}`);
    }

    const key = `${edge.from}:${edge.to}`;
    const prev = minWeightByEdge.get(key);
    if (prev === undefined || edge.weight < prev) {
      minWeightByEdge.set(key, edge.weight);
    }
  }

  const grouped = new Map<number, Array<{ to: number; weight: number }>>();
  for (const [key, weight] of minWeightByEdge) {
    const [fromRaw, toRaw] = key.split(':');
    const from = Number(fromRaw);
    const to = Number(toRaw);
    if (!grouped.has(from)) grouped.set(from, []);
    grouped.get(from)!.push({ to, weight });
  }

  const rowPtr = new Uint32Array(nodeCount + 1);
  const colIdx: number[] = [];
  const values: number[] = [];

  for (let from = 0; from < nodeCount; from++) {
    rowPtr[from] = colIdx.length;
    const outgoing = grouped.get(from) ?? [];
    outgoing.sort((a, b) => a.to - b.to || a.weight - b.weight);
    for (const edge of outgoing) {
      if (from === edge.to) continue;
      colIdx.push(edge.to);
      values.push(edge.weight);
    }
  }
  rowPtr[nodeCount] = colIdx.length;

  const graph = {
    rowPtr,
    colIdx: new Uint32Array(colIdx),
    values: new Float32Array(values),
  };
  assertGraphShape(graph);
  return graph;
}

/** CSR graph -> dense (row-major) adjacency matrix. */
export function csrToDense(graph: TropicalCSRGraph): Float32Array {
  assertGraphShape(graph);
  const n = graph.rowPtr.length - 1;
  const out = new Float32Array(n * n).fill(TROPICAL_INF);

  for (let i = 0; i < n; i++) {
    out[i * n + i] = 0;
    const start = graph.rowPtr[i];
    const finish = graph.rowPtr[i + 1];
    for (let edge = start; edge < finish; edge++) {
      const j = graph.colIdx[edge];
      out[i * n + j] = graph.values[edge];
    }
  }

  return out;
}
