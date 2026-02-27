/**
 * sceneUtils.ts
 *
 * Pure utility functions for scene graph and project management operations.
 * No side effects — all functions return new objects (immutable patterns).
 */

import type { SceneNode } from './store';
import type { ProjectScene } from './projectStore';

// ── Scene Node Utilities ─────────────────────────────────────────────────────

/**
 * Deep-clone a SceneNode with a new ID.
 * The clone is detached (parentId = originalNode.parentId by default,
 * or override with `newParentId`).
 */
export function duplicateNode(
  node: SceneNode,
  newId: string,
  newParentId?: string | null,
): SceneNode {
  return {
    ...node,
    id: newId,
    name: `${node.name} Copy`,
    parentId: newParentId !== undefined ? newParentId : node.parentId,
    traits: node.traits.map(t => ({ ...t, properties: { ...t.properties } })),
    position: [...node.position] as [number, number, number],
    rotation: [...node.rotation] as [number, number, number],
    scale:    [...node.scale]    as [number, number, number],
  };
}

/**
 * Create a group node that contains the given child IDs.
 * Children's parentIds updated to point to the group.
 *
 * Returns `{ group, updatedChildren }` — caller merges into the store.
 */
export function groupNodes(
  nodes: SceneNode[],
  groupId: string,
  groupName = 'Group',
  parentId: string | null = null,
): { group: SceneNode; updatedChildren: SceneNode[] } {
  const group: SceneNode = {
    id: groupId,
    name: groupName,
    type: 'group',
    parentId,
    traits: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  };
  const updatedChildren = nodes.map(n => ({ ...n, parentId: groupId }));
  return { group, updatedChildren };
}

/**
 * Flatten a scene graph into a display list ordered by depth-first traversal.
 * Returns nodes with a `depth` field for indentation.
 */
export function flattenSceneGraph(
  nodes: SceneNode[],
): Array<SceneNode & { depth: number }> {
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const children = new Map<string | null, SceneNode[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key)!.push(n);
  }

  const result: Array<SceneNode & { depth: number }> = [];
  function visit(id: string | null, depth: number) {
    for (const node of children.get(id) ?? []) {
      result.push({ ...node, depth });
      visit(node.id, depth + 1);
    }
  }
  visit(null, 0);
  return result;
}

/**
 * Get all descendants of a node (recursive).
 */
export function getDescendants(nodes: SceneNode[], nodeId: string): SceneNode[] {
  const result: SceneNode[] = [];
  const children = nodes.filter(n => n.parentId === nodeId);
  for (const child of children) {
    result.push(child, ...getDescendants(nodes, child.id));
  }
  return result;
}

/**
 * Remove a node and all its descendants from the scene graph.
 */
export function removeNodeWithDescendants(nodes: SceneNode[], nodeId: string): SceneNode[] {
  const toRemove = new Set([nodeId, ...getDescendants(nodes, nodeId).map(n => n.id)]);
  return nodes.filter(n => !toRemove.has(n.id));
}

// ── Project Scene Utilities ──────────────────────────────────────────────────

/**
 * Reorder a scenes array by moving the item at `fromIdx` to `toIdx`.
 * Returns a new array without mutating the original.
 */
export function reorderScenes(scenes: ProjectScene[], fromIdx: number, toIdx: number): ProjectScene[] {
  if (fromIdx === toIdx) return scenes;
  const copy = [...scenes];
  const [item] = copy.splice(fromIdx, 1);
  if (item === undefined) return scenes;
  copy.splice(toIdx, 0, item);
  return copy;
}

/**
 * Duplicate a scene with a new ID. The copy is dirty=true by default.
 */
export function duplicateScene(scene: ProjectScene, newId: string, newName?: string): ProjectScene {
  return {
    ...scene,
    id: newId,
    name: newName ?? `${scene.name} Copy`,
    isDirty: true,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Sort scenes alphabetically by name. Returns a new array.
 */
export function sortScenesAlpha(scenes: ProjectScene[]): ProjectScene[] {
  return [...scenes].sort((a, b) => a.name.localeCompare(b.name));
}

// ── Node Transform Helpers ───────────────────────────────────────────────────

/** Compute the world-space bounding box of a set of node positions. */
export function computeBounds(nodes: SceneNode[]): {
  min: [number,number,number]; max: [number,number,number]; center: [number,number,number];
} {
  if (nodes.length === 0) return { min:[0,0,0], max:[0,0,0], center:[0,0,0] };
  let minX=Infinity, minY=Infinity, minZ=Infinity;
  let maxX=-Infinity, maxY=-Infinity, maxZ=-Infinity;
  for (const n of nodes) {
    const [x,y,z] = n.position;
    if (x < minX) minX=x;  if (x > maxX) maxX=x;
    if (y < minY) minY=y;  if (y > maxY) maxY=y;
    if (z < minZ) minZ=z;  if (z > maxZ) maxZ=z;
  }
  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center: [(minX+maxX)/2, (minY+maxY)/2, (minZ+maxZ)/2],
  };
}
