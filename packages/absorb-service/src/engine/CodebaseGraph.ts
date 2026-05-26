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
  EmitSite,
  ListenSite,
  EventEdge,
  ProvenanceEdge,
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
  /** Number of resolved EventEdges (HoloGraph Phase 1) */
  totalEventEdges: number;
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

export type StaleGraphEdgeKind = 'call' | 'event' | 'import';

export type StaleGraphEdgeReason = 'target_file_missing' | 'target_symbol_missing';

export interface StaleGraphEdge {
  kind: StaleGraphEdgeKind;
  reason: StaleGraphEdgeReason;
  sourceFile: string;
  sourceSymbol?: string;
  targetFile?: string;
  targetModule?: string;
  targetSymbol?: string;
  line: number;
  staleTargetFiles: string[];
  liveTargetFiles: string[];
}

export interface CodebaseDriftReport {
  driftedFiles: string[];
  modifiedFiles: string[];
  deletedFiles: string[];
  staleEdges: StaleGraphEdge[];
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

  // HoloGraph: event sites collected during addFile(), resolved in buildEventEdges()
  private allEmitSites: EmitSite[] = [];
  private allListenSites: ListenSite[] = [];
  /** Resolved EventEdges: built by buildEventEdges() after all files are loaded */
  private eventEdges: EventEdge[] = [];

  // Indexes
  private symbolsByFile: Map<string, string[]> = new Map();
  private symbolsByName: Map<string, string[]> = new Map();
  private importsByFile: Map<string, ImportEdge[]> = new Map();
  private importedByFile: Map<string, Set<string>> = new Map();
  private callerIndex: Map<string, CallEdge[]> = new Map(); // calleeName -> edges
  private calleeIndex: Map<string, CallEdge[]> = new Map(); // callerId -> edges
  /** eventName → edges where that event is emitted (HoloGraph) */
  private eventEmitIndex: Map<string, EventEdge[]> = new Map();
  /** eventName → edges where that event is listened to (HoloGraph) */
  private eventListenIndex: Map<string, EventEdge[]> = new Map();

  /** HoloGraph Phase 2: SimulationContract receipt edges keyed by filePath */
  private provenanceByFile: Map<string, ProvenanceEdge[]> = new Map();
  /** All provenance edges registered */
  private allProvenanceEdges: ProvenanceEdge[] = [];

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

    // HoloGraph: collect event sites for later cross-file resolution
    if (file.emitSites)  this.allEmitSites.push(...file.emitSites);
    if (file.listenSites) this.allListenSites.push(...file.listenSites);
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

    // HoloGraph: resolve emit/listen sites into cross-file EventEdges
    this.buildEventEdges();
  }

  /**
   * Resolve all EmitSites and ListenSites into EventEdges by matching eventName.
   *
   * Cross-file resolution: for every emit site of eventName X, find all listen
   * sites of X in any file and create an EventEdge. This is O(E·L) where E =
   * distinct event names and L = avg listeners — typically small.
   */
  private buildEventEdges(): void {
    this.eventEdges = [];
    this.eventEmitIndex.clear();
    this.eventListenIndex.clear();

    // Group listen sites by eventName for O(1) lookup
    const listenByEvent = new Map<string, ListenSite[]>();
    for (const ls of this.allListenSites) {
      if (!listenByEvent.has(ls.eventName)) listenByEvent.set(ls.eventName, []);
      listenByEvent.get(ls.eventName)!.push(ls);
    }

    for (const es of this.allEmitSites) {
      const listeners = listenByEvent.get(es.eventName) ?? [];
      for (const ls of listeners) {
        const edge: EventEdge = {
          eventName:      es.eventName,
          emitterFile:    es.filePath,
          emitterSymbol:  es.callerId,
          emitLine:       es.line,
          listenerFile:   ls.filePath,
          listenerSymbol: ls.callerId,
          listenLine:     ls.line,
        };
        this.eventEdges.push(edge);

        // Index by emitter side
        if (!this.eventEmitIndex.has(es.eventName)) this.eventEmitIndex.set(es.eventName, []);
        this.eventEmitIndex.get(es.eventName)!.push(edge);

        // Index by listener side
        if (!this.eventListenIndex.has(ls.eventName)) this.eventListenIndex.set(ls.eventName, []);
        this.eventListenIndex.get(ls.eventName)!.push(edge);
      }

      // Even if no listeners yet, index the emit side for allEventNames()
      if (listeners.length === 0 && !this.eventEmitIndex.has(es.eventName)) {
        this.eventEmitIndex.set(es.eventName, []);
      }
    }

    // Index listen-only events (no emitter found in scanned scope)
    for (const [name, sites] of listenByEvent) {
      if (!this.eventListenIndex.has(name)) {
        this.eventListenIndex.set(name, []);
      }
      // Edges already added above; this ensures allEventNames() includes listen-only
      if (!this.eventEmitIndex.has(name)) {
        this.eventEmitIndex.set(name, []);
      }
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
   * Discovery-friendly symbol search. Exact match wins (precision), but when no
   * symbol is named exactly `name`, fall back to a ranked case-insensitive search
   * (exact-ci > prefix > substring) so partial/discovery queries like "compile"
   * return `compileToUnity`, `compileScene`, etc. instead of an empty result.
   *
   * Returns `{ matchMode, results }` so callers know whether the hit was exact or fuzzy.
   * Capped at `limit` (default 50) to avoid token blowups on common substrings.
   */
  searchSymbolsByName(
    name: string,
    opts?: { limit?: number }
  ): { matchMode: 'exact' | 'fuzzy' | 'none'; truncated: boolean; results: ExternalSymbolDefinition[] } {
    const limit = Math.max(1, opts?.limit ?? 50);

    // 1. Exact match — preserve precise behavior when the symbol name is known.
    const exact = this.findSymbolsByName(name);
    if (exact.length > 0) {
      return { matchMode: 'exact', truncated: exact.length > limit, results: exact.slice(0, limit) };
    }

    // 2. Ranked case-insensitive fallback: exact-ci(0) > prefix(1) > substring(2).
    const needle = name.toLowerCase();
    if (needle.length === 0) return { matchMode: 'none', truncated: false, results: [] };

    const scored: Array<{ sym: ExternalSymbolDefinition; rank: number }> = [];
    const seen = new Set<string>();
    for (const [symName, ids] of this.symbolsByName.entries()) {
      const lower = symName.toLowerCase();
      let rank = -1;
      if (lower === needle) rank = 0;
      else if (lower.startsWith(needle)) rank = 1;
      else if (lower.includes(needle)) rank = 2;
      if (rank < 0) continue;
      for (const id of ids) {
        if (seen.has(id)) continue;
        const sym = this.symbols.get(id);
        if (sym) {
          scored.push({ sym, rank });
          seen.add(id);
        }
      }
    }

    if (scored.length === 0) return { matchMode: 'none', truncated: false, results: [] };

    // Rank, then prefer shorter names (closer to the query) and public symbols.
    scored.sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      const aPub = a.sym.visibility === 'public' ? 0 : 1;
      const bPub = b.sym.visibility === 'public' ? 0 : 1;
      if (aPub !== bPub) return aPub - bPub;
      return a.sym.name.length - b.sym.name.length;
    });

    return {
      matchMode: 'fuzzy',
      truncated: scored.length > limit,
      results: scored.slice(0, limit).map((s) => s.sym),
    };
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

  private getCallTargetCandidates(call: CallEdge): ExternalSymbolDefinition[] {
    const candidates = this.findSymbolsByName(call.calleeName);
    if (!call.calleeOwner) return candidates;

    return candidates.filter((sym) => sym.owner === call.calleeOwner);
  }

  private detectStaleEdges(liveFilePaths: Set<string>): StaleGraphEdge[] {
    const staleEdges: StaleGraphEdge[] = [];

    for (const call of this.calls) {
      if (!liveFilePaths.has(call.filePath)) continue;

      const candidates = this.getCallTargetCandidates(call);
      if (candidates.length === 0) {
        // The edge never resolved inside this graph; it may target a platform API
        // or dependency outside the absorbed scope.
        continue;
      }

      const targetFiles = Array.from(new Set(candidates.map((sym) => sym.filePath))).sort();
      const liveTargetFiles = targetFiles.filter((filePath) => liveFilePaths.has(filePath));
      const staleTargetFiles = targetFiles.filter((filePath) => !liveFilePaths.has(filePath));

      if (liveTargetFiles.length > 0 || staleTargetFiles.length === 0) continue;

      staleEdges.push({
        kind: 'call',
        reason: 'target_symbol_missing',
        sourceFile: call.filePath,
        sourceSymbol: call.callerId,
        targetSymbol: call.calleeOwner
          ? `${call.calleeOwner}.${call.calleeName}`
          : call.calleeName,
        line: call.line,
        staleTargetFiles,
        liveTargetFiles,
      });
    }

    for (const edge of this.eventEdges) {
      if (!liveFilePaths.has(edge.emitterFile) || liveFilePaths.has(edge.listenerFile)) continue;

      staleEdges.push({
        kind: 'event',
        reason: 'target_symbol_missing',
        sourceFile: edge.emitterFile,
        sourceSymbol: edge.emitterSymbol,
        targetFile: edge.listenerFile,
        targetSymbol: edge.listenerSymbol,
        line: edge.emitLine,
        staleTargetFiles: [edge.listenerFile],
        liveTargetFiles: [],
      });
    }

    for (const imp of this.imports) {
      if (!imp.resolvedPath || !liveFilePaths.has(imp.fromFile)) continue;
      if (!this.files.has(imp.resolvedPath) || liveFilePaths.has(imp.resolvedPath)) continue;

      staleEdges.push({
        kind: 'import',
        reason: 'target_file_missing',
        sourceFile: imp.fromFile,
        targetFile: imp.resolvedPath,
        targetModule: imp.toModule,
        line: imp.line,
        staleTargetFiles: [imp.resolvedPath],
        liveTargetFiles: [],
      });
    }

    return staleEdges;
  }

  /**
   * Detect graph drift and stale graph edges against a live filesystem hash map.
   *
   * `fileHashesOnDisk` intentionally omits unreadable/deleted files. That makes
   * absence meaningful: a file that exists in the cached graph but not in this
   * map is stale, and any live caller/import/event edge whose target only lived
   * in that missing file is reported as a stale edge.
   */
  detectDriftReport(fileHashesOnDisk: Record<string, string>): CodebaseDriftReport {
    const liveFilePaths = new Set(Object.keys(fileHashesOnDisk));
    const modifiedFiles = new Set<string>();
    const deletedFiles = new Set<string>();

    for (const filePath of this.files.keys()) {
      if (!liveFilePaths.has(filePath)) deletedFiles.add(filePath);
    }

    if (this.fileHashes) {
      for (const [filePath, storedHash] of Object.entries(this.fileHashes)) {
        const currentHash = fileHashesOnDisk[filePath];
        if (currentHash === undefined) {
          deletedFiles.add(filePath);
        } else if (storedHash !== currentHash) {
          modifiedFiles.add(filePath);
        }
      }
    }

    const modified = Array.from(modifiedFiles).sort();
    const deleted = Array.from(deletedFiles).sort();

    return {
      driftedFiles: Array.from(new Set([...modified, ...deleted])).sort(),
      modifiedFiles: modified,
      deletedFiles: deleted,
      staleEdges: this.detectStaleEdges(liveFilePaths),
    };
  }

  /**
   * Detect "drift" between the graph state and the filesystem.
   * Compares stored content hashes with current filesystem hashes.
   * Returns a list of files that are out of sync.
   */
  detectDrift(fileHashesOnDisk: Record<string, string>): string[] {
    return this.detectDriftReport(fileHashesOnDisk).driftedFiles;
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
      // Persist brain-coordinate node positions (HoloGraph Phase 2)
      nodePositions: this.nodePositions.size > 0
        ? Object.fromEntries(this.nodePositions)
        : undefined,
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

  // ── HoloGraph: Event-Chain Queries ──────────────────────────────────────

  /**
   * Get all EventEdges where the given event name is emitted.
   * O(1) lookup — no embedding search required.
   *
   * Example: getEventEmitters('pillar:slice') → all emit sites for that event.
   */
  getEventEmitters(eventName: string): EventEdge[] {
    return this.eventEmitIndex.get(eventName) ?? [];
  }

  /**
   * Get all EventEdges where the given event name is listened to.
   * O(1) lookup.
   */
  getEventListeners(eventName: string): EventEdge[] {
    return this.eventListenIndex.get(eventName) ?? [];
  }

  /**
   * Get the full producer→consumer chain for an event name:
   * all emit sites and all listener registrations, plus resolved edges.
   */
  getEventChain(eventName: string): {
    eventName: string;
    emitters: EmitSite[];
    listeners: ListenSite[];
    edges: EventEdge[];
  } {
    return {
      eventName,
      emitters: this.allEmitSites.filter(s => s.eventName === eventName),
      listeners: this.allListenSites.filter(s => s.eventName === eventName),
      edges: this.eventEdges.filter(e => e.eventName === eventName),
    };
  }

  /**
   * All distinct event names found across the codebase (emit or listen side).
   * Useful for: "what events does this codebase use?" queries.
   */
  allEventNames(): string[] {
    const names = new Set<string>([
      ...this.eventEmitIndex.keys(),
      ...this.eventListenIndex.keys(),
    ]);
    return Array.from(names).sort();
  }

  /**
   * All event namespaces (prefix before ':') — e.g. 'pillar', 'cortical', 'snn'.
   */
  allEventNamespaces(): string[] {
    const ns = new Set<string>();
    for (const name of this.allEventNames()) {
      const colon = name.indexOf(':');
      if (colon > 0) ns.add(name.slice(0, colon));
    }
    return Array.from(ns).sort();
  }

  /**
   * Raw EmitSites collected across all files (pre-resolution).
   */
  getAllEmitSites(): EmitSite[] {
    return this.allEmitSites;
  }

  /**
   * Raw ListenSites collected across all files (pre-resolution).
   */
  getAllListenSites(): ListenSite[] {
    return this.allListenSites;
  }

  /**
   * All resolved EventEdges in the graph.
   */
  getAllEventEdges(): EventEdge[] {
    return this.eventEdges;
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

  // ── HoloGraph Phase 2: Incremental update ────────────────────────────────

  /**
   * Remove a file and all its symbols, imports, calls, and event sites from the
   * graph. Callers must call buildIndexes() afterward to refresh all indexes.
   *
   * This enables incremental absorb: on a git commit that touches N files,
   * call removeFile() + addFile() for each changed file, then buildIndexes()
   * once — instead of a full re-scan of the entire codebase.
   *
   * O(S + E) where S = symbols in file, E = total edges (filtered by filePath).
   */
  removeFile(filePath: string): boolean {
    const file = this.files.get(filePath);
    if (!file) return false;

    // Remove symbols using the file's own symbol list (safe even before buildIndexes)
    for (const sym of file.symbols) {
      const id = this.makeSymbolId(sym);
      this.symbols.delete(id);
      this.nodePositions.delete(id);
    }

    // Remove all edges that touch this file
    this.imports        = this.imports.filter(e => e.fromFile !== filePath);
    this.calls          = this.calls.filter(e => e.filePath !== filePath);
    this.allEmitSites   = this.allEmitSites.filter(e => e.filePath !== filePath);
    this.allListenSites = this.allListenSites.filter(e => e.filePath !== filePath);

    this.files.delete(filePath);
    this._communities = null; // invalidate
    return true;
  }

  /**
   * Replace a file in the graph with an updated version.
   * Equivalent to removeFile() + addFile(), without a full index rebuild.
   * Callers must call buildIndexes() afterward.
   */
  updateFile(newFile: ScannedFile): void {
    this.removeFile(newFile.path);
    this.addFile(newFile);
  }

  /**
   * Apply a batch of changes (added / modified / removed files) in one pass.
   * Rebuilds indexes exactly once at the end — efficient for post-commit hooks.
   *
   * @param added    New ScannedFile objects for newly created files.
   * @param modified Updated ScannedFile objects for modified files.
   * @param removed  File paths that were deleted.
   */
  patchFromChanges(
    added: ScannedFile[],
    modified: ScannedFile[],
    removed: string[],
  ): void {
    for (const p of removed)  this.removeFile(p);
    for (const f of modified) this.updateFile(f);
    for (const f of added)    this.addFile(f);
    this.buildIndexes();
  }

  // ── HoloGraph Phase 2: Provenance edges ──────────────────────────────────

  /**
   * Register a SimulationContract receipt as a provenance edge.
   *
   * Records that the given file (and optionally a specific symbol within it)
   * has been validated by a simulation run identified by contractHash.
   *
   * Multiple receipts for the same file accumulate — slice diversity is the
   * count of distinct contractHashes for a given path (Paper 32 §5).
   */
  registerProvenance(edge: ProvenanceEdge): void {
    if (!this.provenanceByFile.has(edge.filePath)) {
      this.provenanceByFile.set(edge.filePath, []);
    }
    this.provenanceByFile.get(edge.filePath)!.push(edge);
    this.allProvenanceEdges.push(edge);
  }

  /**
   * Get all provenance receipts for a given file path.
   * Returns [] if no receipts have been registered.
   */
  getProvenanceForFile(filePath: string): ProvenanceEdge[] {
    return this.provenanceByFile.get(filePath) ?? [];
  }

  /**
   * All registered provenance edges across the entire graph.
   */
  getAllProvenanceEdges(): ProvenanceEdge[] {
    return this.allProvenanceEdges;
  }

  /**
   * Get all file paths that have at least one simulation receipt.
   * These are the "validated paths" — the proven-correct subset of the codebase.
   */
  getValidatedFilePaths(): string[] {
    return Array.from(this.provenanceByFile.keys());
  }

  /**
   * Slice diversity for a file: the number of distinct simulation receipts
   * (distinct contractHashes) that have validated this file.
   * Paper 32 §5: higher diversity = higher confidence in the validated path.
   */
  sliceDiversity(filePath: string): number {
    const edges = this.provenanceByFile.get(filePath) ?? [];
    return new Set(edges.map(e => e.contractHash)).size;
  }

  /**
   * Whether a file has been validated by any simulation receipt.
   */
  isValidated(filePath: string): boolean {
    return this.provenanceByFile.has(filePath);
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
      totalEventEdges: this.eventEdges.length,
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
    this.allEmitSites = [];
    this.allListenSites = [];
    this.eventEdges = [];
    this.symbolsByFile.clear();
    this.symbolsByName.clear();
    this.importsByFile.clear();
    this.importedByFile.clear();
    this.callerIndex.clear();
    this.calleeIndex.clear();
    this.eventEmitIndex.clear();
    this.eventListenIndex.clear();
    this.provenanceByFile.clear();
    this.allProvenanceEdges = [];
    this.nodePositions.clear();
    this._communities = null;
  }
}
