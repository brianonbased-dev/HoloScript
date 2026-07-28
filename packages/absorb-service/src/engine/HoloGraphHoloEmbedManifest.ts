import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ExternalSymbolDefinition, ExtendedSymbolType, SupportedLanguage } from './types';
import { TwoTowerSearchIndex, type TwoTowerScoreMode } from './TwoTowerSearchIndex';
import type {
  EmbeddingProvider,
  EmbeddingProviderName,
  EmbeddingProviderOptions,
} from './providers/EmbeddingProvider';
import { createEmbeddingProvider } from './providers/EmbeddingProviderFactory';

export const HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA =
  'holoscript.holograph-holoembed.two-tower-manifest.v1';

export const DEFAULT_HOLOGRAPH_HOLOEMBED_RELEASE_MANIFEST = path.join(
  'holotune',
  'models',
  'holograph-holoembed',
  'mcp-orchestrator-rich-v1',
  'holograph-holoembed-manifest.json'
);

export const DEFAULT_HOLOGRAPH_HOLOEMBED_STUDENT_SHA256 =
  '2ed1808133738b3bb3c776420341b052d502ea0f7aed4485c3e876e0a71bb33f';

export interface HoloGraphHoloEmbedManifest {
  schema: typeof HOLOGRAPH_HOLOEMBED_MANIFEST_SCHEMA;
  name?: string;
  pathMode?: 'absolute' | 'relative-to-manifest' | string;
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
  legacyExportReceiptPath?: string;
}

export interface CreateHoloGraphHoloEmbedSearchIndexOptions {
  manifest?: HoloGraphHoloEmbedManifest;
  manifestPath?: string;
  baseDir?: string;
  queryProvider?: EmbeddingProvider;
  queryProviderOptions?: Omit<EmbeddingProviderOptions, 'provider'>;
  verifyArtifactSha256?: boolean;
  expectedHoloEmbedQueryTowerSha256?: string;
}

export interface ResolveDefaultHoloGraphHoloEmbedManifestPathOptions {
  env?: Record<string, string | undefined>;
  cwd?: string;
  homeDir?: string;
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

export function loadHoloGraphHoloEmbedManifest(manifestPath: string): HoloGraphHoloEmbedManifest {
  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown;
  return validateHoloGraphHoloEmbedManifest(parsed);
}

export function resolveDefaultHoloGraphHoloEmbedManifestPath(
  options: ResolveDefaultHoloGraphHoloEmbedManifestPathOptions = {}
): string | null {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? os.homedir();
  const roots = [
    envPath(env.AI_ECOSYSTEM_ROOT),
    envPath(env.HOLO_ECOSYSTEM_ROOT),
    envPath(env.ECOSYSTEM_ROOT),
    path.resolve(cwd, '..', '.ai-ecosystem'),
    path.join(homeDir, '.ai-ecosystem'),
  ];

  const seen = new Set<string>();
  for (const root of roots) {
    if (!root) continue;
    const candidate = path.resolve(root, DEFAULT_HOLOGRAPH_HOLOEMBED_RELEASE_MANIFEST);
    const key = candidate.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
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

  verifyExpectedHoloEmbedQueryTowerSha256(manifest, options.expectedHoloEmbedQueryTowerSha256);

  const baseDir =
    options.baseDir ?? (options.manifestPath ? path.dirname(options.manifestPath) : process.cwd());
  const graphPath = resolveManifestPath(baseDir, manifest.holoGraph.graphPath);
  const nodeEmbeddingPath = resolveManifestPath(baseDir, manifest.holoGraph.nodeEmbeddingPath);
  const studentPath = manifest.holoEmbed.studentPath
    ? resolveManifestPath(baseDir, manifest.holoEmbed.studentPath)
    : undefined;

  if (options.verifyArtifactSha256 !== false) {
    verifyHoloGraphHoloEmbedArtifacts(manifest, {
      graph: graphPath,
      holoGraphNodeEmbeddings: nodeEmbeddingPath,
      holoEmbedQueryTower: studentPath,
    });
  }

  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')) as HoloGraphJson;
  const nodes = graph.nodes ?? [];
  const matrix = readFloat32NpyMatrix(nodeEmbeddingPath);
  const [rows, dim] = matrix.shape;

  if (rows !== nodes.length) {
    throw new Error(
      `HoloGraph node embedding rows ${rows} do not match graph nodes ${nodes.length}.`
    );
  }
  if (manifest.holoGraph.nodeCount !== rows) {
    throw new Error(
      `HoloGraph manifest nodeCount ${manifest.holoGraph.nodeCount} does not match matrix rows ${rows}.`
    );
  }
  if (manifest.holoGraph.embeddingDim !== dim || manifest.holoEmbed.embeddingDim !== dim) {
    throw new Error(`HoloGraph/HoloEmbed manifest dimensions do not match matrix dim ${dim}.`);
  }

  const queryProvider =
    options.queryProvider ??
    (await createHoloGraphHoloEmbedQueryProvider({
      manifest,
      baseDir,
      studentPath,
      providerOptions: options.queryProviderOptions,
    }));

  const entries = nodes.map((node, row) => ({
    symbol: nodeToSymbol(node, row),
    embedding: matrix.data.subarray(row * dim, (row + 1) * dim),
    text: typeof node.text === 'string' ? node.text : undefined,
    nodeIndex: row,
  }));

  return new TwoTowerSearchIndex({
    queryProvider,
    entries,
    scoreMode: manifest.scoreMode ?? 'cosine',
    name: manifest.name ?? 'HoloGraph/HoloEmbed two-tower search',
  });
}

export async function createHoloGraphHoloEmbedQueryProvider(options: {
  manifest: HoloGraphHoloEmbedManifest;
  baseDir?: string;
  studentPath?: string;
  providerOptions?: Omit<EmbeddingProviderOptions, 'provider'>;
}): Promise<EmbeddingProvider> {
  const manifest = validateHoloGraphHoloEmbedManifest(options.manifest);
  const providerName = manifest.holoEmbed.provider;
  if (!isEmbeddingProviderName(providerName)) {
    throw new Error(`Unsupported HoloEmbed query provider in manifest: ${providerName}`);
  }

  const baseDir = options.baseDir ?? process.cwd();
  const providerOptions = options.providerOptions ?? {};

  if (providerName === 'holodistill-m1a-student') {
    if (!manifest.holoEmbed.studentPath) {
      throw new Error('HoloDistill HoloEmbed manifest requires holoEmbed.studentPath.');
    }
    return createEmbeddingProvider({
      ...providerOptions,
      provider: providerName,
      holodistillStudentPath:
        providerOptions.holodistillStudentPath ??
        options.studentPath ??
        resolveManifestPath(baseDir, manifest.holoEmbed.studentPath),
      holodistillBaseModel: providerOptions.holodistillBaseModel ?? manifest.holoEmbed.baseModel,
      holodistillOutDim: providerOptions.holodistillOutDim ?? manifest.holoEmbed.embeddingDim,
    });
  }

  return createEmbeddingProvider({
    ...providerOptions,
    provider: providerName,
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
  if (
    !/['"]descr['"]:\s*['"]<f4['"]/.test(header) &&
    !/['"]descr['"]:\s*['"]\|f4['"]/.test(header)
  ) {
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
    throw new Error(`Unsupported HoloGraph/HoloEmbed manifest schema: ${String(manifest.schema)}`);
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

function verifyHoloGraphHoloEmbedArtifacts(
  manifest: HoloGraphHoloEmbedManifest,
  paths: {
    graph: string;
    holoGraphNodeEmbeddings: string;
    holoEmbedQueryTower?: string;
  }
): void {
  const expected = manifest.artifactSha256 ?? {};
  verifyArtifactSha256('graph', paths.graph, expected.graph);
  verifyArtifactSha256(
    'holoGraphNodeEmbeddings',
    paths.holoGraphNodeEmbeddings,
    expected.holoGraphNodeEmbeddings
  );
  verifyArtifactSha256(
    'holoEmbedQueryTower',
    paths.holoEmbedQueryTower,
    expected.holoEmbedQueryTower
  );
}

function verifyExpectedHoloEmbedQueryTowerSha256(
  manifest: HoloGraphHoloEmbedManifest,
  expected: string | undefined
): void {
  if (!expected) return;
  const actual = manifest.artifactSha256?.holoEmbedQueryTower;
  if (actual !== expected) {
    throw new Error(
      `HoloGraph/HoloEmbed default student sha256 mismatch: expected ${expected}, manifest declares ${
        actual ?? 'missing'
      }.`
    );
  }
}

function verifyArtifactSha256(
  label: string,
  filePath: string | undefined,
  expected: string | undefined
): void {
  if (!expected) return;
  if (!filePath) {
    throw new Error(`HoloGraph/HoloEmbed artifact sha256 for ${label} requires a manifest path.`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`HoloGraph/HoloEmbed artifact for ${label} not found: ${filePath}`);
  }
  const actual = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  if (actual !== expected) {
    throw new Error(
      `HoloGraph/HoloEmbed artifact sha256 mismatch for ${label}: expected ${expected}, got ${actual}.`
    );
  }
}

function resolveManifestPath(baseDir: string, rawPath: string): string {
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(baseDir, rawPath);
}

function envPath(value: string | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isEmbeddingProviderName(value: string): value is EmbeddingProviderName {
  return (
    value === 'xenova' ||
    value === 'openai' ||
    value === 'ollama' ||
    value === 'structural' ||
    value === 'holoembed' ||
    value === 'holodistill-m1a-student'
  );
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
  return typeof value === 'string' && value.length > 0 ? (value as ExtendedSymbolType) : 'function';
}

function language(value: unknown): SupportedLanguage {
  return typeof value === 'string' && value.length > 0
    ? (value as SupportedLanguage)
    : 'typescript';
}

function visibility(value: unknown): 'public' | 'private' | 'protected' | 'internal' {
  return value === 'private' || value === 'protected' || value === 'internal' ? value : 'public';
}
