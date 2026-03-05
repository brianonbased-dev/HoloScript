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

// =============================================================================
// GRAPH PERSISTENCE
// =============================================================================

const CACHE_DIR = path.join(os.homedir(), '.holoscript');
const CACHE_FILE = path.join(CACHE_DIR, 'graph-cache.json');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface GraphCacheEnvelope {
  version: 1;
  rootDir: string;
  timestamp: number;
  stats: Record<string, unknown>;
  graphJson: string;
}

function saveGraphCache(graph: any, rootDir: string, stats: Record<string, unknown>): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const envelope: GraphCacheEnvelope = {
      version: 1,
      rootDir,
      timestamp: Date.now(),
      stats,
      graphJson: graph.serialize(),
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(envelope), 'utf-8');
  } catch {
    // Best-effort — don't break absorb if persistence fails
  }
}

function loadGraphCache(): GraphCacheEnvelope | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const envelope: GraphCacheEnvelope = JSON.parse(raw);
    if (envelope.version !== 1) return null;
    if (Date.now() - envelope.timestamp > CACHE_MAX_AGE_MS) return null;
    return envelope;
  } catch {
    return null;
  }
}

function getCacheAge(): { exists: boolean; ageMs?: number; rootDir?: string; stats?: Record<string, unknown> } {
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
          description: 'Absolute path to the root directory to scan',
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
          description:
            'Directory to re-scan for the current state',
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
];

// =============================================================================
// HANDLER
// =============================================================================

// Session-level graph cache (persists across tool calls within one MCP session)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedGraph: any = null;
let cachedRootDir = '';
let cacheAutoLoaded = false;

/**
 * Lazy-load the codebase module.
 * Uses dynamic import to avoid hard dependency at compile time.
 * The module path is constructed dynamically to prevent TS from
 * resolving it at type-check time (the dist/ may not exist yet).
 */
async function loadCodebaseModule(): Promise<any> {
  const pkg = '@holoscript/core';
  const subpath = '/codebase';
  return await import(/* webpackIgnore: true */ pkg + subpath);
}

export async function handleCodebaseTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown | null> {
  // Auto-load cached graph from disk on first tool call (if no graph in memory)
  if (!cachedGraph && !cacheAutoLoaded) {
    cacheAutoLoaded = true;
    const envelope = loadGraphCache();
    if (envelope) {
      try {
        const mod = await loadCodebaseModule();
        const { CodebaseGraph } = mod;
        cachedGraph = CodebaseGraph.deserialize(envelope.graphJson);
        cachedRootDir = envelope.rootDir;
        // Rebuild GraphRAG from cached graph (best-effort)
        try {
          const { EmbeddingIndex, GraphRAGEngine } = mod;
          const idx = new EmbeddingIndex();
          await idx.buildIndex(cachedGraph);
          setGraphRAGState(idx, new GraphRAGEngine(cachedGraph, idx));
        } catch { /* Ollama may not be running */ }
      } catch { /* Deserialization failed — stale cache */ }
    }
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
    default:
      return null;
  }
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function handleAbsorb(args: Record<string, unknown>): Promise<unknown> {
  const mod = await loadCodebaseModule();
  const { CodebaseScanner, CodebaseGraph, HoloEmitter } = mod;

  const rootDir = args.rootDir as string;
  const outputFormat = (args.outputFormat as string) ?? 'holo';
  const layout = (args.layout as string) ?? 'force';
  const languages = args.languages as string[] | undefined;
  const maxFiles = args.maxFiles as number | undefined;
  const interactive = (args.interactive as boolean) ?? false;

  const scanner = new CodebaseScanner();
  const scanResult = await scanner.scan({
    rootDir,
    languages,
    maxFiles,
  });

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  // Cache for subsequent queries
  cachedGraph = graph;
  cachedRootDir = rootDir;

  // Persist graph to disk for cross-session reuse
  const graphStats = graph.getStats();
  saveGraphCache(graph, rootDir, graphStats);

  // Build embedding index for Graph RAG (async, best-effort)
  try {
    const { EmbeddingIndex, GraphRAGEngine } = mod;
    const embeddingIndex = new EmbeddingIndex();
    await embeddingIndex.buildIndex(graph);
    const ragEngine = new GraphRAGEngine(graph, embeddingIndex);
    setGraphRAGState(embeddingIndex, ragEngine);
  } catch {
    // Ollama may not be available; Graph RAG tools will return helpful errors
  }

  const stats = graph.getStats();
  const communities: Map<string, string[]> = graph.detectCommunities();

  const communityList = Array.from(communities.entries()).map(
    ([name, files]: [string, string[]]) => ({
      name,
      fileCount: files.length,
    }),
  );

  if (outputFormat === 'stats') {
    return {
      rootDir,
      stats,
      communities: communityList,
      errors: scanResult.stats.errors,
    };
  }

  if (outputFormat === 'graph') {
    return {
      stats,
      graph: graph.serialize(),
    };
  }

  // Default: holo
  const emitter = new HoloEmitter();
  const holoSource = emitter.emit(graph, {
    name: rootDir.split(/[/\\]/).pop() ?? 'codebase',
    layout: layout as 'force' | 'layered',
  });

  // When interactive mode requested, compile an interactive 3D scene
  if (interactive) {
    try {
      const { CodebaseSceneCompiler } = mod;
      const sceneCompiler = new CodebaseSceneCompiler();
      const scene = sceneCompiler.compile(graph, {
        layout: layout as 'force' | 'layered',
        interactive: true,
      });
      return {
        stats,
        holoSource,
        interactiveScene: scene,
        communities: communityList,
      };
    } catch {
      // Fall through to non-interactive output
    }
  }

  return {
    stats,
    holoSource,
    communities: communityList,
  };
}

async function handleQuery(args: Record<string, unknown>): Promise<unknown> {
  if (!cachedGraph) {
    return {
      error: 'No codebase loaded. Call holo_absorb_repo first.',
    };
  }

  const queryType = args.queryType as string | undefined;
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
      };
    }

    case 'callees': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const callees = cachedGraph.getCalleesOf(name);
      return {
        query: `callees of ${name}`,
        results: callees,
        count: callees.length,
      };
    }

    case 'imports': {
      const file = filePath ?? extractFileFromQuery(query);
      const imports = cachedGraph.getImportsOf(file);
      return {
        query: `imports of ${file}`,
        results: imports,
        count: imports.length,
      };
    }

    case 'imported_by': {
      const file = filePath ?? extractFileFromQuery(query);
      const importedBy = cachedGraph.getImportedBy(file);
      return {
        query: `files that import ${file}`,
        results: importedBy,
        count: importedBy.length,
      };
    }

    case 'symbols': {
      const file = filePath ?? extractFileFromQuery(query);
      const symbols = cachedGraph.getSymbolsInFile(file);
      return {
        query: `symbols in ${file}`,
        results: symbols,
        count: symbols.length,
      };
    }

    case 'find': {
      const name = symbolName ?? extractSymbolFromQuery(query);
      const found = cachedGraph.findSymbolsByName(name);
      return {
        query: `find ${name}`,
        results: found,
        count: found.length,
      };
    }

    case 'trace': {
      const parts = query.match(/trace\s+(\S+)\s+(?:to\s+)?(\S+)/i);
      if (parts) {
        const chain = cachedGraph.traceCallChain(parts[1], parts[2]);
        return {
          query: `trace ${parts[1]} -> ${parts[2]}`,
          result: chain,
          found: chain !== null,
        };
      }
      return { error: 'Trace requires format: "trace SymbolA to SymbolB"' };
    }

    case 'communities': {
      const communities: Map<string, string[]> = cachedGraph.detectCommunities();
      return {
        query: 'communities',
        results: Array.from(communities.entries()).map(
          ([name, files]: [string, string[]]) => ({
            name,
            files,
            fileCount: files.length,
          }),
        ),
        count: communities.size,
      };
    }

    case 'stats':
      return { query: 'stats', result: cachedGraph.getStats() };

    default:
      return {
        error: `Unknown query type: ${effectiveType}. Use: callers, callees, imports, imported_by, symbols, find, trace, communities, stats`,
      };
  }
}

async function handleImpact(args: Record<string, unknown>): Promise<unknown> {
  if (!cachedGraph) {
    return { error: 'No codebase loaded. Call holo_absorb_repo first.' };
  }

  const changedFiles = args.changedFiles as string[] | undefined;
  const changedSymbol = args.changedSymbol as string | undefined;
  const symbolOwner = args.symbolOwner as string | undefined;

  if (changedFiles && changedFiles.length > 0) {
    const affected: Set<string> = cachedGraph.getImpactSet(changedFiles);
    return {
      changedFiles,
      affectedFiles: Array.from(affected),
      affectedCount: affected.size,
      blastRadius: `${affected.size} files affected by changes to ${changedFiles.length} files`,
    };
  }

  if (changedSymbol) {
    const affected: Set<string> = cachedGraph.getSymbolImpact(changedSymbol, symbolOwner);
    return {
      changedSymbol: symbolOwner ? `${symbolOwner}.${changedSymbol}` : changedSymbol,
      affectedFiles: Array.from(affected),
      affectedCount: affected.size,
      blastRadius: `${affected.size} files affected by changes to ${changedSymbol}`,
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

// ── Graph Status ─────────────────────────────────────────────────────────────

async function handleGraphStatus(): Promise<unknown> {
  const cache = getCacheAge();
  const { isGraphRAGReady } = await import('./graph-rag-tools');
  return {
    inMemory: cachedGraph !== null,
    rootDir: cachedRootDir || null,
    graphRAGReady: isGraphRAGReady(),
    diskCache: cache.exists
      ? {
          ageMs: cache.ageMs,
          ageHuman: cache.ageMs! < 3600000
            ? `${Math.round(cache.ageMs! / 60000)}m ago`
            : `${Math.round(cache.ageMs! / 3600000)}h ago`,
          rootDir: cache.rootDir,
          stats: cache.stats,
        }
      : null,
  };
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
