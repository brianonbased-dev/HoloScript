import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExternalSymbolDefinition, ExtendedSymbolType, SupportedLanguage } from './types';
import { TwoTowerSearchIndex, type TwoTowerScoreMode } from './TwoTowerSearchIndex';
import type { EmbeddingProvider } from './providers/EmbeddingProvider';

export const HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA =
  'holoscript.holograph-holoembed.two-tower-manifest.v1';

export interface HoloGraphHoloEmbedManifest {
  schema: typeof HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA;
  name?: string;
  scoreMode?: TwoTowerScoreMode;
  holoGraph: {
    kind: 'HoloGraphIndexedTower';
    graphPath: string;
    nodeEmbeddingPath: string;
    nodeEmbeddingFormat: 'npy.float32.row-major.v1' | string;
    nodeCount: number;
    embeddingDim: number;
    eventEdgeCount?: number;
    cleanQueryCount?: number;
    querySetHash?: string | null;
  };
  holoEmbed: {
    kind: 'HoloEmbedQueryTower';
    provider: string;
    baseModel?: string;
    studentPath?: string;
    embeddingDim: number;
  };
  mapping?: Record<string, unknown>;
  artifactSha256?: Record<string, string>;
  eval?: unknown;
  sourceTrainingReceipt?: unknown;
}

export interface CreateHoloGraphHoloEmbedSearchIndexOptions {
  manifest?: HoloGraphHoloEmbedManifest;
  manifestPath?: string;
  baseDir?: string;
  queryProvider: EmbeddingProvider;
}

interface HoloGraphNode {
  name?: unknown;
  type?: unknown;
  language?: unknown;
  visibility?: unknown;
  file?: unknown;
  filePath?: unknown;
  line?: unknown;
  column?: unknown;
  text?: unknown;
  signature?: unknown;
  docComment?: unknown;
  owner?: unknown;
  lineCount?: unknown;
  isExported?: unknown;
}

interface HoloGraphJson {
  nodes?: HoloGraphNode[];
}

interface Float32NpyMatrix {
  shape: [number, number];
  data: Float32Array;
}

export function loadHoloGraphHoloEmbedManifest(
  manifestPath: string
): HoloGraphHoloEmbedManifest {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  return validateHoloGraphHoloEmbedManifest(parsed);
}

export async function createHoloGraphHoloEmbedSearchIndexFromManifest(
  options: CreateHoloGraphHoloEmbedSearchIndexOptions
): Promise<TwoTowerSearchIndex> {
  const manifest = options.manifest
    ? validateHoloGraphHoloEmbedManifest(options.manifest)
    : options.manifestPath
      ? loadHoloGraphHoloEmbedManifest(options.manifestPath)
      : undefined;

  if (!manifest) {
    throw new Error('HoloGraph/HoloEmbed manifest or manifestPath is required.');
  }

  const baseDir = options.baseDir ?? (options.manifestPath ? path.dirname(options.manifestPath) : process.cwd());
  const graphPath = resolveManifestPath(baseDir, manifest.holoGraph.graphPath);
  const nodeEmbeddingPath = resolveManifestPath(baseDir, manifest.holoGraph.nodeEmbeddingPath);

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as HoloGraphJson;
  const nodes = graph.nodes ?? [];
  const matrix = readFloat32NpyMatrix(nodeEmbeddingPath);
  const [rows, dim] = matrix.shape;

  if (rows !== nodes.length) {
    throw new Error(`HoloGraph node embedding rows ${rows} do not match graph nodes ${nodes.length}.`);
  }
  if (manifest.holoGraph.nodeCount !== rows) {
    throw new Error(
      `HoloGraph manifest nodeCount ${manifest.holoGraph.nodeCount} does not match matrix rows ${rows}.`
    );
  }
  if (manifest.holoGraph.embeddingDim !== dim || manifest.holoEmbed.embeddingDim !== dim) {
    throw new Error(
      `HoloGraph/HoloEmbed manifest dimensions do not match matrix dim ${dim}.`
    );
  }

  const entries = nodes.map((node, row) => ({
    symbol: nodeToSymbol(node, row),
    embedding: matrix.data.subarray(row * dim, (row + 1) * dim),
    text: typeof node.text === 'string' ? node.text : undefined,
    nodeIndex: row,
  }));

  return new TwoTowerSearchIndex({
    queryProvider: options.queryProvider,
    entries,
    scoreMode: manifest.scoreMode ?? 'cosine',
    name: manifest.name ?? 'HoloGraph/HoloEmbed two-tower search',
  });
}

export function readFloat32NpyMatrix(filePath: string): Float32NpyMatrix {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 12 || buffer.toString('latin1', 0, 6) !== '\x93NUMPY') {
    throw new Error(`Unsupported HoloGraph embedding matrix ${filePath}: not an NPY file.`);
  }

  const major = buffer[6]!;
  const headerLength =
    major === 1 ? buffer.readUInt16LE(8) : major === 2 || major === 3 ? buffer.readUInt32LE(8) : -1;
  const headerStart = major === 1 ? 10 : major === 2 || major === 3 ? 12 : -1;
  if (headerLength < 0 || headerStart < 0) {
    throw new Error(`Unsupported NPY version ${major}.${buffer[7]} for ${filePath}.`);
  }

  const header = buffer.toString('latin1', headerStart, headerStart + headerLength);
  if (!/['"]descr['"]:\s*['"]<f4['"]/.test(header) && !/['"]descr['"]:\s*['"]\|f4['"]/.test(header)) {
    throw new Error(`Unsupported NPY dtype for ${filePath}; expected little-endian float32.`);
  }
  if (!/['"]fortran_order['"]:\s*False/.test(header)) {
    throw new Error(`Unsupported NPY layout for ${filePath}; expected row-major order.`);
  }

  const shapeMatch = /['"]shape['"]:\s*\((\d+)\s*,\s*(\d+)\s*,?\)/.exec(header);
  if (!shapeMatch) {
    throw new Error(`Could not parse NPY matrix shape from ${filePath}.`);
  }

  const rows = Number(shapeMatch[1]);
  const dim = Number(shapeMatch[2]);
  const count = rows * dim;
  const payloadStart = headerStart + headerLength;
  const payloadBytes = count * 4;
  if (buffer.length - payloadStart < payloadBytes) {
    throw new Error(`NPY payload for ${filePath} is truncated.`);
  }

  const aligned = new ArrayBuffer(payloadBytes);
  new Uint8Array(aligned).set(
    new Uint8Array(buffer.buffer, buffer.byteOffset + payloadStart, payloadBytes)
  );
  return {
    shape: [rows, dim],
    data: new Float32Array(aligned),
  };
}

function validateHoloGraphHoloEmbedManifest(value: unknown): HoloGraphHoloEmbedManifest {
  if (!value || typeof value !== 'object') {
    throw new Error('HoloGraph/HoloEmbed manifest must be an object.');
  }
  const manifest = value as HoloGraphHoloEmbedManifest;
  if (manifest.schema !== HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA) {
    throw new Error(
      `Unsupported HoloGraph/HoloEmbed manifest schema: ${String(manifest.schema)}`
    );
  }
  if (!manifest.holoGraph?.graphPath || !manifest.holoGraph?.nodeEmbeddingPath) {
    throw new Error('HoloGraph manifest requires graphPath and nodeEmbeddingPath.');
  }
  if (!Number.isInteger(manifest.holoGraph.nodeCount) || manifest.holoGraph.nodeCount <= 0) {
    throw new Error('HoloGraph manifest requires a positive nodeCount.');
  }
  if (!Number.isInteger(manifest.holoGraph.embeddingDim) || manifest.holoGraph.embeddingDim <= 0) {
    throw new Error('HoloGraph manifest requires a positive embeddingDim.');
  }
  if (!manifest.holoEmbed || manifest.holoEmbed.embeddingDim !== manifest.holoGraph.embeddingDim) {
    throw new Error('HoloEmbed query tower dimension must match the HoloGraph node tower.');
  }
  return manifest;
}

function resolveManifestPath(baseDir: string, rawPath: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(baseDir, rawPath);
}

function nodeToSymbol(node: HoloGraphNode, row: number): ExternalSymbolDefinition {
  const filePath = stringOr(node.filePath, stringOr(node.file, `holograph-node-${row}`));
  const name = stringOr(node.name, `holographNode${row}`);

  return {
    name,
    type: symbolType(node.type),
    language: language(node.language),
    visibility: visibility(node.visibility),
    filePath,
    line: numberOr(node.line, 1),
    column: numberOr(node.column, 0),
    isExported: booleanOr(node.isExported, true),
    signature: typeof node.signature === 'string' ? node.signature : stringOr(node.text, name),
    docComment: typeof node.docComment === 'string' ? node.docComment : undefined,
    owner: typeof node.owner === 'string' ? node.owner : undefined,
    lineCount: typeof node.lineCount === 'number' ? node.lineCount : undefined,
  };
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function symbolType(value: unknown): ExtendedSymbolType {
  return typeof value === 'string' && value.length > 0
    ? (value as ExtendedSymbolType)
    : 'function';
}

function language(value: unknown): SupportedLanguage {
  return typeof value === 'string' && value.length > 0
    ? (value as SupportedLanguage)
    : 'typescript';
}

function visibility(value: unknown): 'public' | 'private' | 'protected' | 'internal' {
  return value === 'private' || value === 'protected' || value === 'internal' ? value : 'public';
}
