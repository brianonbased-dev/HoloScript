/**
 * NodeGraph — production test suite
 *
 * Tests: addNode/removeNode/getNode/getNodeCount, connect/disconnect,
 * getWireCount, getWiresForNode, topological ordering (linear chain,
 * diamond DAG), hasCycle detection, getAllNodes, type compatibility check.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NodeGraph } from '../NodeGraph';
import type { GraphNode } from '../NodeGraph';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNode(id: string, type = 'generic'): GraphNode {
  return {
    id,
    type,
    label: `Node ${id}`,
    position: { x: 0, y: 0 },
    data: {},
    ports: [
      { id: 'out', name: 'Out', type: 'number', direction: 'output' },
      { id: 'in', name: 'In', type: 'number', direction: 'input' },
    ],
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('NodeGraph: production', () => {
  let graph: NodeGraph;

  beforeEach(() => {
    graph = new NodeGraph();
  });

  // ─── addNode / getNode / getNodeCount / getAllNodes ────────────────────────
  describe('node management', () => {
    it('starts with 0 nodes', () => {
      expect(graph.getNodeCount()).toBe(0);
    });

    it('addNode increments count', () => {
      graph.addNode(makeNode('n1'));
      expect(graph.getNodeCount()).toBe(1);
    });

    it('getNode returns the added node', () => {
      graph.addNode(makeNode('n1', 'math'));
      expect(graph.getNode('n1')?.type).toBe('math');
    });

    it('getNode returns undefined for unknown id', () => {
      expect(graph.getNode('ghost')).toBeUndefined();
    });

    it('getAllNodes returns all added nodes', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      const ids = graph.getAllNodes().map((n) => n.id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');
    });

    it('removeNode removes the node', () => {
      graph.addNode(makeNode('n1'));
      expect(graph.removeNode('n1')).toBe(true);
      expect(graph.getNodeCount()).toBe(0);
    });

    it('removeNode returns false for unknown id', () => {
      expect(graph.removeNode('ghost')).toBe(false);
    });
  });

  // ─── connect / disconnect / getWireCount ──────────────────────────────────
  describe('wire management', () => {
    it('starts with 0 wires', () => {
      expect(graph.getWireCount()).toBe(0);
    });

    it('connect creates a wire and increments count', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      const wireId = graph.connect('a', 'out', 'b', 'in');
      expect(wireId).not.toBeNull();
      expect(graph.getWireCount()).toBe(1);
    });

    it('connect returns null if either node is missing', () => {
      graph.addNode(makeNode('a'));
      expect(graph.connect('a', 'out', 'ghost', 'in')).toBeNull();
    });

    it('connect returns null for type mismatch', () => {
      const nodeA: GraphNode = {
        id: 'a',
        type: 'x',
        label: 'A',
        position: { x: 0, y: 0 },
        data: {},
        ports: [{ id: 'out', name: 'Out', type: 'string', direction: 'output' }],
      };
      const nodeB: GraphNode = {
        id: 'b',
        type: 'y',
        label: 'B',
        position: { x: 0, y: 0 },
        data: {},
        ports: [{ id: 'in', name: 'In', type: 'number', direction: 'input' }],
      };
      graph.addNode(nodeA);
      graph.addNode(nodeB);
      expect(graph.connect('a', 'out', 'b', 'in')).toBeNull();
    });

    it('connect succeeds for any→number (any type)', () => {
      const nodeA: GraphNode = {
        id: 'a',
        type: 'x',
        label: 'A',
        position: { x: 0, y: 0 },
        data: {},
        ports: [{ id: 'out', name: 'Out', type: 'any', direction: 'output' }],
      };
      const nodeB: GraphNode = {
        id: 'b',
        type: 'y',
        label: 'B',
        position: { x: 0, y: 0 },
        data: {},
        ports: [{ id: 'in', name: 'In', type: 'number', direction: 'input' }],
      };
      graph.addNode(nodeA);
      graph.addNode(nodeB);
      expect(graph.connect('a', 'out', 'b', 'in')).not.toBeNull();
    });

    it('disconnect removes the wire', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      const wireId = graph.connect('a', 'out', 'b', 'in')!;
      expect(graph.disconnect(wireId)).toBe(true);
      expect(graph.getWireCount()).toBe(0);
    });

    it('disconnect returns false for unknown wireId', () => {
      expect(graph.disconnect('fake-wire')).toBe(false);
    });

    it('removeNode removes connected wires', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.connect('a', 'out', 'b', 'in');
      graph.removeNode('a');
      expect(graph.getWireCount()).toBe(0);
    });
  });

  // ─── getWiresForNode ──────────────────────────────────────────────────────
  describe('getWiresForNode', () => {
    it('returns wires connected to a node', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.connect('a', 'out', 'b', 'in');
      expect(graph.getWiresForNode('a').length).toBe(1);
      expect(graph.getWiresForNode('b').length).toBe(1);
    });

    it('returns empty for node with no wires', () => {
      graph.addNode(makeNode('solo'));
      expect(graph.getWiresForNode('solo')).toHaveLength(0);
    });
  });

  // ─── topological order ────────────────────────────────────────────────────
  describe('getTopologicalOrder', () => {
    it('returns empty for empty graph', () => {
      expect(graph.getTopologicalOrder()).toHaveLength(0);
    });

    it('returns single node for single-node graph', () => {
      graph.addNode(makeNode('n1'));
      expect(graph.getTopologicalOrder()).toEqual(['n1']);
    });

    it('returns correct order for linear chain (a→b→c)', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.addNode(makeNode('c'));
      graph.connect('a', 'out', 'b', 'in');
      graph.connect('b', 'out', 'c', 'in');
      const order = graph.getTopologicalOrder();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('produces valid order for diamond DAG (a→b,c→d)', () => {
      // a has two outputs; b and c both connect to d
      const nodeA: GraphNode = {
        id: 'a',
        type: 't',
        label: 'A',
        position: { x: 0, y: 0 },
        data: {},
        ports: [
          { id: 'out1', name: 'Out1', type: 'number', direction: 'output' },
          { id: 'out2', name: 'Out2', type: 'number', direction: 'output' },
        ],
      };
      const nodeB: GraphNode = {
        id: 'b',
        type: 't',
        label: 'B',
        position: { x: 0, y: 0 },
        data: {},
        ports: [
          { id: 'in', name: 'In', type: 'number', direction: 'input' },
          { id: 'out', name: 'Out', type: 'number', direction: 'output' },
        ],
      };
      const nodeC: GraphNode = {
        id: 'c',
        type: 't',
        label: 'C',
        position: { x: 0, y: 0 },
        data: {},
        ports: [
          { id: 'in', name: 'In', type: 'number', direction: 'input' },
          { id: 'out', name: 'Out', type: 'number', direction: 'output' },
        ],
      };
      const nodeD: GraphNode = {
        id: 'd',
        type: 't',
        label: 'D',
        position: { x: 0, y: 0 },
        data: {},
        ports: [
          { id: 'in1', name: 'In1', type: 'number', direction: 'input' },
          { id: 'in2', name: 'In2', type: 'number', direction: 'input' },
        ],
      };
      graph.addNode(nodeA);
      graph.addNode(nodeB);
      graph.addNode(nodeC);
      graph.addNode(nodeD);
      graph.connect('a', 'out1', 'b', 'in');
      graph.connect('a', 'out2', 'c', 'in');
      graph.connect('b', 'out', 'd', 'in1');
      graph.connect('c', 'out', 'd', 'in2');
      const order = graph.getTopologicalOrder();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('d'));
      expect(order.indexOf('c')).toBeLessThan(order.indexOf('d'));
      expect(order).toHaveLength(4);
    });
  });

  // ─── hasCycle ─────────────────────────────────────────────────────────────
  describe('hasCycle', () => {
    it('returns false for empty graph', () => {
      expect(graph.hasCycle()).toBe(false);
    });

    it('returns false for acyclic linear chain', () => {
      graph.addNode(makeNode('a'));
      graph.addNode(makeNode('b'));
      graph.connect('a', 'out', 'b', 'in');
      expect(graph.hasCycle()).toBe(false);
    });
  });
});
