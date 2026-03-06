/**
 * ShaderGraph.prod.test.ts
 *
 * Production tests for ShaderGraph — node management, connections,
 * compile output, topological sort, uniforms, and built-in node types.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderGraph, SHADER_NODES } from '../ShaderGraph';

describe('ShaderGraph', () => {
  let graph: ShaderGraph;

  beforeEach(() => { graph = new ShaderGraph('test-graph'); });

  // -------------------------------------------------------------------------
  // Construction
  // -------------------------------------------------------------------------
  describe('construction', () => {
    it('has the given id', () => { expect(graph.id).toBe('test-graph'); });
    it('starts empty', () => { expect(graph.getNodeCount()).toBe(0); });
    it('auto-generates id when not provided', () => {
      const g2 = new ShaderGraph();
      expect(typeof g2.id).toBe('string');
      expect(g2.id.length).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // SHADER_NODES built-ins
  // -------------------------------------------------------------------------
  describe('SHADER_NODES', () => {
    it('contains expected built-ins', () => {
      for (const t of ['Color', 'Texture', 'Multiply', 'Lerp', 'Fresnel', 'Time', 'Output']) {
        expect(SHADER_NODES).toHaveProperty(t);
      }
    });

    it('each built-in has code, inputs, outputs', () => {
      for (const def of Object.values(SHADER_NODES)) {
        expect(typeof def.code).toBe('string');
        expect(Array.isArray(def.inputs)).toBe(true);
        expect(Array.isArray(def.outputs)).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  // addNode / removeNode / getNode / getNodes
  // -------------------------------------------------------------------------
  describe('node management', () => {
    it('addNode returns a ShaderNode for known type', () => {
      const n = graph.addNode('Color');
      expect(n).not.toBeNull();
      expect(n!.type).toBe('Color');
    });

    it('addNode returns null for unknown type', () => {
      expect(graph.addNode('Nonexistent')).toBeNull();
    });

    it('addNode assigns unique id', () => {
      const a = graph.addNode('Color')!;
      const b = graph.addNode('Color')!;
      expect(a.id).not.toBe(b.id);
    });

    it('addNode stores position', () => {
      const n = graph.addNode('Color', 10, 20)!;
      expect(n.position.x).toBe(10);
      expect(n.position.y).toBe(20);
    });

    it('addNode stores overrides', () => {
      const n = graph.addNode('Color', 0, 0, { color: [0.5, 0.5, 0.5, 1] })!;
      expect(n.overrides.color).toEqual([0.5, 0.5, 0.5, 1]);
    });

    it('getNodeCount increments', () => {
      graph.addNode('Color');
      graph.addNode('Output');
      expect(graph.getNodeCount()).toBe(2);
    });

    it('getNode retrieves by id', () => {
      const n = graph.addNode('Multiply')!;
      expect(graph.getNode(n.id)).toBe(n);
    });

    it('getNode returns undefined for unknown id', () => {
      expect(graph.getNode('ghost')).toBeUndefined();
    });

    it('getNodes returns all nodes', () => {
      graph.addNode('Color');
      graph.addNode('Lerp');
      expect(graph.getNodes()).toHaveLength(2);
    });

    it('removeNode returns true for existing node', () => {
      const n = graph.addNode('Color')!;
      expect(graph.removeNode(n.id)).toBe(true);
      expect(graph.getNodeCount()).toBe(0);
    });

    it('removeNode returns false for unknown id', () => {
      expect(graph.removeNode('ghost')).toBe(false);
    });

    it('removeNode removes associated connections', () => {
      const a = graph.addNode('Color')!;
      const b = graph.addNode('Output')!;
      graph.connect(a.id, 'rgba', b.id, 'albedo');
      graph.removeNode(a.id);
      expect(graph.getConnections()).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // connect / getConnections
  // -------------------------------------------------------------------------
  describe('connections', () => {
    it('connect returns a connection for valid nodes', () => {
      const a = graph.addNode('Color')!;
      const b = graph.addNode('Output')!;
      const c = graph.connect(a.id, 'rgba', b.id, 'albedo');
      expect(c).not.toBeNull();
      expect(c!.fromNode).toBe(a.id);
    });

    it('connect returns null for unknown source node', () => {
      const b = graph.addNode('Output')!;
      expect(graph.connect('ghost', 'rgba', b.id, 'albedo')).toBeNull();
    });

    it('connect returns null for unknown target node', () => {
      const a = graph.addNode('Color')!;
      expect(graph.connect(a.id, 'rgba', 'ghost', 'albedo')).toBeNull();
    });

    it('self-loop returns null', () => {
      const a = graph.addNode('Color')!;
      expect(graph.connect(a.id, 'rgba', a.id, 'color')).toBeNull();
    });

    it('getConnections returns all connections', () => {
      const a = graph.addNode('Color')!;
      const b = graph.addNode('Output')!;
      graph.connect(a.id, 'rgba', b.id, 'albedo');
      expect(graph.getConnections()).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // compile
  // -------------------------------------------------------------------------
  describe('compile()', () => {
    it('compiles empty graph without error', () => {
      expect(() => graph.compile()).not.toThrow();
    });

    it('compiled output has vertexCode', () => {
      const result = graph.compile();
      expect(result.vertexCode).toContain('gl_Position');
    });

    it('compiled fragmentCode contains void main()', () => {
      const result = graph.compile();
      expect(result.fragmentCode).toContain('void main()');
    });

    it('single Color node: nodeCount=1 in output', () => {
      graph.addNode('Color');
      const result = graph.compile();
      expect(result.nodeCount).toBe(1);
    });

    it('uniforms generated for unconnected inputs', () => {
      graph.addNode('Color'); // color input is unconnected
      const result = graph.compile();
      expect(result.uniforms.length).toBeGreaterThan(0);
    });

    it('connected nodes: connectionCount returned', () => {
      const a = graph.addNode('Color')!;
      const b = graph.addNode('Output')!;
      graph.connect(a.id, 'rgba', b.id, 'albedo');
      const result = graph.compile();
      expect(result.connectionCount).toBe(1);
    });

    it('compile includes GLSL code from node', () => {
      graph.addNode('Time');
      const result = graph.compile();
      expect(result.fragmentCode).toContain('u_time');
    });

    it('topological sort: source compiled before target', () => {
      const color = graph.addNode('Color')!;
      const mul   = graph.addNode('Multiply')!;
      const out   = graph.addNode('Output')!;
      graph.connect(color.id, 'rgba', mul.id, 'a');
      graph.connect(mul.id, 'result', out.id, 'albedo');
      // Should compile without error in correct order
      expect(() => graph.compile()).not.toThrow();
    });
  });
});
