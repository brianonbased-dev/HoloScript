/**
 * Tests for GraphToCode converter
 */

import { describe, it, expect } from 'vitest';
import { GraphToCode, graphToCode } from '../codegen/GraphToCode';
import type { VisualGraph, HoloNode, HoloEdge } from '../types';

/**
 * Create a test graph
 */
function createTestGraph(nodes: HoloNode[], edges: HoloEdge[] = []): VisualGraph {
  return {
    nodes,
    edges,
    metadata: {
      name: 'Test Graph',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  };
}

/**
 * Create a test node
 */
function createNode(
  id: string,
  type: string,
  category: 'event' | 'action' | 'logic' | 'data',
  label: string,
  properties: Record<string, any> = {},
  inputs: any[] = [],
  outputs: any[] = []
): HoloNode {
  return {
    id,
    type: 'holoNode',
    position: { x: 0, y: 0 },
    data: {
      type,
      label,
      category,
      properties,
      inputs,
      outputs,
    },
  };
}

describe('GraphToCode', () => {
  describe('basic conversion', () => {
    it('should generate empty object for empty graph', () => {
      const graph = createTestGraph([]);
      const result = graphToCode(graph, { objectName: 'empty' });

      expect(result.code).toContain('orb empty');
      expect(result.errors).toHaveLength(0);
    });

    it('should add warning for graph without events', () => {
      const graph = createTestGraph([]);
      const result = graphToCode(graph);

      expect(result.warnings).toContain(
        'No event nodes found. The generated code will not have any behavior triggers.'
      );
    });

    it('should generate code for single event node', () => {
      const nodes: HoloNode[] = [
        createNode(
          '1',
          'on_click',
          'event',
          'On Click',
          {},
          [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]
        ),
      ];

      const graph = createTestGraph(nodes);
      const result = graphToCode(graph, { format: 'hsplus' });

      expect(result.code).toContain('@clickable');
      expect(result.code).toContain('on_click:');
    });

    it('should generate code for event -> action chain', () => {
      const nodes: HoloNode[] = [
        createNode(
          'event1',
          'on_click',
          'event',
          'On Click',
          {},
          [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]
        ),
        createNode(
          'action1',
          'play_sound',
          'action',
          'Play Sound',
          { url: 'click.mp3' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]
        ),
      ];

      const edges: HoloEdge[] = [
        {
          id: 'e1',
          source: 'event1',
          target: 'action1',
          sourceHandle: 'flow',
          targetHandle: 'flow',
        } as HoloEdge,
      ];

      const graph = createTestGraph(nodes, edges);
      const result = graphToCode(graph, { format: 'hsplus' });

      expect(result.code).toContain('audio.play("click.mp3")');
    });
  });

  describe('trait inference', () => {
    it('should add clickable trait for on_click event', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_click', 'event', 'On Click')];

      const result = graphToCode(createTestGraph(nodes));
      expect(result.code).toContain('@clickable');
    });

    it('should add grabbable trait for on_grab event', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_grab', 'event', 'On Grab')];

      const result = graphToCode(createTestGraph(nodes));
      expect(result.code).toContain('@grabbable');
    });

    it('should add hoverable trait for on_hover event', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_hover', 'event', 'On Hover')];

      const result = graphToCode(createTestGraph(nodes));
      expect(result.code).toContain('@hoverable');
    });

    it('should add collidable trait for collision events', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_collision', 'event', 'On Collision')];

      const result = graphToCode(createTestGraph(nodes));
      expect(result.code).toContain('@collidable');
    });

    it('should add animated trait for play_animation action', () => {
      const nodes: HoloNode[] = [
        createNode('1', 'on_click', 'event', 'On Click'),
        createNode('2', 'play_animation', 'action', 'Play Animation'),
      ];

      const result = graphToCode(createTestGraph(nodes));
      expect(result.code).toContain('@animated');
    });
  });

  describe('format options', () => {
    it('should generate .hs format', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_click', 'event', 'On Click')];

      const result = graphToCode(createTestGraph(nodes), { format: 'hs' });

      expect(result.format).toBe('hs');
      expect(result.code).toContain('# Generated from');
      expect(result.code).toContain('orb');
    });

    it('should generate .hsplus format', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_click', 'event', 'On Click')];

      const result = graphToCode(createTestGraph(nodes), { format: 'hsplus' });

      expect(result.format).toBe('hsplus');
      expect(result.code).toContain('// Generated from');
    });

    it('should generate .holo format', () => {
      const nodes: HoloNode[] = [createNode('1', 'on_click', 'event', 'On Click')];

      const result = graphToCode(createTestGraph(nodes), { format: 'holo' });

      expect(result.format).toBe('holo');
      expect(result.code).toContain('composition "Test Graph"');
      expect(result.code).toContain('environment');
      expect(result.code).toContain('logic');
    });

    it('should use custom object name', () => {
      const graph = createTestGraph([]);
      const result = graphToCode(graph, { objectName: 'myCustomObject' });

      expect(result.code).toContain('myCustomObject');
    });

    it('should include comments when enabled', () => {
      const graph = createTestGraph([]);
      const result = graphToCode(graph, { includeComments: true });

      expect(result.code).toContain('Generated from');
    });

    it('should omit comments when disabled', () => {
      const graph = createTestGraph([]);
      const result = graphToCode(graph, { includeComments: false });

      expect(result.code).not.toContain('Generated from');
    });
  });

  describe('action node code generation', () => {
    it('should generate set_property code', () => {
      const nodes: HoloNode[] = [
        createNode(
          '1',
          'on_click',
          'event',
          'On Click',
          {},
          [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]
        ),
        createNode(
          '2',
          'set_property',
          'action',
          'Set Property',
          { property: 'color' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          [{ id: 'flow', label: 'Then', type: 'flow' }]
        ),
      ];

      const edges: HoloEdge[] = [
        {
          id: 'e1',
          source: '1',
          target: '2',
          sourceHandle: 'flow',
          targetHandle: 'flow',
        } as HoloEdge,
      ];

      const result = graphToCode(createTestGraph(nodes, edges));
      expect(result.code).toContain('this.color');
    });

    it('should generate toggle code', () => {
      const nodes: HoloNode[] = [
        createNode(
          '1',
          'on_click',
          'event',
          'On Click',
          {},
          [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]
        ),
        createNode(
          '2',
          'toggle',
          'action',
          'Toggle',
          { property: 'visible' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          []
        ),
      ];

      const edges: HoloEdge[] = [
        {
          id: 'e1',
          source: '1',
          target: '2',
          sourceHandle: 'flow',
          targetHandle: 'flow',
        } as HoloEdge,
      ];

      const result = graphToCode(createTestGraph(nodes, edges));
      expect(result.code).toContain('this.visible = !this.visible');
    });

    it('should generate spawn code', () => {
      const nodes: HoloNode[] = [
        createNode(
          '1',
          'on_click',
          'event',
          'On Click',
          {},
          [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]
        ),
        createNode(
          '2',
          'spawn',
          'action',
          'Spawn',
          { template: 'Bullet' },
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          []
        ),
      ];

      const edges: HoloEdge[] = [
        {
          id: 'e1',
          source: '1',
          target: '2',
          sourceHandle: 'flow',
          targetHandle: 'flow',
        } as HoloEdge,
      ];

      const result = graphToCode(createTestGraph(nodes, edges));
      expect(result.code).toContain('scene.spawn("Bullet")');
    });

    it('should generate destroy code', () => {
      const nodes: HoloNode[] = [
        createNode(
          '1',
          'on_click',
          'event',
          'On Click',
          {},
          [],
          [{ id: 'flow', label: 'Execute', type: 'flow' }]
        ),
        createNode(
          '2',
          'destroy',
          'action',
          'Destroy',
          {},
          [{ id: 'flow', label: 'Execute', type: 'flow' }],
          []
        ),
      ];

      const edges: HoloEdge[] = [
        {
          id: 'e1',
          source: '1',
          target: '2',
          sourceHandle: 'flow',
          targetHandle: 'flow',
        } as HoloEdge,
      ];

      const result = graphToCode(createTestGraph(nodes, edges));
      expect(result.code).toContain('this.destroy()');
    });
  });

  describe('data node code generation', () => {
    it('should generate random value code', () => {
      const nodes: HoloNode[] = [createNode('1', 'random', 'data', 'Random', { min: 0, max: 100 })];

      const converter = new GraphToCode();
      // Access internal method via any cast for testing
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'value'
      );

      expect(code).toContain('random(0, 100)');
    });

    it('should generate vector3 code', () => {
      const nodes: HoloNode[] = [
        createNode('1', 'vector3', 'data', 'Vector3', { x: 1, y: 2, z: 3 }),
      ];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'vector'
      );

      expect(code).toBe('[1, 2, 3]');
    });

    it('should generate this reference', () => {
      const nodes: HoloNode[] = [createNode('1', 'this', 'data', 'This', {})];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'object'
      );

      expect(code).toBe('this');
    });
  });

  describe('logic node code generation', () => {
    it('should generate math operation code', () => {
      const nodes: HoloNode[] = [createNode('1', 'math', 'logic', 'Math', { operator: '+' })];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'result'
      );

      expect(code).toContain('+');
    });

    it('should generate compare operation code', () => {
      const nodes: HoloNode[] = [createNode('1', 'compare', 'logic', 'Compare', { operator: '>' })];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'result'
      );

      expect(code).toContain('>');
    });

    it('should generate and operation code', () => {
      const nodes: HoloNode[] = [createNode('1', 'and', 'logic', 'And', {})];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'result'
      );

      expect(code).toContain('&&');
    });

    it('should generate or operation code', () => {
      const nodes: HoloNode[] = [createNode('1', 'or', 'logic', 'Or', {})];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'result'
      );

      expect(code).toContain('||');
    });

    it('should generate not operation code', () => {
      const nodes: HoloNode[] = [createNode('1', 'not', 'logic', 'Not', {})];

      const converter = new GraphToCode();
      const code = (converter as any).generateDataNodeCode(
        { node: nodes[0], incomingEdges: [], outgoingEdges: [], processed: false, code: '' },
        'result'
      );

      expect(code).toContain('!');
    });
  });

  describe('validation', () => {
    it('should report error for unknown node type', () => {
      const nodes: HoloNode[] = [createNode('1', 'unknown_type', 'event', 'Unknown')];

      const result = graphToCode(createTestGraph(nodes));

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Unknown node type');
    });

    it('should warn about disconnected non-event nodes', () => {
      const nodes: HoloNode[] = [
        createNode('1', 'on_click', 'event', 'On Click'),
        createNode('2', 'play_sound', 'action', 'Play Sound'), // Not connected
      ];

      const result = graphToCode(createTestGraph(nodes));

      expect(result.warnings.some((w) => w.includes('no incoming connections'))).toBe(true);
    });
  });

  describe('value formatting', () => {
    it('should format strings with quotes', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue('hello')).toBe('"hello"');
    });

    it('should format colors with quotes', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue('#ff0000')).toBe('"#ff0000"');
    });

    it('should format numbers without quotes', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue(42)).toBe('42');
    });

    it('should format booleans', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue(true)).toBe('true');
      expect((converter as any).formatValue(false)).toBe('false');
    });

    it('should format null', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue(null)).toBe('null');
      expect((converter as any).formatValue(undefined)).toBe('null');
    });

    it('should format arrays', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue([1, 2, 3])).toBe('[1, 2, 3]');
    });

    it('should format objects', () => {
      const converter = new GraphToCode();
      expect((converter as any).formatValue({ x: 1, y: 2 })).toBe('{ x: 1, y: 2 }');
    });
  });
});
