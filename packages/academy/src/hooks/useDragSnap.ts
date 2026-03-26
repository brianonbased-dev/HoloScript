/**
 * useDragSnap — Asset Auto-Snap Hook
 *
 * Combines floor-snap (Y from bounding box) and grid-snap (X/Z from builderStore)
 * into a single composable hook used by AssetDropProcessor and the scene canvas
 * when placing or dragging assets.
 *
 * Features:
 * - Reads `gridSnap` and `gridSize` from builderStore (reactive, sync with toggle)
 * - `snapDrop(box, worldXZ?)` — returns a snapped [x, y, z] position
 * - `snapNode(pos)` — snaps an existing [x, y, z] to grid (ignores Y)
 * - `gridSnap` / `gridSize` / `toggleGridSnap` — forwarded from builderStore
 */

import { useCallback } from 'react';
import * as THREE from 'three';
import { useBuilderStore, snapToGrid, snapPosition } from '@/lib/stores/builderStore';

export interface SnapResult {
  position: [number, number, number];
  /** true if grid snap was applied to X/Z */
  gridSnapped: boolean;
  /** true if floor snap was applied via bounding box */
  floorSnapped: boolean;
  /** The grid size used, or null if snap was off */
  gridSize: number | null;
}

export function useDragSnap() {
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const gridSize = useBuilderStore((s) => s.gridSize);
  const toggleGridSnap = useBuilderStore((s) => s.toggleGridSnap);

  /**
   * Compute a snapped drop position for a just-imported asset.
   *
   * @param box     - THREE.Box3 of the asset's geometry (world space before snap)
   * @param worldX  - Optional desired X position (from cursor/raycaster), default 0
   * @param worldZ  - Optional desired Z position (from cursor/raycaster), default 0
   */
  const snapDrop = useCallback(
    (
      box: THREE.Box3,
      worldX = 0,
      worldZ = 0
    ): SnapResult => {
      // Floor snap: raise asset so its bottom is at Y=0
      const yOffset = box.min.y < 0 ? Math.abs(box.min.y) : -box.min.y;
      const rawY = yOffset;

      let x = worldX;
      let z = worldZ;
      let gridSnapped = false;

      if (gridSnap) {
        x = snapToGrid(worldX, gridSize);
        z = snapToGrid(worldZ, gridSize);
        gridSnapped = true;
      }

      return {
        position: [x, rawY, z],
        gridSnapped,
        floorSnapped: true,
        gridSize: gridSnap ? gridSize : null,
      };
    },
    [gridSnap, gridSize]
  );

  /**
   * Snap an existing [x, y, z] position to the current grid (X/Z only).
   * Leaves Y untouched — useful for re-snapping selected objects.
   */
  const snapNode = useCallback(
    (pos: [number, number, number]): [number, number, number] => {
      if (!gridSnap) return pos;
      return snapPosition(pos, gridSize);
    },
    [gridSnap, gridSize]
  );

  return {
    gridSnap,
    gridSize,
    toggleGridSnap,
    snapDrop,
    snapNode,
  };
}
