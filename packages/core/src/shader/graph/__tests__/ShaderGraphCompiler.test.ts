import { describe, it, expect, beforeEach } from 'vitest';
import { ShaderGraph } from '../ShaderGraph';
import { ShaderGraphCompiler, compileShaderGraph } from '../ShaderGraphCompiler';

describe('ShaderGraphCompiler', () => {
  let graph: ShaderGraph;

  beforeEach(() => {
    graph = new ShaderGraph('TestShader');
  });

  // ===========================================================================
  // Construction
  // ===========================================================================
  describe('construction', () => {
    it('creates compiler from graph', () => {
      const compiler = new ShaderGraphCompiler(graph);
      expect(compiler).toBeDefined();
    });

    it('accepts custom compile options', () => {
      const compiler = new ShaderGraphCompiler(graph, {
        optimization: 'balanced',
        target: 'webgpu',
      });
      expect(compiler).toBeDefined();
    });
  });

  // ===========================================================================
  // Empty Graph Compilation
  // ===========================================================================
  describe('empty graph compilation', () => {
    it('compiles an empty graph without error', () => {
      const compiler = new ShaderGraphCompiler(graph);
      const result = compiler.compile();
      expect(result).toBeDefined();
    });

    it('compiled result has vertex and fragment code', () => {
      const outputNode = graph.createNode('output_surface');
      expect(outputNode).not.toBeNull();

      const compiler = new ShaderGraphCompiler(graph);
      const result = compiler.compile();
      expect(result.vertexCode).toBeDefined();
      expect(result.fragmentCode).toBeDefined();
    });
  });

  // ===========================================================================
  // Basic Node Compilation
  // ===========================================================================
  describe('basic node compilation', () => {
    it('compiles a color constant connected to output', () => {
      const colorNode = graph.createNode('constant_color');
      const outputNode = graph.createNode('output_surface');
      expect(colorNode).not.toBeNull();
      expect(outputNode).not.toBeNull();

      if (colorNode && outputNode) {
        graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.fragmentCode).toBeDefined();
        expect(result.fragmentCode.length).toBeGreaterThan(0);
      }
    });

    it('compiles float constant node', () => {
      const floatNode = graph.createNode('constant_float');
      const outputNode = graph.createNode('output_surface');
      expect(floatNode).not.toBeNull();
      expect(outputNode).not.toBeNull();

      if (floatNode && outputNode) {
        graph.connect(floatNode.id, 'value', outputNode.id, 'metallic');
        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.fragmentCode).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Math Operations
  // ===========================================================================
  describe('math operations', () => {
    it('compiles add node', () => {
      const a = graph.createNode('constant_float');
      const b = graph.createNode('constant_float');
      const add = graph.createNode('math_add');
      const output = graph.createNode('output_surface');

      if (a && b && add && output) {
        graph.connect(a.id, 'value', add.id, 'a');
        graph.connect(b.id, 'value', add.id, 'b');
        graph.connect(add.id, 'result', output.id, 'metallic');

        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.fragmentCode).toBeDefined();
      }
    });

    it('compiles multiply node', () => {
      const a = graph.createNode('constant_float');
      const mul = graph.createNode('math_multiply');
      const output = graph.createNode('output_surface');

      if (a && mul && output) {
        graph.connect(a.id, 'value', mul.id, 'a');
        graph.connect(mul.id, 'result', output.id, 'roughness');

        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.fragmentCode).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // WGSL Output
  // ===========================================================================
  describe('WGSL output', () => {
    it('fragment code contains WGSL syntax', () => {
      const outputNode = graph.createNode('output_surface');
      if (outputNode) {
        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        // Should contain WGSL-specific syntax
        expect(result.fragmentCode).toMatch(/@fragment|fn\s+fragment|@location/);
      }
    });

    it('vertex code contains WGSL syntax', () => {
      const outputNode = graph.createNode('output_surface');
      if (outputNode) {
        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.vertexCode).toMatch(/@vertex|fn\s+vertex|@location/);
      }
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================
  describe('reset', () => {
    it('reset clears compilation state', () => {
      const outputNode = graph.createNode('output_surface');
      if (outputNode) {
        const compiler = new ShaderGraphCompiler(graph);
        compiler.compile();
        compiler.reset();
        // Should be able to compile again after reset
        const result2 = compiler.compile();
        expect(result2).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // compileShaderGraph helper
  // ===========================================================================
  describe('compileShaderGraph', () => {
    it('compiles via convenience function', () => {
      const outputNode = graph.createNode('output_surface');
      if (outputNode) {
        const result = compileShaderGraph(graph);
        expect(result).toBeDefined();
        expect(result.vertexCode).toBeDefined();
        expect(result.fragmentCode).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Texture Nodes
  // ===========================================================================
  describe('texture compilation', () => {
    it('compiles texture sample node', () => {
      const texNode = graph.createNode('texture_sample');
      const output = graph.createNode('output_surface');

      if (texNode && output) {
        graph.connect(texNode.id, 'color', output.id, 'baseColor');
        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.fragmentCode).toBeDefined();
      }
    });
  });

  // ===========================================================================
  // Complex Graphs
  // ===========================================================================
  describe('complex graphs', () => {
    it('compiles a multi-node graph without errors', () => {
      const color1 = graph.createNode('constant_color');
      const color2 = graph.createNode('constant_color');
      const blend = graph.createNode('color_blend');
      const output = graph.createNode('output_surface');

      if (color1 && color2 && blend && output) {
        graph.connect(color1.id, 'color', blend.id, 'a');
        graph.connect(color2.id, 'color', blend.id, 'b');
        graph.connect(blend.id, 'result', output.id, 'baseColor');

        const compiler = new ShaderGraphCompiler(graph);
        const result = compiler.compile();
        expect(result.fragmentCode).toBeDefined();
        expect(result.fragmentCode.length).toBeGreaterThan(100);
      }
    });
  });
});
