/**
 * Codebase Knowledge Graph
 *
 * Unified graph wrapping symbols, imports, and call edges extracted by
 * CodebaseScanner. Provides query methods for callers/callees, impact
 * analysis, and community detection.
 *
 * @version 1.0.0
 */

import type {
  ScanResult,
  ScannedFile,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
  SupportedLanguage,
} from './types';
import { CommunityDetector } from './CommunityDetector';

// =============================================================================
// TYPES
// =============================================================================

export interface CodebaseGraphStats {
  totalFiles: number;
  totalSymbols: number;
  totalImports: number;
  totalCalls: number;
  totalLoc: number;
  filesByLanguage: Record<string, number>;
  symbolsByType: Record<string, number>;
  communities: number;
}

export interface SymbolQuery {
  name?: string;
  type?: string;
  file?: string;
  language?: SupportedLanguage;
  visibility?: 'public' | 'private' | 'protected' | 'internal';
}

export interface CallChain {
  path: string[];
  depth: number;
  /** Optional aggregate path cost for weighted/tropical tracing. */
  cost?: number;
}

export interface CallChainOptions {
  /**
   * Path strategy:
   * - bfs: unweighted shortest-hop path (default)
   * - tropical-min-plus: weighted shortest path (min-plus semiring)
   */
  algorithm?: 'bfs' | 'tropical-min-plus';
  /** Edge weight callback used by tropical-min-plus. Defaults to 1. */
  edgeWeight?: (edge: CallEdge, fromNode: string, toNode: string) => number;
}

interface SerializedGraph {
  version: number;
  rootDir: string;
  files: ScannedFile[];
  communities: Record<string, string[]>;
  // v2 fields (incremental absorb)
  gitCommitHash?: string;
  fileHashes?: Record<string, string>;
  nodePositions?: Record<string, [number, number, number]>;
}

function callEdgeDedupeKey(e: CallEdge): string {
  return `${e.callerId}|${e.calleeOwner ?? ''}|${e.calleeName}|${e.filePath}|${e.line}|${e.column}`;
}

/** Stable dedupe when merging qualified + unqualified caller indexes. */
function dedupeCallEdges(edges: CallEdge[]): CallEdge[] {
  const seen = new Set<string>();
  const out: CallEdge[] = [];
  for (const e of edges) {
    const k = callEdgeDedupeKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

// =============================================================================
// CODEBASE GRAPH
// =============================================================================

export class CodebaseGraph {
  private rootDir = '';
  private files: Map<string, ScannedFile> = new Map();

  // Symbol storage: "type:name:filePath:line" -> definition
  private symbols: Map<string, ExternalSymbolDefinition> = new Map();

  // All edges
  private imports: ImportEdge[] = [];
  private calls: CallEdge[] = [];

  // Indexes
  private symbolsByFile: Map<string, string[]> = new Map();
  private symbolsByName: Map<string, string[]> = new Map();
  private importsByFile: Map<string, ImportEdge[]> = new Map();
  private importedByFile: Map<string, Set<string>> = new Map();
  private callerIndex: Map<string, CallEdge[]> = new Map(); // calleeName -> edges
  private calleeIndex: Map<string, CallEdge[]> = new Map(); // callerId -> edges

  /** 3D Node positions for spatial persistence (makeObjectId(sym) -> [x,y,z]) */
  public nodePositions: Map<string, [number, number, number]> = new Map();

  // Communities (lazily computed)
  private _communities: Map<string, string[]> | null = null;

  /**
   * Build the graph from a CodebaseScanner result.
   */
  buildFromScanResult(result: ScanResult): void {
    this.clear();
    this.rootDir = result.rootDir;

    for (const file of result.files) {
      this.addFile(file);
    }

    this.buildIndexes();
  }

  /**
   * Add a scanned file to the graph.
   */
  addFile(file: ScannedFile): void {
    this.files.set(file.path, file);
    this._communities = null; // invalidate cache

    // Register symbols
    for (const sym of file.symbols) {
      const id = this.makeSymbolId(sym);
      this.symbols.set(id, sym);
    }

    // Collect edges
    this.imports.push(...file.imports);
    this.calls.push(...file.calls);
  }

  /**
   * Rebuild all indexes after adding files.
   */
  buildIndexes(): void {
    this.symbolsByFile.clear();
    this.symbolsByName.clear();
    this.importsByFile.clear();
    this.importedByFile.clear();
    this.callerIndex.clear();
    this.calleeIndex.clear();

    // Index symbols
    for (const [id, sym] of this.symbols) {
      const filePath = sym.filePath;
      if (!this.symbolsByFile.has(filePath)) {
        this.symbolsByFile.set(filePath, []);
      }
      this.symbolsByFile.get(filePath)!.push(id);

      const name = sym.name;
      if (!this.symbolsByName.has(name)) {
        this.symbolsByName.set(name, []);
      }
      this.symbolsByName.get(name)!.push(id);
    }

    // Index imports
    for (const imp of this.imports) {
      if (!this.importsByFile.has(imp.fromFile)) {
        this.importsByFile.set(imp.fromFile, []);
      }
      this.importsByFile.get(imp.fromFile)!.push(imp);

      // Reverse index: which files import a given module
      const target = imp.resolvedPath ?? imp.toModule;
      if (!this.importedByFile.has(target)) {
        this.importedByFile.set(target, new Set());
      }
      this.importedByFile.get(target)!.add(imp.fromFile);
    }

    // Index calls
    for (const call of this.calls) {
      // Callee index: "who does X call?"
      if (!this.calleeIndex.has(call.callerId)) {
        this.calleeIndex.set(call.callerId, []);
      }
      this.calleeIndex.get(call.callerId)!.push(call);

      // Caller index: "who calls X?"
      const key = call.calleeOwner ? `${call.calleeOwner}.${call.calleeName}` : call.calleeName;
      if (!this.callerIndex.has(key)) {
        this.callerIndex.set(key, []);
      }
      this.callerIndex.get(key)!.push(call);
    }
  }

  // ── Query Methods ────────────────────────────────────────────────────────

  /**
   * Get a symbol by its ID.
   */
  getSymbol(id: string): ExternalSymbolDefinition | undefined {
    return this.symbols.get(id);
  }

  /**
   * Get all symbols in a file.
   */
  getSymbolsInFile(filePath: string): ExternalSymbolDefinition[] {
    const ids = this.symbolsByFile.get(filePath) ?? [];
    return ids.map((id) => this.symbols.get(id)!).filter(Boolean);
  }

  /**
   * Find symbols by name (may return multiple across files).
   */
  findSymbolsByName(name: string): ExternalSymbolDefinition[] {
    const ids = this.symbolsByName.get(name) ?? [];
    return ids.map((id) => this.symbols.get(id)!).filter(Boolean);
  }

  /**
   * Query symbols with filters.
   */
  querySymbols(query: SymbolQuery): ExternalSymbolDefinition[] {
    const results: ExternalSymbolDefinition[] = [];
    for (const sym of this.symbols.values()) {
      if (query.name && sym.name !== query.name) continue;
      if (query.type && sym.type !== query.type) continue;
      if (query.file && sym.filePath !== query.file) continue;
      if (query.language && sym.language !== query.language) continue;
      if (query.visibility && sym.visibility !== query.visibility) continue;
      results.push(sym);
    }
    return results;
  }

  /**
   * Get all call edges where `symbolName` is the callee.
   * "Who calls this function/method?"
   */
  getCallersOf(symbolName: string, owner?: string): CallEdge[] {
    const key = owner ? `${owner}.${symbolName}` : symbolName;
    const qualified = this.callerIndex.get(key) ?? [];
    if (!owner) {
      // Without owner, key === symbolName — avoid duplicate lookup (same array twice).
      return dedupeCallEdges(qualified);
    }
    const unqualified = this.callerIndex.get(symbolName) ?? [];
    return dedupeCallEdges([...qualified, ...unqualified]);
  }

  /**
   * Get all call edges where `callerId` is the caller.
   * "What does this function/method call?"
   */
  getCalleesOf(callerId: string): CallEdge[] {
    return this.calleeIndex.get(callerId) ?? [];
  }

  /**
   * Get all import edges from a file.
   */
  getImportsOf(filePath: string): ImportEdge[] {
    return this.importsByFile.get(filePath) ?? [];
  }

  /**
   * Get all files that import a given file/module.
   */
  getImportedBy(filePath: string): string[] {
    return Array.from(this.importedByFile.get(filePath) ?? []);
  }

  /**
   * Get a scanned file by path.
   */
  getFile(filePath: string): ScannedFile | undefined {
    return this.files.get(filePath);
  }

  /**
   * Get all file paths in the graph.
   */
  getFilePaths(): string[] {
    return Array.from(this.files.keys());
  }

  // ── Impact Analysis ──────────────────────────────────────────────────────

  /**
   * Given a set of changed files, compute the transitive set of files
   * affected through import and call chains (BFS propagation).
   */
  getImpactSet(changedFiles: string[]): Set<string> {
    const affected = new Set<string>(changedFiles);
    const queue = [...changedFiles];

    while (queue.length > 0) {
      const file = queue.shift()!;

      // Files that import this file
      const importers = this.importedByFile.get(file);
      if (importers) {
        for (const importer of importers) {
          if (!affected.has(importer)) {
            affected.add(importer);
            queue.push(importer);
          }
        }
      }
    }

    return affected;
  }

  /**
   * Group the impact set by architectural communities.
   * Returns a map of community label -> list of affected files.
   */
  getCommunityAwareImpact(changedFiles: string[]): Map<string, string[]> {
    const affected = this.getImpactSet(changedFiles);
    const communities = this.detectCommunities();

    const communityImpact: Map<string, string[]> = new Map();

    for (const file of affected) {
      let foundComm = 'unknown';
      for (const [comm, fileList] of communities) {
        if (fileList.includes(file)) {
          foundComm = comm;
          break;
        }
      }

      if (!communityImpact.has(foundComm)) {
        communityImpact.set(foundComm, []);
      }
      communityImpact.get(foundComm)!.push(file);
    }

    return communityImpact;
  }

  /**
   * Compute the blast radius of changing a specific symbol:
   * returns all files containing callers of that symbol, transitively.
   */
  getSymbolImpact(symbolName: string, owner?: string): Set<string> {
    const affectedFiles = new Set<string>();
    const visited = new Set<string>();
    const queue: string[] = [];

    // Seed: direct callers
    const callers = this.getCallersOf(symbolName, owner);
    for (const call of callers) {
      if (!visited.has(call.filePath)) {
        visited.add(call.filePath);
        affectedFiles.add(call.filePath);
        queue.push(call.filePath);
      }
    }

    // BFS through import chain
    while (queue.length > 0) {
      const file = queue.shift()!;
      const importers = this.importedByFile.get(file);
      if (importers) {
        for (const importer of importers) {
          if (!visited.has(importer)) {
            visited.add(importer);
            affectedFiles.add(importer);
            queue.push(importer);
          }
        }
      }
    }

    return affectedFiles;
  }

  /**
   * Detect "drift" between the graph state and the filesystem.
   * Compares stored content hashes with current filesystem hashes.
   * Returns a list of files that are out of sync.
   */
  detectDrift(fileHashesOnDisk: Record<string, string>): string[] {
    if (!this.fileHashes) return [];

    const drifted: string[] = [];
    for (const [filePath, currentHash] of Object.entries(fileHashesOnDisk)) {
      if (this.fileHashes[filePath] && this.fileHashes[filePath] !== currentHash) {
        drifted.push(filePath);
      }
    }

    return drifted;
  }

  /**
   * Trace a call chain from a symbol to a target (BFS shortest path).
   * Returns the path of symbol names, or null if no path exists.
   */
  traceCallChain(
    fromSymbol: string,
    toSymbol: string,
    maxDepth = 10,
    options?: CallChainOptions
  ): CallChain | null {
    const algorithm = options?.algorithm ?? 'bfs';
    if (algorithm === 'tropical-min-plus') {
      return this.traceCallChainTropical(fromSymbol, toSymbol, maxDepth, options);
    }

    const queue: Array<{ node: string; path: string[] }> = [
      { node: fromSymbol, path: [fromSymbol] },
    ];
    const visited = new Set<string>([fromSymbol]);

    while (queue.length > 0) {
      const { node, path } = queue.shift()!;
      if (path.length > maxDepth) continue;

      const callees = this.calleeIndex.get(node) ?? [];
      for (const call of callees) {
        const callee = call.calleeOwner
          ? `${call.calleeOwner}.${call.calleeName}`
          : call.calleeName;

        if (callee === toSymbol) {
          return { path: [...path, callee], depth: path.length };
        }

        if (!visited.has(callee)) {
          visited.add(callee);
          queue.push({ node: callee, path: [...path, callee] });
        }
      }
    }

    return null;
  }

  private traceCallChainTropical(
    fromSymbol: string,
    toSymbol: string,
    maxDepth = 10,
    options?: CallChainOptions
  ): CallChain | null {
    const dist = new Map<string, number>([[fromSymbol, 0]]);
    const hops = new Map<string, number>([[fromSymbol, 0]]);
    const prev = new Map<string, string | null>([[fromSymbol, null]]);
    const queue: Array<{ node: string; cost: number; hop: number }> = [
      { node: fromSymbol, cost: 0, hop: 0 },
    ];

    const edgeWeight = options?.edgeWeight;

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost || a.hop - b.hop);
      const current = queue.shift()!;

      if (current.node === toSymbol) break;
      if (current.hop >= maxDepth) continue;

      const knownCost = dist.get(current.node);
      const knownHop = hops.get(current.node);
      if (
        knownCost === undefined ||
        knownHop === undefined ||
        current.cost > knownCost ||
        (current.cost === knownCost && current.hop > knownHop)
      ) {
        continue;
      }

      const callees = this.calleeIndex.get(current.node) ?? [];
      for (const call of callees) {
        const callee = call.calleeOwner
          ? `${call.calleeOwner}.${call.calleeName}`
          : call.calleeName;

        const rawWeight = edgeWeight ? edgeWeight(call, current.node, callee) : 1;
        const weight = Number.isFinite(rawWeight) && rawWeight >= 0 ? rawWeight : 1;

        const nextHop = current.hop + 1;
        if (nextHop > maxDepth) continue;

        const nextCost = current.cost + weight;
        const prevCost = dist.get(callee);
        const prevHop = hops.get(callee) ?? Number.POSITIVE_INFINITY;

        if (
          prevCost === undefined ||
          nextCost < prevCost ||
          (nextCost === prevCost && nextHop < prevHop)
        ) {
          dist.set(callee, nextCost);
          hops.set(callee, nextHop);
          prev.set(callee, current.node);
          queue.push({ node: callee, cost: nextCost, hop: nextHop });
        }
      }
    }

    const finalCost = dist.get(toSymbol);
    if (finalCost === undefined) {
      return null;
    }

    const path: string[] = [];
    let cursor: string | null = toSymbol;
    while (cursor) {
      path.push(cursor);
      cursor = prev.get(cursor) ?? null;
    }
    path.reverse();

    if (path.length === 0 || path[0] !== fromSymbol) {
      return null;
    }

    return {
      path,
      depth: Math.max(0, path.length - 1),
      cost: finalCost,
    };
  }

  // ── Incremental Patching ─────────────────────────────────────────────────

  /**
   * Remove a file and all its associated symbols, imports, and calls.
   * Call `buildIndexes()` after all add/remove operations are complete.
   * Returns true if the file existed and was removed.
   */
  removeFile(filePath: string): boolean {
    const file = this.files.get(filePath);
    if (!file) return false;

    this.files.delete(filePath);

    // Remove symbols belonging to this file
    for (const sym of file.symbols) {
      const id = this.makeSymbolId(sym);
      this.symbols.delete(id);
    }

    // Filter out imports and calls originating from this file
    this.imports = this.imports.filter((imp) => imp.fromFile !== filePath);
    this.calls = this.calls.filter((call) => call.filePath !== filePath);

    this._communities = null;
    return true;
  }

  /**
   * Patch the graph by removing stale files and adding fresh ones.
   * Rebuilds indexes once after all mutations.
   */
  patchFiles(removed: string[], added: ScannedFile[]): void {
    for (const filePath of removed) {
      this.removeFile(filePath);
    }
    for (const file of added) {
      this.addFile(file);
    }
    this.buildIndexes();
  }

  // ── Community Detection ──────────────────────────────────────────────────

  /**
   * Detect module communities using Louvain on the import/call graph.
   * Falls back to directory-based grouping for sparse graphs.
   */
  detectCommunities(): Map<string, string[]> {
    if (this._communities) return this._communities;

    const detector = new CommunityDetector();
    this._communities = detector.detect(Array.from(this.files.keys()), this.imports, this.calls);

    return this._communities;
  }

  // ── Serialization (v2 — incremental absorb) ─────────────────────────────

  /** Git commit hash at time of last scan (set externally for v2 caching) */
  gitCommitHash?: string;

  /** Per-file content hashes for incremental invalidation */
  fileHashes?: Record<string, string>;

  /**
   * Serialize the graph to JSON for persistence (v2 format).
   */
  serialize(): string {
    const data: SerializedGraph = {
      version: 2,
      rootDir: this.rootDir,
      files: Array.from(this.files.values()),
      communities: this._communities ? Object.fromEntries(this._communities) : {},
      gitCommitHash: this.gitCommitHash,
      fileHashes: this.fileHashes,
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize a graph from JSON. Accepts both v1 and v2 formats.
   */
  static deserialize(json: string): CodebaseGraph {
    const data: Partial<SerializedGraph> = JSON.parse(json);
    const graph = new CodebaseGraph();
    graph.rootDir = data.rootDir ?? '';

    for (const file of data.files ?? []) {
      graph.addFile(file);
    }
    graph.buildIndexes();

    if (data.communities && Object.keys(data.communities).length > 0) {
      graph._communities = new Map(Object.entries(data.communities));
    }

    // v2 fields
    graph.gitCommitHash = data.gitCommitHash;
    graph.fileHashes = data.fileHashes;
    if (data.nodePositions) {
      graph.nodePositions = new Map(Object.entries(data.nodePositions));
    }

    return graph;
  }

  // ── Bulk Access ────────────────────────────────────────────────────────

  /**
   * Get all symbols in the graph as a flat array.
   */
  getAllSymbols(): ExternalSymbolDefinition[] {
    return Array.from(this.symbols.values());
  }

  /**
   * Reverse lookup: which community does a file belong to?
   * Returns community name or undefined if not found.
   */
  getCommunityForFile(filePath: string): string | undefined {
    const communities = this.detectCommunities();
    for (const [community, files] of communities) {
      if (files.includes(filePath)) return community;
    }
    return undefined;
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  /**
   * Get graph statistics.
   */
  getStats(): CodebaseGraphStats {
    const filesByLanguage: Record<string, number> = {};
    const symbolsByType: Record<string, number> = {};
    let totalLoc = 0;

    for (const file of this.files.values()) {
      filesByLanguage[file.language] = (filesByLanguage[file.language] ?? 0) + 1;
      totalLoc += file.loc;
    }

    for (const sym of this.symbols.values()) {
      symbolsByType[sym.type] = (symbolsByType[sym.type] ?? 0) + 1;
    }

    return {
      totalFiles: this.files.size,
      totalSymbols: this.symbols.size,
      totalImports: this.imports.length,
      totalCalls: this.calls.length,
      totalLoc,
      filesByLanguage,
      symbolsByType,
      communities: this._communities?.size ?? 0,
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private makeSymbolId(sym: ExternalSymbolDefinition): string {
    const owner = sym.owner ? `${sym.owner}.` : '';
    return `${sym.type}:${owner}${sym.name}:${sym.filePath}:${sym.line}`;
  }

  private clear(): void {
    this.files.clear();
    this.symbols.clear();
    this.imports = [];
    this.calls = [];
    this.symbolsByFile.clear();
    this.symbolsByName.clear();
    this.importsByFile.clear();
    this.importedByFile.clear();
    this.callerIndex.clear();
    this.calleeIndex.clear();
    this._communities = null;
  }
}
