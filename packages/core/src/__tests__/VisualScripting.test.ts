import { describe, it, expect, beforeEach } from 'vitest';
import { NodeGraph } from '../scripting/NodeGraph';
import { GraphCompiler } from '../scripting/GraphCompiler';
import { NodeLibrary } from '../scripting/NodeLibrary';

describe('Visual Scripting (Cycle 176)', () => {
  describe('NodeGraph', () => {
    let graph: NodeGraph;

    beforeEach(() => {
      graph = new NodeGraph();
    });

    it('should add and retrieve nodes', () => {
      graph.addNode({
        id: 'n1',
        type: 'math.add',
        label: 'Add',
        ports: [],
        position: { x: 0, y: 0 },
        data: {},
      });
      expect(graph.getNodeCount()).toBe(1);
      expect(graph.getNode('n1')?.type).toBe('math.add');
    });

    it('should connect nodes with compatible ports', () => {
      graph.addNode({
        id: 'n1',
        type: 'const',
        label: 'Const',
        ports: [{ id: 'out', name: 'Out', type: 'number', direction: 'output' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'n2',
        type: 'add',
        label: 'Add',
        ports: [{ id: 'in', name: 'In', type: 'number', direction: 'input' }],
        position: { x: 100, y: 0 },
        data: {},
      });
      const wireId = graph.connect('n1', 'out', 'n2', 'in');
      expect(wireId).not.toBeNull();
      expect(graph.getWireCount()).toBe(1);
    });

    it('should reject incompatible port types', () => {
      graph.addNode({
        id: 'n1',
        type: 'a',
        label: 'A',
        ports: [{ id: 'out', name: 'Out', type: 'number', direction: 'output' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'n2',
        type: 'b',
        label: 'B',
        ports: [{ id: 'in', name: 'In', type: 'boolean', direction: 'input' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      expect(graph.connect('n1', 'out', 'n2', 'in')).toBeNull();
    });

    it('should detect cycles', () => {
      graph.addNode({
        id: 'a',
        type: 't',
        label: 'A',
        ports: [
          { id: 'out', name: 'O', type: 'any', direction: 'output' },
          { id: 'in', name: 'I', type: 'any', direction: 'input' },
        ],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'b',
        type: 't',
        label: 'B',
        ports: [
          { id: 'out', name: 'O', type: 'any', direction: 'output' },
          { id: 'in', name: 'I', type: 'any', direction: 'input' },
        ],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.connect('a', 'out', 'b', 'in');
      graph.connect('b', 'out', 'a', 'in');
      expect(graph.hasCycle()).toBe(true);
    });

    it('should produce topological order', () => {
      graph.addNode({
        id: 'a',
        type: 't',
        label: 'A',
        ports: [{ id: 'out', name: 'O', type: 'any', direction: 'output' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'b',
        type: 't',
        label: 'B',
        ports: [
          { id: 'in', name: 'I', type: 'any', direction: 'input' },
          { id: 'out', name: 'O', type: 'any', direction: 'output' },
        ],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'c',
        type: 't',
        label: 'C',
        ports: [{ id: 'in', name: 'I', type: 'any', direction: 'input' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.connect('a', 'out', 'b', 'in');
      graph.connect('b', 'out', 'c', 'in');
      const order = graph.getTopologicalOrder();
      expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
      expect(order.indexOf('b')).toBeLessThan(order.indexOf('c'));
    });

    it('should remove nodes and clean up wires', () => {
      graph.addNode({
        id: 'a',
        type: 't',
        label: 'A',
        ports: [{ id: 'out', name: 'O', type: 'any', direction: 'output' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'b',
        type: 't',
        label: 'B',
        ports: [{ id: 'in', name: 'I', type: 'any', direction: 'input' }],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.connect('a', 'out', 'b', 'in');
      graph.removeNode('a');
      expect(graph.getNodeCount()).toBe(1);
      expect(graph.getWireCount()).toBe(0);
    });
  });

  describe('GraphCompiler', () => {
    it('should compile a valid graph into ordered steps', () => {
      const graph = new NodeGraph();
      const lib = new NodeLibrary();
      graph.addNode(lib.createNode('math.add', 'add1', { x: 0, y: 0 })!);
      graph.addNode(lib.createNode('math.multiply', 'mul1', { x: 100, y: 0 })!);
      graph.connect('add1', 'result', 'mul1', 'a');

      const compiler = new GraphCompiler();
      const result = compiler.compile(graph);
      expect(result.errors).toHaveLength(0);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[0].nodeId).toBe('add1');
    });

    it('should reject cyclic graphs', () => {
      const graph = new NodeGraph();
      graph.addNode({
        id: 'a',
        type: 't',
        label: 'A',
        ports: [
          { id: 'out', name: 'O', type: 'any', direction: 'output' },
          { id: 'in', name: 'I', type: 'any', direction: 'input' },
        ],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.addNode({
        id: 'b',
        type: 't',
        label: 'B',
        ports: [
          { id: 'out', name: 'O', type: 'any', direction: 'output' },
          { id: 'in', name: 'I', type: 'any', direction: 'input' },
        ],
        position: { x: 0, y: 0 },
        data: {},
      });
      graph.connect('a', 'out', 'b', 'in');
      graph.connect('b', 'out', 'a', 'in');

      const compiler = new GraphCompiler();
      const result = compiler.compile(graph);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('NodeLibrary', () => {
    let lib: NodeLibrary;

    beforeEach(() => {
      lib = new NodeLibrary();
    });

    it('should have built-in nodes', () => {
      expect(lib.getCount()).toBeGreaterThanOrEqual(9);
    });

    it('should categorize nodes', () => {
      const categories = lib.getCategories();
      expect(categories).toContain('math');
      expect(categories).toContain('logic');
      expect(categories).toContain('flow');
    });

    it('should search nodes', () => {
      const results = lib.search('add');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should evaluate math.add', () => {
      const def = lib.get('math.add')!;
      const result = def.evaluate!({ a: 3, b: 7 });
      expect(result.result).toBe(10);
    });

    it('should create nodes from definitions', () => {
      const node = lib.createNode('math.clamp', 'c1');
      expect(node).not.toBeNull();
      expect(node!.ports).toHaveLength(4);
    });
  });
});
