/**
 * Layered Layout (Sugiyama-style)
 *
 * Positions nodes in horizontal layers based on dependency depth.
 * Files that depend on nothing sit at the bottom; files depended on by
 * many sit at the top. Within each layer, nodes are spaced evenly.
 *
 * @version 1.0.0
 */

import type { LayoutNode, LayoutEdge } from './ForceDirectedLayout';

export interface LayeredLayoutOptions {
  /** Vertical spacing between layers (default: 5) */
  layerSpacing?: number;
  /** Horizontal spacing between nodes in same layer (default: 4) */
  nodeSpacing?: number;
  /** Depth spacing for 3D spread (default: 3) */
  depthSpacing?: number;
  /** Maximum columns per layer before wrapping to next depth row (default: 8) */
  maxColumns?: number;
}

export function layeredLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  options: LayeredLayoutOptions = {}
): LayoutNode[] {
  const layerSpacing = options.layerSpacing ?? 5;
  const nodeSpacing = options.nodeSpacing ?? 4;
  const depthSpacing = options.depthSpacing ?? 3;
  const maxColumns = options.maxColumns ?? 8;

  if (nodes.length === 0) return [];

  // Build adjacency for topological sort
  const nodeIndex = new Map<string, number>();
  for (let i = 0; i < nodes.length; i++) {
    nodeIndex.set(nodes[i].id, i);
  }

  const inDegree = new Int32Array(nodes.length);
  const adj: number[][] = Array.from({ length: nodes.length }, () => []);

  for (const edge of edges) {
    const si = nodeIndex.get(edge.source);
    const ti = nodeIndex.get(edge.target);
    if (si === undefined || ti === undefined) continue;
    adj[si].push(ti);
    inDegree[ti]++;
  }

  // Assign layers via longest-path (modified Kahn's algorithm)
  const layer = new Int32Array(nodes.length);
  const queue: number[] = [];

  // Start with nodes that have no incoming edges (leaf dependencies)
  for (let i = 0; i < nodes.length; i++) {
    if (inDegree[i] === 0) {
      queue.push(i);
      layer[i] = 0;
    }
  }

  // BFS to assign layers
  const remaining = new Int32Array(inDegree);
  let head = 0;
  while (head < queue.length) {
    const u = queue[head++];
    for (const v of adj[u]) {
      layer[v] = Math.max(layer[v], layer[u] + 1);
      remaining[v]--;
      if (remaining[v] === 0) {
        queue.push(v);
      }
    }
  }

  // Handle cycles: unvisited nodes get assigned to max layer + 1
  const maxLayer = Math.max(0, ...layer);
  for (let i = 0; i < nodes.length; i++) {
    if (remaining[i] > 0) {
      layer[i] = maxLayer + 1;
    }
  }

  // Group nodes by layer
  const layers: number[][] = [];
  for (let i = 0; i < nodes.length; i++) {
    const l = layer[i];
    while (layers.length <= l) layers.push([]);
    layers[l].push(i);
  }

  // Position nodes
  for (let l = 0; l < layers.length; l++) {
    const nodesInLayer = layers[l];
    const y = l * layerSpacing;

    for (let idx = 0; idx < nodesInLayer.length; idx++) {
      const nodeIdx = nodesInLayer[idx];
      const col = idx % maxColumns;
      const row = Math.floor(idx / maxColumns);

      // Center the layer horizontally
      const layerWidth = Math.min(nodesInLayer.length, maxColumns);
      const offsetX = -((layerWidth - 1) * nodeSpacing) / 2;

      nodes[nodeIdx].x = offsetX + col * nodeSpacing;
      nodes[nodeIdx].y = y;
      nodes[nodeIdx].z = row * depthSpacing;
    }
  }

  return nodes;
}
