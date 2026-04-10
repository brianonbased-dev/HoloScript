// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShaderGraph, ShaderGraph } from '../useShaderGraph';

describe('useShaderGraph', () => {
  beforeEach(() => {
    // Reset store by clearing the graph
    const { result } = renderHook(() => useShaderGraph());
    act(() => {
      result.current.clearGraph();
    });
  });

  describe('Initial State', () => {
    it('should initialize with empty graph', () => {
      const { result } = renderHook(() => useShaderGraph());

      expect(result.current.graph.nodes.size).toBe(0);
      expect(result.current.graph.connections).toEqual([]);
    });

    it('should initialize with default graph name', () => {
      const { result } = renderHook(() => useShaderGraph());

      expect(result.current.graph.name).toBe('Untitled Shader');
    });

    it('should initialize with not dirty', () => {
      const { result } = renderHook(() => useShaderGraph());

      expect(result.current.isDirty).toBe(false);
    });

    it('should initialize with history', () => {
      const { result } = renderHook(() => useShaderGraph());

      expect(result.current.history).toHaveLength(1);
      expect(result.current.historyIndex).toBe(0);
    });

    it('should have max history size of 50', () => {
      const { result } = renderHook(() => useShaderGraph());

      expect(result.current.maxHistorySize).toBe(50);
    });
  });

  describe('Node Creation', () => {
    it('should create a node', () => {
      const { result } = renderHook(() => useShaderGraph());

      let node: any;
      act(() => {
        node = result.current.createNode('AddNode', { x: 100, y: 200 });
      });

      expect(node).not.toBeNull();
      expect(node.type).toBe('AddNode');
      expect(node.position).toEqual({ x: 100, y: 200 });
    });

    it('should add node to graph', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('MultiplyNode', { x: 0, y: 0 });
      });

      expect(result.current.graph.nodes.size).toBe(1);
    });

    it('should generate unique node IDs', () => {
      const { result } = renderHook(() => useShaderGraph());

      let node1: any, node2: any;
      act(() => {
        node1 = result.current.createNode('Node1', { x: 0, y: 0 });
        node2 = result.current.createNode('Node2', { x: 100, y: 100 });
      });

      expect(node1.id).not.toBe(node2.id);
    });

    it('should mark dirty after creating node', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('TestNode', { x: 0, y: 0 });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should push history after creating node', () => {
      const { result } = renderHook(() => useShaderGraph());

      const initialHistoryLength = result.current.history.length;

      act(() => {
        result.current.createNode('TestNode', { x: 0, y: 0 });
      });

      expect(result.current.history.length).toBe(initialHistoryLength + 1);
    });
  });

  describe('Node Deletion', () => {
    it('should delete a node', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 0, y: 0 });
        nodeId = node!.id;
      });

      act(() => {
        result.current.deleteNode(nodeId);
      });

      expect(result.current.graph.nodes.size).toBe(0);
    });

    it('should delete node connections when deleting node', () => {
      const { result } = renderHook(() => useShaderGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        const n1 = result.current.createNode('Node1', { x: 0, y: 0 });
        const n2 = result.current.createNode('Node2', { x: 100, y: 0 });
        node1Id = n1!.id;
        node2Id = n2!.id;

        // Manually add ports for connection
        n1!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        n2!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });

        result.current.connect(node1Id, 'out', node2Id, 'in');
      });

      expect(result.current.graph.connections).toHaveLength(1);

      act(() => {
        result.current.deleteNode(node1Id);
      });

      expect(result.current.graph.connections).toHaveLength(0);
    });

    it('should handle deleting non-existent node', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.deleteNode('non-existent');
      });

      expect(result.current.graph.nodes.size).toBe(0);
    });
  });

  describe('Multiple Node Deletion', () => {
    it('should delete multiple nodes at once', () => {
      const { result } = renderHook(() => useShaderGraph());

      let ids: string[];
      act(() => {
        const n1 = result.current.createNode('Node1', { x: 0, y: 0 });
        const n2 = result.current.createNode('Node2', { x: 100, y: 0 });
        const n3 = result.current.createNode('Node3', { x: 200, y: 0 });
        ids = [n1!.id, n2!.id, n3!.id];
      });

      expect(result.current.graph.nodes.size).toBe(3);

      act(() => {
        result.current.deleteNodes([ids[0], ids[1]]);
      });

      expect(result.current.graph.nodes.size).toBe(1);
    });
  });

  describe('Node Updates', () => {
    it('should update node properties', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId!: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 0, y: 0 });
        nodeId = node!.id;
      });

      act(() => {
        result.current.updateNode(nodeId, { name: 'Updated Name' });
      });

      const node = result.current.graph.getNode(nodeId);
      expect((node as Record<string, unknown>)?.['name']).toBe('Updated Name');
    });

    it('should handle updating non-existent node', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.updateNode('non-existent', { name: 'Test' });
      });

      // Should not crash
      expect(result.current.graph.nodes.size).toBe(0);
    });
  });

  describe('Node Properties', () => {
    it('should set node property', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId!: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 0, y: 0 });
        nodeId = node!.id;
      });

      act(() => {
        result.current.setNodeProperty(nodeId, 'color', '#ff0000');
      });

      expect(result.current.graph.getNode(nodeId)?.properties.color).toBe('#ff0000');
    });

    it('should mark dirty after setting property', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 0, y: 0 });
        nodeId = node!.id;
        result.current.markClean();
      });

      act(() => {
        result.current.setNodeProperty(nodeId, 'value', 42);
      });

      expect(result.current.isDirty).toBe(true);
    });
  });

  describe('Node Position', () => {
    it('should set node position', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId!: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 0, y: 0 });
        nodeId = node!.id;

        result.current.setNodePosition(nodeId, 500, 600);
      });

      expect(result.current.graph.getNode(nodeId)?.position).toEqual({ x: 500, y: 600 });
    });

    it('should not push history for position updates', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 0, y: 0 });
        nodeId = node!.id;
      });

      const historyLength = result.current.history.length;

      act(() => {
        result.current.setNodePosition(nodeId, 100, 200);
      });

      // Position updates don't push history to avoid spam
      expect(result.current.history.length).toBe(historyLength);
    });
  });

  describe('Connections', () => {
    it('should connect two nodes', () => {
      const { result } = renderHook(() => useShaderGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        const n1 = result.current.createNode('Node1', { x: 0, y: 0 });
        const n2 = result.current.createNode('Node2', { x: 100, y: 0 });
        node1Id = n1!.id;
        node2Id = n2!.id;

        n1!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        n2!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });

        result.current.connect(node1Id, 'out', node2Id, 'in');
      });

      expect(result.current.graph.connections).toHaveLength(1);
    });

    it('should prevent self-connections', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId: string;
      act(() => {
        const node = result.current.createNode('Node1', { x: 0, y: 0 });
        nodeId = node!.id;
        node!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        node!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });

        result.current.connect(nodeId, 'out', nodeId, 'in');
      });

      expect(result.current.graph.connections).toHaveLength(0);
    });

    it('should prevent cyclic connections', () => {
      const { result } = renderHook(() => useShaderGraph());

      let n1Id: string, n2Id: string, n3Id: string;
      act(() => {
        const n1 = result.current.createNode('Node1', { x: 0, y: 0 });
        const n2 = result.current.createNode('Node2', { x: 100, y: 0 });
        const n3 = result.current.createNode('Node3', { x: 200, y: 0 });
        n1Id = n1!.id;
        n2Id = n2!.id;
        n3Id = n3!.id;

        // Add ports
        n1!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        n1!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });
        n2!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        n2!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });
        n3!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        n3!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });

        // Create chain: n1 -> n2 -> n3
        result.current.connect(n1Id, 'out', n2Id, 'in');
        result.current.connect(n2Id, 'out', n3Id, 'in');

        // Try to create cycle: n3 -> n1 (should be prevented)
        result.current.connect(n3Id, 'out', n1Id, 'in');
      });

      // Should only have 2 connections, not 3
      expect(result.current.graph.connections).toHaveLength(2);
    });

    it('should disconnect a port', () => {
      const { result } = renderHook(() => useShaderGraph());

      let node1Id: string, node2Id: string;
      act(() => {
        const n1 = result.current.createNode('Node1', { x: 0, y: 0 });
        const n2 = result.current.createNode('Node2', { x: 100, y: 0 });
        node1Id = n1!.id;
        node2Id = n2!.id;

        n1!.outputs.push({ id: 'out', name: 'output', type: 'float', direction: 'out' });
        n2!.inputs.push({ id: 'in', name: 'input', type: 'float', direction: 'in' });

        result.current.connect(node1Id, 'out', node2Id, 'in');
      });

      expect(result.current.graph.connections).toHaveLength(1);

      act(() => {
        result.current.disconnect(node1Id, 'out');
      });

      expect(result.current.graph.connections).toHaveLength(0);
    });
  });

  describe('History - Undo/Redo', () => {
    it('should start with no undo available', () => {
      const { result } = renderHook(() => useShaderGraph());

      expect(result.current.canUndo()).toBe(false);
    });

    it('should enable undo after creating node', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('TestNode', { x: 0, y: 0 });
      });

      expect(result.current.canUndo()).toBe(true);
    });

    it('should undo node creation', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('TestNode', { x: 0, y: 0 });
      });

      expect(result.current.graph.nodes.size).toBe(1);

      act(() => {
        result.current.undo();
      });

      expect(result.current.graph.nodes.size).toBe(0);
    });

    it('should enable redo after undo', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('TestNode', { x: 0, y: 0 });
        result.current.undo();
      });

      expect(result.current.canRedo()).toBe(true);
    });

    it('should redo after undo', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('TestNode', { x: 0, y: 0 });
        result.current.undo();
        result.current.redo();
      });

      expect(result.current.graph.nodes.size).toBe(1);
    });

    it('should clear redo history when new action is performed', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('Node1', { x: 0, y: 0 });
        result.current.undo();
      });

      expect(result.current.canRedo()).toBe(true);

      act(() => {
        result.current.createNode('Node2', { x: 100, y: 0 });
      });

      expect(result.current.canRedo()).toBe(false);
    });

    it('should cap history at max size', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        for (let i = 0; i < 60; i++) {
          result.current.createNode(`Node${i}`, { x: i * 10, y: 0 });
        }
      });

      expect(result.current.history.length).toBeLessThanOrEqual(result.current.maxHistorySize);
    });
  });

  describe('Serialization', () => {
    it('should serialize graph', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('TestNode', { x: 100, y: 200 });
      });

      const serialized = result.current.serializeGraph();

      expect(serialized).toBeTruthy();
      expect(typeof serialized).toBe('string');
    });

    it('should deserialize graph', () => {
      const { result } = renderHook(() => useShaderGraph());

      let serialized: string;
      act(() => {
        result.current.createNode('TestNode', { x: 100, y: 200 });
        serialized = result.current.serializeGraph();
        result.current.clearGraph();
      });

      expect(result.current.graph.nodes.size).toBe(0);

      act(() => {
        result.current.loadGraph(serialized);
      });

      expect(result.current.graph.nodes.size).toBe(1);
    });

    it('should preserve node properties in serialization', () => {
      const { result } = renderHook(() => useShaderGraph());

      let nodeId: string, serialized: string;
      act(() => {
        const node = result.current.createNode('TestNode', { x: 100, y: 200 });
        nodeId = node!.id;
        result.current.setNodeProperty(nodeId, 'color', '#ff0000');
        serialized = result.current.serializeGraph();
        result.current.clearGraph();
        result.current.loadGraph(serialized);
      });

      const nodes = Array.from(result.current.graph.nodes.values());
      expect(nodes[0].properties.color).toBe('#ff0000');
    });
  });

  describe('Clear Graph', () => {
    it('should clear all nodes', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('Node1', { x: 0, y: 0 });
        result.current.createNode('Node2', { x: 100, y: 0 });
        result.current.clearGraph();
      });

      expect(result.current.graph.nodes.size).toBe(0);
    });

    it('should reset history', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('Node1', { x: 0, y: 0 });
        result.current.clearGraph();
      });

      expect(result.current.history).toHaveLength(1);
      expect(result.current.historyIndex).toBe(0);
    });

    it('should mark clean after clear', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('Node1', { x: 0, y: 0 });
        result.current.clearGraph();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('Dirty State', () => {
    it('should mark dirty', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.markDirty();
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('should mark clean', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('Node', { x: 0, y: 0 });
        result.current.markClean();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('ShaderGraph Class', () => {
    it('should create empty graph', () => {
      const graph = new ShaderGraph('Test Graph');

      expect(graph.name).toBe('Test Graph');
      expect(graph.nodes.size).toBe(0);
      expect(graph.connections).toEqual([]);
    });

    it('should generate unique ID', () => {
      const g1 = new ShaderGraph('Graph1');
      const g2 = new ShaderGraph('Graph2');

      expect(g1.id).not.toBe(g2.id);
    });

    it('should track timestamps', () => {
      const graph = new ShaderGraph('Test');

      expect(graph.createdAt).toBeLessThanOrEqual(Date.now());
      expect(graph.updatedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should toJSON and fromJSON correctly', () => {
      const graph = new ShaderGraph('Test');
      graph.createNode('TestNode', { x: 10, y: 20 });

      const json = graph.toJSON();
      const restored = ShaderGraph.fromJSON(json);

      expect(restored.name).toBe('Test');
      expect(restored.nodes.size).toBe(1);
    });
  });

  describe('Store Persistence', () => {
    it('should maintain graph across hook instances', () => {
      const { result: result1 } = renderHook(() => useShaderGraph());
      const { result: result2 } = renderHook(() => useShaderGraph());

      act(() => {
        result1.current.createNode('TestNode', { x: 0, y: 0 });
      });

      expect(result2.current.graph.nodes.size).toBe(1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle connecting non-existent nodes', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.connect('non-existent-1', 'out', 'non-existent-2', 'in');
      });

      expect(result.current.graph.connections).toHaveLength(0);
    });

    it('should handle empty graph serialization', () => {
      const { result } = renderHook(() => useShaderGraph());

      const serialized = result.current.serializeGraph();
      const parsed = JSON.parse(serialized);

      expect(parsed.nodes).toEqual([]);
      expect(parsed.connections).toEqual([]);
    });

    it('should handle multiple undo beyond history', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.undo();
        result.current.undo();
        result.current.undo();
      });

      // Should not crash
      expect(result.current.canUndo()).toBe(false);
    });

    it('should handle multiple redo beyond history', () => {
      const { result } = renderHook(() => useShaderGraph());

      act(() => {
        result.current.createNode('Node', { x: 0, y: 0 });
        result.current.undo();
        result.current.redo();
        result.current.redo();
        result.current.redo();
      });

      // Should not crash
      expect(result.current.canRedo()).toBe(false);
    });
  });
});
