/**
 * @holoscript/nodetoy-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 8 (NodeToy shader graph). Validation errors
 * MUST catch missing output_node_id + dangling input refs.
 *
 * Extended: also validates that compileNodeToy produces real GLSL/WGSL
 * shader source — the STUB label is removed only because end-to-end
 * compilation is verified here.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapNodeToyToShader, compileNodeToy, transpileGLSLToWGSL, type NodeToyGraph } from '../index';
import type { NodeToyGraph as CoreNodeToyGraph } from '@holoscript/core/compiler/nodetoy';

function graph(overrides: Partial<NodeToyGraph> = {}): NodeToyGraph {
  return {
    name: 'TestShader',
    output_node_id: 'out1',
    nodes: [
      { id: 'tex1', family: 'texture' },
      { id: 'pbr1', family: 'pbr', inputs: { albedo: 'tex1' } },
      { id: 'out1', family: 'output', inputs: { color: 'pbr1' } },
    ],
    ...overrides,
  };
}

function coreGraph(): CoreNodeToyGraph {
  return {
    name: 'contract_test',
    nodes: [
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
          { name: 'scale', type: 'float', default: 3.0 },
        ],
        outputs: [{ name: 'out', type: 'float' }],
      },
      {
        id: 'uv1',
        type: 'UV',
        label: 'UV',
        inputs: [],
        outputs: [{ name: 'out', type: 'vec2' }],
      },
      {
        id: 'out1',
        type: 'FragColor',
        label: 'Output',
        inputs: [{ name: 'color', type: 'float', connection: 'noise1' }],
        outputs: [],
      },
    ],
    edges: [
      { id: 'e1', fromNode: 'uv1', fromPort: 'out', toNode: 'noise1', toPort: 'uv' },
      { id: 'e2', fromNode: 'noise1', fromPort: 'out', toNode: 'out1', toPort: 'color' },
    ],
  };
}

describe('CONTRACT: nodetoy-plugin adapter', () => {
  it('exposes mapNodeToyToShader at stable public path', () => {
    expect(typeof mod.mapNodeToyToShader).toBe('function');
  });

  it('exposes compileNodeToy at stable public path', () => {
    expect(typeof mod.compileNodeToy).toBe('function');
  });

  it('exposes transpileGLSLToWGSL at stable public path', () => {
    expect(typeof mod.transpileGLSLToWGSL).toBe('function');
  });

  it('trait.kind = @shader, target_id preserves graph.name', () => {
    const r = mapNodeToyToShader(graph());
    expect(r.trait.kind).toBe('@shader');
    expect(r.trait.target_id).toBe('TestShader');
  });

  it('node_count matches graph.nodes.length', () => {
    expect(mapNodeToyToShader(graph()).node_count).toBe(3);
  });

  it('by_family sum equals node_count', () => {
    const r = mapNodeToyToShader(graph());
    const sum = Object.values(r.by_family).reduce((a, b) => a + b, 0);
    expect(sum).toBe(r.node_count);
  });

  it('missing output_node_id is flagged in validation_errors', () => {
    const r = mapNodeToyToShader(graph({ output_node_id: 'does_not_exist' }));
    expect(r.validation_errors.some((e) => /output_node_id/.test(e))).toBe(true);
  });

  it('dangling input ref is flagged in validation_errors', () => {
    const r = mapNodeToyToShader({
      name: 'Dangling',
      output_node_id: 'out',
      nodes: [
        { id: 'out', family: 'output', inputs: { color: 'missing_node' } },
      ],
    });
    expect(r.validation_errors.some((e) => /missing/.test(e))).toBe(true);
  });

  it('well-formed graph produces zero validation_errors', () => {
    const r = mapNodeToyToShader(graph());
    expect(r.validation_errors).toEqual([]);
  });

  it('trait.params.output preserves output_node_id', () => {
    expect(mapNodeToyToShader(graph()).trait.params.output).toBe('out1');
  });

  it('empty graph (no nodes) → validation_errors catches missing output', () => {
    const r = mapNodeToyToShader({ name: 'Empty', output_node_id: 'out', nodes: [] });
    expect(r.node_count).toBe(0);
    expect(r.validation_errors.length).toBeGreaterThan(0);
  });
});

describe('CONTRACT: compileNodeToy end-to-end compilation', () => {
  it('produces non-empty GLSL vertex and fragment source', () => {
    const result = compileNodeToy(coreGraph());

    expect(result.vertexSource.length).toBeGreaterThan(0);
    expect(result.fragmentSource.length).toBeGreaterThan(0);
    expect(result.fragmentSource).toContain('void main()');
  });

  it('produces ShaderConfig with correct name and language', () => {
    const result = compileNodeToy(coreGraph());

    expect(result.shaderConfig.name).toBe('contract_test');
    expect(result.shaderConfig.source?.language).toBe('glsl');
  });

  it('produces WGSL output by default', () => {
    const result = compileNodeToy(coreGraph());

    expect(result.wgslFragmentSource.length).toBeGreaterThan(0);
    expect(result.wgslFragmentSource).toContain('@fragment');
  });

  it('auto-detects time uniform', () => {
    const result = compileNodeToy(coreGraph());

    expect(result.uniforms).toHaveProperty('time');
    expect(result.uniforms.time.type).toBe('float');
  });
});