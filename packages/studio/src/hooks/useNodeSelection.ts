/**
 * Node Selection State Management Hook
 *
 * Manages multi-select behavior and selection state
 */

import { create } from 'zustand';

interface NodeSelectionState {
  // Selected node IDs
  selectedNodes: Set<string>;

  // Selection box (for multi-select drag)
  selectionBox: {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  } | null;

  // Actions
  selectNode: (nodeId: string, addToSelection?: boolean) => void;
  selectNodes: (nodeIds: string[]) => void;
  deselectNode: (nodeId: string) => void;
  clearSelection: () => void;
  toggleNodeSelection: (nodeId: string) => void;

  isSelected: (nodeId: string) => boolean;
  getSelectedNodes: () => string[];
  getSelectedCount: () => number;

  // Selection box
  startSelectionBox: (x: number, y: number) => void;
  updateSelectionBox: (x: number, y: number) => void;
  endSelectionBox: () => void;

  // Bounding box calculation
  getSelectionBounds: (nodePositions: Map<string, { x: number; y: number }>) => {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
}

export const useNodeSelection = create<NodeSelectionState>((set, get) => ({
  selectedNodes: new Set<string>(),
  selectionBox: null,

  selectNode: (nodeId, addToSelection = false) => {
    set((state) => {
      const newSelection = addToSelection ? new Set(state.selectedNodes) : new Set<string>();
      newSelection.add(nodeId);
      return { selectedNodes: newSelection };
    });
  },

  selectNodes: (nodeIds) => {
    set({ selectedNodes: new Set(nodeIds) });
  },

  deselectNode: (nodeId) => {
    set((state) => {
      const newSelection = new Set(state.selectedNodes);
      newSelection.delete(nodeId);
      return { selectedNodes: newSelection };
    });
  },

  clearSelection: () => {
    set({ selectedNodes: new Set<string>() });
  },

  toggleNodeSelection: (nodeId) => {
    set((state) => {
      const newSelection = new Set(state.selectedNodes);
      if (newSelection.has(nodeId)) {
        newSelection.delete(nodeId);
      } else {
        newSelection.add(nodeId);
      }
      return { selectedNodes: newSelection };
    });
  },

  isSelected: (nodeId) => {
    return get().selectedNodes.has(nodeId);
  },

  getSelectedNodes: () => {
    return Array.from(get().selectedNodes);
  },

  getSelectedCount: () => {
    return get().selectedNodes.size;
  },

  startSelectionBox: (x, y) => {
    set({
      selectionBox: {
        startX: x,
        startY: y,
        endX: x,
        endY: y,
      },
    });
  },

  updateSelectionBox: (x, y) => {
    set((state) => {
      if (!state.selectionBox) return state;
      return {
        selectionBox: {
          ...state.selectionBox,
          endX: x,
          endY: y,
        },
      };
    });
  },

  endSelectionBox: () => {
    set({ selectionBox: null });
  },

  getSelectionBounds: (nodePositions) => {
    const { selectedNodes } = get();
    if (selectedNodes.size === 0) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const nodeId of selectedNodes) {
      const pos = nodePositions.get(nodeId);
      if (pos) {
        minX = Math.min(minX, pos.x);
        minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x + 200); // Assume node width ~200px
        maxY = Math.max(maxY, pos.y + 150); // Assume node height ~150px
      }
    }

    if (minX === Infinity) return null;

    return { minX, minY, maxX, maxY };
  },
}));
