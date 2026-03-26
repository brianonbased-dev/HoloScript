// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeSelection } from '../useNodeSelection';
import { act, renderHook } from '@testing-library/react';

describe('useNodeSelection', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useNodeSelection());
    act(() => {
      result.current.clearSelection();
      result.current.endSelectionBox();
    });
  });

  describe('Initial State', () => {
    it('should initialize with empty selection', () => {
      const { result } = renderHook(() => useNodeSelection());

      expect(result.current.getSelectedCount()).toBe(0);
      expect(result.current.getSelectedNodes()).toEqual([]);
    });

    it('should initialize with null selection box', () => {
      const { result } = renderHook(() => useNodeSelection());

      expect(result.current.selectionBox).toBeNull();
    });
  });

  describe('Single Selection', () => {
    it('should select a single node', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
      });

      expect(result.current.isSelected('node-1')).toBe(true);
      expect(result.current.getSelectedCount()).toBe(1);
    });

    it('should replace previous selection by default', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
        result.current.selectNode('node-2');
      });

      expect(result.current.isSelected('node-1')).toBe(false);
      expect(result.current.isSelected('node-2')).toBe(true);
      expect(result.current.getSelectedCount()).toBe(1);
    });

    it('should add to selection when addToSelection is true', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
        result.current.selectNode('node-2', true);
      });

      expect(result.current.isSelected('node-1')).toBe(true);
      expect(result.current.isSelected('node-2')).toBe(true);
      expect(result.current.getSelectedCount()).toBe(2);
    });
  });

  describe('Multi Selection', () => {
    it('should select multiple nodes at once', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2', 'node-3']);
      });

      expect(result.current.getSelectedCount()).toBe(3);
      expect(result.current.getSelectedNodes()).toEqual(
        expect.arrayContaining(['node-1', 'node-2', 'node-3'])
      );
    });

    it('should replace previous selection with selectNodes', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('old-node');
        result.current.selectNodes(['node-1', 'node-2']);
      });

      expect(result.current.isSelected('old-node')).toBe(false);
      expect(result.current.getSelectedCount()).toBe(2);
    });

    it('should handle empty array', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
        result.current.selectNodes([]);
      });

      expect(result.current.getSelectedCount()).toBe(0);
    });
  });

  describe('Deselection', () => {
    it('should deselect a single node', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2', 'node-3']);
        result.current.deselectNode('node-2');
      });

      expect(result.current.isSelected('node-1')).toBe(true);
      expect(result.current.isSelected('node-2')).toBe(false);
      expect(result.current.isSelected('node-3')).toBe(true);
      expect(result.current.getSelectedCount()).toBe(2);
    });

    it('should handle deselecting non-selected node', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
        result.current.deselectNode('node-2');
      });

      expect(result.current.getSelectedCount()).toBe(1);
    });

    it('should clear all selections', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2', 'node-3']);
        result.current.clearSelection();
      });

      expect(result.current.getSelectedCount()).toBe(0);
      expect(result.current.getSelectedNodes()).toEqual([]);
    });
  });

  describe('Toggle Selection', () => {
    it('should add node when not selected', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.toggleNodeSelection('node-1');
      });

      expect(result.current.isSelected('node-1')).toBe(true);
    });

    it('should remove node when already selected', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
        result.current.toggleNodeSelection('node-1');
      });

      expect(result.current.isSelected('node-1')).toBe(false);
    });

    it('should preserve other selections when toggling', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2']);
        result.current.toggleNodeSelection('node-1');
      });

      expect(result.current.isSelected('node-1')).toBe(false);
      expect(result.current.isSelected('node-2')).toBe(true);
      expect(result.current.getSelectedCount()).toBe(1);
    });
  });

  describe('Selection Query', () => {
    it('should return true for selected node', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
      });

      expect(result.current.isSelected('node-1')).toBe(true);
    });

    it('should return false for non-selected node', () => {
      const { result } = renderHook(() => useNodeSelection());

      expect(result.current.isSelected('node-1')).toBe(false);
    });

    it('should return correct selected nodes array', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-3', 'node-1', 'node-2']);
      });

      const selected = result.current.getSelectedNodes();
      expect(selected).toHaveLength(3);
      expect(selected).toContain('node-1');
      expect(selected).toContain('node-2');
      expect(selected).toContain('node-3');
    });

    it('should return correct selection count', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['a', 'b', 'c', 'd', 'e']);
      });

      expect(result.current.getSelectedCount()).toBe(5);
    });
  });

  describe('Selection Box', () => {
    it('should start selection box', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.startSelectionBox(100, 200);
      });

      expect(result.current.selectionBox).toEqual({
        startX: 100,
        startY: 200,
        endX: 100,
        endY: 200,
      });
    });

    it('should update selection box end coordinates', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.startSelectionBox(100, 200);
        result.current.updateSelectionBox(300, 400);
      });

      expect(result.current.selectionBox).toEqual({
        startX: 100,
        startY: 200,
        endX: 300,
        endY: 400,
      });
    });

    it('should preserve start coordinates when updating', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.startSelectionBox(50, 75);
        result.current.updateSelectionBox(200, 250);
        result.current.updateSelectionBox(300, 350);
      });

      expect(result.current.selectionBox?.startX).toBe(50);
      expect(result.current.selectionBox?.startY).toBe(75);
      expect(result.current.selectionBox?.endX).toBe(300);
      expect(result.current.selectionBox?.endY).toBe(350);
    });

    it('should handle update when no box exists', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.updateSelectionBox(100, 100);
      });

      expect(result.current.selectionBox).toBeNull();
    });

    it('should end selection box', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.startSelectionBox(100, 200);
        result.current.updateSelectionBox(300, 400);
        result.current.endSelectionBox();
      });

      expect(result.current.selectionBox).toBeNull();
    });
  });

  describe('Selection Bounds', () => {
    it('should calculate bounds for single node', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
      });

      const positions = new Map([['node-1', { x: 100, y: 200 }]]);
      const bounds = result.current.getSelectionBounds(positions);

      expect(bounds).toEqual({
        minX: 100,
        minY: 200,
        maxX: 300, // 100 + 200
        maxY: 350, // 200 + 150
      });
    });

    it('should calculate bounds for multiple nodes', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2', 'node-3']);
      });

      const positions = new Map([
        ['node-1', { x: 0, y: 0 }],
        ['node-2', { x: 500, y: 300 }],
        ['node-3', { x: 200, y: 150 }],
      ]);
      const bounds = result.current.getSelectionBounds(positions);

      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 700, // 500 + 200
        maxY: 450, // 300 + 150
      });
    });

    it('should return null for empty selection', () => {
      const { result } = renderHook(() => useNodeSelection());

      const positions = new Map([['node-1', { x: 100, y: 200 }]]);
      const bounds = result.current.getSelectionBounds(positions);

      expect(bounds).toBeNull();
    });

    it('should return null when no positions match selected nodes', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2']);
      });

      const positions = new Map([['node-3', { x: 100, y: 200 }]]);
      const bounds = result.current.getSelectionBounds(positions);

      expect(bounds).toBeNull();
    });

    it('should skip nodes without positions', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-2', 'node-3']);
      });

      const positions = new Map([
        ['node-1', { x: 0, y: 0 }],
        ['node-3', { x: 500, y: 300 }],
      ]);
      const bounds = result.current.getSelectionBounds(positions);

      expect(bounds).toEqual({
        minX: 0,
        minY: 0,
        maxX: 700,
        maxY: 450,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle selecting same node twice', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1', true);
        result.current.selectNode('node-1', true);
      });

      expect(result.current.getSelectedCount()).toBe(1);
    });

    it('should handle duplicate node IDs in selectNodes', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNodes(['node-1', 'node-1', 'node-2']);
      });

      expect(result.current.getSelectedCount()).toBe(2);
    });

    it('should handle clearing empty selection', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.getSelectedCount()).toBe(0);
    });

    it('should handle ending non-existent selection box', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.endSelectionBox();
      });

      expect(result.current.selectionBox).toBeNull();
    });

    it('should handle negative coordinates in selection box', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.startSelectionBox(-100, -50);
        result.current.updateSelectionBox(-200, -150);
      });

      expect(result.current.selectionBox).toEqual({
        startX: -100,
        startY: -50,
        endX: -200,
        endY: -150,
      });
    });

    it('should handle negative positions in bounds calculation', () => {
      const { result } = renderHook(() => useNodeSelection());

      act(() => {
        result.current.selectNode('node-1');
      });

      const positions = new Map([['node-1', { x: -100, y: -200 }]]);
      const bounds = result.current.getSelectionBounds(positions);

      expect(bounds).toEqual({
        minX: -100,
        minY: -200,
        maxX: 100, // -100 + 200
        maxY: -50, // -200 + 150
      });
    });
  });

  describe('Store Persistence', () => {
    it('should maintain selection across multiple hook instances', () => {
      const { result: result1 } = renderHook(() => useNodeSelection());
      const { result: result2 } = renderHook(() => useNodeSelection());

      act(() => {
        result1.current.selectNode('node-1');
      });

      expect(result2.current.isSelected('node-1')).toBe(true);
    });

    it('should maintain selection box across instances', () => {
      const { result: result1 } = renderHook(() => useNodeSelection());
      const { result: result2 } = renderHook(() => useNodeSelection());

      act(() => {
        result1.current.startSelectionBox(100, 200);
      });

      expect(result2.current.selectionBox).toEqual({
        startX: 100,
        startY: 200,
        endX: 100,
        endY: 200,
      });
    });
  });
});
