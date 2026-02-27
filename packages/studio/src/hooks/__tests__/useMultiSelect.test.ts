// @vitest-environment jsdom
/**
 * useMultiSelect.test.ts
 * Tests for multi-selection hook functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMultiSelect } from '../useMultiSelect';
import { useSceneGraphStore } from '@/lib/store';

describe('useMultiSelect', () => {
  beforeEach(() => {
    // Reset store to clean state
    useSceneGraphStore.setState({ nodes: [] });
  });

  describe('Selection Management', () => {
    it('should initialize with empty selection', () => {
      const { result } = renderHook(() => useMultiSelect());

      expect(result.current.selectedIds.size).toBe(0);
      expect(result.current.selectedNodes).toEqual([]);
      expect(result.current.count).toBe(0);
    });

    it('should select a single node', () => {
      // Setup: Add a node to the scene
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Test Node 1',
          type: 'empty',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
      });

      expect(result.current.selectedIds.has('node1')).toBe(true);
      expect(result.current.count).toBe(1);
      expect(result.current.selectedNodes.length).toBe(1);
      expect(result.current.selectedNodes[0].id).toBe('node1');
    });

    it('should replace selection when selecting without additive mode', () => {
      // Setup: Add two nodes
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Node 1',
            type: 'empty',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
          {
            id: 'node2',
            name: 'Node 2',
            type: 'empty',
            position: [1, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
        result.current.select('node2'); // Replace selection
      });

      expect(result.current.selectedIds.has('node1')).toBe(false);
      expect(result.current.selectedIds.has('node2')).toBe(true);
      expect(result.current.count).toBe(1);
    });

    it('should add to selection in additive mode', () => {
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Node 1',
            type: 'empty',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
          {
            id: 'node2',
            name: 'Node 2',
            type: 'empty',
            position: [1, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1', true); // Additive
        result.current.select('node2', true); // Additive
      });

      expect(result.current.selectedIds.has('node1')).toBe(true);
      expect(result.current.selectedIds.has('node2')).toBe(true);
      expect(result.current.count).toBe(2);
    });

    it('should toggle selection in additive mode', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result } = renderHook(() => useMultiSelect());

      // First selection adds
      act(() => {
        result.current.toggleSelect('node1');
      });
      expect(result.current.selectedIds.has('node1')).toBe(true);

      // Second selection removes
      act(() => {
        result.current.toggleSelect('node1');
      });
      expect(result.current.selectedIds.has('node1')).toBe(false);
    });

    it('should select all nodes', () => {
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Node 1',
            type: 'empty',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
          {
            id: 'node2',
            name: 'Node 2',
            type: 'empty',
            position: [1, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
          {
            id: 'node3',
            name: 'Node 3',
            type: 'empty',
            position: [2, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.selectAll();
      });

      expect(result.current.count).toBe(3);
      expect(result.current.selectedIds.has('node1')).toBe(true);
      expect(result.current.selectedIds.has('node2')).toBe(true);
      expect(result.current.selectedIds.has('node3')).toBe(true);
    });

    it('should clear selection', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
        result.current.clearSelection();
      });

      expect(result.current.count).toBe(0);
      expect(result.current.selectedIds.size).toBe(0);
    });
  });

  describe('Transform Operations', () => {
    it('should apply position delta to selected nodes', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result, rerender } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
      });
      rerender(); // Ensure hook updates with new selection

      act(() => {
        result.current.applyDelta({ position: [1, 2, 3] });
      });

      const node = useSceneGraphStore.getState().nodes[0];
      expect(node.position).toEqual([1, 2, 3]);
    });

    it('should apply rotation delta to selected nodes', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result, rerender } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
      });
      rerender();

      act(() => {
        result.current.applyDelta({ rotation: [0.5, 1.0, 0] });
      });

      const node = useSceneGraphStore.getState().nodes[0];
      expect(node.rotation).toEqual([0.5, 1.0, 0]);
    });

    it('should apply scale delta to selected nodes', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result, rerender } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
      });
      rerender();

      act(() => {
        result.current.applyDelta({ scale: [1, 1, 1] });
      });

      const node = useSceneGraphStore.getState().nodes[0];
      expect(node.scale).toEqual([2, 2, 2]);
    });

    it('should apply absolute position to selected nodes', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [5, 5, 5],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result, rerender } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
      });
      rerender();

      act(() => {
        result.current.applyAbsolute({ position: [0, 0, 0] });
      });

      const node = useSceneGraphStore.getState().nodes[0];
      expect(node.position).toEqual([0, 0, 0]);
    });

    it('should apply transforms to multiple selected nodes', () => {
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Node 1',
            type: 'empty',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
          {
            id: 'node2',
            name: 'Node 2',
            type: 'empty',
            position: [1, 1, 1],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const { result, rerender } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1', true);
        result.current.select('node2', true);
      });
      rerender();

      act(() => {
        result.current.applyDelta({ position: [10, 0, 0] });
      });

      const nodes = useSceneGraphStore.getState().nodes;
      expect(nodes[0].position).toEqual([10, 0, 0]);
      expect(nodes[1].position).toEqual([11, 1, 1]);
    });
  });

  describe('Centroid Calculation', () => {
    it('should return [0,0,0] for empty selection', () => {
      const { result } = renderHook(() => useMultiSelect());
      expect(result.current.centroid).toEqual([0, 0, 0]);
    });

    it('should calculate centroid for single node', () => {
      useSceneGraphStore.setState({
        nodes: [{
          id: 'node1',
          name: 'Node 1',
          type: 'empty',
          position: [5, 10, 15],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          traits: [],
        }],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.select('node1');
      });

      expect(result.current.centroid).toEqual([5, 10, 15]);
    });

    it('should calculate average position for multiple nodes', () => {
      useSceneGraphStore.setState({
        nodes: [
          {
            id: 'node1',
            name: 'Node 1',
            type: 'empty',
            position: [0, 0, 0],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
          {
            id: 'node2',
            name: 'Node 2',
            type: 'empty',
            position: [10, 10, 10],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [],
          },
        ],
      });

      const { result } = renderHook(() => useMultiSelect());

      act(() => {
        result.current.selectAll();
      });

      expect(result.current.centroid).toEqual([5, 5, 5]);
    });
  });
});
