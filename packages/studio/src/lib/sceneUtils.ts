/**
 * sceneUtils.ts — Scene Operations
 *
 * Common utilities for scene graph manipulation, traversal, and queries.
 */

// Re-export scene graph utilities (including duplicateNode which supersedes the local version)
export {
  duplicateNode,
  groupNodes,
  flattenSceneGraph,
  getDescendants,
  removeNodeWithDescendants,
  reorderScenes,
  duplicateScene,
  sortScenesAlpha,
  computeBounds,
} from './scene/sceneUtils';

import type { SceneNode } from './serializer';

export interface BoundingBox {
  min: [number, number, number];
  max: [number, number, number];
}

/**
 * Flatten a scene tree into a flat list.
 */
export function flattenScene(nodes: SceneNode[]): SceneNode[] {
  const flat: SceneNode[] = [];
  function walk(list: SceneNode[]) {
    for (const n of list) {
      flat.push(n);
      walk(n.children);
    }
  }
  walk(nodes);
  return flat;
}

/**
 * Group nodes by type.
 */
export function groupByType(nodes: SceneNode[]): Record<string, SceneNode[]> {
  const groups: Record<string, SceneNode[]> = {};
  for (const n of flattenScene(nodes)) {
    if (!groups[n.type]) groups[n.type] = [];
    groups[n.type].push(n);
  }
  return groups;
}

/**
 * Find nodes matching a predicate.
 */
export function findNodes(nodes: SceneNode[], predicate: (n: SceneNode) => boolean): SceneNode[] {
  return flattenScene(nodes).filter(predicate);
}

/**
 * Find nodes with a specific trait.
 */
export function nodesWithTrait(nodes: SceneNode[], trait: string): SceneNode[] {
  return findNodes(nodes, (n) => n.traits.includes(trait));
}

/**
 * Calculate the AABB bounding box of a set of nodes.
 */
export function sceneBounds(nodes: SceneNode[]): BoundingBox {
  const flat = flattenScene(nodes);
  if (flat.length === 0) {
    return { min: [0, 0, 0], max: [0, 0, 0] };
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (const n of flat) {
    const pos = n.position;
    min[0] = Math.min(min[0], pos[0]);
    min[1] = Math.min(min[1], pos[1]);
    min[2] = Math.min(min[2], pos[2]);
    max[0] = Math.max(max[0], pos[0]);
    max[1] = Math.max(max[1], pos[1]);
    max[2] = Math.max(max[2], pos[2]);
  }

  return { min, max };
}

/**
 * Calculate the center of a bounding box.
 */
export function boundsCenter(bounds: BoundingBox): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

/**
 * Calculate scene statistics.
 */
export function sceneStats(nodes: SceneNode[]): {
  totalNodes: number;
  byType: Record<string, number>;
  maxDepth: number;
  uniqueTraits: string[];
} {
  const flat = flattenScene(nodes);
  const byType: Record<string, number> = {};
  const traits = new Set<string>();

  for (const n of flat) {
    byType[n.type] = (byType[n.type] || 0) + 1;
    n.traits.forEach((t) => traits.add(t));
  }

  function depth(list: SceneNode[], d: number): number {
    if (list.length === 0) return d;
    return Math.max(...list.map((n) => depth(n.children, d + 1)));
  }

  return {
    totalNodes: flat.length,
    byType,
    maxDepth: depth(nodes, 0),
    uniqueTraits: [...traits].sort(),
  };
}

/**
 * Rename a node by ID (returns new tree).
 */
export function renameNode(nodes: SceneNode[], id: string, newName: string): SceneNode[] {
  return nodes.map((n) => {
    if (n.id === id) return { ...n, name: newName };
    return { ...n, children: renameNode(n.children, id, newName) };
  });
}

/**
 * Remove a node by ID (returns new tree).
 */
export function removeNode(nodes: SceneNode[], id: string): SceneNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: removeNode(n.children, id) }));
}

// duplicateNode is re-exported from ./scene/sceneUtils (flat parentId version)
