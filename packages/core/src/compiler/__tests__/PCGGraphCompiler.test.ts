import { describe, expect, it } from 'vitest';
import type { HoloComposition, HoloDomainBlock } from '../../parser/HoloCompositionTypes';
import {
  PCGGraphCompiler,
  compilePCGGraphFromBlocks,
  compileToPCGGraph,
  pcgGraphToUnrealXml,
} from '../PCGGraphCompiler';
import { createTestCompilerToken } from '../CompilerBase';
import { getExportManager } from '../ExportManager';
import { parseHolo } from '../../parser/HoloCompositionParser';

function proceduralBlock(
  properties: Record<string, unknown> = {},
  overrides: Partial<HoloDomainBlock> = {}
): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain: 'procedural',
    keyword: 'scatter',
    name: 'ForestScatter',
    properties: properties as HoloDomainBlock['properties'],
    children: [],
    traits: [],
    ...overrides,
  };
}

function composition(blocks: HoloDomainBlock[]): HoloComposition {
  return {
    type: 'Composition',
    name: 'ForestPCG',
    imports: [],
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    cameras: [],
    animations: [],
    interactions: [],
    functions: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    materials: [],
    domainBlocks: blocks,
  } as unknown as HoloComposition;
}

describe('PCGGraphCompiler', () => {
  it('expands a procedural scatter block into typed PCG spatial operators', () => {
    const { graph, diagnostics } = compilePCGGraphFromBlocks([
      proceduralBlock({
        density: 0.42,
        max_slope: 32,
        source_mesh: '/Game/Foliage/SM_Pine',
        count: 256,
        seed: 1337,
        gpu_eval: true,
      }),
    ]);

    expect(graph.schema).toBe('holoscript-pcg-graph-v1');
    expect(graph.seed).toBe(1337);
    expect(graph.gpuEvaluation.enabled).toBe(true);
    expect(graph.nodes.map((node) => node.kind)).toEqual([
      'surface',
      'density_filter',
      'slope_mask',
      'scatter',
      'snap_to_terrain',
      'output',
    ]);
    expect(graph.edges.map((edge) => edge.type)).toEqual([
      'surface',
      'scalar-field',
      'scalar-field',
      'point-set',
      'point-set',
    ]);
    expect(graph.nodes.find((node) => node.kind === 'scatter')?.inputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'mask', type: 'scalar-field' }),
        expect.objectContaining({ name: 'mesh', type: 'asset' }),
      ])
    );
    expect(diagnostics[0]).toContain('density_filter -> slope_mask -> scatter -> snap_to_terrain');
  });

  it('compiles explicit pcg_graph node declarations in order', () => {
    const { graph } = compilePCGGraphFromBlocks([
      proceduralBlock(
        {
          nodes: [
            { kind: 'density_filter', properties: { min_density: 0.1 } },
            { kind: 'slope_mask', properties: { max_slope: 28 } },
            { kind: 'scatter', properties: { source_mesh: '/Game/Rocks/SM_Rock' } },
            { kind: 'snap_to_terrain' },
            { kind: 'output' },
          ],
          gpu: true,
        },
        { keyword: 'pcg_graph', name: 'RockGraph' }
      ),
    ]);

    expect(graph.nodes.map((node) => node.kind)).toEqual([
      'surface',
      'density_filter',
      'slope_mask',
      'scatter',
      'snap_to_terrain',
      'output',
    ]);
    expect(graph.edges).toHaveLength(5);
    expect(graph.nodes.every((node) => node.gpu === true)).toBe(true);
  });

  it('parses a .holo pcg_graph arrow block into first-class operator nodes', () => {
    const result = parseHolo(`
      pcg_graph ForestFoliage {
        seed: 2026
        gpu_eval: true
        density_filter -> slope_mask -> scatter("/Game/Foliage/SM_Pine", 512) -> snap_to_terrain -> output
      }
    `);

    expect(result.success).toBe(true);
    const block = result.ast?.domainBlocks?.[0];
    expect(block?.domain).toBe('procedural');
    expect(block?.keyword).toBe('pcg_graph');
    expect(block?.properties.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'density_filter' }),
        expect.objectContaining({
          kind: 'scatter',
          properties: expect.objectContaining({
            source_mesh: '/Game/Foliage/SM_Pine',
            count: 512,
          }),
        }),
        expect.objectContaining({ kind: 'snap_to_terrain' }),
      ])
    );

    const compiled = compileToPCGGraph(result.ast!);
    expect(compiled.graph.gpuEvaluation.enabled).toBe(true);
    expect(compiled.graph.nodes.map((node) => node.kind)).toEqual([
      'surface',
      'density_filter',
      'slope_mask',
      'scatter',
      'snap_to_terrain',
      'output',
    ]);
  });

  it('emits Unreal PCG XML with typed ports and engine classes', () => {
    const { graph } = compilePCGGraphFromBlocks([
      proceduralBlock({
        source_mesh: '/Game/Foliage/SM_Grass',
        density: 0.7,
      }),
    ]);
    const xml = pcgGraphToUnrealXml(graph);

    expect(xml).toContain('<HoloScriptPCGGraph');
    expect(xml).toContain('/Script/PCG.PCGDensityFilter');
    expect(xml).toContain('/Script/PCG.PCGSlopeFilter');
    expect(xml).toContain('/Script/PCG.PCGStaticMeshSpawner');
    expect(xml).toContain('/Script/PCG.PCGProjection');
    expect(xml).toContain('type="point-set"');
    expect(xml).toContain('/Game/Foliage/SM_Grass');
  });

  it('returns XML, graph JSON, and GPU plan files', () => {
    const compiler = new PCGGraphCompiler({ gpuEvaluation: true, seed: 99 });
    const files = compiler.compileToFiles(composition([proceduralBlock()]), createTestCompilerToken());

    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'pcg/forestpcgpcg.pcg.xml',
        'pcg/forestpcgpcg.gpu-plan.md',
        'pcg/forestpcgpcg.graph.json',
      ])
    );
    expect(files['pcg/forestpcgpcg.pcg.xml']).toContain('<HoloScriptPCGGraph');
    expect(files['pcg/forestpcgpcg.gpu-plan.md']).toContain('Enabled: yes');
    expect(JSON.parse(files['pcg/forestpcgpcg.graph.json']).schema).toBe('holoscript-pcg-graph-v1');
  });

  it('is reachable through the ExportManager target table', async () => {
    const manager = getExportManager({ useMemoryMonitoring: false });
    const result = await manager.export('pcg-graph', composition([proceduralBlock({ gpu_eval: true })]), {
      compilerOptions: { seed: 7 },
    });

    expect(result.error?.message).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.output).toContain('HoloScriptPCGGraph');
    expect(result.output).toContain('GPU evaluation: enabled');
    expect(manager.getSupportedTargets()).toContain('pcg-graph');
  });

  it('has a convenience compile helper for direct consumers', () => {
    const result = compileToPCGGraph(composition([proceduralBlock({ seed: 12 })]));

    expect(result.graph.seed).toBe(12);
    expect(result.unrealXml).toContain('target="UnrealPCG"');
    expect(result.gpuEvalPlan).toContain('Operator chain:');
  });
});
