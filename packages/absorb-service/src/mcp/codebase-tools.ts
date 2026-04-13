/**
 * MCP Codebase Tools for HoloScript
 *
 * Provides AI agents with tools for codebase absorption, knowledge graph
 * queries, impact analysis, and change detection.
 *
 * Tools:
 * - holo_absorb_repo: Full scan→graph→emit pipeline
 * - holo_query_codebase: Graph traversal queries
 * - holo_impact_analysis: Changed files → affected symbols
 * - holo_detect_changes: Diff two graph snapshots
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { setGraphRAGState } from './graph-rag-tools';
import type { EmbeddingProviderName } from '../engine/providers/EmbeddingProvider';

// =============================================================================
// SMART EMBEDDING PROVIDER AUTO-DETECTION
// =============================================================================

let cachedProviderName: string | null = null;

/**
 * Auto-detect the best available embedding provider.
 * Cached for the session (only probes once).
 *
 * Priority:
 * 1. Explicit EMBEDDING_PROVIDER env var (user override)
 * 2. OPENAI_API_KEY set → 'openai' (PREFERRED — best quality)
 * 3. Ollama running (probe with 2s timeout) ��� 'ollama'
 * 4. Fallback → 'openai' with warning (BM25 deprecated)
 */
async function detectBestEmbeddingProvider(): Promise<string> {
  if (cachedProviderName) return cachedProviderName;

  // 1. Explicit env override
  if (process.env.EMBEDDING_PROVIDER) {
    cachedProviderName = process.env.EMBEDDING_PROVIDER;
    console.error(`[EmbeddingProvider] Using explicit env: ${cachedProviderName}`);
    return cachedProviderName;
  }

  // 2. OpenAI API key available
  if (process.env.OPENAI_API_KEY) {
    cachedProviderName = 'openai';
    console.error(`[EmbeddingProvider] Auto-detected: ${cachedProviderName} (API key found)`);
    return cachedProviderName;
  }

  // 3. Probe Ollama (only if OLLAMA_URL is configured)
  try {
    const ollamaUrl = process.env.OLLAMA_URL;
    if (!ollamaUrl) throw new Error('OLLAMA_URL not set');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: controller.signal,
      method: 'GET',
    });
    clearTimeout(timeout);

    if (response.ok) {
      cachedProviderName = 'ollama';
      console.error(
        `[EmbeddingProvider] Auto-detected: ${cachedProviderName} (running at ${ollamaUrl})`
      );
      return cachedProviderName;
    }
  } catch {
    // Ollama not running or unreachable
  }

  // 4. Fallback — OpenAI without key will fail gracefully; warn user
  cachedProviderName = 'openai';
  console.error(
    `[EmbeddingProvider] WARNING: No OPENAI_API_KEY or Ollama found. Defaulting to 'openai' which will fail without a key.`
  );
  console.error(
    `[EmbeddingProvider] Set OPENAI_API_KEY in your environment for best quality semantic search.`
  );
  return cachedProviderName;
}

/**
 * Create an EmbeddingIndex with auto-detected or explicitly configured provider.
 */
async function createDynamicEmbeddingIndex(
  mod: {
    EmbeddingIndex: new (provider: any) => any;
    createEmbeddingProvider: (opts: any) => Promise<any>;
  },
  embeddingProvider?: string,
  embeddingApiKey?: string,
  embeddingModel?: string
): Promise<any> {
  const { EmbeddingIndex, createEmbeddingProvider } = mod;
  const providerName = embeddingProvider || (await detectBestEmbeddingProvider());

  const provider = await createEmbeddingProvider({
    provider: providerName as EmbeddingProviderName,
    ollamaUrl: process.env.OLLAMA_URL,
    ollamaModel: process.env.OLLAMA_MODEL,
    openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
    openaiModel: embeddingModel || process.env.OPENAI_MODEL,
    xenovaModel: process.env.XENOVA_MODEL,
  });
  console.error(
    `[EmbeddingProvider] Created: ${provider.name}${embeddingProvider ? ' (agent-specified)' : ''}`
  );
  return new EmbeddingIndex({ provider });
}

// =============================================================================
// JOB TRACKING (PHASE 8: SSE Progress Streaming)
// =============================================================================

interface AbsorbJob {
  jobId: string;
  rootDir: string;
  status: 'queued' | 'scanning' | 'analyzing' | 'indexing' | 'complete' | 'error';
  progress: number; // 0-100
  phase: string;
  filesProcessed: number;
  totalFiles: number;
  startedAt: number;
  completedAt?: number;
  error?: string;
  result?: unknown;
}

const absorbJobs = new Map<string, AbsorbJob>();

/**
 * Track absorb job progress. Updates the job state in the jobs map.
 */
function trackAbsorbProgress(
  jobId: string,
  phase: string,
  progress: number,
  filesProcessed: number = 0,
  totalFiles: number = 0
): void {
  const job = absorbJobs.get(jobId);
  if (job) {
    job.phase = phase;
    job.progress = Math.min(100, Math.max(0, progress));
    job.filesProcessed = filesProcessed;
    job.totalFiles = totalFiles;

    // Auto-update status based on progress
    if (progress >= 100) {
      job.status = 'complete';
      job.completedAt = Date.now();
    } else if (progress >= 65) {
      job.status = 'indexing';
    } else if (progress >= 10) {
      job.status = 'scanning';
    } else {
      job.status = 'queued';
    }
  }
}

/**
 * Create a new absorb job and register it.
 */
function createAbsorbJob(rootDir: string): string {
  const jobId = `absorb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  absorbJobs.set(jobId, {
    jobId,
    rootDir,
    status: 'queued',
    progress: 0,
    phase: 'Initializing',
    filesProcessed: 0,
    totalFiles: 0,
    startedAt: Date.now(),
  });

  // Auto-cleanup after 1 hour
  setTimeout(
    () => {
      absorbJobs.delete(jobId);
    },
    60 * 60 * 1000
  );

  return jobId;
}

// =============================================================================
// GRAPH PERSISTENCE
// =============================================================================

const CACHE_DIR = process.env.HOLOSCRIPT_CACHE_DIR || path.join(os.homedir(), '.holoscript');
const CACHE_FILE = path.join(CACHE_DIR, 'graph-cache.json');
const EMBEDDINGS_FILE = path.join(CACHE_DIR, 'embeddings-cache.bin');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface GraphCacheEnvelope {
  version: 1 | 2;
  rootDir: string;
  timestamp: number;
  stats: Record<string, unknown>;
  graphJson: string;
  // v2 fields (incremental absorb)
  gitCommitHash?: string;
  fileHashes?: Record<string, string>;
  embeddingProvider?: string;
}

interface AbsorbDiagnostics {
  requestedRootDir: string;
  resolvedRootDir: string;
  processCwd: string;
  resolvedDirExists: boolean;
  resolvedDirReadable: boolean;
  rootEntriesSample?: string[];
  scanErrorCount: number;
  scanErrorSample: Array<{ file: string; phase: string; error: string }>;
  hints: string[];
}

function saveGraphCache(
  graph: any,
  rootDir: string,
  stats: Record<string, unknown>,
  gitCommitHash?: string,
  fileHashes?: Record<string, string>,
  embeddingProvider?: string
): void {
  const totalFiles = Number((stats as { totalFiles?: unknown })?.totalFiles ?? 0);
  if (!Number.isFinite(totalFiles) || totalFiles <= 0) {
    return;
  }
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const envelope: GraphCacheEnvelope = {
      version: 2,
      rootDir,
      timestamp: Date.now(),
      stats,
      graphJson: graph.serialize(),
      gitCommitHash,
      fileHashes,
      embeddingProvider,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(envelope), 'utf-8');
  } catch (err) {
    // Best-effort — don't break absorb if persistence fails
    console.warn(
      `[CacheDebug][codebase] save miss path=${CACHE_FILE} error=${(err as Error)?.message ?? String(err)}`
    );
  }
}

function saveEmbeddingsCache(index: any, rootDir: string): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    if (typeof index.serializeBinary === 'function') {
      const buffer = index.serializeBinary();
      fs.writeFileSync(EMBEDDINGS_FILE, buffer);
    }
  } catch (err) {
    console.warn(
      `[CacheDebug][codebase] save embeddings miss path=${EMBEDDINGS_FILE} error=${(err as Error)?.message}`
    );
  }
}

async function loadEmbeddingsCache(mod: any, providerInstance: any): Promise<any | null> {
  try {
    if (!fs.existsSync(EMBEDDINGS_FILE)) return null;
    const buffer = fs.readFileSync(EMBEDDINGS_FILE);
    const index = mod.EmbeddingIndex.deserializeBinary(buffer, { provider: providerInstance });
    return index;
  } catch (err) {
    console.warn(`[CacheDebug][codebase] load embeddings miss path=${EMBEDDINGS_FILE}`);
    return null;
  }
}

function loadGraphCache(): GraphCacheEnvelope | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return null;
    }
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const envelope: GraphCacheEnvelope = JSON.parse(raw);

    // Accept both v1 and v2
    if (envelope.version !== 1 && envelope.version !== 2) {
      return null;
    }

    // v2 caches use content-based invalidation (no TTL check)
    // v1 caches still use 24h TTL
    if (envelope.version === 1 && Date.now() - envelope.timestamp > CACHE_MAX_AGE_MS) {
      return null;
    }

    return envelope;
  } catch {
    console.warn(`[CacheDebug][codebase] load miss path=${CACHE_FILE} reason=parse-or-io-error`);
    return null;
  }
}

function getCacheAge(): {
  exists: boolean;
  ageMs?: number;
  rootDir?: string;
  stats?: Record<string, unknown>;
} {
  try {
    if (!fs.existsSync(CACHE_FILE)) return { exists: false };
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const envelope: GraphCacheEnvelope = JSON.parse(raw);
    return {
      exists: true,
      ageMs: Date.now() - envelope.timestamp,
      rootDir: envelope.rootDir,
      stats: envelope.stats,
    };
  } catch {
    return { exists: false };
  }
}

function buildAbsorbDiagnostics(
  rootDir: string,
  scanResult: { files: any[]; stats?: any } | null,
  includeBuildArtifacts: boolean
): AbsorbDiagnostics {
  const resolvedRootDir = path.resolve(rootDir);
  const processCwd = process.cwd();
  const resolvedDirExists = fs.existsSync(resolvedRootDir);
  let resolvedDirReadable = false;
  let rootEntriesSample: string[] | undefined;

  if (resolvedDirExists) {
    try {
      fs.accessSync(resolvedRootDir, fs.constants.R_OK);
      resolvedDirReadable = true;
    } catch {
      resolvedDirReadable = false;
    }

    if (resolvedDirReadable) {
      try {
        rootEntriesSample = fs.readdirSync(resolvedRootDir).slice(0, 20);
      } catch {
        rootEntriesSample = undefined;
      }
    }
  }

  const errors = Array.isArray(scanResult?.stats?.errors) ? scanResult?.stats?.errors : [];
  const scanErrorSample = errors.slice(0, 5).map((e: any) => ({
    file: String(e?.file ?? ''),
    phase: String(e?.phase ?? ''),
    error: String(e?.error ?? ''),
  }));

  const hints: string[] = [];
  if (!resolvedDirExists) {
    hints.push('Resolved rootDir does not exist in runtime container.');
  } else if (!resolvedDirReadable) {
    hints.push('Resolved rootDir exists but is not readable by the running process.');
  }

  const entries = rootEntriesSample ?? [];
  const hasDist = entries.includes('dist');
  const hasSrc = entries.includes('src');
  if (hasDist && !hasSrc && !includeBuildArtifacts) {
    hints.push(
      'Directory appears dist-only. Scanner excludes dist/build/out by default, so scans may return zero files in production images that omit src.'
    );
  }

  if (hasDist && !hasSrc && includeBuildArtifacts) {
    hints.push(
      'Directory appears dist-only and includeBuildArtifacts=true is set. If totalFiles is still zero, verify file extensions/language filters and runtime visibility of compiled files.'
    );
  }

  if (errors.length > 0) {
    hints.push('Scanner reported parse/read/extract errors. See scanErrorSample for details.');
  }

  if (hints.length === 0) {
    hints.push(
      'No supported source files were found after exclusions and language filters. Verify rootDir, languages filter, and runtime filesystem contents.'
    );
  }

  return {
    requestedRootDir: rootDir,
    resolvedRootDir,
    processCwd,
    resolvedDirExists,
    resolvedDirReadable,
    rootEntriesSample,
    scanErrorCount: errors.length,
    scanErrorSample,
    hints,
  };
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const codebaseTools: Tool[] = [
  {
    name: 'holo_absorb_repo',
    description:
      'Absorb a codebase into HoloScript. Scans a directory, extracts symbols from all supported languages (TypeScript, Python, Rust, Go), builds a knowledge graph, and optionally generates a .holo composition for spatial visualization. Returns scan stats and the generated output.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Absolute path to the root directory to scan (deprecated in favor of rootDirs)',
        },
        rootDirs: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of absolute paths to root directories to scan (for multi-repository context)',
        },
        outputFormat: {
          type: 'string',
          enum: ['holo', 'graph', 'stats'],
          description:
            'Output format: "holo" for .holo source, "graph" for serialized knowledge graph JSON, "stats" for scan statistics only. Defaults to "holo".',
        },
        layout: {
          type: 'string',
          enum: ['force', 'layered'],
          description:
            'Layout algorithm for .holo output: "force" for organic force-directed, "layered" for dependency-depth layers. Defaults to "force".',
        },
        languages: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Filter to specific languages (e.g., ["typescript", "python"]). Defaults to all supported languages.',
        },
        maxFiles: {
          type: 'number',
          description: 'Maximum number of files to process. Defaults to 10000.',
        },
        interactive: {
          type: 'boolean',
          description:
            'When true, generates an interactive 3D scene with hover, click, selection, and edge highlighting. Only applies when outputFormat is "holo". Defaults to false.',
        },
        force: {
          type: 'boolean',
          description:
            'When false (default), skips re-scanning if a disk cache already exists and is younger than 24 hours. Set to true to force a fresh scan regardless of cache age.',
        },
        includeBuildArtifacts: {
          type: 'boolean',
          description:
            'When true, includes build output folders (dist/build/out) in scanning. Useful in production containers that only ship compiled output. Defaults to false.',
        },
        embeddingProvider: {
          type: 'string',
          enum: ['openai', 'ollama', 'xenova'],
          description:
            'Embedding provider for semantic search (default: openai). "openai" uses OpenAI embeddings (best quality, requires API key), "ollama" uses local Ollama server, "xenova" uses local WASM model.',
        },
        embeddingApiKey: {
          type: 'string',
          description:
            'API key for embedding provider (required for openai, not needed for ollama/xenova). Falls back to OPENAI_API_KEY environment variable if not provided.',
        },
        embeddingModel: {
          type: 'string',
          description:
            'Model name for embeddings (e.g., "text-embedding-3-small" for OpenAI). Uses provider defaults if not specified.',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_query_codebase',
    description:
      'Query a codebase knowledge graph. Supports queries like "what calls X?", "what does X call?", "show imports of file", "find all classes", "trace call chain from A to B". Requires a prior holo_absorb_repo call in the same session.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language or structured query. Examples: "callers of functionName", "callees of className.method", "imports of src/file.ts", "symbols in src/file.ts", "trace MyFunc to OtherFunc"',
        },
        symbolName: {
          type: 'string',
          description: 'Specific symbol name to query (for structured queries)',
        },
        symbolOwner: {
          type: 'string',
          description: 'Owner class/struct for method queries',
        },
        filePath: {
          type: 'string',
          description: 'File path for file-scoped queries',
        },
        queryType: {
          type: 'string',
          enum: [
            'callers',
            'callees',
            'imports',
            'imported_by',
            'symbols',
            'find',
            'trace',
            'communities',
            'stats',
          ],
          description: 'Structured query type',
        },
        traceStrategy: {
          type: 'string',
          enum: ['bfs', 'tropical-min-plus'],
          description:
            'Trace algorithm for queryType="trace". bfs = shortest hop count (default), tropical-min-plus = weighted shortest path.',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum call-chain traversal depth for queryType="trace" (default: 10).',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'holo_impact_analysis',
    description:
      'Analyze the impact of changing files or symbols. Given a list of changed files, returns all transitively affected files through import and call chains. Given a symbol name, returns all files containing callers of that symbol.',
    inputSchema: {
      type: 'object',
      properties: {
        changedFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of changed file paths (relative to scan root)',
        },
        changedSymbol: {
          type: 'string',
          description: 'Symbol name that changed (alternative to changedFiles)',
        },
        symbolOwner: {
          type: 'string',
          description: 'Owner class/struct for the changed symbol',
        },
      },
    },
  },
  {
    name: 'holo_detect_changes',
    description:
      'Detect structural changes between two codebase snapshots. Compares a previously saved graph with a fresh scan to find added/removed/modified symbols, imports, and files.',
    inputSchema: {
      type: 'object',
      properties: {
        previousGraphJson: {
          type: 'string',
          description:
            'JSON string of the previous CodebaseGraph (from a prior holo_absorb_repo with outputFormat "graph")',
        },
        rootDir: {
          type: 'string',
          description: 'Directory to re-scan for the current state',
        },
      },
      required: ['previousGraphJson', 'rootDir'],
    },
  },
  {
    name: 'holo_graph_status',
    description:
      'Check the status of the codebase knowledge graph: whether it is loaded in memory, whether a disk cache exists, cache age, and scan statistics. Use this before running queries to confirm the graph is ready.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'holo_detect_drift',
    description:
      'Fast drift detection: checks if the current knowledge graph is out of sync with the filesystem content hashes (without a full scan). Returns a list of drifted files.',
    inputSchema: {
      type: 'object',
      properties: {
        rootDir: {
          type: 'string',
          description: 'Absolute path to the root directory',
        },
      },
      required: ['rootDir'],
    },
  },
  {
    name: 'holo_resolve_symbol',
    description:
      'Federated symbol resolution: searches for a symbol across the entire absorbed knowledge mesh.',
    inputSchema: {
      type: 'object',
      properties: {
        symbolName: { type: 'string', description: 'Name of the symbol to resolve' },
        limit: { type: 'number', description: 'Maximum results to return', default: 5 },
      },
      required: ['symbolName'],
    },
  },
  {
    name: 'holo_get_absorb_status',
    description:
      'Get progress status of a running absorb job by jobId. Returns current progress, phase, files processed, and completion status.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: { type: 'string', description: 'Job ID returned from holo_absorb_repo' },
      },
      required: ['jobId'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

// Session-level graph cache (persists across tool calls within one MCP session)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGraph: any = null;
let cachedRootDir = '';
let cacheAutoLoaded = false;
let cacheProvenance: 'fresh-scan' | 'disk-cache' | 'incremental-patch' | null = null;
let cacheTimestamp = 0;

/**
 * Ensure graph is loaded. Returns { loaded: boolean; source: string; ageMs?: number }.
 * Order of preference:
 *   1. Already in memory (cachedGraph set)
 *   2. Disk cache (if younger than 24 h)
 *   3. Nothing available → returns loaded=false
 */
async function ensureCachedGraph(): Promise<{
  loaded: boolean;
  source: 'memory' | 'disk-cache' | 'none';
  ageMs?: number;
  rootDir?: string;
  stale?: boolean;
}> {
  if (cachedGraph) {
    return {
      loaded: true,
      source: cacheProvenance === 'disk-cache' ? 'disk-cache' : 'memory',
      ageMs: cacheTimestamp ? Date.now() - cacheTimestamp : undefined,
      rootDir: cachedRootDir,
      stale: cacheTimestamp ? Date.now() - cacheTimestamp > CACHE_MAX_AGE_MS : false,
    };
  }
  // Try disk
  const envelope = loadGraphCache();
  if (envelope) {
    try {
      const mod = await loadCodebaseModule();
      const { CodebaseGraph } = mod;
      cachedGraph = CodebaseGraph.deserialize(envelope.graphJson);
      cachedRootDir = envelope.rootDir;
      cacheProvenance = 'disk-cache';
      cacheTimestamp = envelope.timestamp;
      // Rebuild GraphRAG (best-effort)
      try {
        const { GraphRAGEngine } = mod;
        const providerName = await detectBestEmbeddingProvider();
        const providerObj = await mod.createEmbeddingProvider({
          provider: providerName as EmbeddingProviderName,
          ollamaUrl: process.env.OLLAMA_URL,
          ollamaModel: process.env.OLLAMA_MODEL,
          openaiApiKey: process.env.OPENAI_API_KEY,
          openaiModel: process.env.OPENAI_MODEL,
          xenovaModel: process.env.XENOVA_MODEL,
        });

        let idx = await loadEmbeddingsCache(mod, providerObj);
        if (!idx) {
          idx = await createDynamicEmbeddingIndex(mod);
          await idx.buildIndex(cachedGraph);
          saveEmbeddingsCache(idx, cachedRootDir);
        }
        setGraphRAGState(idx, new GraphRAGEngine(cachedGraph, idx));
      } catch {
        /* Embedding provider may not be available */
      }
      const ageMs = Date.now() - envelope.timestamp;
      return { loaded: true, source: 'disk-cache', ageMs, rootDir: envelope.rootDir, stale: false };
    } catch {
      /* Deserialization failed */
    }
  }
  return { loaded: false, source: 'none' };
}

/**
 * Lazy-load the codebase module.
 * Uses dynamic import to avoid hard dependency at compile time.
 * The module path is constructed dynamically to prevent TS from
 * resolving it at type-check time (the dist/ may not exist yet).
 */
import * as EngineMod from '../engine/index';

async function loadCodebaseModule(): Promise<any> {
  return EngineMod.CodebaseScanner ? EngineMod : (EngineMod as any).default || EngineMod;
}

export async function handleCodebaseTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  // cacheAutoLoaded guard prevents repeated disk I/O within a session;
  // ensureCachedGraph handles the actual lazy-load logic.
  if (!cacheAutoLoaded) {
    cacheAutoLoaded = true;
    // Pre-warm: load from disk if available (errors intentionally swallowed)
    await ensureCachedGraph().catch(() => {});
  }

  switch (name) {
    case 'holo_absorb_repo':
      return handleAbsorb(args);
    case 'holo_query_codebase':
      return handleQuery(args);
    case 'holo_impact_analysis':
      return handleImpact(args);
    case 'holo_detect_changes':
      return handleDetectChanges(args);
    case 'holo_graph_status':
      return handleGraphStatus();
    case 'holo_detect_drift':
      return handleDetectDrift(args);
    case 'holo_resolve_symbol':
      return handleResolveSymbol(args);
    case 'holo_get_absorb_status':
      return handleGetAbsorbStatus(args);
    default:
      return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

/**
 * Run a full codebase scan (non-incremental path).
 */
async function runFullScan(
  mod: {
    CodebaseScanner: any;
    CodebaseGraph: any;
    HoloEmitter: any;
    CodebaseSceneCompiler: any;
    GitChangeDetector: any;
    GraphRAGEngine: any;
    EmbeddingIndex: any;
    createEmbeddingProvider: any;
  },
  rootDirsRaw: string[] | undefined,
  languages: string[] | undefined,
  maxFiles: number | undefined,
  includeBuildArtifacts: boolean,
  outputFormat: string,
  layout: string,
  interactive: boolean,
  jobId?: string,
  embeddingProvider?: string,
  embeddingApiKey?: string,
  embeddingModel?: string
): Promise<unknown> {
  const { CodebaseScanner, CodebaseGraph, HoloEmitter, CodebaseSceneCompiler, GitChangeDetector } =
    mod;

  const rootDirs = rootDirsRaw && rootDirsRaw.length > 0 ? rootDirsRaw : [];
  if (rootDirs.length === 0) throw new Error('No rootDir or rootDirs provided');
  const primaryRootDir = rootDirs[0]; 

  const startTime = Date.now();

  if (jobId) trackAbsorbProgress(jobId, 'Discovering files', 5);

  const scanner = new CodebaseScanner();

  if (jobId) trackAbsorbProgress(jobId, 'Scanning codebase', 10);

  const scanResult = await scanner.scan({
    rootDir: primaryRootDir, // for backward compat mapping
    rootDirs,
    languages,
    maxFiles,
    includeBuildArtifacts,
    onProgress: (processed: number, total: number, file: string) => {
      if (jobId) {
        const scanPercent = 10 + (processed / Math.max(total, 1)) * 50; // 10-60%
        trackAbsorbProgress(jobId, `Parsing ${file}`, scanPercent, processed, total);
      }
    },
  });

  if (jobId) trackAbsorbProgress(jobId, 'Building graph', 65);

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  // Compute git commit hash and file hashes for v2 cache
  const detector = new GitChangeDetector(primaryRootDir);
  let gitCommitHash: string | undefined;
  let fileHashes: Record<string, string> | undefined;

  if (detector.isGitRepo()) {
    gitCommitHash = detector.getHeadCommit() ?? undefined;
    const filePaths = (scanResult as { files: any[] }).files.map((f: any) => f.path);
    const hashes = detector.computeFileHashes(filePaths);
    fileHashes = Object.fromEntries(hashes.map((h: any) => [h.filePath, h.hash]));
  }

  graph.gitCommitHash = gitCommitHash;
  graph.fileHashes = fileHashes;

  // Cache for subsequent queries
  cachedGraph = graph;
  cachedRootDir = primaryRootDir;
  cacheProvenance = 'fresh-scan';
  cacheTimestamp = Date.now();

  // Persist graph to disk
  const graphStats = graph.getStats();
  const detectedProvider = embeddingProvider || (await detectBestEmbeddingProvider());
  saveGraphCache(graph, primaryRootDir, graphStats, gitCommitHash, fileHashes, detectedProvider);

  if (jobId) trackAbsorbProgress(jobId, 'Creating embeddings', 80);

  // Build embedding index with granular progress (Phase 8 Extension)
  try {
    const { GraphRAGEngine } = mod;
    const embeddingIndex = await createDynamicEmbeddingIndex(
      mod,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );

    // Wire progress callback for granular embedding updates
    await embeddingIndex.buildIndex(
      graph,
      jobId
        ? (batchNum: number, totalBatches: number, symbolsProcessed: number) => {
            // Map batch progress to 80-95% range (Phase 8 Extension)
            const embeddingProgress = 80 + Math.floor((batchNum / totalBatches) * 15);
            trackAbsorbProgress(
              jobId,
              `Embedding batch ${batchNum}/${totalBatches} (${symbolsProcessed} symbols)`,
              embeddingProgress
            );
          }
        : undefined
    );

    saveEmbeddingsCache(embeddingIndex, primaryRootDir);
    setGraphRAGState(embeddingIndex, new GraphRAGEngine(graph, embeddingIndex));
  } catch {
    // Embedding provider may not be available
  }

  // Sync with mesh (Phase 9)
  await syncWithMesh(graph, primaryRootDir);

  const stats = graph.getStats();
  const diagnostics =
    stats.totalFiles === 0
      ? buildAbsorbDiagnostics(primaryRootDir, scanResult, includeBuildArtifacts)
      : undefined;

  if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);

  let result: unknown;

  if (outputFormat === 'stats') {
    result = {
      rootDir: primaryRootDir,
      stats,
      gitCommitHash,
      diagnostics,
      durationMs: Date.now() - startTime,
    };
  } else if (outputFormat === 'graph') {
    result = {
      stats,
      graph: graph.serialize(),
      gitCommitHash,
      diagnostics,
      durationMs: Date.now() - startTime,
    };
  } else {
    // Default: holo
    const emitter = new HoloEmitter();
    const holoSource = emitter.emit(graph, {
      name: primaryRootDir.split(/[/\\]/).pop() ?? 'codebase',
      layout: layout as 'force' | 'layered',
      lastPositions: graph.nodePositions,
    });

    // Extract positions from AST via SceneCompiler (since emitter doesn't expose them directly)
    const sceneCompiler = new CodebaseSceneCompiler();
    const scene = sceneCompiler.compile(graph, {
      layout: layout as 'force' | 'layered',
      interactive,
      lastPositions: graph.nodePositions,
    });

    // Save new positions to graph
    for (const obj of scene.objects) {
      graph.nodePositions.set(obj.name, obj.position);
    }

    result = {
      stats,
      holoSource,
      interactiveScene: scene,
      gitCommitHash,
      diagnostics,
      durationMs: Date.now() - startTime,
    };
  }

  // Store result in job
  if (jobId) {
    const job = absorbJobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'complete';
      job.completedAt = Date.now();
    }
  }

  return result;
}

/**
 * Run an incremental patch (reuse cached graph, only rescan changed files).
 */
async function runIncrementalPatch(
  mod: {
    CodebaseScanner: any;
    CodebaseGraph: any;
    GitChangeDetector: any;
    HoloEmitter: any;
    CodebaseSceneCompiler: any;
    GraphRAGEngine: any;
    EmbeddingIndex: any;
    createEmbeddingProvider: any;
  },
  rootDir: string,
  envelope: GraphCacheEnvelope,
  changes: { added: string[]; modified: string[]; deleted: string[]; headCommit: string },
  includeBuildArtifacts: boolean,
  outputFormat: string,
  layout: string,
  interactive: boolean,
  jobId?: string,
  embeddingProvider?: string,
  embeddingApiKey?: string,
  embeddingModel?: string
): Promise<unknown> {
  const { CodebaseScanner, CodebaseGraph, GitChangeDetector } = mod;
  const startTime = Date.now();

  if (jobId) trackAbsorbProgress(jobId, 'Loading cached graph', 10);

  // Deserialize cached graph
  let graph: any;
  try {
    graph = CodebaseGraph.deserialize(envelope.graphJson);
  } catch {
    console.warn('[AbsorbIncremental] deserialization failed → full scan');
    return await runFullScan(
      mod,
      [rootDir],
      undefined,
      undefined,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
  }

  if (jobId) trackAbsorbProgress(jobId, 'Detecting content changes', 20);

  // Content-hash verification
  const detector = new GitChangeDetector(rootDir);
  const modifiedFiltered = detector.filterByContentHash(
    changes.modified,
    envelope.fileHashes ?? {}
  );

  const filesToRemove = [...changes.deleted, ...modifiedFiltered.trulyChanged];
  const filesToRescan = [...changes.added, ...modifiedFiltered.trulyChanged];

  if (jobId) trackAbsorbProgress(jobId, `Rescanning ${filesToRescan.length} changed files`, 30);

  // Rescan changed files
  const scanner = new CodebaseScanner();
  const rescanResult = await scanner.scanFiles(
    rootDir,
    filesToRescan.map((f) => path.join(rootDir, f)),
    {
      includeBuildArtifacts,
      onProgress: (processed: number, total: number, file: string) => {
        if (jobId) {
          const scanPercent = 30 + (processed / total) * 30; // 30-60%
          trackAbsorbProgress(jobId, `Parsing ${file}`, scanPercent, processed, total);
        }
      },
    }
  );

  if (jobId) trackAbsorbProgress(jobId, 'Patching graph', 65);

  // Patch graph
  graph.patchFiles(filesToRemove, rescanResult.files);

  // Update git metadata
  graph.gitCommitHash = changes.headCommit;
  const allFilePaths = graph.getFilePaths();
  const newHashes = detector.computeFileHashes(allFilePaths);
  graph.fileHashes = Object.fromEntries(newHashes.map((h: any) => [h.filePath, h.hash]));

  if (jobId) trackAbsorbProgress(jobId, 'Updating embeddings', 80);

  // Update embedding index
  try {
    const { GraphRAGEngine } = mod;
    let index: any = null;

    if (cachedGraph && cachedGraph === graph && false) {
      // In-memory cache hit (todo: global cached index not implemented)
    } else {
      const providerName = embeddingProvider || (await detectBestEmbeddingProvider());
      const providerObj = await mod.createEmbeddingProvider({
        provider: providerName as EmbeddingProviderName,
        ollamaUrl: process.env.OLLAMA_URL,
        ollamaModel: process.env.OLLAMA_MODEL,
        openaiApiKey: embeddingApiKey || process.env.OPENAI_API_KEY,
        openaiModel: embeddingModel || process.env.OPENAI_MODEL,
        xenovaModel: process.env.XENOVA_MODEL,
      });

      index = await loadEmbeddingsCache(mod, providerObj);
      if (!index) {
        index = await createDynamicEmbeddingIndex(
          mod,
          embeddingProvider,
          embeddingApiKey,
          embeddingModel
        );
      }

      // Remove stale embeddings
      for (const file of filesToRemove) {
        index.removeSymbols(file);
      }
      // Add fresh embeddings
      const newSymbols = rescanResult.files.flatMap(
        (f: Record<string, unknown>) => (f as { symbols?: unknown[] }).symbols ?? []
      );
      if (newSymbols.length > 0) {
        await index.addSymbols(newSymbols);
      }

      saveEmbeddingsCache(index, rootDir);
      setGraphRAGState(index, new GraphRAGEngine(graph, index));
    }
  } catch {
    // Embedding provider may not be available
  }

  // Cache updated graph
  cachedGraph = graph;
  cachedRootDir = rootDir;
  cacheProvenance = 'incremental-patch';
  cacheTimestamp = Date.now();

  const graphStats = graph.getStats();
  const detectedProvider = embeddingProvider || (await detectBestEmbeddingProvider());

  // Layout and Emission (Phase 8: Incremental Spatial)
  let holoSource = '';
  let interactiveScene: any = null;

  if (outputFormat === 'holo' || interactive) {
    const { HoloEmitter, CodebaseSceneCompiler } = mod;
    const emitter = new HoloEmitter();
    holoSource = emitter.emit(graph, {
      name: rootDir.split(/[/\\]/).pop() ?? 'codebase',
      layout: layout as 'force' | 'layered',
      incremental: true,
      lastPositions: graph.nodePositions,
      changedFiles: filesToRescan,
    });

    const sceneCompiler = new CodebaseSceneCompiler();
    interactiveScene = sceneCompiler.compile(graph, {
      layout: layout as 'force' | 'layered',
      interactive: true,
      lastPositions: graph.nodePositions,
    });

    // Save positions back for next time
    for (const obj of interactiveScene.objects) {
      graph.nodePositions.set(obj.name, obj.position);
    }
  }

  saveGraphCache(
    graph,
    rootDir,
    graphStats,
    graph.gitCommitHash,
    graph.fileHashes,
    detectedProvider
  );

  // Sync with mesh if truly changed (Phase 9)
  if (filesToRescan.length > 0) {
    await syncWithMesh(graph, rootDir);
  }

  if (jobId) trackAbsorbProgress(jobId, 'Complete', 100);

  const patchDurationMs = Date.now() - startTime;

  const result = {
    incremental: true,
    filesChanged: filesToRescan.length,
    filesAdded: changes.added.length,
    filesModified: modifiedFiltered.trulyChanged.length,
    filesDeleted: changes.deleted.length,
    patchDurationMs,
    rootDir,
    stats: graphStats,
    holoSource,
    interactiveScene,
    gitCommitHash: changes.headCommit,
    message: `Incremental update: patched ${filesToRescan.length} files in ${patchDurationMs}ms (${graphStats.totalFiles} total)`,
  };

  // Store result in job
  if (jobId) {
    const job = absorbJobs.get(jobId);
    if (job) {
      job.result = result;
      job.status = 'complete';
      job.completedAt = Date.now();
    }
  }

  return result;
}

async function handleAbsorb(args: Record<string, unknown>): Promise<unknown> {
  const mod = (await loadCodebaseModule()) as {
    CodebaseScanner: any;
    CodebaseGraph: any;
    GitChangeDetector: any;
    HoloEmitter: any;
    CodebaseSceneCompiler: any;
    GraphRAGEngine: any;
    EmbeddingIndex: any;
    createEmbeddingProvider: any;
  };
  const { CodebaseGraph, GitChangeDetector } = mod;

  const rootDir = args.rootDir as string;
  const rootDirsRaw = args.rootDirs as string[] | undefined;
  const effectiveRootDirs = rootDirsRaw && rootDirsRaw.length > 0 ? rootDirsRaw : (rootDir ? [rootDir] : []);
  const primaryRootDir = effectiveRootDirs[0];
  if (!primaryRootDir) return { error: "rootDir or rootDirs required" };

  const outputFormat = (args.outputFormat as string) ?? 'holo';
  const layout = (args.layout as string) ?? 'force';
  const languages = args.languages as string[] | undefined;
  const maxFiles = args.maxFiles as number | undefined;
  const interactive = (args.interactive as boolean) ?? false;
  const force = (args.force as boolean) ?? false;
  const includeBuildArtifacts = (args.includeBuildArtifacts as boolean) ?? false;
  const embeddingProvider = args.embeddingProvider as string | undefined;
  const embeddingApiKey = args.embeddingApiKey as string | undefined;
  const embeddingModel = args.embeddingModel as string | undefined;

  // Create job for progress tracking
  const jobId = createAbsorbJob(primaryRootDir);

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 1: force=true → FULL SCAN
  // ═══════════════════════════════════════════════════════════════════════════
  if (force) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 2: Load cache checks
  // ═══════════════════════════════════════════════════════════════════════════
  const envelope = loadGraphCache();
  if (!envelope) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  if (envelope.version === 1) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  if (envelope.rootDir !== primaryRootDir) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 3: Git change detection
  // ═══════════════════════════════════════════════════════════════════════════
  const detector = new GitChangeDetector(primaryRootDir);
  if (!detector.isGitRepo()) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  const changes = detector.detectChanges(envelope.gitCommitHash ?? null);
  if (changes.storedCommitMissing) {
    const result = await runFullScan(
      mod,
      effectiveRootDirs,
      languages,
      maxFiles,
      includeBuildArtifacts,
      outputFormat,
      layout,
      interactive,
      jobId,
      embeddingProvider,
      embeddingApiKey,
      embeddingModel
    );
    return { ...(result as Record<string, unknown>), jobId };
  }

  const totalChanges = changes.added.length + changes.modified.length + changes.deleted.length;

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 4: FAST PATH - Zero changes
  // ═══════════════════════════════════════════════════════════════════════════
  if (totalChanges === 0) {
    // Ensure cached graph is in session memory
    if (!cachedGraph) {
      try {
        cachedGraph = CodebaseGraph.deserialize(envelope.graphJson);
        cachedRootDir = rootDir;
        cacheProvenance = 'disk-cache';
        cacheTimestamp = envelope.timestamp;
      } catch {
        console.warn('[AbsorbIncremental] deserialization failed → full scan');
        const result = await runFullScan(
          mod,
          [rootDir],
          languages,
          maxFiles,
          includeBuildArtifacts,
          outputFormat,
          layout,
          interactive,
          jobId
        );
        return { ...(result as Record<string, unknown>), jobId };
      }
    }

    // Mark job as complete immediately (fast path)
    if (jobId) {
      const job = absorbJobs.get(jobId);
      if (job) {
        job.status = 'complete';
        job.progress = 100;
        job.phase = 'Complete (cached)';
        job.completedAt = Date.now();
      }
    }

    return {
      cached: true,
      incremental: false,
      filesChanged: 0,
      rootDir,
      stats: envelope.stats,
      gitCommitHash: changes.headCommit,
      message: `No changes since last scan (${changes.headCommit.slice(0, 7)})`,
      jobId,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PATH 5: INCREMENTAL PATCH
  // ═══════════════════════════════════════════════════════════════════════════
  const result = await runIncrementalPatch(
    mod,
    primaryRootDir,
    envelope,
    changes,
    includeBuildArtifacts,
    outputFormat,
    layout,
    interactive,
    jobId,
    embeddingProvider,
    embeddingApiKey,
    embeddingModel
  );
  return { ...(result as Record<string, unknown>), jobId };
}

async function handleQuery(args: Record<string, unknown>): Promise<unknown> {
  const graphState = await ensureCachedGraph();
  if (!graphState.loaded) {
    return {
      error: 'No codebase loaded and no disk cache found. Call holo_absorb_repo first.',
    };
  }
  const fromCache = graphState.source === 'disk-cache';
  const cacheNote = fromCache
    ? `[auto-loaded from disk cache, ${
        graphState.ageMs! < 3600000
          ? `${Math.round(graphState.ageMs! / 60000)}m old`
          : `${(graphState.ageMs! / 3600000).toFixed(1)}h old`
      }, rootDir: ${graphState.rootDir}]`
    : undefined;

  const queryType = args.queryType as string | undefined;
  const traceStrategy = args.traceStrategy as 'bfs' | 'tropical-min-plus' | undefined;
  const maxDepth = (args.maxDepth as number | undefined) ?? 10;
  const symbolName = args.symbolName as string | undefined;
  const symbolOwner = args.symbolOwner as string | undefined;
  const filePath = args.filePath as string | undefined;
  const query = args.query as string;

  // Infer query type from natural language if not provided
  const effectiveType = queryType ?? inferQueryType(query);

  switch (effectiveType) {
    case 'callers': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const callers = cachedGraph.getCallersOf(name, symbolOwner);
      return {
        query: `callers of ${symbolOwner ? `${symbolOwner}.` : ''}${name}`,
        results: callers,
        count: callers.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'callees': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const callees = cachedGraph.getCalleesOf(name);
      return {
        query: `callees of ${name}`,
        results: callees,
        count: callees.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'imports': {
      const file = filePath ?? extractFileFromQuery(query);
      const imports = cachedGraph.getImportsOf(file);
      return {
        query: `imports of ${file}`,
        results: imports,
        count: imports.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'imported_by': {
      const file = filePath ?? extractFileFromQuery(query);
      const importedBy = cachedGraph.getImportedBy(file);
      return {
        query: `files that import ${file}`,
        results: importedBy,
        count: importedBy.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'symbols': {
      const file = filePath ?? extractFileFromQuery(query);
      const symbols = cachedGraph.getSymbolsInFile(file);
      return {
        query: `symbols in ${file}`,
        results: symbols,
        count: symbols.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'find': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const found = cachedGraph.findSymbolsByName(name);
      return {
        query: `find ${name}`,
        results: found,
        count: found.length,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'trace': {
      const parts = query.match(/trace\s+(\S+)\s+(?:to\s+)?(\S+)/i);
      if (parts) {
        const inferredStrategy = query.toLowerCase().includes('tropical')
          ? 'tropical-min-plus'
          : 'bfs';
        const strategy = traceStrategy ?? inferredStrategy;
        const chain = cachedGraph.traceCallChain(parts[1], parts[2], maxDepth, {
          algorithm: strategy,
        });
        return {
          query: `trace ${parts[1]} -> ${parts[2]}`,
          strategy,
          result: chain,
          found: chain !== null,
          ...(cacheNote && { cacheNote }),
        };
      }
      return { error: 'Trace requires format: "trace SymbolA to SymbolB"' };
    }

    case 'communities': {
      const communities: Map<string, string[]> = cachedGraph.detectCommunities();
      // Cap output: only show file counts + top 10 files per community to prevent token overflow
      const MAX_FILES_PER_COMMUNITY = 10;
      return {
        query: 'communities',
        results: Array.from(communities.entries())
          .sort(([, a]: [string, string[]], [, b]: [string, string[]]) => b.length - a.length)
          .slice(0, 50)
          .map(([name, files]: [string, string[]]) => ({
            name,
            files: files.slice(0, MAX_FILES_PER_COMMUNITY),
            fileCount: files.length,
            truncated: files.length > MAX_FILES_PER_COMMUNITY,
          })),
        count: communities.size,
        ...(cacheNote && { cacheNote }),
      };
    }

    case 'stats':
      return {
        query: 'stats',
        result: cachedGraph.getStats(),
        ...(cacheNote && { cacheNote }),
      };

    default:
      return {
        error: `Unknown query type: ${effectiveType}. Use: callers, callees, imports, imported_by, symbols, find, trace, communities, stats`,
      };
  }
}

async function handleImpact(args: Record<string, unknown>): Promise<unknown> {
  const graphState = await ensureCachedGraph();
  if (!graphState.loaded) {
    return { error: 'No codebase loaded and no disk cache found. Call holo_absorb_repo first.' };
  }
  const cacheNote =
    graphState.source === 'disk-cache'
      ? `auto-loaded from disk cache (${
          graphState.ageMs! < 3600000
            ? `${Math.round(graphState.ageMs! / 60000)}m old`
            : `${(graphState.ageMs! / 3600000).toFixed(1)}h old`
        })`
      : undefined;

  const changedFiles = args.changedFiles as string[] | undefined;
  const changedSymbol = args.changedSymbol as string | undefined;
  const symbolOwner = args.symbolOwner as string | undefined;

  if (changedFiles && changedFiles.length > 0) {
    const communityImpact = cachedGraph.getCommunityAwareImpact(changedFiles);
    const affectedCount = Array.from(communityImpact.values()).reduce(
      (acc: number, files: any) => acc + (files as string[]).length,
      0
    );

    return {
      changedFiles,
      impactByCommunity: Object.fromEntries(communityImpact),
      affectedCount,
      blastRadius: `${affectedCount} files across ${communityImpact.size} communities affected by changes to ${changedFiles.length} files`,
      ...(cacheNote && { cacheNote }),
    };
  }

  if (changedSymbol) {
    const affected: Set<string> = cachedGraph.getSymbolImpact(changedSymbol, symbolOwner);
    return {
      changedSymbol: symbolOwner ? `${symbolOwner}.${changedSymbol}` : changedSymbol,
      affectedFiles: Array.from(affected),
      affectedCount: affected.size,
      blastRadius: `${affected.size} files affected by changes to ${changedSymbol}`,
      ...(cacheNote && { cacheNote }),
    };
  }

  return { error: 'Provide either changedFiles or changedSymbol' };
}

async function handleDetectChanges(args: Record<string, unknown>): Promise<unknown> {
  const mod = await loadCodebaseModule();
  const { CodebaseScanner, CodebaseGraph } = mod;

  const previousGraphJson = args.previousGraphJson as string;
  const rootDir = args.rootDir as string;

  // Deserialize previous graph
  const previousGraph = CodebaseGraph.deserialize(previousGraphJson);
  const previousStats = previousGraph.getStats();
  const previousFiles = new Set<string>(previousGraph.getFilePaths());

  // Fresh scan
  const scanner = new CodebaseScanner();
  const scanResult = await scanner.scan({ rootDir });
  const currentGraph = new CodebaseGraph();
  currentGraph.buildFromScanResult(scanResult);
  const currentStats = currentGraph.getStats();
  const currentFiles = new Set<string>(currentGraph.getFilePaths());

  // Cache for subsequent queries
  cachedGraph = currentGraph;
  cachedRootDir = rootDir;

  // Diff files
  const addedFiles = Array.from(currentFiles).filter((f: string) => !previousFiles.has(f));
  const removedFiles = Array.from(previousFiles).filter((f: string) => !currentFiles.has(f));
  const commonFiles = Array.from(currentFiles).filter((f: string) => previousFiles.has(f));

  // Diff symbols in common files
  const modifiedFiles: string[] = [];
  for (const file of commonFiles) {
    const prevSymbols = previousGraph.getSymbolsInFile(file);
    const currSymbols = currentGraph.getSymbolsInFile(file);
    if (prevSymbols.length !== currSymbols.length) {
      modifiedFiles.push(file);
      continue;
    }
    // Check symbol names changed
    const prevNames = new Set(prevSymbols.map((s: any) => `${s.type}:${s.name}`));
    const currNames = new Set(currSymbols.map((s: any) => `${s.type}:${s.name}`));
    const changed = Array.from(currNames as Set<string>).some((n) => !prevNames.has(n));
    if (changed) modifiedFiles.push(file);
  }

  return {
    previous: previousStats,
    current: currentStats,
    changes: {
      addedFiles,
      removedFiles,
      modifiedFiles,
      addedFileCount: addedFiles.length,
      removedFileCount: removedFiles.length,
      modifiedFileCount: modifiedFiles.length,
    },
    summary: `${addedFiles.length} added, ${removedFiles.length} removed, ${modifiedFiles.length} modified`,
  };
}

async function handleDetectDrift(args: Record<string, unknown>): Promise<unknown> {
  const graphState = await ensureCachedGraph();
  if (!graphState.loaded) {
    return { error: 'No codebase loaded and no disk cache found. Call holo_absorb_repo first.' };
  }

  const rootDir = args.rootDir as string;
  const mod = await loadCodebaseModule();
  const { GitChangeDetector } = mod;

  const detector = new GitChangeDetector(rootDir);
  const filePaths = cachedGraph.getFilePaths();
  const currentHashes = detector.computeFileHashes(filePaths);
  const hashMap = Object.fromEntries(currentHashes.map((h: any) => [h.filePath, h.hash]));

  const drifted = cachedGraph.detectDrift(hashMap);

  return {
    rootDir,
    driftedFiles: drifted,
    driftCount: drifted.length,
    inSync: drifted.length === 0,
    summary:
      drifted.length === 0
        ? 'Knowledge graph is perfectly in sync with filesystem.'
        : `Detected ${drifted.length} drifted files. Recommend running holo_absorb_repo.`,
  };
}

// ── Graph Status ─────────────────────────────────────────────────────────────

async function handleGraphStatus(): Promise<unknown> {
  const cache = getCacheAge();
  const { isGraphRAGReady } = await import('./graph-rag-tools');
  const cacheAgeMs = cache.ageMs;
  const isFresh = cacheAgeMs !== undefined && cacheAgeMs < CACHE_MAX_AGE_MS;
  return {
    inMemory: cachedGraph !== null,
    rootDir: cachedRootDir || null,
    graphRAGReady: isGraphRAGReady(),
    sessionProvenance: cacheProvenance ?? null,
    diskCache: cache.exists
      ? {
          ageMs: cacheAgeMs,
          ageHuman:
            cacheAgeMs! < 3600000
              ? `${Math.round(cacheAgeMs! / 60000)}m ago`
              : `${(cacheAgeMs! / 3600000).toFixed(1)}h ago`,
          fresh: isFresh,
          stale: !isFresh,
          rootDir: cache.rootDir,
          stats: cache.stats,
          hint: isFresh
            ? 'Cache is fresh — query tools will auto-load it without re-scanning.'
            : 'Cache is older than 24h — call holo_absorb_repo to refresh.',
        }
      : {
          exists: false,
          hint: 'No disk cache found. Call holo_absorb_repo to create one.',
        },
  };
}

// ── Absorb Status ────────────────────────────────────────────────────────────

async function handleGetAbsorbStatus(args: Record<string, unknown>): Promise<unknown> {
  const jobId = args.jobId as string;
  const job = absorbJobs.get(jobId);

  if (!job) {
    return { error: 'Job not found', jobId };
  }

  const response: Record<string, unknown> = {
    jobId,
    status: job.status,
    progress: job.progress,
    phase: job.phase,
    filesProcessed: job.filesProcessed,
    totalFiles: job.totalFiles,
    durationMs: Date.now() - job.startedAt,
  };

  if (job.error) {
    response.error = job.error;
  }

  if (job.result && job.status === 'complete') {
    response.result = job.result;
  }

  return response;
}

// ── Query Helpers ────────────────────────────────────────────────────────────

function inferQueryType(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('call') && (q.includes('who') || q.includes('what calls'))) return 'callers';
  if (q.includes('call') && (q.includes('does') || q.includes('what does'))) return 'callees';
  if (q.includes('import') && q.includes('by')) return 'imported_by';
  if (q.includes('import')) return 'imports';
  if (q.includes('symbol') || q.includes('in file')) return 'symbols';
  if (q.includes('trace') || q.includes('path')) return 'trace';
  if (q.includes('communit') || q.includes('module')) return 'communities';
  if (q.includes('stat')) return 'stats';
  if (q.includes('find') || q.includes('where') || q.includes('search')) return 'find';
  return 'find'; // default: search by name
}

function extractSymbolFromQuery(query: string): string {
  // Try to extract a symbol name: last capitalized word or quoted string
  const quoted = query.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  const words = query.split(/\s+/);
  // Return the last word that looks like a symbol
  for (let i = words.length - 1; i >= 0; i--) {
    const w = words[i];
    if (/^[A-Z]/.test(w) || w.includes('.') || w.includes('_')) {
      return w;
    }
  }
  return words[words.length - 1];
}

function extractFileFromQuery(query: string): string {
  // Try to extract a file path
  const quoted = query.match(/"([^"]+)"/);
  if (quoted) return quoted[1];

  const pathMatch = query.match(/(\S+\.\w{1,6})/);
  if (pathMatch) return pathMatch[1];

  return query.split(/\s+/).pop() ?? '';
}

/**
 * Handle federated symbol resolution via MCP Orchestrator.
 */
async function handleResolveSymbol(args: Record<string, unknown>): Promise<unknown> {
  const symbolName = args.symbolName as string;
  const limit = (args.limit as number) ?? 5;
  const orchestratorUrl = process.env.MCP_ORCHESTRATOR_URL || 'http://localhost:5566';
  const apiKey = process.env.HOLOSCRIPT_API_KEY;

  try {
    const response = await fetch(`${orchestratorUrl}/knowledge/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey || '',
      },
      body: JSON.stringify({
        search: symbolName,
        type: 'symbol',
        limit,
      }),
    });

    if (!response.ok) {
      throw new Error(`Orchestrator error: ${response.status}`);
    }

    const data = (await response.json()) as { results: any[] };
    return {
      symbolName,
      results: (data.results || []).map((r: any) => ({
        repo: r.workspace_id,
        filePath: r.metadata?.filePath,
        type: r.metadata?.symbolType,
        content: r.content,
        relevance: r.relevance,
      })),
    };
  } catch (err) {
    return { error: `Federated lookup failed: ${err}` };
  }
}

/**
 * Sync codebase symbols with the MCP Orchestrator for federated discovery.
 */
export async function syncWithMesh(graph: any, rootDir: string): Promise<void> {
  const orchestratorUrl = process.env.MCP_ORCHESTRATOR_URL || 'http://localhost:5566';
  const apiKey = process.env.HOLOSCRIPT_API_KEY;
  const workspaceId = rootDir.split(/[/\\]/).pop() || 'unknown';

  const symbols = graph.getAllSymbols().filter((s: any) => s.visibility === 'public');
  const entries = symbols.slice(0, 1000).map((s: any) => ({
    id: `symbol-${workspaceId}-${s.name}`,
    workspace_id: workspaceId,
    type: 'symbol',
    content: `Symbol: ${s.name}\nType: ${s.type}\nFile: ${s.filePath}\nLanguage: ${s.language}\nSignature: ${s.signature || ''}\nDoc: ${s.docComment || ''}`,
    metadata: {
      symbolName: s.name,
      symbolType: s.type,
      filePath: s.filePath,
      repo: workspaceId,
    },
  }));

  if (entries.length === 0) return;

  try {
    const response = await fetch(`${orchestratorUrl}/knowledge/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-mcp-api-key': apiKey || '',
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        entries,
      }),
    });

    if (response.ok) {
    } else {
      console.warn(`[MeshSync] Orchestrator sync failed: ${response.status}`);
    }
  } catch (err) {
    console.warn(`[MeshSync] Could not reach orchestrator: ${err}`);
  }
}
