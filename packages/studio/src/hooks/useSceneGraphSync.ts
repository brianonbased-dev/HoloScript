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
 *
 * Uses a merge strategy to preserve gizmo-edited transforms:
 * - New nodes from R3F → added to the store
 * - Removed nodes (no longer in R3F) → pruned from the store
 * - Existing nodes → update name/type/parentId but KEEP transforms
 *   UNLESS the node wasn't edited by the user (gizmo/transform panel)
 */
export function useSceneGraphSync(r3fTree: R3FTreeNode | null) {
  const prevTreeRef = useRef<string>('');
  /** Set of node IDs whose transforms were edited by the user (gizmo, panel, etc.) */
  const userEditedRef = useRef<Set<string>>(new Set());

  // Subscribe once to track user-edited nodes
  useEffect(() => {
    // Listen for transform updates and mark the node as user-edited
    const unsub = useSceneGraphStore.subscribe(
      (state, prevState) => {
        // Compare nodes by reference — any node whose position/rotation/scale changed
        // between states was edited by the user (not by this sync hook)
        if (state.nodes !== prevState.nodes) {
          for (const node of state.nodes) {
            const prev = prevState.nodes.find((n) => n.id === node.id);
            if (prev &&
              (prev.position !== node.position ||
               prev.rotation !== node.rotation ||
               prev.scale !== node.scale)
            ) {
              userEditedRef.current.add(node.id);
            }
          }
        }
      }
    );
    return unsub;
  }, []);

  useEffect(() => {
    if (!r3fTree) return;

    // Quick identity check to avoid unnecessary re-syncs
    const treeId = JSON.stringify(r3fTree.children?.map((c: any) => c.id) || []);
    if (treeId === prevTreeRef.current) return;
    prevTreeRef.current = treeId;

    const parsedNodes: SceneNode[] = [];
    flattenTree(r3fTree, null, parsedNodes);

    const store = useSceneGraphStore.getState();
    const existingMap = new Map(store.nodes.map((n) => [n.id, n]));
    const parsedMap = new Map(parsedNodes.map((n) => [n.id, n]));

    // Build merged node list
    const mergedNodes: SceneNode[] = [];

    for (const parsed of parsedNodes) {
      const existing = existingMap.get(parsed.id);

      if (existing && userEditedRef.current.has(parsed.id)) {
        // User edited this node's transform — keep their transforms, update metadata
        mergedNodes.push({
          ...parsed,
          position: existing.position,
          rotation: existing.rotation,
          scale: existing.scale,
          traits: existing.traits.length > 0 ? existing.traits : parsed.traits,
        });
      } else if (existing) {
        // Node existed but wasn't user-edited — take parsed transforms
        mergedNodes.push(parsed);
      } else {
        // Brand new node from parse
        mergedNodes.push(parsed);
      }
    }

    // Also keep user-placed nodes (from builderStore clicks) that aren't from the parser
    for (const existing of store.nodes) {
      if (!parsedMap.has(existing.id) && existing.id.startsWith('placed-')) {
        mergedNodes.push(existing);
      }
      if (!parsedMap.has(existing.id) && existing.id.startsWith('dropped-')) {
        mergedNodes.push(existing);
      }
    }

    // Only update if something actually changed
    const needsUpdate =
      mergedNodes.length !== store.nodes.length ||
      mergedNodes.some((n, i) => n !== store.nodes[i]);

    if (needsUpdate) {
      useSceneGraphStore.setState({ nodes: mergedNodes });
    }
  }, [r3fTree]);
}

