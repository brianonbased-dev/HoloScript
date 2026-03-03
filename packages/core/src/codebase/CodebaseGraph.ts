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
}

interface SerializedGraph {
  version: number;
  rootDir: string;
  files: ScannedFile[];
  communities: Record<string, string[]>;
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
      const key = call.calleeOwner
        ? `${call.calleeOwner}.${call.calleeName}`
        : call.calleeName;
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
    // Check both qualified and unqualified
    const qualified = this.callerIndex.get(key) ?? [];
    if (owner) return qualified;
    // Also check unqualified matches
    const unqualified = this.callerIndex.get(symbolName) ?? [];
    return [...qualified, ...unqualified];
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
   * Trace a call chain from a symbol to a target (BFS shortest path).
   * Returns the path of symbol names, or null if no path exists.
   */
  traceCallChain(
    fromSymbol: string,
    toSymbol: string,
    maxDepth = 10,
  ): CallChain | null {
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

  // ── Community Detection ──────────────────────────────────────────────────

  /**
   * Detect module communities using Louvain on the import/call graph.
   * Falls back to directory-based grouping for sparse graphs.
   */
  detectCommunities(): Map<string, string[]> {
    if (this._communities) return this._communities;

    const detector = new CommunityDetector();
    this._communities = detector.detect(
      Array.from(this.files.keys()),
      this.imports,
      this.calls,
    );

    return this._communities;
  }

  // ── Serialization ────────────────────────────────────────────────────────

  /**
   * Serialize the graph to JSON for persistence.
   */
  serialize(): string {
    const data: SerializedGraph = {
      version: 1,
      rootDir: this.rootDir,
      files: Array.from(this.files.values()),
      communities: this._communities
        ? Object.fromEntries(this._communities)
        : {},
    };
    return JSON.stringify(data);
  }

  /**
   * Deserialize a graph from JSON.
   */
  static deserialize(json: string): CodebaseGraph {
    const data: SerializedGraph = JSON.parse(json);
    const graph = new CodebaseGraph();
    graph.rootDir = data.rootDir;

    for (const file of data.files) {
      graph.addFile(file);
    }
    graph.buildIndexes();

    if (data.communities && Object.keys(data.communities).length > 0) {
      graph._communities = new Map(Object.entries(data.communities));
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
