import type { TropicalCSRGraph } from './TropicalShortestPaths.js';

export const TROPICAL_INF = 1e30;

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

/** CSR graph -> dense (row-major) adjacency matrix. */
export function csrToDense(graph: TropicalCSRGraph): Float32Array {
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
