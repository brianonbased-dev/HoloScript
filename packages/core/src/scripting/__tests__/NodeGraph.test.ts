import { describe, it, expect, beforeEach } from 'vitest';
import { NodeGraph, type GraphNode } from '../NodeGraph';

function makeNode(id: string, ports: GraphNode['ports'] = []): GraphNode {
  return { id, type: 'generic', label: id, ports, position: { x: 0, y: 0 }, data: {} };
}

describe('NodeGraph', () => {
  let graph: NodeGraph;

  beforeEach(() => {
    graph = new NodeGraph();
  });

  it('addNode and getNodeCount', () => {
    graph.addNode(makeNode('a'));
    expect(graph.getNodeCount()).toBe(1);
  });

  it('getNode retrieves by id', () => {
    graph.addNode(makeNode('a'));
    expect(graph.getNode('a')).toBeDefined();
    expect(graph.getNode('a')!.id).toBe('a');
  });

  it('removeNode returns true', () => {
    graph.addNode(makeNode('a'));
    expect(graph.removeNode('a')).toBe(true);
    expect(graph.getNodeCount()).toBe(0);
  });

  it('removeNode returns false for missing', () => {
    expect(graph.removeNode('nope')).toBe(false);
  });

  it('removeNode also removes connected wires', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'number', direction: 'input' }]));
    graph.connect('a', 'out', 'b', 'in');
    graph.removeNode('a');
    expect(graph.getWireCount()).toBe(0);
  });

  // Connect
  it('connect creates wire and returns id', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'number', direction: 'input' }]));
    const wireId = graph.connect('a', 'out', 'b', 'in');
    expect(wireId).not.toBeNull();
    expect(graph.getWireCount()).toBe(1);
  });

  it('connect returns null for missing node', () => {
    expect(graph.connect('a', 'out', 'b', 'in')).toBeNull();
  });

  it('connect returns null for type mismatch', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'string', direction: 'input' }]));
    expect(graph.connect('a', 'out', 'b', 'in')).toBeNull();
  });

  it('connect allows "any" type compatibility', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'any', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'string', direction: 'input' }]));
    expect(graph.connect('a', 'out', 'b', 'in')).not.toBeNull();
  });

  it('connect rejects wrong port direction', () => {
    graph.addNode(makeNode('a', [{ id: 'p1', name: 'p1', type: 'number', direction: 'input' }]));
    graph.addNode(makeNode('b', [{ id: 'p2', name: 'p2', type: 'number', direction: 'input' }]));
    expect(graph.connect('a', 'p1', 'b', 'p2')).toBeNull(); // p1 not output
  });

  // Disconnect
  it('disconnect removes wire', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'number', direction: 'input' }]));
    const wireId = graph.connect('a', 'out', 'b', 'in')!;
    expect(graph.disconnect(wireId)).toBe(true);
    expect(graph.getWireCount()).toBe(0);
  });

  // Topological order
  it('getTopologicalOrder for linear chain', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(
      makeNode('b', [
        { id: 'in', name: 'in', type: 'number', direction: 'input' },
        { id: 'out', name: 'out', type: 'number', direction: 'output' },
      ])
    );
    graph.addNode(makeNode('c', [{ id: 'in', name: 'in', type: 'number', direction: 'input' }]));
    graph.connect('a', 'out', 'b', 'in');
    graph.connect('b', 'out', 'c', 'in');
    const order = graph.getTopologicalOrder();
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
  });

  it('hasCycle returns false for DAG', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'number', direction: 'input' }]));
    graph.connect('a', 'out', 'b', 'in');
    expect(graph.hasCycle()).toBe(false);
  });

  // getWiresForNode
  it('getWiresForNode returns connected wires', () => {
    graph.addNode(makeNode('a', [{ id: 'out', name: 'out', type: 'number', direction: 'output' }]));
    graph.addNode(makeNode('b', [{ id: 'in', name: 'in', type: 'number', direction: 'input' }]));
    graph.connect('a', 'out', 'b', 'in');
    expect(graph.getWiresForNode('a')).toHaveLength(1);
    expect(graph.getWiresForNode('b')).toHaveLength(1);
  });

  // getAllNodes
  it('getAllNodes returns all', () => {
    graph.addNode(makeNode('a'));
    graph.addNode(makeNode('b'));
    expect(graph.getAllNodes()).toHaveLength(2);
  });
});
