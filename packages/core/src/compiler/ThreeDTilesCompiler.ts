import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { CompilerBase, type BaseCompilerOptions } from './CompilerBase';
import { GaussianSplattingCompiler } from './GaussianSplattingCompiler';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes';

export type ThreeDTilesLodLevel = 'coarse' | 'medium' | 'fine';

export interface ThreeDTilesCompilerOptions extends BaseCompilerOptions {
  tileSizeMeters?: number;
  lodLevels?: ThreeDTilesLodLevel[];
  baseUri?: string;
  streamBaseUrl?: string;
  streamId?: string;
  geometricError?: number;
}

export interface ThreeDTilesTile {
  boundingVolume: { box: number[] };
  geometricError: number;
  refine?: 'ADD' | 'REPLACE';
  content?: { uri: string };
  children?: ThreeDTilesTile[];
  metadata?: {
    class: string;
    properties: Record<string, string | number>;
  };
}

export interface ThreeDTilesTileset {
  asset: {
    version: '1.1';
    generator: string;
  };
  geometricError: number;
  root: ThreeDTilesTile;
  schema: {
    classes: Record<
      string,
      {
        properties: Record<string, { type: 'STRING' | 'SCALAR'; componentType?: 'UINT32' }>;
      }
    >;
  };
}

export interface ThreeDTilesTileManifest {
  tileId: string;
  lod: ThreeDTilesLodLevel;
  uri: string;
  splatCount: number;
  bounds: Bounds;
  contentEncoding: 'base64';
  contentSha256: string;
  provenance: {
    caelEventId: string;
    sourceCompositionHash: string;
  };
}

export interface ThreeDTilesManifest {
  kind: 'holoscript-3dtiles-gaussian-stream-manifest';
  target: '3dtiles';
  tilesVersion: '1.1';
  composition: string;
  stream: {
    streamId: string;
    manifestUrl: string;
    tilesetUri: string;
    tileSizeMeters: number;
    lodLevels: ThreeDTilesLodLevel[];
  };
  source: {
    gaussianSplatCount: number;
    sourceObjectCount: number;
    compositionHash: string;
  };
  tiles: ThreeDTilesTileManifest[];
  provenance: {
    compiler: 'ThreeDTilesCompiler';
    compositionHash: string;
    caelRoot: string;
  };
}

export interface ThreeDTilesCompileResult {
  kind: 'holoscript-3dtiles-source-bundle';
  target: '3dtiles';
  tileset: ThreeDTilesTileset;
  manifest: ThreeDTilesManifest;
  files: Record<string, string>;
}

export interface StreamWorldTilesResult {
  success: true;
  target: '3dtiles';
  manifestUrl: string;
  streamId: string;
  tileset: ThreeDTilesTileset;
  manifest: ThreeDTilesManifest;
  files: Record<string, string>;
}

interface GaussianData {
  positions: Float32Array;
  scales: Float32Array;
  rotations: Float32Array;
  colors: Float32Array;
  opacities: Float32Array;
  count: number;
  warnings: string[];
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

interface TileBucket {
  id: string;
  tileX: number;
  tileZ: number;
  indices: number[];
}

interface LodSpec {
  level: ThreeDTilesLodLevel;
  stride: number;
  geometricError: number;
}

const DEFAULT_LODS: ThreeDTilesLodLevel[] = ['coarse', 'medium', 'fine'];
const LOD_STRIDES: Record<ThreeDTilesLodLevel, number> = {
  coarse: 8,
  medium: 3,
  fine: 1,
};

export class ThreeDTilesCompiler extends CompilerBase {
  protected readonly compilerName = 'ThreeDTilesCompiler';
  private readonly options: Required<
    Omit<ThreeDTilesCompilerOptions, 'provenanceHash' | 'docsOptions'>
  > &
    Pick<ThreeDTilesCompilerOptions, 'provenanceHash' | 'docsOptions'>;

  constructor(options: ThreeDTilesCompilerOptions = {}) {
    super();
    this.options = {
      tileSizeMeters: options.tileSizeMeters ?? 50,
      lodLevels: options.lodLevels ?? DEFAULT_LODS,
      baseUri: options.baseUri ?? '',
      streamBaseUrl: options.streamBaseUrl ?? 'holoscript://world-tiles',
      streamId: options.streamId ?? '',
      geometricError: options.geometricError ?? 120,
      generateDocs: options.generateDocs ?? false,
      provenanceHash: options.provenanceHash,
      docsOptions: options.docsOptions,
    };
  }

  protected override getRequiredCapability(): string {
    return '/compile/interchange/3dtiles';
  }

  compile(composition: HoloComposition, agentToken?: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    return JSON.stringify(this.compileToBundle(composition), null, 2);
  }

  compileToBundle(composition: HoloComposition): ThreeDTilesCompileResult {
    const data = extractGaussianData(composition);
    const compositionHash = digest(JSON.stringify(composition));
    const streamId =
      this.options.streamId ||
      `${sanitizeSegment(composition.name || 'world')}-${compositionHash.slice(0, 12)}`;
    const manifestUrl = `${trimRightSlash(this.options.streamBaseUrl)}/${streamId}/tileset.json`;
    const tileSizeMeters = Math.max(1, this.options.tileSizeMeters);
    const lodSpecs = this.createLodSpecs();
    const buckets = partitionTiles(data, tileSizeMeters);
    const root: ThreeDTilesTile = {
      boundingVolume: { box: boundsToBox(boundsForIndices(data, range(data.count))) },
      geometricError: this.options.geometricError,
      refine: 'ADD',
      children: [],
    };
    const files: Record<string, string> = {};
    const tileManifest: ThreeDTilesTileManifest[] = [];
    const payloadCompiler = new GaussianSplattingCompiler({ format: 'glb' });

    for (const bucket of buckets) {
      root.children!.push(
        this.buildTileChain(
          composition,
          data,
          bucket,
          lodSpecs,
          payloadCompiler,
          files,
          tileManifest,
          compositionHash
        )
      );
    }

    const tileset: ThreeDTilesTileset = {
      asset: {
        version: '1.1',
        generator: 'HoloScript ThreeDTilesCompiler',
      },
      geometricError: this.options.geometricError,
      root,
      schema: {
        classes: {
          HoloScriptGaussianTile: {
            properties: {
              tileId: { type: 'STRING' },
              lod: { type: 'STRING' },
              splatCount: { type: 'SCALAR', componentType: 'UINT32' },
              provenanceHash: { type: 'STRING' },
            },
          },
        },
      },
    };

    const manifest: ThreeDTilesManifest = {
      kind: 'holoscript-3dtiles-gaussian-stream-manifest',
      target: '3dtiles',
      tilesVersion: '1.1',
      composition: composition.name || 'HoloScriptWorld',
      stream: {
        streamId,
        manifestUrl,
        tilesetUri: 'tileset.json',
        tileSizeMeters,
        lodLevels: lodSpecs.map((lod) => lod.level),
      },
      source: {
        gaussianSplatCount: data.count,
        sourceObjectCount: flattenObjects(composition.objects ?? []).length,
        compositionHash,
      },
      tiles: tileManifest,
      provenance: {
        compiler: 'ThreeDTilesCompiler',
        compositionHash,
        caelRoot: digest(tileManifest.map((tile) => tile.provenance.caelEventId).join('|')),
      },
    };

    files['tileset.json'] = JSON.stringify(tileset, null, 2);
    files['stream-manifest.json'] = JSON.stringify(manifest, null, 2);
    files['cael-tile-provenance.json'] = JSON.stringify(renderCaelProvenance(manifest), null, 2);
    files['README.md'] = renderReadme(manifest, data.warnings);

    return {
      kind: 'holoscript-3dtiles-source-bundle',
      target: '3dtiles',
      tileset,
      manifest,
      files,
    };
  }

  private createLodSpecs(): LodSpec[] {
    const levels = this.options.lodLevels.length > 0 ? this.options.lodLevels : DEFAULT_LODS;
    const unique = levels.filter((level, index) => levels.indexOf(level) === index);
    const denominator = Math.max(1, unique.length - 1);
    return unique.map((level, index) => ({
      level,
      stride: LOD_STRIDES[level],
      geometricError:
        index === unique.length - 1
          ? 0
          : Math.max(
              1,
              Math.round(this.options.geometricError * ((denominator - index) / denominator))
            ),
    }));
  }

  private buildTileChain(
    sourceComposition: HoloComposition,
    data: GaussianData,
    bucket: TileBucket,
    lodSpecs: LodSpec[],
    payloadCompiler: GaussianSplattingCompiler,
    files: Record<string, string>,
    manifests: ThreeDTilesTileManifest[],
    compositionHash: string
  ): ThreeDTilesTile {
    let child: ThreeDTilesTile | undefined;

    for (let index = lodSpecs.length - 1; index >= 0; index--) {
      const lod = lodSpecs[index]!;
      const indices = sampleIndices(bucket.indices, lod.stride);
      const uri = `${this.options.baseUri}tiles/${bucket.id}/${lod.level}.glb`;
      const localUri = `tiles/${bucket.id}/${lod.level}.glb`;
      const caelEventId = `cael-3dtiles-${digest(
        `${compositionHash}:${bucket.id}:${lod.level}:${indices.join(',')}`
      ).slice(0, 16)}`;
      const payload = compileGaussianPayload(
        payloadCompiler,
        sourceComposition,
        data,
        indices,
        `${bucket.id}-${lod.level}`
      );
      files[localUri] = Buffer.from(payload).toString('base64');

      const manifestEntry: ThreeDTilesTileManifest = {
        tileId: bucket.id,
        lod: lod.level,
        uri: localUri,
        splatCount: indices.length,
        bounds: boundsForIndices(data, indices),
        contentEncoding: 'base64',
        contentSha256: digestBytes(payload),
        provenance: {
          caelEventId,
          sourceCompositionHash: compositionHash,
        },
      };
      manifests.push(manifestEntry);

      child = {
        boundingVolume: { box: boundsToBox(manifestEntry.bounds) },
        geometricError: lod.geometricError,
        refine: 'REPLACE',
        content: { uri },
        metadata: {
          class: 'HoloScriptGaussianTile',
          properties: {
            tileId: bucket.id,
            lod: lod.level,
            splatCount: indices.length,
            provenanceHash: caelEventId,
          },
        },
        ...(child ? { children: [child] } : {}),
      };
    }

    return child!;
  }
}

export function compileTo3DTiles(
  composition: HoloComposition,
  options: ThreeDTilesCompilerOptions = {}
): ThreeDTilesCompileResult {
  return new ThreeDTilesCompiler(options).compileToBundle(composition);
}

export function streamWorldTiles(
  composition: HoloComposition,
  options: ThreeDTilesCompilerOptions = {}
): StreamWorldTilesResult {
  const bundle = compileTo3DTiles(composition, options);
  return {
    success: true,
    target: '3dtiles',
    manifestUrl: bundle.manifest.stream.manifestUrl,
    streamId: bundle.manifest.stream.streamId,
    tileset: bundle.tileset,
    manifest: bundle.manifest,
    files: bundle.files,
  };
}

export function createThreeDTilesCompiler(
  options?: ThreeDTilesCompilerOptions
): ThreeDTilesCompiler {
  return new ThreeDTilesCompiler(options);
}

function extractGaussianData(composition: HoloComposition): GaussianData {
  for (const obj of flattenObjects(composition.objects ?? [])) {
    const trait = findTrait(obj, 'gaussian_splat');
    const config = traitConfig(trait);
    if (!config) continue;

    const positions = parseFloatArray(config.positions);
    let colors = parseFloatArray(config.colors);
    if (!positions || !colors) continue;

    const count = Math.floor(positions.length / 3);
    if (count <= 0) continue;
    if (colors.length === count * 3) {
      colors = expandRgbToRgba(colors, count);
    }
    if (colors.length !== count * 4) continue;

    const scales = parseFloatArray(config.scales) ?? fillScales(count, 0.08);
    const rotations = parseFloatArray(config.rotations) ?? fillRotations(count);
    const opacities = parseFloatArray(config.opacities) ?? fillOpacities(count);
    if (
      scales.length !== count * 3 ||
      rotations.length !== count * 4 ||
      opacities.length !== count
    ) {
      continue;
    }

    return {
      positions,
      scales,
      rotations,
      colors,
      opacities,
      count,
      warnings: [],
    };
  }

  const fallback = generateDemoGrid();
  return {
    ...fallback,
    warnings: ['No valid @gaussian_splat trait data found; generated demo tile grid'],
  };
}

function compileGaussianPayload(
  compiler: GaussianSplattingCompiler,
  sourceComposition: HoloComposition,
  data: GaussianData,
  indices: number[],
  name: string
): Uint8Array {
  const composition: HoloComposition = {
    ...sourceComposition,
    name: `${sourceComposition.name || 'HoloScriptWorld'}_${name}`,
    objects: [
      {
        type: 'Object',
        name,
        properties: [],
        traits: [
          {
            type: 'ObjectTrait',
            name: 'gaussian_splat',
            config: sliceGaussianData(data, indices),
          },
        ],
      },
    ],
  };
  const result = compiler.compile(composition);
  if (!result.binary) {
    throw new Error('Gaussian tile payload compiler did not emit GLB binary');
  }
  return result.binary;
}

function sliceGaussianData(data: GaussianData, indices: number[]): Record<string, number[]> {
  const positions: number[] = [];
  const scales: number[] = [];
  const rotations: number[] = [];
  const colors: number[] = [];
  const opacities: number[] = [];

  for (const index of indices) {
    positions.push(...copyTuple(data.positions, index, 3));
    scales.push(...copyTuple(data.scales, index, 3));
    rotations.push(...copyTuple(data.rotations, index, 4));
    colors.push(...copyTuple(data.colors, index, 4));
    opacities.push(data.opacities[index] ?? 1);
  }

  return { positions, scales, rotations, colors, opacities };
}

function copyTuple(array: Float32Array, index: number, width: number): number[] {
  const offset = index * width;
  return Array.from(array.slice(offset, offset + width));
}

function partitionTiles(data: GaussianData, tileSizeMeters: number): TileBucket[] {
  const buckets = new Map<string, TileBucket>();
  for (let i = 0; i < data.count; i++) {
    const x = data.positions[i * 3] ?? 0;
    const z = data.positions[i * 3 + 2] ?? 0;
    const tileX = Math.floor(x / tileSizeMeters);
    const tileZ = Math.floor(z / tileSizeMeters);
    const id = `tile_${formatTileCoord(tileX)}_${formatTileCoord(tileZ)}`;
    const bucket = buckets.get(id) ?? { id, tileX, tileZ, indices: [] };
    bucket.indices.push(i);
    buckets.set(id, bucket);
  }
  return [...buckets.values()].sort((a, b) => a.tileX - b.tileX || a.tileZ - b.tileZ);
}

function sampleIndices(indices: number[], stride: number): number[] {
  if (stride <= 1) return indices;
  const sampled = indices.filter((_, index) => index % stride === 0);
  return sampled.length > 0 ? sampled : [indices[0]!];
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function boundsForIndices(data: GaussianData, indices: number[]): Bounds {
  const bounds = emptyBounds();
  for (const index of indices) {
    includePoint(
      bounds,
      data.positions[index * 3] ?? 0,
      data.positions[index * 3 + 1] ?? 0,
      data.positions[index * 3 + 2] ?? 0
    );
  }
  normalizeEmptyBounds(bounds);
  return bounds;
}

function boundsToBox(bounds: Bounds): number[] {
  normalizeEmptyBounds(bounds);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  const centerZ = (bounds.min[2] + bounds.max[2]) / 2;
  const halfX = Math.max((bounds.max[0] - bounds.min[0]) / 2, 0.001);
  const halfY = Math.max((bounds.max[1] - bounds.min[1]) / 2, 0.001);
  const halfZ = Math.max((bounds.max[2] - bounds.min[2]) / 2, 0.001);
  return [centerX, centerY, centerZ, halfX, 0, 0, 0, halfY, 0, 0, 0, halfZ];
}

function emptyBounds(): Bounds {
  return {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
}

function includePoint(bounds: Bounds, x: number, y: number, z: number): void {
  bounds.min[0] = Math.min(bounds.min[0], x);
  bounds.min[1] = Math.min(bounds.min[1], y);
  bounds.min[2] = Math.min(bounds.min[2], z);
  bounds.max[0] = Math.max(bounds.max[0], x);
  bounds.max[1] = Math.max(bounds.max[1], y);
  bounds.max[2] = Math.max(bounds.max[2], z);
}

function normalizeEmptyBounds(bounds: Bounds): void {
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(bounds.min[i]) || !Number.isFinite(bounds.max[i])) {
      bounds.min[i] = 0;
      bounds.max[i] = 0;
    }
  }
}

function findTrait(obj: HoloObjectDecl, name: string): HoloObjectTrait | undefined {
  return (obj.traits ?? []).find((trait) => trait.name === name || trait.name === `@${name}`);
}

function traitConfig(
  trait: (HoloObjectTrait & { params?: Record<string, HoloValue> }) | undefined
): Record<string, HoloValue> | undefined {
  return trait?.config ?? trait?.params;
}

function parseFloatArray(value: unknown): Float32Array | undefined {
  if (value instanceof Float32Array) return value;
  if (Array.isArray(value)) {
    const numbers = value.map((entry) => Number(entry));
    if (numbers.every((entry) => Number.isFinite(entry))) {
      return new Float32Array(numbers);
    }
  }
  return undefined;
}

function expandRgbToRgba(rgb: Float32Array, count: number): Float32Array {
  const rgba = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    rgba[i * 4] = rgb[i * 3] ?? 1;
    rgba[i * 4 + 1] = rgb[i * 3 + 1] ?? 1;
    rgba[i * 4 + 2] = rgb[i * 3 + 2] ?? 1;
    rgba[i * 4 + 3] = 1;
  }
  return rgba;
}

function fillScales(count: number, scale: number): Float32Array {
  const values = new Float32Array(count * 3);
  values.fill(scale);
  return values;
}

function fillRotations(count: number): Float32Array {
  const values = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    values[i * 4 + 3] = 1;
  }
  return values;
}

function fillOpacities(count: number): Float32Array {
  const values = new Float32Array(count);
  values.fill(1);
  return values;
}

function generateDemoGrid(): GaussianData {
  const positions = new Float32Array([
    0, 0, 0, 24, 0, 0, 49, 0, 0, 51, 0, 0, 0, 0, 51, 24, 0, 51, 51, 0, 51, 76, 0, 76,
  ]);
  const count = positions.length / 3;
  const colors = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    colors[i * 4] = i % 2 === 0 ? 0.2 : 0.8;
    colors[i * 4 + 1] = 0.6;
    colors[i * 4 + 2] = i % 3 === 0 ? 1 : 0.3;
    colors[i * 4 + 3] = 1;
  }
  return {
    positions,
    scales: fillScales(count, 0.1),
    rotations: fillRotations(count),
    colors,
    opacities: fillOpacities(count),
    count,
    warnings: [],
  };
}

function flattenObjects(objects: HoloObjectDecl[]): HoloObjectDecl[] {
  return objects.flatMap((obj) => [
    obj,
    ...flattenObjects((obj as unknown as { children?: HoloObjectDecl[] }).children ?? []),
    ...flattenObjects((obj as unknown as { objects?: HoloObjectDecl[] }).objects ?? []),
  ]);
}

function renderCaelProvenance(manifest: ThreeDTilesManifest): Record<string, unknown> {
  return {
    kind: 'cael-3dtiles-provenance-chain',
    target: '3dtiles',
    streamId: manifest.stream.streamId,
    root: manifest.provenance.caelRoot,
    compositionHash: manifest.provenance.compositionHash,
    events: manifest.tiles.map((tile) => ({
      eventId: tile.provenance.caelEventId,
      tileId: tile.tileId,
      lod: tile.lod,
      uri: tile.uri,
      splatCount: tile.splatCount,
      contentSha256: tile.contentSha256,
    })),
  };
}

function renderReadme(manifest: ThreeDTilesManifest, warnings: string[]): string {
  const warningText =
    warnings.length > 0 ? `\nWarnings:\n${warnings.map((w) => `- ${w}`).join('\n')}\n` : '';
  return `# HoloScript 3D Tiles Gaussian stream

Tileset: ${manifest.stream.tilesetUri}
Manifest URL: ${manifest.stream.manifestUrl}
Tile size: ${manifest.stream.tileSizeMeters}m
LOD levels: ${manifest.stream.lodLevels.join(', ')}

The .glb entries in this source bundle are base64-encoded strings. Decode them
to binary files at the same paths before serving tileset.json from static storage.
${warningText}`;
}

function formatTileCoord(value: number): string {
  return value < 0 ? `n${Math.abs(value)}` : `${value}`;
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'world';
}

function trimRightSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function digestBytes(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}
