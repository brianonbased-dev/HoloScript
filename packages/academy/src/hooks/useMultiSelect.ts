'use client';

/**
 * useMultiSelect — manages multi-selection of scene graph nodes.
 * Provides selection set, bounding info, and batch transform operations.
 */

import { useState, useCallback, useMemo } from 'react';
import { useSceneGraphStore, type SceneNode } from '@/lib/stores';

export interface DeltaTransform {
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export function useMultiSelect() {
  const nodes = useSceneGraphStore((s) => s.nodes);
  const updateNode = useSceneGraphStore((s) => s.updateNode);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selectedNodes = useMemo(
    () => nodes.filter((n) => selectedIds.has(n.id)),
    [nodes, selectedIds]
  );

  const select = useCallback((id: string, additive = false) => {
    setSelectedIds((prev) => {
      const next = additive ? new Set(prev) : new Set<string>();
      if (prev.has(id) && additive) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(nodes.map((n) => n.id)));
  }, [nodes]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleSelect = useCallback((id: string) => select(id, true), [select]);

  /** Apply a position/rotation/scale DELTA to all selected nodes */
  const applyDelta = useCallback(
    (delta: DeltaTransform) => {
      for (const id of selectedIds) {
        const node = nodes.find((n) => n.id === id);
        if (!node) continue;
        const patch: Partial<SceneNode> = {};
        if (delta.position) {
          patch.position = [
            node.position[0] + delta.position[0],
            node.position[1] + delta.position[1],
            node.position[2] + delta.position[2],
          ];
        }
        if (delta.rotation) {
          patch.rotation = [
            node.rotation[0] + delta.rotation[0],
            node.rotation[1] + delta.rotation[1],
            node.rotation[2] + delta.rotation[2],
          ];
        }
        if (delta.scale) {
          patch.scale = [
            node.scale[0] + delta.scale[0],
            node.scale[1] + delta.scale[1],
            node.scale[2] + delta.scale[2],
          ];
        }
        updateNode(id, patch);
      }
    },
    [selectedIds, nodes, updateNode]
  );

  /** Set absolute values on all selected nodes */
  const applyAbsolute = useCallback(
    (abs: DeltaTransform) => {
      for (const id of selectedIds) {
        const patch: Partial<SceneNode> = {};
        if (abs.position) patch.position = abs.position;
        if (abs.rotation) patch.rotation = abs.rotation;
        if (abs.scale) patch.scale = abs.scale;
        updateNode(id, patch);
      }
    },
    [selectedIds, updateNode]
  );

  /** Average position of all selected nodes */
  const centroid = useMemo<[number, number, number]>(() => {
    if (selectedNodes.length === 0) return [0, 0, 0];
    const sum = selectedNodes.reduce(
      (acc, n) =>
        [acc[0] + n.position[0], acc[1] + n.position[1], acc[2] + n.position[2]] as [
          number,
          number,
          number,
        ],
      [0, 0, 0] as [number, number, number]
    );
    return [
      sum[0] / selectedNodes.length,
      sum[1] / selectedNodes.length,
      sum[2] / selectedNodes.length,
    ];
  }, [selectedNodes]);

  return {
    selectedIds,
    selectedNodes,
    centroid,
    select,
    selectAll,
    clearSelection,
    toggleSelect,
    applyDelta,
    applyAbsolute,
    count: selectedIds.size,
  };
}
