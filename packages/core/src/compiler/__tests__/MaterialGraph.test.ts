import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';
import { TSLCompiler } from '../TSLCompiler';
import {
  compileMaterialGraphBlock,
  materialGraphToWGSL,
  type CompiledMaterialGraph,
} from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

const EXAMPLE = readFileSync(
  join(__dirname, '../../parser/examples/material-graph.holo'),
  'utf8'
);

function parseFirstMaterialGraph(source: string): HoloDomainBlock {
  const parser = new HoloCompositionParser();
  const result = parser.parse(source);
  expect(result.success).toBe(true);
  const block = result.ast!.domainBlocks!.find((b) => b.domain === 'material_graph');
  expect(block).toBeDefined();
  return block!;
}

describe('material_graph — parse to IR', () => {
  it('registers as its own domain and captures nodes + edges', () => {
    const block = parseFirstMaterialGraph(EXAMPLE);
    expect(block.domain).toBe('material_graph');
    expect(block.keyword).toBe('material_graph');
    expect(block.name).toBe('rusty_metal');

    // Each node id is a unique property key; same-type nodes do NOT collide.
    const props = block.properties as Record<string, unknown>;
    expect(props.base_metal).toBeDefined();
    expect(props.base_rust).toBeDefined();
    expect((props.base_metal as Record<string, unknown>).type).toBe('constant');
    expect((props.base_rust as Record<string, unknown>).type).toBe('constant');
    expect(Array.isArray(props.connections)).toBe(true);
  });

  it('compiles the block into typed nodes and directed edges', () => {
    const block = parseFirstMaterialGraph(EXAMPLE);
    const g = compileMaterialGraphBlock(block);
    expect(g.name).toBe('rusty_metal');
    // 8 nodes authored in the example
    expect(g.nodes).toHaveLength(8);
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(byId.rust_mask.nodeType).toBe('noise');
    expect(byId.rust_mask.params.scale).toBe(8);
    expect(byId.rim.nodeType).toBe('fresnel');
    // edges are split into toNode.toPort
    const albedoT = g.edges.find((e) => e.toNode === 'albedo' && e.toPort === 't');
    expect(albedoT?.from).toBe('rust_mask');
  });
});

describe('material_graph — lower to WGSL', () => {
  it('emits an evaluatable fragment fn via the TSLCompiler domain-block path', () => {
    const parser = new HoloCompositionParser();
    const result = parser.parse(EXAMPLE);
    const out = new TSLCompiler().compile(result.ast!);
    const key = '_domain.material_graph.rusty_metal.wgsl';
    expect(out[key]).toBeDefined();
    const wgsl = out[key];
    expect(wgsl).toContain('fn evalMaterialGraph_rusty_metal(uv: vec2<f32>, N: vec3<f32>, V: vec3<f32>');
    expect(wgsl).toContain('struct MaterialGraphSurface');
  });

  it('orders nodes topologically (dependencies declared before use)', () => {
    const { wgsl } = materialGraphToWGSL(compileMaterialGraphBlock(parseFirstMaterialGraph(EXAMPLE)));
    // albedo depends on base_metal, base_rust, rust_mask → must come after all three
    const iAlbedo = wgsl.indexOf('let mg_albedo');
    expect(iAlbedo).toBeGreaterThan(wgsl.indexOf('let mg_base_metal'));
    expect(iAlbedo).toBeGreaterThan(wgsl.indexOf('let mg_base_rust'));
    expect(iAlbedo).toBeGreaterThan(wgsl.indexOf('let mg_rust_mask'));
    // rim_glow depends on rim → rim must be emitted first
    expect(wgsl.indexOf('let mg_rim_glow')).toBeGreaterThan(wgsl.indexOf('let mg_rim'));
  });

  it('wires the output node ports from the edges', () => {
    const { wgsl } = materialGraphToWGSL(compileMaterialGraphBlock(parseFirstMaterialGraph(EXAMPLE)));
    expect(wgsl).toContain('surface.baseColor = mg_albedo;');
    expect(wgsl).toContain('surface.roughness = mg_rust_mask;'); // noise is already f32, no coercion
    expect(wgsl).toContain('surface.emissive = mg_rim_glow;');
  });

  it('fresnel reads the surface normal and view vector', () => {
    const { wgsl } = materialGraphToWGSL(compileMaterialGraphBlock(parseFirstMaterialGraph(EXAMPLE)));
    expect(wgsl).toContain('dot(N, V)');
  });

  it('decodes hex constants to normalized vec3 literals', () => {
    const { wgsl } = materialGraphToWGSL(compileMaterialGraphBlock(parseFirstMaterialGraph(EXAMPLE)));
    // #B0B0B0 → 0.6902
    expect(wgsl).toContain('vec3<f32>(0.6902, 0.6902, 0.6902)');
  });
});

describe('material_graph — robustness', () => {
  const mk = (nodes: CompiledMaterialGraph['nodes'], edges: CompiledMaterialGraph['edges']): CompiledMaterialGraph => ({
    name: 'test',
    nodes,
    edges,
    traits: [],
  });

  it('falls back to sensible defaults for an unconnected output', () => {
    const { wgsl } = materialGraphToWGSL(
      mk([{ id: 'out', nodeType: 'output', params: {} }], [])
    );
    expect(wgsl).toContain('surface.baseColor = vec3<f32>(0.8);');
    expect(wgsl).toContain('surface.roughness = 0.5;');
    expect(wgsl).toContain('surface.metallic = 0.0;');
  });

  it('detects a cycle and still emits (with a warning) instead of hanging', () => {
    const { wgsl } = materialGraphToWGSL(
      mk(
        [
          { id: 'a', nodeType: 'multiply', params: {} },
          { id: 'b', nodeType: 'multiply', params: {} },
        ],
        [
          { from: 'a', toNode: 'b', toPort: 'a' },
          { from: 'b', toNode: 'a', toPort: 'a' },
        ]
      )
    );
    expect(wgsl).toContain('WARNING');
    expect(wgsl.toLowerCase()).toContain('cycle');
  });
});
