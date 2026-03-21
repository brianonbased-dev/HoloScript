/**
 * /api/daemon/absorb — Standalone Codebase Absorb Endpoint
 *
 * The "IntelliSense provider" for HoloScript Studio. Runs CodebaseScanner +
 * CodebaseGraph from @holoscript/core directly (no subprocess) and returns:
 *   - Serialized graph JSON
 *   - Visualization data (nodes, edges, communities) for CodebaseVisualizationPanel
 *   - In-degree map for impact analysis ("what breaks if I change X?")
 *   - Leaf-first file order (safest files to edit first)
 *
 * POST { projectPath: string, depth?: 'shallow' | 'medium' | 'deep' }
 * GET  — returns cache status
 *
 * Equivalent to: `holoscript absorb <dir> --json`
 * Used by: daemon runner (Phase 0), Studio codebase panel, impact analysis UI
 */

import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// ─── Types (mirrored from CodebaseGraph serialized shape) ─────────────────────

interface AbsorbSymbol {
  name: string;
  type: string;
  filePath: string;
  line: number;
}

interface AbsorbImport {
  fromFile: string;
  toModule: string;
  resolvedPath?: string;
}

interface AbsorbFileResult {
  path: string;
  language: string;
  symbols: AbsorbSymbol[];
  imports: AbsorbImport[];
  calls: unknown[];
  loc: number;
  sizeBytes: number;
}

interface AbsorbScanResult {
  rootDir: string;
  files: AbsorbFileResult[];
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalImports: number;
    totalLoc: number;
    durationMs: number;
    errors: string[];
    filesByLanguage: Record<string, number>;
    symbolsByType: Record<string, number>;
    totalCalls: number;
  };
}

export interface AbsorbVisualizationNode {
  id: string;
  label: string;
  community: number;
  degree: number;
  inDegree: number;
  outDegree: number;
  loc: number;
}

export interface AbsorbVisualizationEdge {
  source: string;
  target: string;
}

export interface AbsorbResult {
  /** Serialized CodebaseGraph JSON (for persistence, MCP tools compatibility) */
  graphJson: string;
  /** Visualization data for CodebaseVisualizationPanel */
  visualization: {
    nodes: AbsorbVisualizationNode[];
    edges: AbsorbVisualizationEdge[];
    communities: Record<string, number>;
    stats: {
      totalFiles: number;
      totalSymbols: number;
      totalImports: number;
      totalLoc: number;
      communityCount: number;
    };
  };
  /** In-degree per file (how many files import this one — higher = more risk to change) */
  inDegree: Record<string, number>;
  /** Files sorted leaf-first (lowest in-degree first — safest to modify) */
  leafFirstOrder: string[];
  /** Top hub files (highest in-degree = hardest to change safely) */
  hubFiles: Array<{ path: string; inDegree: number; symbols: number }>;
  /** Absorb scan stats */
  stats: AbsorbScanResult['stats'];
  /** Duration of the absorb scan in ms */
  durationMs: number;
  /** Timestamp of this absorb */
  absorbedAt: string;
  /** Project path that was absorbed */
  projectPath: string;
  /** Depth used */
  depth: 'shallow' | 'medium' | 'deep';
  /** Git commit hash at time of absorb (v2) */
  gitCommitHash?: string;
  /** SHA-256 content hashes of all files (v2) */
  fileHashes?: Record<string, string>;
  /** True if this was an incremental patch (not a full scan) */
  incremental?: boolean;
  /** Number of files changed (for incremental absorb) */
  filesChanged?: number;
}

// ─── On-disk cache ──────────────────────────────────────────────────────────

const CACHE_DIR = path.join(os.homedir(), '.holoscript', 'absorb-cache');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(projectPath: string, depth: string): string {
  return Buffer.from(`${projectPath}::${depth}`).toString('base64').replace(/[/+=]/g, '_');
}

function readCache(key: string): AbsorbResult | null {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (!fs.existsSync(file)) return null;
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as AbsorbResult;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: AbsorbResult): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data), 'utf-8');
  } catch {
    // Cache write failure is non-fatal
  }
}

// ─── Core absorb logic ───────────────────────────────────────────────────────

/**
 * Run a full absorb scan (all files, from scratch).
 * Extracted from original runAbsorb() to support incremental patching.
 */
async function runFullScan(
  projectPath: string,
  depth: 'shallow' | 'medium' | 'deep',
  start: number,
): Promise<AbsorbResult> {
  // Runtime import with webpackIgnore keeps optional deep deps out of the Studio bundle.
  const coreCb = await import(/* webpackIgnore: true */ '@holoscript/core/codebase') as {
    CodebaseScanner: {
      new(): { scan(opts: { rootDir: string; depth?: string }): Promise<AbsorbScanResult> };
    };
    CodebaseGraph: {
      new(): {
        buildFromScanResult(r: AbsorbScanResult): void;
        serialize(): string;
        communities?: Record<string, number>;
        gitCommitHash?: string;
        fileHashes?: Record<string, string>;
      };
    };
    GitChangeDetector: {
      new(rootDir: string): {
        isGitRepo(): boolean;
        getHeadCommit(): string | null;
        computeFileHashes(paths: string[]): Array<{ filePath: string; hash: string }>;
      };
    };
  };

  const { CodebaseScanner, CodebaseGraph, GitChangeDetector } = coreCb;

  const scanner = new CodebaseScanner();
  const scanResult: AbsorbScanResult = await scanner.scan({ rootDir: projectPath, depth });

  const graph = new CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  // Capture git metadata
  let gitCommitHash: string | undefined;
  let fileHashes: Record<string, string> | undefined;
  try {
    const detector = new GitChangeDetector(projectPath);
    if (detector.isGitRepo()) {
      const headCommit = detector.getHeadCommit();
      if (headCommit) {
        gitCommitHash = headCommit;
        const filePaths = scanResult.files.map((f) => path.join(projectPath, f.path));
        const hashes = detector.computeFileHashes(filePaths);
        fileHashes = Object.fromEntries(hashes.map((h: any) => [h.filePath, h.hash]));
      }
    }
  } catch {
    // Git metadata is optional
  }

  graph.gitCommitHash = gitCommitHash;
  graph.fileHashes = fileHashes;

  const graphJson = graph.serialize();

  // Build in-degree and out-degree maps
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  for (const file of scanResult.files) {
    if (!(file.path in inDegree)) inDegree[file.path] = 0;
    if (!(file.path in outDegree)) outDegree[file.path] = 0;
    outDegree[file.path] += file.imports.length;
    for (const imp of file.imports) {
      if (imp.resolvedPath) {
        inDegree[imp.resolvedPath] = (inDegree[imp.resolvedPath] ?? 0) + 1;
      }
    }
  }

  // Community assignment from graph (fallback: 0 for all)
  const communities: Record<string, number> = graph.communities ?? {};

  // Build visualization nodes
  const nodes: AbsorbVisualizationNode[] = scanResult.files.map((f) => ({
    id: f.path,
    label: path.basename(f.path),
    community: communities[f.path] ?? 0,
    degree: (inDegree[f.path] ?? 0) + (outDegree[f.path] ?? 0),
    inDegree: inDegree[f.path] ?? 0,
    outDegree: outDegree[f.path] ?? 0,
    loc: f.loc,
  }));

  // Build visualization edges (from imports)
  const edges: AbsorbVisualizationEdge[] = [];
  for (const file of scanResult.files) {
    for (const imp of file.imports) {
      if (imp.resolvedPath) {
        edges.push({ source: file.path, target: imp.resolvedPath });
      }
    }
  }

  // Leaf-first order
  const leafFirstOrder = scanResult.files
    .map((f) => f.path)
    .sort((a, b) => (inDegree[a] ?? 0) - (inDegree[b] ?? 0));

  // Top hub files (highest in-degree)
  const hubFiles = scanResult.files
    .filter((f) => (inDegree[f.path] ?? 0) >= 3)
    .sort((a, b) => (inDegree[b.path] ?? 0) - (inDegree[a.path] ?? 0))
    .slice(0, 20)
    .map((f) => ({
      path: f.path,
      inDegree: inDegree[f.path] ?? 0,
      symbols: f.symbols.length,
    }));

  const communityIds = new Set(Object.values(communities));

  return {
    graphJson,
    visualization: {
      nodes,
      edges,
      communities,
      stats: {
        totalFiles: scanResult.stats.totalFiles,
        totalSymbols: scanResult.stats.totalSymbols,
        totalImports: scanResult.stats.totalImports,
        totalLoc: scanResult.stats.totalLoc,
        communityCount: communityIds.size || 1,
      },
    },
    inDegree,
    leafFirstOrder,
    hubFiles,
    stats: scanResult.stats,
    durationMs: Date.now() - start,
    absorbedAt: new Date().toISOString(),
    projectPath,
    depth,
    gitCommitHash,
    fileHashes,
    incremental: false,
  };
}

/**
 * Run an incremental absorb patch (only changed files).
 */
async function runIncrementalPatch(
  projectPath: string,
  depth: 'shallow' | 'medium' | 'deep',
  cached: AbsorbResult,
  addedFiles: string[],
  modifiedFiles: string[],
  deletedFiles: string[],
  start: number,
): Promise<AbsorbResult> {
  const coreCb = await import(/* webpackIgnore: true */ '@holoscript/core/codebase') as {
    CodebaseScanner: {
      new(): { scanFiles(rootDir: string, files: string[], opts?: any): Promise<AbsorbScanResult> };
    };
    CodebaseGraph: {
      new(): any;
      deserialize(json: string): any;
    };
    GitChangeDetector: {
      new(rootDir: string): {
        getHeadCommit(): string | null;
        computeFileHashes(paths: string[]): Array<{ filePath: string; hash: string }>;
      };
    };
  };

  const { CodebaseScanner, CodebaseGraph, GitChangeDetector } = coreCb;

  // Deserialize cached graph
  const graph = CodebaseGraph.deserialize(cached.graphJson);

  // Scan only changed files
  const scanner = new CodebaseScanner();
  const changedAbsPaths = [...addedFiles, ...modifiedFiles].map((f) => path.join(projectPath, f));
  const patchScanResult = await scanner.scanFiles(projectPath, changedAbsPaths, {});

  // Patch the graph
  const removedPaths = [...deletedFiles, ...modifiedFiles];
  graph.patchFiles(removedPaths, patchScanResult.files);

  // Update git metadata
  const detector = new GitChangeDetector(projectPath);
  const newCommit = detector.getHeadCommit();
  if (newCommit) {
    graph.gitCommitHash = newCommit;
    const allFiles = Array.from(graph.files.values());
    const allAbsPaths = allFiles.map((f: any) => path.join(projectPath, f.path));
    const hashes = detector.computeFileHashes(allAbsPaths);
    graph.fileHashes = Object.fromEntries(hashes.map((h: any) => [h.filePath, h.hash]));
  }

  const graphJson = graph.serialize();

  // Rebuild visualization from patched graph
  const allFiles = Array.from(graph.files.values()) as AbsorbFileResult[];

  // Build in-degree and out-degree maps
  const inDegree: Record<string, number> = {};
  const outDegree: Record<string, number> = {};
  for (const file of allFiles) {
    if (!(file.path in inDegree)) inDegree[file.path] = 0;
    if (!(file.path in outDegree)) outDegree[file.path] = 0;
    outDegree[file.path] += file.imports.length;
    for (const imp of file.imports) {
      if (imp.resolvedPath) {
        inDegree[imp.resolvedPath] = (inDegree[imp.resolvedPath] ?? 0) + 1;
      }
    }
  }

  // Community assignment
  const communities: Record<string, number> = graph.communities ?? {};

  // Build visualization nodes
  const nodes: AbsorbVisualizationNode[] = allFiles.map((f) => ({
    id: f.path,
    label: path.basename(f.path),
    community: communities[f.path] ?? 0,
    degree: (inDegree[f.path] ?? 0) + (outDegree[f.path] ?? 0),
    inDegree: inDegree[f.path] ?? 0,
    outDegree: outDegree[f.path] ?? 0,
    loc: f.loc,
  }));

  // Build visualization edges
  const edges: AbsorbVisualizationEdge[] = [];
  for (const file of allFiles) {
    for (const imp of file.imports) {
      if (imp.resolvedPath) {
        edges.push({ source: file.path, target: imp.resolvedPath });
      }
    }
  }

  // Leaf-first order
  const leafFirstOrder = allFiles.map((f) => f.path).sort((a, b) => (inDegree[a] ?? 0) - (inDegree[b] ?? 0));

  // Top hub files
  const hubFiles = allFiles
    .filter((f) => (inDegree[f.path] ?? 0) >= 3)
    .sort((a, b) => (inDegree[b.path] ?? 0) - (inDegree[a.path] ?? 0))
    .slice(0, 20)
    .map((f) => ({
      path: f.path,
      inDegree: inDegree[f.path] ?? 0,
      symbols: f.symbols.length,
    }));

  const communityIds = new Set(Object.values(communities));

  const stats = graph.getStats();

  return {
    graphJson,
    visualization: {
      nodes,
      edges,
      communities,
      stats: {
        totalFiles: stats.totalFiles,
        totalSymbols: stats.totalSymbols,
        totalImports: stats.totalImports,
        totalLoc: stats.totalLoc,
        communityCount: communityIds.size || 1,
      },
    },
    inDegree,
    leafFirstOrder,
    hubFiles,
    stats: {
      totalFiles: stats.totalFiles,
      totalSymbols: stats.totalSymbols,
      totalImports: stats.totalImports,
      totalLoc: stats.totalLoc,
      totalCalls: stats.totalCalls,
      durationMs: Date.now() - start,
      errors: [],
      filesByLanguage: stats.filesByLanguage,
      symbolsByType: stats.symbolsByType,
    },
    durationMs: Date.now() - start,
    absorbedAt: new Date().toISOString(),
    projectPath,
    depth,
    gitCommitHash: graph.gitCommitHash,
    fileHashes: graph.fileHashes,
    incremental: true,
    filesChanged: addedFiles.length + modifiedFiles.length + deletedFiles.length,
  };
}

/**
 * Main absorb orchestrator with 5-path incremental logic:
 * 1. force=true → full scan
 * 2. Load cache, check validity
 * 3. Git change detection
 * 4. Fast path (0 changes)
 * 5. Incremental patch
 */
async function runAbsorb(
  projectPath: string,
  depth: 'shallow' | 'medium' | 'deep',
  force: boolean,
): Promise<AbsorbResult> {
  const start = Date.now();
  const key = cacheKey(projectPath, depth);

  // PATH 1: force=true → FULL SCAN
  if (force) {
    const result = await runFullScan(projectPath, depth, start);
    writeCache(key, result);
    return result;
  }

  // PATH 2: Load cache checks
  const cached = readCache(key);
  if (!cached || !cached.gitCommitHash || !cached.fileHashes) {
    // No cache or v1 cache (no git metadata) → FULL SCAN
    const result = await runFullScan(projectPath, depth, start);
    writeCache(key, result);
    return result;
  }

  // PATH 3: Git change detection
  const coreCb = await import(/* webpackIgnore: true */ '@holoscript/core/codebase') as {
    GitChangeDetector: {
      new(rootDir: string): {
        isGitRepo(): boolean;
        detectChanges(storedCommit: string | null): {
          headCommit: string | null;
          added: string[];
          modified: string[];
          deleted: string[];
          storedCommitMissing: boolean;
          notGitRepo: boolean;
        };
        filterByContentHash(
          files: string[],
          storedHashes: Record<string, string>
        ): { trulyChanged: string[]; unchanged: string[] };
      };
    };
  };

  const { GitChangeDetector } = coreCb;
  const detector = new GitChangeDetector(projectPath);

  if (!detector.isGitRepo()) {
    // Not a git repo → FULL SCAN
    const result = await runFullScan(projectPath, depth, start);
    writeCache(key, result);
    return result;
  }

  const changes = detector.detectChanges(cached.gitCommitHash);

  if (changes.storedCommitMissing || changes.notGitRepo) {
    // Stored commit is gone (force push) or git error → FULL SCAN
    const result = await runFullScan(projectPath, depth, start);
    writeCache(key, result);
    return result;
  }

  // Content-hash verification to filter timestamp-only changes
  const gitChanged = [...changes.added, ...changes.modified];
  const { trulyChanged, unchanged } = detector.filterByContentHash(gitChanged, cached.fileHashes);

  const addedFiles = changes.added.filter((f) => trulyChanged.includes(f));
  const modifiedFiles = changes.modified.filter((f) => trulyChanged.includes(f));
  const deletedFiles = changes.deleted;

  const totalChanges = addedFiles.length + modifiedFiles.length + deletedFiles.length;

  // PATH 4: FAST PATH - Zero changes (sub-second)
  if (totalChanges === 0) {
    return { ...cached, durationMs: Date.now() - start, incremental: false, filesChanged: 0 };
  }

  // PATH 5: INCREMENTAL PATCH
  const result = await runIncrementalPatch(
    projectPath,
    depth,
    cached,
    addedFiles,
    modifiedFiles,
    deletedFiles,
    start,
  );

  writeCache(key, result);
  return result;
}

// ─── GET — cache status ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const projectPath = req.nextUrl.searchParams.get('projectPath') ?? process.cwd();
  const depth = (req.nextUrl.searchParams.get('depth') ?? 'shallow') as 'shallow' | 'medium' | 'deep';
  const key = cacheKey(projectPath, depth);
  const cached = readCache(key);

  return NextResponse.json({
    cached: cached !== null,
    projectPath,
    depth,
    absorbedAt: cached?.absorbedAt ?? null,
    totalFiles: cached?.visualization.stats.totalFiles ?? null,
    totalSymbols: cached?.visualization.stats.totalSymbols ?? null,
    cacheAgeMs: cached ? Date.now() - new Date(cached.absorbedAt).getTime() : null,
    hint: cached ? 'Cache fresh — POST with force=true to refresh' : 'No cache. POST to absorb.',
  });
}

// ─── POST — run absorb ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { projectPath?: string; depth?: string; force?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectPath = body.projectPath ?? process.cwd();
  const depth = (['shallow', 'medium', 'deep'].includes(body.depth ?? '')
    ? body.depth
    : 'shallow') as 'shallow' | 'medium' | 'deep';
  const force = body.force === true;

  // Basic path validation — must be absolute and must exist
  if (!path.isAbsolute(projectPath)) {
    return NextResponse.json({ error: 'projectPath must be an absolute path' }, { status: 400 });
  }

  try {
    const fs2 = await import('fs');
    if (!fs2.existsSync(projectPath)) {
      return NextResponse.json({ error: `projectPath does not exist: ${projectPath}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Could not validate projectPath' }, { status: 400 });
  }

  try {
    const result = await runAbsorb(projectPath, depth, force);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: message,
        hint: '@holoscript/core/codebase may not be built. Run: pnpm build --filter @holoscript/core',
      },
      { status: 500 },
    );
  }
}
