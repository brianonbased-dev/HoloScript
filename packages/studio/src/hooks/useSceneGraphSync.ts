'use client';

/**
 * useSceneGraphSync — Flattens the R3F tree into the SceneGraphStore
 *
 * After each parse/compile cycle, walks the R3F tree (including hydrated
 * children from native assets) and creates SceneNode entries so that:
 *   - The Scene Graph Panel shows the full nested hierarchy
 *   - GizmoController can write transform changes back to the store
 *   - Node selection works for all primitives
 */

import { useEffect, useRef } from 'react';
import { useSceneGraphStore } from '@/lib/stores';
import type { SceneNode } from '@/lib/stores/sceneGraphStore';

interface R3FTreeNode {
  id?: string;
  type?: string;
  props?: Record<string, any>;
  children?: R3FTreeNode[];
}

/**
 * Recursively flatten an R3F tree node into SceneNode entries.
 */
function flattenTree(node: R3FTreeNode, parentId: string | null, out: SceneNode[]): void {
  if (!node) return;

  const id = node.id || `node-${out.length}`;
  const props = node.props || {};

  // Only create SceneNode entries for renderable types
  if (node.type === 'mesh' || node.type === 'group') {
    const sceneNode: SceneNode = {
      id,
      name: props.name || props.hsType || id,
      type: node.type === 'group' ? 'group' : 'mesh',
      parentId,
      traits: [],
      position: props.position || [0, 0, 0],
      rotation: props.rotation || [0, 0, 0],
      scale:
        typeof props.scale === 'number'
          ? [props.scale, props.scale, props.scale]
          : props.scale || [1, 1, 1],
    };
    out.push(sceneNode);
  } else if (
    node.type === 'directionalLight' ||
    node.type === 'ambientLight' ||
    node.type === 'pointLight' ||
    node.type === 'spotLight'
  ) {
    out.push({
      id,
      name: props.name || node.type,
      type: 'light',
      parentId,
      traits: [],
      position: props.position || [0, 0, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    });
  }

  // Recurse into children
  if (node.children) {
    for (const child of node.children) {
      flattenTree(child, id, out);
    }
  }
}

/**
 * Hook: sync R3F tree → SceneGraphStore whenever the tree changes.
 */
export function useSceneGraphSync(r3fTree: R3FTreeNode | null) {
  const prevTreeRef = useRef<string>('');

  useEffect(() => {
    if (!r3fTree) return;

    // Quick identity check to avoid unnecessary re-syncs
    const treeId = JSON.stringify(r3fTree.children?.map((c: any) => c.id) || []);
    if (treeId === prevTreeRef.current) return;
    prevTreeRef.current = treeId;

    const nodes: SceneNode[] = [];
    flattenTree(r3fTree, null, nodes);

    // Batch update: replace all nodes at once
    const store = useSceneGraphStore.getState();
    // Only update if the node set actually changed
    const existingIds = new Set(store.nodes.map((n) => n.id));
    const newIds = new Set(nodes.map((n) => n.id));

    const needsFullSync =
      existingIds.size !== newIds.size || nodes.some((n) => !existingIds.has(n.id));

    if (needsFullSync) {
      // Clear and re-add all nodes
      useSceneGraphStore.setState({ nodes });
    }
  }, [r3fTree]);
}
