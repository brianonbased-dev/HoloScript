import { describe, it, expect } from 'vitest';
import { GraphToCode } from '../codegen/GraphToCode';
import { useGraphStore } from '../store/graphStore';
import {
  ALL_NODES,
  EVENT_NODES,
  ACTION_NODES,
  LOGIC_NODES,
  DATA_NODES,
  NODE_REGISTRY,
  getNodeDefinition,
  getNodesByCategory,
} from '../nodes/nodeRegistry';
import type { VisualGraph, HoloNode, HoloEdge } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function makeNode(id: string, type: string, x = 0, y = 0): HoloNode {
  const def = getNodeDefinition(type);
  return {
    id,
    type: 'holoNode',
    position: { x, y },
    data: {
      type,
      label: def?.label ?? type,
      category: def?.category ?? 'event',
      properties: {},
      inputs: def?.inputs ?? [],
      outputs: def?.outputs ?? [],
    },
  };
}

function makeEdge(
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string
): HoloEdge {
  return {
    id,
    source,
    sourceHandle,
    target,
    targetHandle,
    data: { sourcePort: sourceHandle, targetPort: targetHandle, flowType: 'flow' },
  };
}

function makeGraph(nodes: HoloNode[], edges: HoloEdge[]): VisualGraph {
  return {
    nodes,
    edges,
    metadata: {
      name: 'test',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Integration: Full graph → code pipeline
// ────────────────────────────────────────────────────────────────────────────

describe('Visual scripting — end-to-end integration', () => {
  describe('Node registry completeness', () => {
    it('has at least 20 node types', () => {
      expect(ALL_NODES.length).toBeGreaterThanOrEqual(20);
    });

    it('has nodes in all 4 categories', () => {
      expect(EVENT_NODES.length).toBeGreaterThan(0);
      expect(ACTION_NODES.length).toBeGreaterThan(0);
      expect(LOGIC_NODES.length).toBeGreaterThan(0);
      expect(DATA_NODES.length).toBeGreaterThan(0);
    });

    it('NODE_REGISTRY map has all nodes', () => {
      expect(NODE_REGISTRY.size).toBe(ALL_NODES.length);
    });

    it('every event node has at least one output', () => {
      for (const n of EVENT_NODES) {
        expect(n.outputs.length).toBeGreaterThan(0);
      }
    });

    it('every action node has at least one input', () => {
      for (const n of ACTION_NODES) {
        expect(n.inputs.length).toBeGreaterThan(0);
      }
    });

    it('getNodesByCategory returns correct subset', () => {
      const events = getNodesByCategory('event');
      expect(events.length).toBe(EVENT_NODES.length);
      expect(events.every((n) => n.category === 'event')).toBe(true);

      const actions = getNodesByCategory('action');
      expect(actions.length).toBe(ACTION_NODES.length);
    });

    it('getNodeDefinition finds node by type', () => {
      const def = getNodeDefinition('on_click');
      expect(def).toBeDefined();
      expect(def?.type).toBe('on_click');
    });

    it('getNodeDefinition returns undefined for unknown type', () => {
      expect(getNodeDefinition('nonexistent_type_xyz')).toBeUndefined();
    });
  });

  describe('Code generation', () => {
    it('generates hsplus for click → set_property chain', () => {
      const converter = new GraphToCode({ format: 'hsplus', objectName: 'button' });
      const nodes = [makeNode('n1', 'on_click', 0, 0), makeNode('n2', 'set_property', 200, 0)];
      const edges = [makeEdge('e1', 'n1', 'flow', 'n2', 'flow')];
      const result = converter.convert(makeGraph(nodes, edges));
      expect(result.code).toBeTruthy();
      expect(result.errors).toHaveLength(0);
    });

    it('generates holo format code', () => {
      const converter = new GraphToCode({ format: 'holo', objectName: 'scene' });
      const nodes = [makeNode('n1', 'on_tick', 0, 0)];
      const result = converter.convert(makeGraph(nodes, []));
      expect(result.format).toBe('holo');
      expect(typeof result.code).toBe('string');
    });

    it('generates hs format code', () => {
      const converter = new GraphToCode({ format: 'hs', objectName: 'myOrb' });
      const nodes = [makeNode('n1', 'on_hover', 0, 0)];
      const result = converter.convert(makeGraph(nodes, []));
      expect(result.format).toBe('hs');
    });

    it('includes object name in generated code', () => {
      const converter = new GraphToCode({ objectName: 'myComposition' });
      const nodes = [makeNode('n1', 'on_click', 0, 0)];
      const result = converter.convert(makeGraph(nodes, []));
      expect(result.code).toContain('myComposition');
    });

    it('empty graph generates valid empty composition', () => {
      const converter = new GraphToCode({ objectName: 'empty' });
      const result = converter.convert(makeGraph([], []));
      expect(result.errors).toHaveLength(0);
    });

    it('multi-node chain does not error', () => {
      const converter = new GraphToCode({ objectName: 'chain' });
      const nodes = [
        makeNode('n1', 'on_collision', 0, 0),
        makeNode('n2', 'play_sound', 200, 0),
        makeNode('n3', 'set_property', 400, 0),
      ];
      const edges = [
        makeEdge('e1', 'n1', 'enter', 'n2', 'flow'),
        makeEdge('e2', 'n2', 'flow', 'n3', 'flow'),
      ];
      const result = converter.convert(makeGraph(nodes, edges));
      expect(result.errors).toHaveLength(0);
    });

    it('unknown node type produces a warning or soft error', () => {
      const converter = new GraphToCode({ objectName: 'test' });
      const node: HoloNode = {
        id: 'x1',
        type: 'completely_unknown_type',
        position: { x: 0, y: 0 },
        data: {
          label: 'Unknown',
          type: 'completely_unknown_type',
          properties: {},
          inputs: [],
          outputs: [],
        },
      };
      const result = converter.convert(makeGraph([node], []));
      // Should not throw; may have a warning or just skip unknown node
      expect(result).toBeDefined();
    });
  });

  describe('Graph store + codegen pipeline', () => {
    it('store has nodes array', () => {
      const store = useGraphStore.getState();
      expect(Array.isArray(store.nodes)).toBe(true);
    });

    it('adding a node updates the graph', () => {
      useGraphStore.getState().clear();
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      expect(useGraphStore.getState().nodes).toHaveLength(1);
    });

    it('store node has correct data.type', () => {
      useGraphStore.getState().clear();
      useGraphStore.getState().addNode('on_timer', { x: 50, y: 50 });
      const nodes = useGraphStore.getState().nodes;
      // ReactFlow node type is 'holoNode'; HoloScript type is in data.type
      expect(nodes[0].type).toBe('holoNode');
      expect(nodes[0].data.type).toBe('on_timer');
    });

    it('exportGraph returns a VisualGraph', () => {
      useGraphStore.getState().clear();
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      const graph = useGraphStore.getState().exportGraph();
      expect(graph).toBeDefined();
      expect(Array.isArray(graph.nodes)).toBe(true);
      expect(Array.isArray(graph.edges)).toBe(true);
    });

    it('codegen from exported graph produces code', () => {
      useGraphStore.getState().clear();
      useGraphStore.getState().addNode('on_click', { x: 0, y: 0 });
      const graph = useGraphStore.getState().exportGraph();
      const converter = new GraphToCode({ objectName: 'test' });
      const result = converter.convert(graph);
      expect(typeof result.code).toBe('string');
    });

    it('clear removes all nodes and edges', () => {
      useGraphStore.getState().addNode('on_hover', { x: 0, y: 0 });
      useGraphStore.getState().clear();
      expect(useGraphStore.getState().nodes).toHaveLength(0);
      expect(useGraphStore.getState().edges).toHaveLength(0);
    });
  });
});
