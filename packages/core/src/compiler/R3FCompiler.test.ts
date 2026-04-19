/**
 * R3FCompiler — focused tests for HoloComposition / world compilation.
 */
import { describe, it, expect } from 'vitest';
import type { HoloComposition, HoloWorld } from '../parser/HoloCompositionTypes';
import { R3FCompiler, type R3FNode } from './R3FCompiler';

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
    const root = compiler.compileComposition(
      minimalComposition({ worlds: [world] })
    );

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
    const root = compiler.compileComposition(
      minimalComposition({ worlds: [world] })
    );

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
});
