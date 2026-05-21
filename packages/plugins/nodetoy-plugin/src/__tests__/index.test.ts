import { describe, it, expect } from 'vitest';
import {
  mapNodeToyToShader,
  nodeToyToNativeShaderGraph,
  compileNodeToy,
  transpileGLSLToWGSL,
} from '../index';
import type {
  NodeToyGraph,
  NodeToyCompileResult,
} from '../index';
import type {
  NodeToyGraph as CoreNodeToyGraph,
  NodeToyNode as CoreNodeToyNode,
  NodeToyEdge,
  NodeToyMappingOptions,
} from '@holoscript/core/compiler/nodetoy';

// =============================================================================
// BACKWARD-COMPATIBLE LEGACY API TESTS
// =============================================================================

describe('nodetoy-plugin legacy stub API', () => {
  it('tallies family counts', () => {
    const r = mapNodeToyToShader({
      name: 'plastic',
      nodes: [
        { id: 'n1', family: 'input' },
        { id: 'n2', family: 'noise' },
        { id: 'n3', family: 'pbr', inputs: { albedo: 'n2' } },
        { id: 'n4', family: 'output', inputs: { color: 'n3' } },
      ],
      output_node_id: 'n4',
    });
    expect(r.node_count).toBe(4);
    expect(r.by_family.pbr).toBe(1);
    expect(r.by_family.noise).toBe(1);
    expect(r.validation_errors).toEqual([]);
  });

  it('flags missing output node', () => {
    const r = mapNodeToyToShader({
      name: 'broken',
      nodes: [{ id: 'n1', family: 'input' }],
      output_node_id: 'zzz',
    });
    expect(r.validation_errors[0]).toContain('zzz');
  });

  it('flags dangling input refs', () => {
    const r = mapNodeToyToShader({
      name: 'dangle',
      nodes: [{ id: 'n1', family: 'output', inputs: { color: 'missing' } }],
      output_node_id: 'n1',
    });
    expect(r.validation_errors.some((e) => e.includes('missing'))).toBe(true);
  });

  it('produces HoloScript-native ShaderGraph IR from NodeToy (Phase 2 native path)', () => {
    const native = nodeToyToNativeShaderGraph({
      name: 'test-graph',
      nodes: [
        { id: 'a', family: 'pbr' },
        { id: 'b', family: 'output', inputs: { color: 'a' } },
      ],
      output_node_id: 'b',
    });
    expect(native.id).toBe('sg_test-graph');
    expect(native.provenance).toBe('imported:NodeToy');
    expect(native.nodes.length).toBe(2);
    expect(native.outputNodeId).toBe('b');
  });
});

// =============================================================================
// FIXTURE: REAL NODETOY GRAPH → GLSL SHADER COMPILATION (END-TO-END)
// =============================================================================

/**
 * Fixture: a simple 3-node graph (UV → ProceduralNoise → FragColor).
 * This is the canonical test case proving the plugin compiles a real
 * NodeToy graph to shader source end-to-end.
 */
function makeFixtureGraph(): CoreNodeToyGraph {
  return {
    name: 'noise_material',
    nodes: [
      {
        id: 'uv1',
        type: 'UV',
        label: 'UV',
        inputs: [],
        outputs: [{ name: 'out', type: 'vec2' }],
      },
      {
        id: 'time1',
        type: 'Time',
        label: 'Time',
        inputs: [],
        outputs: [{ name: 'out', type: 'float' }],
      },
      {
        id: 'noise1',
        type: 'ProceduralNoise',
        label: 'Noise',
        inputs: [
          { name: 'uv', type: 'vec2', connection: 'uv1' },
          { name: 'scale', type: 'float', default: 5.0 },
        ],
        outputs: [{ name: 'out', type: 'float' }],
      },
      {
        id: 'mix1',
        type: 'Mix',
        label: 'Mix Colors',
        inputs: [
          { name: 'a', type: 'vec3', default: [0.2, 0.5, 1.0] },
          { name: 'b', type: 'vec3', default: [1.0, 0.3, 0.1] },
          { name: 'factor', type: 'float', connection: 'noise1' },
        ],
        outputs: [{ name: 'out', type: 'vec3' }],
      },
      {
        id: 'out1',
        type: 'FragColor',
        label: 'Output',
        inputs: [
          { name: 'color', type: 'vec4', connection: 'mix1' },
        ],
        outputs: [],
      },
    ],
    edges: [
      { id: 'e1', fromNode: 'uv1', fromPort: 'out', toNode: 'noise1', toPort: 'uv' },
      { id: 'e2', fromNode: 'noise1', fromPort: 'out', toNode: 'mix1', toPort: 'factor' },
      { id: 'e3', fromNode: 'mix1', fromPort: 'out', toNode: 'out1', toPort: 'color' },
    ],
  };
}

/**
 * Fixture: a graph with math operations (Add → Multiply → FragColor).
 * Tests that the node-graph traversal chains operations correctly.
 */
function makeMathGraph(): CoreNodeToyGraph {
  return {
    name: 'math_shader',
    nodes: [
      {
        id: 'time1',
        type: 'Time',
        label: 'Time',
        inputs: [],
        outputs: [{ name: 'out', type: 'float' }],
      },
      {
        id: 'add1',
        type: 'Add',
        label: 'Add',
        inputs: [
          { name: 'a', type: 'float', connection: 'time1' },
          { name: 'b', type: 'float', default: 1.0 },
        ],
        outputs: [{ name: 'out', type: 'float' }],
      },
      {
        id: 'mul1',
        type: 'Multiply',
        label: 'Multiply',
        inputs: [
          { name: 'a', type: 'float', connection: 'add1' },
          { name: 'b', type: 'float', default: 2.0 },
        ],
        outputs: [{ name: 'out', type: 'float' }],
      },
      {
        id: 'out1',
        type: 'FragColor',
        label: 'Output',
        inputs: [
          { name: 'color', type: 'float', connection: 'mul1' },
        ],
        outputs: [],
      },
    ],
    edges: [
      { id: 'e1', fromNode: 'time1', fromPort: 'out', toNode: 'add1', toPort: 'a' },
      { id: 'e2', fromNode: 'add1', fromPort: 'out', toNode: 'mul1', toPort: 'a' },
      { id: 'e3', fromNode: 'mul1', fromPort: 'out', toNode: 'out1', toPort: 'color' },
    ],
  };
}

describe('compileNodeToy — end-to-end fixture tests', () => {
  it('compiles noise material graph to GLSL with vertex and fragment shaders', () => {
    const result = compileNodeToy(makeFixtureGraph());

    // Must produce non-empty GLSL vertex and fragment source
    expect(result.vertexSource.length).toBeGreaterThan(0);
    expect(result.fragmentSource.length).toBeGreaterThan(0);

    // Vertex shader must contain main function
    expect(result.vertexSource).toContain('void main()');

    // Fragment shader must contain main function
    expect(result.fragmentSource).toContain('void main()');

    // Time uniform should be auto-detected
    expect(result.uniforms).toHaveProperty('time');
    expect(result.uniforms.time.type).toBe('float');

    // No unsupported nodes for the fixture graph
    expect(result.unsupportedNodes).toEqual([]);

    // Emission summary must be correct
    expect(result.emission.trait.kind).toBe('@shader');
    expect(result.emission.trait.target_id).toBe('noise_material');
    expect(result.emission.node_count).toBe(5);
  });

  it('compiles math chain graph to GLSL with correct operation order', () => {
    const result = compileNodeToy(makeMathGraph());

    expect(result.vertexSource.length).toBeGreaterThan(0);
    expect(result.fragmentSource.length).toBeGreaterThan(0);

    // The fragment shader should contain the Add and Multiply operations
    expect(result.fragmentSource).toContain('nt_add1');
    expect(result.fragmentSource).toContain('nt_mul1');

    // Time uniform auto-detected
    expect(result.uniforms).toHaveProperty('time');
  });

  it('produces ShaderConfig compatible with @holoscript/core ShaderTrait', () => {
    const result = compileNodeToy(makeFixtureGraph());

    // ShaderConfig must have required fields
    expect(result.shaderConfig.name).toBe('noise_material');
    expect(result.shaderConfig.source).toBeDefined();
    expect(result.shaderConfig.source!.language).toBe('glsl');
    expect(result.shaderConfig.source!.vertex).toBeTruthy();
    expect(result.shaderConfig.source!.fragment).toBeTruthy();
  });

  it('produces WGSL output when wgsl option is true (default)', () => {
    const result = compileNodeToy(makeFixtureGraph());

    // WGSL sources should be non-empty
    expect(result.wgslFragmentSource.length).toBeGreaterThan(0);
    expect(result.wgslVertexSource.length).toBeGreaterThan(0);

    // WGSL should use @fragment/@vertex entry points
    expect(result.wgslFragmentSource).toContain('@fragment');
    expect(result.wgslVertexSource).toContain('@vertex');

    // WGSL should have struct-based uniforms when uniforms exist
    if (Object.keys(result.uniforms).length > 0) {
      expect(result.wgslFragmentSource).toContain('struct Uniforms');
    }
  });

  it('skips WGSL when wgsl option is false', () => {
    const result = compileNodeToy(makeFixtureGraph(), { wgsl: false });

    expect(result.wgslVertexSource).toBe('');
    expect(result.wgslFragmentSource).toBe('');
  });

  it('flags unsupported node types', () => {
    const graph: CoreNodeToyGraph = {
      name: 'unknown_nodes',
      nodes: [
        {
          id: 'weird1',
          type: 'SuperAdvancedRayMarching',
          label: 'Unknown',
          inputs: [],
          outputs: [{ name: 'out', type: 'float' }],
        },
        {
          id: 'out1',
          type: 'FragColor',
          label: 'Output',
          inputs: [{ name: 'color', type: 'float', connection: 'weird1' }],
          outputs: [],
        },
      ],
      edges: [
        { id: 'e1', fromNode: 'weird1', fromPort: 'out', toNode: 'out1', toPort: 'color' },
      ],
    };

    const result = compileNodeToy(graph);

    expect(result.unsupportedNodes).toContain('SuperAdvancedRayMarching');
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('handles empty graph with fallback shader', () => {
    const graph: CoreNodeToyGraph = {
      name: 'empty',
      nodes: [],
      edges: [],
    };

    const result = compileNodeToy(graph);

    // Should still produce valid shader output (fallback)
    expect(result.vertexSource.length).toBeGreaterThan(0);
    expect(result.fragmentSource.length).toBeGreaterThan(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('handles cycles in node graph gracefully', () => {
    const graph: CoreNodeToyGraph = {
      name: 'cycle',
      nodes: [
        { id: 'a', type: 'Add', label: 'A', inputs: [{ name: 'a', type: 'float', connection: 'b' }, { name: 'b', type: 'float', default: 1.0 }], outputs: [{ name: 'out', type: 'float' }] },
        { id: 'b', type: 'Multiply', label: 'B', inputs: [{ name: 'a', type: 'float', connection: 'a' }, { name: 'b', type: 'float', default: 2.0 }], outputs: [{ name: 'out', type: 'float' }] },
        { id: 'out1', type: 'FragColor', label: 'Output', inputs: [{ name: 'color', type: 'float', connection: 'a' }], outputs: [] },
      ],
      edges: [
        { id: 'e1', fromNode: 'b', fromPort: 'out', toNode: 'a', toPort: 'a' },
        { id: 'e2', fromNode: 'a', fromPort: 'out', toNode: 'b', toPort: 'a' },
        { id: 'e3', fromNode: 'a', fromPort: 'out', toNode: 'out1', toPort: 'color' },
      ],
    };

    const result = compileNodeToy(graph);

    // Should produce output with a cycle warning, not crash
    expect(result.warnings.some((w) => /cycle/i.test(w))).toBe(true);
    expect(result.vertexSource.length).toBeGreaterThan(0);
    expect(result.fragmentSource.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// WGSL TRANSPILATION UNIT TESTS
// =============================================================================

describe('transpileGLSLToWGSL', () => {
  it('converts GLSL varying declarations to WGSL struct members', () => {
    const glsl = `
varying vec2 vUv;
varying vec3 vNormal;
void main() {
  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
}`;
    const wgsl = transpileGLSLToWGSL(glsl, 'fragment');

    expect(wgsl).toContain('struct Varyings');
    expect(wgsl).toContain('vUv');
    expect(wgsl).toContain('vec2f');
    expect(wgsl).toContain('vNormal');
    expect(wgsl).toContain('vec3f');
  });

  it('converts GLSL uniform declarations to WGSL struct', () => {
    const glsl = `
precision highp float;
uniform float time;
uniform vec3 color;
void main() {
  gl_FragColor = vec4(color, 1.0);
}`;
    const wgsl = transpileGLSLToWGSL(glsl, 'fragment');

    expect(wgsl).toContain('struct Uniforms');
    expect(wgsl).toContain('time: f32');
    expect(wgsl).toContain('color: vec3f');
    expect(wgsl).toContain('@group(0) @binding(0) var<uniform> uniforms: Uniforms');
  });

  it('converts gl_FragColor assignment to return statement', () => {
    const glsl = `
void main() {
  gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
}`;
    const wgsl = transpileGLSLToWGSL(glsl, 'fragment');

    expect(wgsl).toContain('return vec4f(0.0, 1.0, 0.0, 1.0)');
    expect(wgsl).not.toContain('gl_FragColor');
  });

  it('generates @fragment entry point for fragment stage', () => {
    const glsl = `void main() { gl_FragColor = vec4(1.0); }`;
    const wgsl = transpileGLSLToWGSL(glsl, 'fragment');

    expect(wgsl).toContain('@fragment');
    expect(wgsl).toContain('fn fs_main');
  });

  it('generates @vertex entry point for vertex stage', () => {
    const glsl = `void main() { gl_Position = vec4(1.0); }`;
    const wgsl = transpileGLSLToWGSL(glsl, 'vertex');

    expect(wgsl).toContain('@vertex');
    expect(wgsl).toContain('fn vs_main');
  });

  it('strips precision qualifiers', () => {
    const glsl = `precision highp float;\nuniform float time;\nvoid main() { gl_FragColor = vec4(time, 0.0, 0.0, 1.0); }`;
    const wgsl = transpileGLSLToWGSL(glsl, 'fragment');

    expect(wgsl).not.toContain('precision');
  });

  it('converts vec3/vec4 constructors to vec3f/vec4f', () => {
    const glsl = `void main() { gl_FragColor = vec4(vec3(0.5), 1.0); }`;
    const wgsl = transpileGLSLToWGSL(glsl, 'fragment');

    expect(wgsl).toContain('vec4f(vec3f(0.5), 1.0)');
  });
});