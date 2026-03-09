// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useNodeGraphHistory, type GraphSnapshot } from '../useNodeGraphHistory';

describe('useNodeGraphHistory', () => {
  const mockSnapshot1: GraphSnapshot = {
    nodes: [{ id: '1', type: 'add', position: { x: 0, y: 0 } }],
    edges: [],
  };

  const mockSnapshot2: GraphSnapshot = {
    nodes: [
      { id: '1', type: 'add', position: { x: 0, y: 0 } },
      { id: '2', type: 'mul', position: { x: 100, y: 0 } },
    ],
    edges: [{ id: 'e1', source: '1', target: '2' }],
  };

  describe('Initial State', () => {
    it('should start with no undo/redo available', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should have empty history list', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      expect(result.current.historyList).toEqual([]);
    });
  });

  describe('Record', () => {
    it('should enable undo after recording', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      expect(result.current.canUndo).toBe(true);
    });

    it('should clear redo stack on new record', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
        result.current.record(mockSnapshot2.nodes, mockSnapshot2.edges);
      });

      act(() => {
        result.current.undo(mockSnapshot2);
      });

      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      expect(result.current.canRedo).toBe(false);
    });

    it('should cap history at 50 snapshots', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.record([{ id: `${i}`, type: 'add', position: { x: 0, y: 0 } }], []);
        }
      });

      expect(result.current.historyList).toHaveLength(50);
    });

    it('should update historyList with snapshot info', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      expect(result.current.historyList).toHaveLength(1);
      expect(result.current.historyList[0]).toMatchObject({
        index: 0,
        nodeCount: 1,
        edgeCount: 0,
      });
    });
  });

  describe('Undo', () => {
    it('should return previous snapshot', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      let undone: any;
      act(() => {
        undone = result.current.undo(mockSnapshot2);
      });

      expect(undone).toEqual(mockSnapshot1);
    });

    it('should enable redo after undo', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      act(() => {
        result.current.undo(mockSnapshot2);
      });

      expect(result.current.canRedo).toBe(true);
    });

    it('should return null when nothing to undo', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      let undone: any;
      act(() => {
        undone = result.current.undo(mockSnapshot1);
      });

      expect(undone).toBeNull();
    });

    it('should disable undo after undoing all', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      act(() => {
        result.current.undo(mockSnapshot2);
      });

      expect(result.current.canUndo).toBe(false);
    });
  });

  describe('Redo', () => {
    it('should return next snapshot', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      act(() => {
        result.current.undo(mockSnapshot2);
      });

      let redone: any;
      act(() => {
        redone = result.current.redo(mockSnapshot1);
      });

      expect(redone).toEqual(mockSnapshot2);
    });

    it('should return null when nothing to redo', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      let redone: any;
      act(() => {
        redone = result.current.redo(mockSnapshot1);
      });

      expect(redone).toBeNull();
    });

    it('should restore past after redo', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      act(() => {
        result.current.undo(mockSnapshot2);
      });

      expect(result.current.canUndo).toBe(false);

      act(() => {
        result.current.redo(mockSnapshot1);
      });

      expect(result.current.canUndo).toBe(true);
    });
  });

  describe('Clear', () => {
    it('should clear both past and future', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
        result.current.record(mockSnapshot2.nodes, mockSnapshot2.edges);
      });

      act(() => {
        result.current.undo(mockSnapshot2);
      });

      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.clear();
      });

      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(false);
    });

    it('should clear historyList', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      act(() => {
        result.current.record(mockSnapshot1.nodes, mockSnapshot1.edges);
      });

      act(() => {
        result.current.clear();
      });

      expect(result.current.historyList).toEqual([]);
    });
  });

  describe('Multiple Undo/Redo', () => {
    it('should handle multiple undo/redo cycles', () => {
      const { result } = renderHook(() => useNodeGraphHistory());

      const s1 = { nodes: [{ id: '1' }], edges: [] };
      const s2 = { nodes: [{ id: '1' }, { id: '2' }], edges: [] };
      const s3 = { nodes: [{ id: '1' }, { id: '2' }, { id: '3' }], edges: [] };

      act(() => {
        result.current.record(s1.nodes, s1.edges);
        result.current.record(s2.nodes, s2.edges);
      });

      let undone1: any, undone2: any, redone1: any;
      act(() => {
        undone1 = result.current.undo(s3);
      });
      expect(undone1).toEqual(s2);

      act(() => {
        undone2 = result.current.undo(s2);
      });
      expect(undone2).toEqual(s1);

      act(() => {
        redone1 = result.current.redo(s1);
      });
      expect(redone1).toEqual(s2);
    });
  });
});
