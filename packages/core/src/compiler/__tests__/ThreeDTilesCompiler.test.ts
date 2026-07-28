import { describe, expect, it } from 'vitest';
import { ThreeDTilesCompiler, compileTo3DTiles, streamWorldTiles } from '../ThreeDTilesCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

function makeSplatComposition(): HoloComposition {
  const positions: number[] = [];
  const scales: number[] = [];
  const rotations: number[] = [];
  const colors: number[] = [];
  const opacities: number[] = [];

  for (let i = 0; i < 12; i++) {
    const x = i < 6 ? i * 5 : 60 + i * 5;
    const z = i % 3 === 0 ? 55 : 5;
    positions.push(x, 1, z);
    scales.push(0.1, 0.1, 0.1);
    rotations.push(0, 0, 0, 1);
    colors.push(1, i / 12, 0.2, 1);
    opacities.push(1);
  }

  const obj: HoloObjectDecl = {
    type: 'Object',
    name: 'CitySplats',
    properties: [],
    traits: [
      {
        type: 'ObjectTrait',
        name: 'gaussian_splat',
        config: { positions, scales, rotations, colors, opacities },
      },
    ],
  };

  return {
    type: 'Composition',
    name: 'GaussianCity',
    templates: [],
    objects: [obj],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

describe('ThreeDTilesCompiler', () => {
  it('emits a 3D Tiles 1.1 tileset with Gaussian tile payload files', () => {
    const bundle = compileTo3DTiles(makeSplatComposition(), {
      tileSizeMeters: 50,
      streamBaseUrl: 'https://tiles.example/streams',
      streamId: 'city-run',
    });

    expect(bundle.kind).toBe('holoscript-3dtiles-source-bundle');
    expect(bundle.target).toBe('3dtiles');
    expect(bundle.tileset.asset.version).toBe('1.1');
    expect(bundle.files['tileset.json']).toContain('"version": "1.1"');
    expect(bundle.files['stream-manifest.json']).toContain('city-run');
    expect(bundle.manifest.stream.manifestUrl).toBe(
      'https://tiles.example/streams/city-run/tileset.json'
    );
    expect(bundle.manifest.tiles.length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(bundle.files).some((path) => path.endsWith('/fine.glb'))).toBe(true);
  });

  it('builds coarse-medium-fine LOD chains with lower splat counts near the root', () => {
    const bundle = new ThreeDTilesCompiler({ tileSizeMeters: 50 }).compileToBundle(
      makeSplatComposition()
    );
    const firstChild = bundle.tileset.root.children?.[0];

    expect(firstChild?.metadata?.properties.lod).toBe('coarse');
    expect(firstChild?.children?.[0]?.metadata?.properties.lod).toBe('medium');
    expect(firstChild?.children?.[0]?.children?.[0]?.metadata?.properties.lod).toBe('fine');

    const coarse = bundle.manifest.tiles.find((tile) => tile.lod === 'coarse');
    const fine = bundle.manifest.tiles.find(
      (tile) => tile.tileId === coarse?.tileId && tile.lod === 'fine'
    );
    expect(coarse?.splatCount).toBeLessThanOrEqual(fine?.splatCount ?? 0);
  });

  it('falls back to a deterministic demo grid when no splat trait is present', () => {
    const empty = { ...makeSplatComposition(), objects: [] };
    const bundle = compileTo3DTiles(empty, { tileSizeMeters: 50 });

    expect(bundle.manifest.source.gaussianSplatCount).toBe(8);
    expect(bundle.files['README.md']).toContain('generated demo tile grid');
  });

  it('returns a stream manifest URL for stream_world_tiles callers', () => {
    const result = streamWorldTiles(makeSplatComposition(), {
      streamBaseUrl: 'https://cdn.example/holo',
      streamId: 'run-42',
    });

    expect(result.success).toBe(true);
    expect(result.target).toBe('3dtiles');
    expect(result.manifestUrl).toBe('https://cdn.example/holo/run-42/tileset.json');
    expect(result.files['cael-tile-provenance.json']).toContain('cael-3dtiles-provenance-chain');
  });
});
