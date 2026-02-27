// @vitest-environment jsdom
/**
 * useNodeGraph.test.ts
 * Tests for node graph editor hook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNodeGraph, type NodeDef } from '../useNodeGraph';

describe('useNodeGraph', () => {
  const mockNodeDef: NodeDef = {
    type: 'math.add',
    label: 'Add',
    category: 'Math',
    color: '#4CAF50',
    inputs: [
      { id: 'in1', label: 'A', type: 'float' },
      { id: 'in2', label: 'B', type: 'float' },
    ],
    outputs: [
      { id: 'out1', label: 'Result', type: 'float' },
    ],
  };

  const mockNodeDef2: NodeDef = {
    type: 'math.multiply',
    label: 'Multiply',
    category: 'Math',
    color: '#2196F3',
    inputs: [
      { id: 'in1', label: 'A', type: 'float' },
      { id: 'in2', label: 'B', type: 'float' },
    ],
    outputs: [
      { id: 'out1', label: 'Result', type: 'float' },
    ],
  };

  describe('Initial State', () => {
    it('should initialize with empty nodes and edges', () => {
      const { result } = renderHook(() => useNodeGraph());

      expect(result.current.nodes).toEqual([]);
      expect(result.current.edges).toEqual([]);
      expect(result.current.selected).toBeNull();
    });

    it('should provide all required functions', () => {
      const { result } = renderHook(() => useNodeGraph());

      expect(typeof result.current.addNode).toBe('function');
      expect(typeof result.current.removeNode).toBe('function');
      expect(typeof result.current.moveNode).toBe('function');
      expect(typeof result.current.connect).toBe('function');
      expect(typeof result.current.disconnect).toBe('function');
      expect(typeof result.current.clearGraph).toBe('function');
      expect(typeof result.current.setSelected).toBe('function');
    });
  });

  describe('Add Node', () => {
    it('should add a node with default position', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0]).toMatchObject({
        type: 'math.add',
        label: 'Add',
        category: 'Math',
        color: '#4CAF50',
        inputs: mockNodeDef.inputs,
        outputs: mockNodeDef.outputs,
      });
      expect(result.current.nodes[0].x).toBeGreaterThan(0);
      expect(result.current.nodes[0].y).toBeGreaterThan(0);
      expect(nodeId!).toBeDefined();
    });

    it('should add a node with custom position', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        result.current.addNode(mockNodeDef, 200, 150);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].x).toBe(200);
      expect(result.current.nodes[0].y).toBe(150);
    });

    it('should add multiple nodes', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        result.current.addNode(mockNodeDef);
        result.current.addNode(mockNodeDef2);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.nodes[0].type).toBe('math.add');
      expect(result.current.nodes[1].type).toBe('math.multiply');
    });

    it('should return unique node IDs', () => {
      const { result } = renderHook(() => useNodeGraph());

      let id1: string, id2: string;
      act(() => {
        id1 = result.current.addNode(mockNodeDef);
        id2 = result.current.addNode(mockNodeDef);
      });

      expect(id1!).not.toBe(id2!);
      expect(result.current.nodes).toHaveLength(2);
    });

    it('should increment position for successive nodes', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        result.current.addNode(mockNodeDef);
        result.current.addNode(mockNodeDef2);
      });

      const node1 = result.current.nodes[0];
      const node2 = result.current.nodes[1];

      // Second node should have offset position
      expect(node2.x).toBeGreaterThan(node1.x);
      expect(node2.y).toBeGreaterThan(node1.y);
    });
  });

  describe('Remove Node', () => {
    it('should remove a node by ID', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef);
      });

      expect(result.current.nodes).toHaveLength(1);

      act(() => {
        result.current.removeNode(nodeId!);
      });

      expect(result.current.nodes).toHaveLength(0);
    });

    it('should remove connected edges when removing node', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
      });

      expect(result.current.edges).toHaveLength(1);

      act(() => {
        result.current.removeNode(node1Id!);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.edges).toHaveLength(0);
    });

    it('should clear selection when removing selected node', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef);
        result.current.setSelected(nodeId!);
      });

      expect(result.current.selected).toBe(nodeId!);

      act(() => {
        result.current.removeNode(nodeId!);
      });

      expect(result.current.selected).toBeNull();
    });

    it('should not clear selection when removing non-selected node', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.setSelected(node1Id!);
      });

      expect(result.current.selected).toBe(node1Id!);

      act(() => {
        result.current.removeNode(node2Id!);
      });

      expect(result.current.selected).toBe(node1Id!);
    });

    it('should handle removing non-existent node', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        result.current.addNode(mockNodeDef);
      });

      expect(result.current.nodes).toHaveLength(1);

      act(() => {
        result.current.removeNode('non-existent-id');
      });

      expect(result.current.nodes).toHaveLength(1);
    });
  });

  describe('Move Node', () => {
    it('should move a node by delta', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef, 100, 100);
      });

      const initialX = result.current.nodes[0].x;
      const initialY = result.current.nodes[0].y;

      act(() => {
        result.current.moveNode(nodeId!, 50, 30);
      });

      expect(result.current.nodes[0].x).toBe(initialX + 50);
      expect(result.current.nodes[0].y).toBe(initialY + 30);
    });

    it('should move node by negative delta', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef, 100, 100);
      });

      act(() => {
        result.current.moveNode(nodeId!, -20, -15);
      });

      expect(result.current.nodes[0].x).toBe(80);
      expect(result.current.nodes[0].y).toBe(85);
    });

    it('should only move the specified node', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef, 100, 100);
        node2Id = result.current.addNode(mockNodeDef2, 200, 200);
      });

      act(() => {
        result.current.moveNode(node1Id!, 50, 50);
      });

      expect(result.current.nodes[0].x).toBe(150);
      expect(result.current.nodes[0].y).toBe(150);
      expect(result.current.nodes[1].x).toBe(200);
      expect(result.current.nodes[1].y).toBe(200);
    });

    it('should handle moving non-existent node', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        result.current.addNode(mockNodeDef, 100, 100);
      });

      const initialNode = result.current.nodes[0];

      act(() => {
        result.current.moveNode('non-existent-id', 50, 50);
      });

      // Original node should be unchanged
      expect(result.current.nodes[0].x).toBe(initialNode.x);
      expect(result.current.nodes[0].y).toBe(initialNode.y);
    });
  });

  describe('Connect Nodes', () => {
    it('should create an edge between two nodes', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0]).toMatchObject({
        fromNodeId: node1Id!,
        fromPortId: 'out1',
        toNodeId: node2Id!,
        toPortId: 'in1',
      });
      expect(result.current.edges[0].id).toBeDefined();
    });

    it('should create multiple edges', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
        result.current.connect(node1Id!, 'out1', node2Id!, 'in2');
      });

      expect(result.current.edges).toHaveLength(2);
    });

    it('should prevent duplicate connections to same input', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string, node3Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        node3Id = result.current.addNode(mockNodeDef);

        // Connect node1 to node2.in1
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
      });

      expect(result.current.edges).toHaveLength(1);
      const firstEdgeId = result.current.edges[0].id;

      act(() => {
        // Connect node3 to node2.in1 (should replace first connection)
        result.current.connect(node3Id!, 'out1', node2Id!, 'in1');
      });

      expect(result.current.edges).toHaveLength(1);
      expect(result.current.edges[0].fromNodeId).toBe(node3Id!);
      expect(result.current.edges[0].id).not.toBe(firstEdgeId);
    });

    it('should allow multiple outputs from same node', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string, node3Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        node3Id = result.current.addNode(mockNodeDef);

        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
        result.current.connect(node1Id!, 'out1', node3Id!, 'in1');
      });

      expect(result.current.edges).toHaveLength(2);
    });
  });

  describe('Disconnect Nodes', () => {
    it('should remove an edge by ID', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
      });

      const edgeId = result.current.edges[0].id;
      expect(result.current.edges).toHaveLength(1);

      act(() => {
        result.current.disconnect(edgeId);
      });

      expect(result.current.edges).toHaveLength(0);
    });

    it('should handle disconnecting non-existent edge', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
      });

      expect(result.current.edges).toHaveLength(1);

      act(() => {
        result.current.disconnect('non-existent-edge-id');
      });

      expect(result.current.edges).toHaveLength(1);
    });
  });

  describe('Selection', () => {
    it('should set selected node', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef);
        result.current.setSelected(nodeId!);
      });

      expect(result.current.selected).toBe(nodeId!);
    });

    it('should clear selection with null', () => {
      const { result } = renderHook(() => useNodeGraph());

      let nodeId: string;
      act(() => {
        nodeId = result.current.addNode(mockNodeDef);
        result.current.setSelected(nodeId!);
      });

      expect(result.current.selected).toBe(nodeId!);

      act(() => {
        result.current.setSelected(null);
      });

      expect(result.current.selected).toBeNull();
    });

    it('should change selection', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.setSelected(node1Id!);
      });

      expect(result.current.selected).toBe(node1Id!);

      act(() => {
        result.current.setSelected(node2Id!);
      });

      expect(result.current.selected).toBe(node2Id!);
    });
  });

  describe('Clear Graph', () => {
    it('should clear all nodes and edges', () => {
      const { result } = renderHook(() => useNodeGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        node1Id = result.current.addNode(mockNodeDef);
        node2Id = result.current.addNode(mockNodeDef2);
        result.current.connect(node1Id!, 'out1', node2Id!, 'in1');
        result.current.setSelected(node1Id!);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.edges).toHaveLength(1);
      expect(result.current.selected).toBe(node1Id!);

      act(() => {
        result.current.clearGraph();
      });

      expect(result.current.nodes).toHaveLength(0);
      expect(result.current.edges).toHaveLength(0);
      expect(result.current.selected).toBeNull();
    });

    it('should reset node counter after clear', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        result.current.addNode(mockNodeDef);
        result.current.addNode(mockNodeDef2);
      });

      act(() => {
        result.current.clearGraph();
      });

      let newNodeId: string;
      act(() => {
        newNodeId = result.current.addNode(mockNodeDef);
      });

      // After clear, new nodes should start from counter 1 again
      expect(newNodeId!).toContain('n-');
      expect(result.current.nodes).toHaveLength(1);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle graph with multiple connections', () => {
      const { result } = renderHook(() => useNodeGraph());

      let n1: string, n2: string, n3: string;
      act(() => {
        n1 = result.current.addNode(mockNodeDef);
        n2 = result.current.addNode(mockNodeDef2);
        n3 = result.current.addNode(mockNodeDef);

        // Create a chain: n1 -> n2 -> n3
        result.current.connect(n1!, 'out1', n2!, 'in1');
        result.current.connect(n2!, 'out1', n3!, 'in1');
      });

      expect(result.current.nodes).toHaveLength(3);
      expect(result.current.edges).toHaveLength(2);
    });

    it('should handle removing middle node in chain', () => {
      const { result } = renderHook(() => useNodeGraph());

      let n1: string, n2: string, n3: string;
      act(() => {
        n1 = result.current.addNode(mockNodeDef);
        n2 = result.current.addNode(mockNodeDef2);
        n3 = result.current.addNode(mockNodeDef);

        result.current.connect(n1!, 'out1', n2!, 'in1');
        result.current.connect(n2!, 'out1', n3!, 'in1');
      });

      expect(result.current.edges).toHaveLength(2);

      act(() => {
        result.current.removeNode(n2!);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.edges).toHaveLength(0); // Both edges removed
    });

    it('should handle rapid node additions', () => {
      const { result } = renderHook(() => useNodeGraph());

      act(() => {
        for (let i = 0; i < 10; i++) {
          result.current.addNode(mockNodeDef);
        }
      });

      expect(result.current.nodes).toHaveLength(10);

      // All nodes should have unique IDs
      const ids = result.current.nodes.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });
  });
});
