/**
 * R3FCompiler — focused tests for HoloComposition / world compilation.
 */
import { describe, it, expect } from 'vitest';
import type { HoloComposition, HoloWorld } from '../parser/HoloCompositionTypes';
import { SceneIRCompiler as R3FCompiler, type R3FNode } from './SceneIRCompiler';

function minimalComposition(overrides: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestScene',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    worlds: [],
    domainBlocks: [],
    ...overrides,
  };
}

function findByType(nodes: R3FNode[] | undefined, t: string): R3FNode | undefined {
  if (!nodes) return undefined;
  for (const n of nodes) {
    if (n.type === t) return n;
    const inner = findByType(n.children, t);
    if (inner) return inner;
  }
  return undefined;
}

describe('R3FCompiler.compileComposition — world blocks', () => {
  const compiler = new R3FCompiler({});

  it('compiles world properties to ambient + physics nodes (flat)', () => {
    const world: HoloWorld = {
      type: 'World',
      name: 'w1',
      properties: [
        { type: 'WorldProperty', key: 'ambient_light', value: 0.5 },
        { type: 'WorldProperty', key: 'gravity', value: 9.8 },
      ],
    };
    const root = compiler.compileComposition(minimalComposition({ worlds: [world] }));

    expect(root.type).toBe('group');
    const ambient = findByType(root.children, 'ambientLight');
    const physics = findByType(root.children, 'Physics');
    expect(ambient?.props?.intensity).toBe(0.5);
    expect(physics?.props?.gravity).toEqual([0, -9.8, 0]);
  });

  it('wraps world with nested objects in a group and compiles children', () => {
    const world: HoloWorld = {
      type: 'World',
      name: 'arena',
      properties: [{ type: 'WorldProperty', key: 'ambient_light', value: 0.3 }],
      children: [
        {
          type: 'Object',
          name: 'floor',
          properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'plane' }],
          traits: [],
        },
      ],
    };
    const root = compiler.compileComposition(minimalComposition({ worlds: [world] }));

    expect(root.children?.length).toBe(1);
    const worldGroup = root.children![0];
    expect(worldGroup.type).toBe('group');
    expect(worldGroup.id).toBe('arena');

    const ambient = findByType(worldGroup.children, 'ambientLight');
    expect(ambient?.props?.intensity).toBe(0.3);

    const mesh = findByType(worldGroup.children, 'mesh');
    expect(mesh).toBeDefined();
    expect(mesh?.id).toBe('floor');
  });

  it('injects holomapPointCloud node when compiler option is set', () => {
    const compiler = new R3FCompiler({
      holomapPointCloud: {
        positionsB64: 'AAAA',
        colorsB64: 'AQID',
        pointCount: 1,
      },
    });
    const root = compiler.compileComposition(minimalComposition({}));
    const pc = findByType(root.children, 'holomapPointCloud');
    expect(pc).toBeDefined();
    expect(pc?.props?.pointCount).toBe(1);
    expect(pc?.props?.positionsB64).toBe('AAAA');
  });

  it('routes scientific color maps through the perceptual color pass', () => {
    const root = compiler.compileComposition(
      minimalComposition({
        objects: [
          {
            type: 'Object',
            name: 'heat',
            properties: [
              { type: 'ObjectProperty', key: 'geometry', value: 'heatmap_view' },
              { type: 'ObjectProperty', key: 'color_map', value: 'plasma' },
              { type: 'ObjectProperty', key: 'steps', value: 5 },
            ],
            traits: [],
          } as any,
        ],
      })
    );

    const heat = root.children?.find((node) => node.id === 'heat');
    const pass = heat?.props.perceptualColor as { source: string; colorMap?: { name: string } };

    expect(pass.source).toBe('color_map');
    expect(pass.colorMap?.name).toBe('plasma');
    expect(heat?.props.colorMapColors).toHaveLength(5);
  });

  it('routes @perceptual_color palette config through the compiler pass', () => {
    const root = compiler.compileComposition(
      minimalComposition({
        objects: [
          {
            type: 'Object',
            name: 'legend',
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'plane' }],
            traits: [
              {
                name: 'perceptual_color',
                config: {
                  mode: 'palette',
                  palette: ['#000000', '#FFFFFF'],
                  steps: 3,
                  neutral_axis: true,
                },
              },
            ],
          } as any,
        ],
      })
    );

    const legend = root.children?.find((node) => node.id === 'legend');
    const pass = legend?.props.perceptualColor as {
      source: string;
      palette?: { colors: string[] };
    };

    expect(pass.source).toBe('palette');
    expect(pass.palette?.colors).toEqual(['#000000', '#FFFFFF']);
  });

  it('uses viridis defaults for bare @perceptual_color traits', () => {
    const root = compiler.compileComposition(
      minimalComposition({
        objects: [
          {
            type: 'Object',
            name: 'defaultLegend',
            properties: [{ type: 'ObjectProperty', key: 'geometry', value: 'plane' }],
            traits: [{ name: 'perceptual_color' }],
          } as any,
        ],
      })
    );

    const legend = root.children?.find((node) => node.id === 'defaultLegend');
    const pass = legend?.props.perceptualColor as {
      source: string;
      colorMap?: { name: string; colors: string[] };
    };

    expect(pass.source).toBe('color_map');
    expect(pass.colorMap?.name).toBe('viridis');
    expect(pass.colorMap?.colors).toHaveLength(7);
  });

  it('compiles a procedural scatter domain block into an instanced scatter node', () => {
    const root = compiler.compileComposition(
      minimalComposition({
        domainBlocks: [
          {
            type: 'DomainBlock',
            domain: 'procedural',
            keyword: 'scatter',
            name: 'forest',
            properties: {
              count: 25,
              seed: 42,
              source_mesh: 'box',
              bounds: [20, 0, 20],
              scale_range: [0.5, 2.0],
            },
          } as any,
        ],
      })
    );

    const scatter = findByType(root.children, 'scatter');
    expect(scatter).toBeDefined();
    expect(scatter?.props?.count).toBe(25);
    expect((scatter?.props?.transforms as number[][]).length).toBe(25);
    expect(scatter?.props?.sourceMesh).toBe('box');
    expect(scatter?.props?.hsType).toBe('box');
  });

  it('produces deterministic transforms for the same seed', () => {
    const block = {
      type: 'DomainBlock',
      domain: 'procedural',
      keyword: 'scatter',
      name: 'grass',
      properties: {
        count: 30,
        seed: 7,
        source_mesh: 'box',
        bounds: [10, 0, 10],
        scale_range: [0.8, 1.2],
        random_rotation: true,
      },
    };
    const rootA = compiler.compileComposition(
      minimalComposition({ domainBlocks: [{ ...block } as any] })
    );
    const rootB = compiler.compileComposition(
      minimalComposition({ domainBlocks: [{ ...block } as any] })
    );

    const a = findByType(rootA.children, 'scatter')?.props?.transforms as number[][];
    const b = findByType(rootB.children, 'scatter')?.props?.transforms as number[][];

    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a).toEqual(b);
  });
});
