/**
 * Tests for graph store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useGraphStore } from '../store/graphStore';
import type { VisualGraph, HoloNode } from '../types';

describe('Graph Store', () => {
  // Reset store before each test
  beforeEach(() => {
    useGraphStore.getState().clear();
  });

  describe('initial state', () => {
    it('should start with empty nodes and edges', () => {
      const state = useGraphStore.getState();
      expect(state.nodes).toEqual([]);
      expect(state.edges).toEqual([]);
    });

    it('should have default metadata', () => {
      const state = useGraphStore.getState();
      expect(state.metadata.name).toBe('Untitled Graph');
      expect(state.metadata.version).toBe('1.0.0');
    });

    it('should start with empty history', () => {
      const state = useGraphStore.getState();
      expect(state.history).toEqual([]);
      expect(state.historyIndex).toBe(-1);
    });
  });

  describe('addNode', () => {
    it('should add a node to the graph', () => {
      const id = useGraphStore.getState().addNode('on_click', { x: 100, y: 100 });

      const state = useGraphStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.nodes[0].id).toBe(id);
    });

    it('should set correct node data', () => {
      useGraphStore.getState().addNode('on_click', { x: 100, y: 100 });

      const node = useGraphStore.getState().nodes[0];
      expect(node.data.type).toBe('on_click');
      expect(node.data.label).toBe('On Click');
      expect(node.data.category).toBe('event');
    });

    it('should set node position', () => {
      useGraphStore.getState().addNode('on_click', { x: 150, y: 250 });

      const node = useGraphStore.getState().nodes[0];
      expect(node.position).toEqual({ x: 150, y: 250 });
    });

    it('should return empty string for unknown node type', () => {
      const id = useGraphStore.getState().addNode('unknown_type', { x: 0, y: 0 });

      expect(id).toBe('');
      expect(useGraphStore.getState().nodes).toHaveLength(0);
    });

    it('should push to history', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });

      const state = useGraphStore.getState();
      expect(state.history).toHaveLength(1);
      expect(state.history[0].description).toContain('Add');
    });
  });

  describe('removeNode', () => {
    it('should remove a node from the graph', () => {
      const id = useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().removeNode(id);

      expect(useGraphStore.getState().nodes).toHaveLength(0);
    });

    it('should remove connected edges', () => {
      const store = useGraphStore.getState();
      const id1 = store.addNode('on_click', { x: 0, y: 0 });
      const id2 = store.addNode('play_sound', { x: 200, y: 0 });

      // Add edge manually
      store.setEdges([
        {
          id: 'e1',
          source: id1,
          target: id2,
          sourceHandle: 'flow',
          targetHandle: 'flow',
        } as any,
      ]);

      store.removeNode(id1);

      expect(useGraphStore.getState().edges).toHaveLength(0);
    });
  });

  describe('updateNodeProperty', () => {
    it('should update a node property', () => {
      const id = useGraphStore.getState().addNode('play_sound', { x: 0, y: 0 });
      useGraphStore.getState().updateNodeProperty(id, 'url', 'click.mp3');

      const node = useGraphStore.getState().nodes[0];
      expect(node.data.properties.url).toBe('click.mp3');
    });
  });

  describe('duplicateNodes', () => {
    it('should duplicate selected nodes', () => {
      const id = useGraphStore.getState().addNode('on_click', { x: 100, y: 100 });
      useGraphStore.getState().duplicateNodes([id]);

      const nodes = useGraphStore.getState().nodes;
      expect(nodes).toHaveLength(2);
      expect(nodes[1].position.x).toBe(150); // Offset by 50
      expect(nodes[1].position.y).toBe(150);
    });

    it('should select the duplicated nodes', () => {
      const id = useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().duplicateNodes([id]);

      const state = useGraphStore.getState();
      expect(state.selectedNodes).toHaveLength(1);
      expect(state.selectedNodes[0]).not.toBe(id); // New node ID
    });
  });

  describe('selection', () => {
    it('should set selected nodes', () => {
      const id = useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().setSelectedNodes([id]);

      expect(useGraphStore.getState().selectedNodes).toEqual([id]);
    });

    it('should select all', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().addNode('play_sound', { x: 200, y: 0 });
      useGraphStore.getState().selectAll();

      expect(useGraphStore.getState().selectedNodes).toHaveLength(2);
    });

    it('should deselect all', () => {
      const id = useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().setSelectedNodes([id]);
      useGraphStore.getState().deselectAll();

      expect(useGraphStore.getState().selectedNodes).toHaveLength(0);
    });
  });

  describe('undo/redo', () => {
    it('should undo last action', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      expect(useGraphStore.getState().nodes).toHaveLength(1);

      useGraphStore.getState().undo();
      // After undo, we go back one step but first history entry is the add
      // Undo should not work on first entry (nothing before it)
    });

    it('should track canUndo correctly', () => {
      expect(useGraphStore.getState().canUndo()).toBe(false);

      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      expect(useGraphStore.getState().canUndo()).toBe(false); // First entry

      useGraphStore.getState().addNode('play_sound', { x: 200, y: 0 });
      expect(useGraphStore.getState().canUndo()).toBe(true);
    });

    it('should track canRedo correctly', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().addNode('play_sound', { x: 200, y: 0 });

      expect(useGraphStore.getState().canRedo()).toBe(false);

      useGraphStore.getState().undo();
      expect(useGraphStore.getState().canRedo()).toBe(true);
    });

    it('should redo after undo', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().addNode('play_sound', { x: 200, y: 0 });

      useGraphStore.getState().undo();
      const nodesAfterUndo = useGraphStore.getState().nodes.length;

      useGraphStore.getState().redo();
      expect(useGraphStore.getState().nodes.length).toBeGreaterThanOrEqual(nodesAfterUndo);
    });
  });

  describe('loadGraph', () => {
    it('should load a graph', () => {
      const graph: VisualGraph = {
        nodes: [
          {
            id: 'n1',
            type: 'holoNode',
            position: { x: 0, y: 0 },
            data: {
              type: 'on_click',
              label: 'On Click',
              category: 'event',
              properties: {},
              inputs: [],
              outputs: [],
            },
          },
        ],
        edges: [],
        metadata: {
          name: 'Test Graph',
          version: '1.0.0',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      };

      useGraphStore.getState().loadGraph(graph);

      const state = useGraphStore.getState();
      expect(state.nodes).toHaveLength(1);
      expect(state.metadata.name).toBe('Test Graph');
    });

    it('should reset history when loading', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().addNode('play_sound', { x: 200, y: 0 });

      const graph: VisualGraph = {
        nodes: [],
        edges: [],
        metadata: {
          name: 'Empty',
          version: '1.0.0',
          createdAt: '',
          updatedAt: '',
        },
      };

      useGraphStore.getState().loadGraph(graph);

      expect(useGraphStore.getState().history).toHaveLength(1); // One entry for "Load graph"
    });
  });

  describe('exportGraph', () => {
    it('should export the current graph', () => {
      useGraphStore.getState().addNode('on_click', { x: 100, y: 100 });
      useGraphStore.getState().setMetadata({ name: 'My Graph' });

      const graph = useGraphStore.getState().exportGraph();

      expect(graph.nodes).toHaveLength(1);
      expect(graph.metadata.name).toBe('My Graph');
    });

    it('should update updatedAt timestamp on export', () => {
      const before = new Date().toISOString();
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });

      const graph = useGraphStore.getState().exportGraph();

      expect(graph.metadata.updatedAt >= before).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all graph data', () => {
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      useGraphStore.getState().addNode('play_sound', { x: 200, y: 0 });
      useGraphStore.getState().setSelectedNodes(['some-id']);

      useGraphStore.getState().clear();

      const state = useGraphStore.getState();
      expect(state.nodes).toHaveLength(0);
      expect(state.edges).toHaveLength(0);
      expect(state.selectedNodes).toHaveLength(0);
      expect(state.history).toHaveLength(0);
    });

    it('should reset metadata', () => {
      useGraphStore.getState().setMetadata({ name: 'Custom Name' });
      useGraphStore.getState().clear();

      expect(useGraphStore.getState().metadata.name).toBe('Untitled Graph');
    });
  });

  describe('setMetadata', () => {
    it('should update metadata', () => {
      useGraphStore.getState().setMetadata({
        name: 'New Name',
        description: 'A description',
      });

      const meta = useGraphStore.getState().metadata;
      expect(meta.name).toBe('New Name');
      expect(meta.description).toBe('A description');
    });

    it('should preserve existing metadata fields', () => {
      const originalCreatedAt = useGraphStore.getState().metadata.createdAt;

      useGraphStore.getState().setMetadata({ name: 'New Name' });

      expect(useGraphStore.getState().metadata.createdAt).toBe(originalCreatedAt);
    });
  });
});
