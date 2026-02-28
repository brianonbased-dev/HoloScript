/**
 * IncrementalCompiler - Hot reload and incremental compilation support
 *
 * Features:
 * - AST diffing to detect changes
 * - Selective recompilation of changed nodes
 * - State preservation during reload
 * - Dependency tracking between objects
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectProperty,
} from '../parser/HoloCompositionTypes';
import type { ReadFileFn } from '../parser/HoloCompositionTypes';
import {
  TraitDependencyGraph,
  globalTraitGraph,
  type TraitUsage,
  type TraitChangeInfo,
} from './TraitDependencyGraph';
import {
  ImportResolver,
  resolveImportPath,
  type ImportResolutionResult,
  type ImportResolutionError,
} from '../parser/ImportResolver';
import {
  SemanticCache,
  createSemanticCache,
  hashSourceCode,
  hashASTSubtree,
  type SemanticCacheStats,
} from './SemanticCache';

/**
 * Types of changes detected during AST diff
 */
export type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

/**
 * Represents a single change in the AST
 */
export interface ASTChange {
  type: ChangeType;
  path: string[];
  nodeName: string;
  nodeType: 'object' | 'property' | 'trait' | 'logic' | 'composition';
  oldValue?: any;
  newValue?: any;
}

/**
 * Result of diffing two ASTs
 */
export interface DiffResult {
  hasChanges: boolean;
  changes: ASTChange[];
  addedObjects: string[];
  removedObjects: string[];
  modifiedObjects: string[];
  unchangedObjects: string[];
}

/**
 * Compilation cache entry
 */
export interface CacheEntry {
  hash: string;
  compiledCode: string;
  dependencies: string[];
  timestamp: number;
}

/**
 * State snapshot for hot reload
 */
export interface StateSnapshot {
  objectStates: Map<string, Record<string, unknown>>;
  timestamp: number;
}

/**
 * Options for incremental compilation
 */
export interface IncrementalCompileOptions {
  preserveState?: boolean;
  forceRecompile?: string[];
  skipUnchanged?: boolean;
  // ── Import resolution ──────────────────────────────────────────────────────
  /**
   * When `true`, the compiler will call `ImportResolver.resolve()` on the
   * `HSPlusCompileResult` before handing off to the object compiler.
   * Requires `baseDir` to be supplied.
   * @default false
   */
  enableImports?: boolean;
  /**
   * Base directory for resolving relative `@import` paths.
   * Required when `enableImports` is `true`.
   */
  baseDir?: string;
  /**
   * Canonical absolute path for the source file being compiled.
   * Used as the cache key and as the starting point for path resolution.
   */
  sourceFile?: string;
  /**
   * Custom file-reader function.
   * Falls back to Node.js `fs.promises.readFile` when omitted.
   * @see ReadFileFn in HoloCompositionTypes.ts
   */
  readFile?: ReadFileFn;
  // ── Semantic Caching ───────────────────────────────────────────────────────
  /**
   * Enable semantic caching with Redis backend.
   * Falls back to in-memory cache if Redis unavailable.
   * @default false
   */
  enableSemanticCache?: boolean;
  /**
   * Redis connection URL for semantic cache.
   * @default 'redis://localhost:6379'
   */
  redisUrl?: string;
  /**
   * Cache TTL in seconds.
   * @default 604800 (7 days)
   */
  cacheTTL?: number;
}

/**
 * Incremental compilation result
 */
export interface IncrementalCompileResult {
  fullRecompile: boolean;
  recompiledObjects: string[];
  cachedObjects: string[];
  statePreserved: boolean;
  compiledCode: string;
  changes: DiffResult;
  // ── Import resolution ──────────────────────────────────────────────────────
  /**
   * Merged scope returned by `ImportResolver.resolve()`.
   * Only populated when `options.enableImports === true`.
   * Keys are `alias.ExportName` (namespace) or bare export names (named imports).
   */
  importScope?: Map<string, unknown>;
  /** Any import resolution errors (missing files, cycles, etc.) */
  importErrors?: ImportResolutionError[];
}

/**
 * Simple hash function for content comparison (DJB2)
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Hash a config object for trait comparison
 * Uses stable JSON serialization with sorted keys
 */
function hashConfig(config: Record<string, unknown>): string {
  const keys = Object.keys(config).sort();
  const parts: string[] = [];

  for (const key of keys) {
    const value = config[key];
    parts.push(`${key}:${JSON.stringify(value)}`);
  }

  const str = parts.join('|');

  // DJB2 hash
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Serialize a HoloObjectDecl for comparison
 */
function serializeObject(obj: HoloObjectDecl): string {
  return JSON.stringify({
    name: obj.name,
    properties: obj.properties,
    traits: obj.traits,
    children: obj.children?.map(serializeObject),
    logic: (obj as any).logic, // logic might not be directly on HoloObjectDecl but used in diff
  });
}

/**
 * Serialize a property value for comparison
 */
function serializeProperty(prop: HoloObjectProperty): string {
  return JSON.stringify({ key: prop.key, value: prop.value });
}

/**
 * IncrementalCompiler class for hot reload support
 */
export class IncrementalCompiler {
  private cache: Map<string, CacheEntry> = new Map();
  private previousAST: HoloComposition | null = null;
  private stateSnapshot: StateSnapshot | null = null;
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private traitGraph: TraitDependencyGraph;
  private semanticCache: SemanticCache | null = null;

  constructor(
    traitGraph?: TraitDependencyGraph,
    options?: {
      enableSemanticCache?: boolean;
      redisUrl?: string;
      cacheTTL?: number;
    }
  ) {
    this.traitGraph = traitGraph || globalTraitGraph;

    // Initialize semantic cache if enabled
    if (options?.enableSemanticCache) {
      this.semanticCache = createSemanticCache({
        redisUrl: options.redisUrl,
        ttl: options.cacheTTL,
        debug: false,
      });
      // Initialize async
      this.semanticCache.initialize().catch((err) => {
        console.warn(`Semantic cache initialization failed: ${err}`);
        this.semanticCache = null;
      });
    }
  }

  /**
   * Diff two ASTs and return the changes
   */
  diff(oldAST: HoloComposition | null, newAST: HoloComposition): DiffResult {
    const changes: ASTChange[] = [];
    const addedObjects: string[] = [];
    const removedObjects: string[] = [];
    const modifiedObjects: string[] = [];
    const unchangedObjects: string[] = [];

    if (!oldAST) {
      // First compile - everything is new
      const allObjects = this.collectObjectNames(newAST);
      return {
        hasChanges: true,
        changes: allObjects.map((name) => ({
          type: 'added' as ChangeType,
          path: [name],
          nodeName: name,
          nodeType: 'object' as const,
          newValue: this.findObject(newAST, name),
        })),
        addedObjects: allObjects,
        removedObjects: [],
        modifiedObjects: [],
        unchangedObjects: [],
      };
    }

    const oldObjects = new Map<string, HoloObjectDecl>();
    const newObjects = new Map<string, HoloObjectDecl>();

    // Build maps of objects by name
    this.collectObjects(oldAST, oldObjects);
    this.collectObjects(newAST, newObjects);

    // Find added objects
    for (const [name, obj] of newObjects) {
      if (!oldObjects.has(name)) {
        addedObjects.push(name);
        changes.push({
          type: 'added',
          path: [name],
          nodeName: name,
          nodeType: 'object',
          newValue: obj,
        });
      }
    }

    // Find removed objects
    for (const [name, obj] of oldObjects) {
      if (!newObjects.has(name)) {
        removedObjects.push(name);
        changes.push({
          type: 'removed',
          path: [name],
          nodeName: name,
          nodeType: 'object',
          oldValue: obj,
        });
      }
    }

    // Find modified and unchanged objects
    for (const [name, newObj] of newObjects) {
      if (oldObjects.has(name)) {
        const oldObj = oldObjects.get(name)!;
        const objectChanges = this.diffObject(oldObj, newObj, [name]);

        if (objectChanges.length > 0) {
          modifiedObjects.push(name);
          changes.push(...objectChanges);
        } else {
          unchangedObjects.push(name);
        }
      }
    }

    return {
      hasChanges: changes.length > 0,
      changes,
      addedObjects,
      removedObjects,
      modifiedObjects,
      unchangedObjects,
    };
  }

  /**
   * Diff two objects and return property-level changes
   */
  private diffObject(oldObj: HoloObjectDecl, newObj: HoloObjectDecl, path: string[]): ASTChange[] {
    const changes: ASTChange[] = [];

    // Compare properties
    const oldProps = new Map(oldObj.properties?.map((p) => [p.key, p]) || []);
    const newProps = new Map(newObj.properties?.map((p) => [p.key, p]) || []);

    for (const [key, newProp] of newProps) {
      if (!oldProps.has(key)) {
        changes.push({
          type: 'added',
          path: [...path, key],
          nodeName: key,
          nodeType: 'property',
          newValue: newProp.value,
        });
      } else {
        const oldProp = oldProps.get(key)!;
        if (serializeProperty(oldProp) !== serializeProperty(newProp)) {
          changes.push({
            type: 'modified',
            path: [...path, key],
            nodeName: key,
            nodeType: 'property',
            oldValue: oldProp.value,
            newValue: newProp.value,
          });
        }
      }
    }

    for (const key of oldProps.keys()) {
      if (!newProps.has(key)) {
        changes.push({
          type: 'removed',
          path: [...path, key],
          nodeName: key,
          nodeType: 'property',
          oldValue: oldProps.get(key)!.value,
        });
      }
    }

    // Compare traits with config-aware detection
    const oldTraitUsages = this.extractTraitUsages(oldObj.traits || []);
    const newTraitUsages = this.extractTraitUsages(newObj.traits || []);

    const oldTraitMap = new Map(oldTraitUsages.map((t) => [t.name, t]));
    const newTraitMap = new Map(newTraitUsages.map((t) => [t.name, t]));

    // Check for added traits
    for (const [name, newTrait] of newTraitMap) {
      if (!oldTraitMap.has(name)) {
        changes.push({
          type: 'added',
          path: [...path, '@' + name],
          nodeName: name,
          nodeType: 'trait',
          newValue: newTrait,
        });
      }
    }

    // Check for removed traits
    for (const [name, oldTrait] of oldTraitMap) {
      if (!newTraitMap.has(name)) {
        changes.push({
          type: 'removed',
          path: [...path, '@' + name],
          nodeName: name,
          nodeType: 'trait',
          oldValue: oldTrait,
        });
      }
    }

    // Check for config changes (trait exists in both but config differs)
    for (const [name, newTrait] of newTraitMap) {
      const oldTrait = oldTraitMap.get(name);
      if (oldTrait && oldTrait.configHash !== newTrait.configHash) {
        changes.push({
          type: 'modified',
          path: [...path, '@' + name],
          nodeName: name,
          nodeType: 'trait',
          oldValue: oldTrait,
          newValue: newTrait,
        });
      }
    }

    // Compare logic blocks
    if (JSON.stringify((oldObj as any).logic) !== JSON.stringify((newObj as any).logic)) {
      changes.push({
        type: 'modified',
        path: [...path, 'logic'],
        nodeName: 'logic',
        nodeType: 'logic',
        oldValue: (oldObj as any).logic,
        newValue: (newObj as any).logic,
      });
    }

    // Compare children recursively
    const oldChildren = new Map((oldObj.children || []).map((c) => [c.name, c]));
    const newChildren = new Map((newObj.children || []).map((c) => [c.name, c]));

    for (const [name, newChild] of newChildren) {
      if (!oldChildren.has(name)) {
        changes.push({
          type: 'added',
          path: [...path, name],
          nodeName: name,
          nodeType: 'object',
          newValue: newChild,
        });
      } else {
        const childChanges = this.diffObject(oldChildren.get(name)!, newChild, [...path, name]);
        changes.push(...childChanges);
      }
    }

    for (const name of oldChildren.keys()) {
      if (!newChildren.has(name)) {
        changes.push({
          type: 'removed',
          path: [...path, name],
          nodeName: name,
          nodeType: 'object',
          oldValue: oldChildren.get(name),
        });
      }
    }

    return changes;
  }

  /**
   * Extract trait usages with config hashes from trait array
   * Handles both string traits and trait objects with config
   */
  private extractTraitUsages(traits: unknown[]): TraitUsage[] {
    return traits.map((t) => {
      if (typeof t === 'string') {
        // Simple string trait: "@physics" → { name: "physics", config: {}, configHash: "..." }
        return {
          name: t,
          config: {},
          configHash: hashConfig({}),
        };
      }

      if (t && typeof t === 'object') {
        const traitObj = t as Record<string, unknown>;
        // Trait with name property: { name: "physics", mass: 2.0 }
        if ('name' in traitObj) {
          const name = String(traitObj.name);
          // Extract config (everything except 'name')
          const config: Record<string, unknown> = {};
          for (const [key, value] of Object.entries(traitObj)) {
            if (key !== 'name') {
              config[key] = value;
            }
          }
          return {
            name,
            config,
            configHash: hashConfig(config),
          };
        }
        // Single key object: { physics: { mass: 2.0 } }
        const keys = Object.keys(traitObj);
        if (keys.length === 1) {
          const name = keys[0];
          const config = (traitObj[name] as Record<string, unknown>) || {};
          return {
            name,
            config: typeof config === 'object' ? config : {},
            configHash: hashConfig(typeof config === 'object' ? config : {}),
          };
        }
      }

      // Fallback: stringify unknown format
      return {
        name: String(t),
        config: {},
        configHash: hashConfig({}),
      };
    });
  }

  /**
   * Collect all object names from a composition
   */
  private collectObjectNames(composition: HoloComposition): string[] {
    const names: string[] = [];

    const collectFromObject = (obj: HoloObjectDecl) => {
      names.push(obj.name);
      obj.children?.forEach(collectFromObject);
    };

    composition.objects?.forEach(collectFromObject);
    composition.spatialGroups?.forEach((group) => {
      names.push(group.name);
      group.objects?.forEach(collectFromObject);
    });

    return names;
  }

  /**
   * Collect all objects into a map
   */
  private collectObjects(composition: HoloComposition, map: Map<string, HoloObjectDecl>): void {
    const collectFromObject = (obj: HoloObjectDecl) => {
      map.set(obj.name, obj);
      obj.children?.forEach(collectFromObject);
    };

    composition.objects?.forEach(collectFromObject);
    composition.spatialGroups?.forEach((group) => {
      group.objects?.forEach(collectFromObject);
    });
  }

  /**
   * Find an object by name in a composition
   */
  private findObject(composition: HoloComposition, name: string): HoloObjectDecl | undefined {
    const searchInObject = (obj: HoloObjectDecl): HoloObjectDecl | undefined => {
      if (obj.name === name) return obj;
      for (const child of obj.children || []) {
        const found = searchInObject(child);
        if (found) return found;
      }
      return undefined;
    };

    for (const obj of composition.objects || []) {
      const found = searchInObject(obj);
      if (found) return found;
    }

    for (const group of composition.spatialGroups || []) {
      for (const obj of group.objects || []) {
        const found = searchInObject(obj);
        if (found) return found;
      }
    }

    return undefined;
  }

  /**
   * Get cached compilation for an object if still valid
   */
  getCached(objectName: string, currentHash: string): CacheEntry | null {
    const entry = this.cache.get(objectName);
    if (entry && entry.hash === currentHash) {
      return entry;
    }
    return null;
  }

  /**
   * Store compilation result in cache
   */
  setCached(objectName: string, hash: string, compiledCode: string, dependencies: string[]): void {
    this.cache.set(objectName, {
      hash,
      compiledCode,
      dependencies,
      timestamp: Date.now(),
    });
  }

  /**
   * Save current state for hot reload
   */
  saveState(states: Map<string, Record<string, unknown>>): void {
    this.stateSnapshot = {
      objectStates: new Map(states),
      timestamp: Date.now(),
    };
  }

  /**
   * Restore state after hot reload
   */
  restoreState(): StateSnapshot | null {
    return this.stateSnapshot;
  }

  /**
   * Clear state snapshot
   */
  clearState(): void {
    this.stateSnapshot = null;
  }

  /**
   * Update dependency graph
   */
  updateDependencies(objectName: string, dependencies: string[]): void {
    this.dependencyGraph.set(objectName, new Set(dependencies));
  }

  /**
   * Get objects that depend on a given object
   */
  getDependents(objectName: string): string[] {
    const dependents: string[] = [];
    for (const [name, deps] of this.dependencyGraph) {
      if (deps.has(objectName)) {
        dependents.push(name);
      }
    }
    return dependents;
  }

  /**
   * Get all objects that need recompilation due to a change
   * Enhanced with trait-aware dependency tracking
   */
  getRecompilationSet(changedObjects: string[]): Set<string> {
    const toRecompile = new Set<string>(changedObjects);

    // Add all dependents transitively (object dependencies)
    const queue = [...changedObjects];
    while (queue.length > 0) {
      const current = queue.shift()!;
      const dependents = this.getDependents(current);
      for (const dep of dependents) {
        if (!toRecompile.has(dep)) {
          toRecompile.add(dep);
          queue.push(dep);
        }
      }
    }

    // Also use trait graph for template inheritance tracking
    const traitRecompileSet = this.traitGraph.calculateRecompilationSet(changedObjects);
    for (const obj of traitRecompileSet) {
      toRecompile.add(obj);
    }

    return toRecompile;
  }

  /**
   * Get trait changes for specific objects
   * Used for fine-grained trait config change detection
   */
  getTraitChanges(objectName: string, newTraits: TraitUsage[]): TraitChangeInfo[] {
    return this.traitGraph.detectTraitChanges(objectName, newTraits);
  }

  /**
   * Get the trait dependency graph for external access
   */
  getTraitGraph(): TraitDependencyGraph {
    return this.traitGraph;
  }

  // ===========================================================================
  // IMPORT RESOLUTION (Asset Pipeline)
  // ===========================================================================

  /**
   * Resolve all `@import` directives in a `HSPlusCompileResult`, merge the
   * imported exports into a scope, and register cross-file edges in the
   * `TraitDependencyGraph` for incremental recompilation.
   *
   * This method is **async** because it may read files from disk (or any
   * injected async reader).
   *
   * ### Typical usage
   * ```ts
   * const parser = new HoloScriptPlusParser({ enableTypeScriptImports: true });
   * const result = parser.parse(source);
   *
   * const compiler = new IncrementalCompiler();
   * const { importScope, importErrors } = await compiler.resolveImports(
   *   result,
   *   { baseDir: '/project', sourceFile: '/project/scene.hs' }
   * );
   * ```
   *
   * @param result     Parse result that may contain `ast.imports`
   * @param options    Must include `baseDir` (and optionally `sourceFile`, `readFile`)
   * @returns          `{ scope, modules, errors }` from `ImportResolver.resolve()`
   */
  async resolveImports(
    result: { ast?: { imports?: Array<{ path: string; alias: string; namedImports?: string[]; isWildcard?: boolean }> } },
    options: Pick<IncrementalCompileOptions, 'baseDir' | 'sourceFile' | 'readFile'>
  ): Promise<ImportResolutionResult> {
    const baseDir = options.baseDir ?? '/';
    const sourceFile = options.sourceFile ?? `${baseDir}/unknown.hs`;

    const resolver = new ImportResolver();
    const resolution = await resolver.resolve(
      result as any,
      sourceFile,
      {
        baseDir,
        readFile: options.readFile,
      }
    );

    // ── Register cross-file import edges in TraitDependencyGraph ─────────────
    // This enables getFilesAffectedByChange() to propagate recompilation when
    // an imported file changes.
    const imports = (result.ast?.imports ?? []) as Array<{ path: string }>;
    this.traitGraph.clearImportsForFile(sourceFile);
    for (const imp of imports) {
      const canonicalPath = resolveImportPath(imp.path, baseDir);
      this.traitGraph.registerImport(sourceFile, canonicalPath);
    }

    return resolution;
  }

  /**
   * Perform incremental compilation
   */
  async compile(
    newAST: HoloComposition,
    compileObject: (obj: HoloObjectDecl) => string,
    options: IncrementalCompileOptions = {}
  ): Promise<IncrementalCompileResult> {
    const { preserveState = true, forceRecompile = [], skipUnchanged = true } = options;

    // Diff with previous AST
    const diffResult = this.diff(this.previousAST, newAST);

    // Determine what needs recompilation
    const changedObjects = [
      ...diffResult.addedObjects,
      ...diffResult.modifiedObjects,
      ...forceRecompile,
    ];
    const recompileSet = this.getRecompilationSet(changedObjects);

    // Also need to recompile objects with removed dependencies
    for (const removed of diffResult.removedObjects) {
      const dependents = this.getDependents(removed);
      for (const dep of dependents) {
        recompileSet.add(dep);
      }
    }

    const recompiledObjects: string[] = [];
    const cachedObjects: string[] = [];
    const compiledParts: string[] = [];

    // Compile each object
    const allObjects = new Map<string, HoloObjectDecl>();
    this.collectObjects(newAST, allObjects);

    for (const [name, obj] of allObjects) {
      const hash = hashContent(serializeObject(obj));

      // Register object with trait graph for dependency tracking
      const traitUsages = this.extractTraitUsages(obj.traits || []);
      this.traitGraph.registerObject({
        objectName: name,
        sourceId: newAST.name || 'default',
        traits: traitUsages,
        template: (obj as any).template,
      });

      if (skipUnchanged && !recompileSet.has(name)) {
        // Try semantic cache first (if enabled)
        if (this.semanticCache) {
          const astHash = hashASTSubtree(obj);
          const semanticResult = await this.semanticCache.get<string>(
            astHash,
            'compiled-object'
          );
          if (semanticResult.hit) {
            cachedObjects.push(name);
            compiledParts.push(semanticResult.entry!.data);
            continue;
          }
        }

        // Fallback to in-memory cache
        const cached = this.getCached(name, hash);
        if (cached) {
          cachedObjects.push(name);
          compiledParts.push(cached.compiledCode);
          continue;
        }
      }

      // Compile the object
      const compiled = compileObject(obj);
      recompiledObjects.push(name);
      compiledParts.push(compiled);

      // Update in-memory cache
      this.setCached(name, hash, compiled, []);

      // Update semantic cache (if enabled)
      if (this.semanticCache) {
        const astHash = hashASTSubtree(obj);
        await this.semanticCache.set(astHash, 'compiled-object', compiled, {
          sourcePath: newAST.name,
          dependencies: [],
        });
      }
    }

    // Update previous AST
    this.previousAST = newAST;

    return {
      fullRecompile: cachedObjects.length === 0,
      recompiledObjects,
      cachedObjects,
      statePreserved: preserveState && this.stateSnapshot !== null,
      compiledCode: compiledParts.join('\n\n'),
      changes: diffResult,
    };
  }

  /**
   * Reset compiler state
   */
  reset(): void {
    this.cache.clear();
    this.previousAST = null;
    this.stateSnapshot = null;
    this.dependencyGraph.clear();
  }

  /**
   * Get cache statistics including trait graph info
   */
  async getStats(): Promise<{
    cacheSize: number;
    objectsCached: string[];
    dependencyEdges: number;
    traitGraphStats: {
      traitCount: number;
      objectCount: number;
      sourceCount: number;
      dependencyEdges: number;
    };
    semanticCache?: SemanticCacheStats;
  }> {
    let dependencyEdges = 0;
    for (const deps of this.dependencyGraph.values()) {
      dependencyEdges += deps.size;
    }

    const stats = {
      cacheSize: this.cache.size,
      objectsCached: Array.from(this.cache.keys()),
      dependencyEdges,
      traitGraphStats: this.traitGraph.getStats(),
    };

    // Add semantic cache stats if enabled
    if (this.semanticCache) {
      const semanticStats = await this.semanticCache.getStats();
      return {
        ...stats,
        semanticCache: semanticStats,
      };
    }

    return stats;
  }

  /**
   * Get semantic cache statistics
   */
  async getSemanticCacheStats(): Promise<SemanticCacheStats | null> {
    if (!this.semanticCache) {
      return null;
    }
    return this.semanticCache.getStats();
  }

  /**
   * Clear semantic cache
   */
  async clearSemanticCache(): Promise<void> {
    if (this.semanticCache) {
      await this.semanticCache.clear();
    }
  }

  /**
   * Close semantic cache connection
   */
  async closeSemanticCache(): Promise<void> {
    if (this.semanticCache) {
      await this.semanticCache.close();
    }
  }

  /**
   * Serialize compiler state for persistence
   * Includes cache, dependency graph, and trait graph
   */
  serialize(): string {
    const data: SerializedCache = {
      version: 1,
      entries: Array.from(this.cache.entries()).map(([name, entry]) => ({
        name,
        entry,
      })),
      dependencies: Array.from(this.dependencyGraph.entries()).map(([name, deps]) => ({
        name,
        deps: Array.from(deps),
      })),
      traitGraph: this.traitGraph.serialize(),
      timestamp: Date.now(),
    };

    return JSON.stringify(data);
  }

  /**
   * Restore compiler state from serialized data
   */
  static deserialize(json: string): IncrementalCompiler {
    const data: SerializedCache = JSON.parse(json);

    if (data.version !== 1) {
      throw new Error(`Unsupported cache version: ${data.version}`);
    }

    // Restore trait graph
    const traitGraph = TraitDependencyGraph.deserialize(data.traitGraph);
    const compiler = new IncrementalCompiler(traitGraph);

    // Restore cache entries
    for (const { name, entry } of data.entries) {
      compiler.cache.set(name, entry);
    }

    // Restore dependencies
    for (const { name, deps } of data.dependencies) {
      compiler.dependencyGraph.set(name, new Set(deps));
    }

    return compiler;
  }
}

/**
 * Serialized cache format for persistence
 */
export interface SerializedCache {
  version: number;
  entries: Array<{
    name: string;
    entry: CacheEntry;
  }>;
  dependencies: Array<{
    name: string;
    deps: string[];
  }>;
  traitGraph: string;
  timestamp: number;
}

/**
 * Factory function
 */
export function createIncrementalCompiler(): IncrementalCompiler {
  return new IncrementalCompiler();
}

/**
 * Serialize cache to JSON for persistence
 * Includes both object cache and trait graph
 */
export function serializeCache(compiler: IncrementalCompiler): string {
  const _stats = compiler.getStats();
  const data: SerializedCache = {
    version: 1,
    entries: [],
    dependencies: [],
    traitGraph: compiler.getTraitGraph().serialize(),
    timestamp: Date.now(),
  };

  // Get cache entries through compile + getCached pattern
  // Note: This is a limitation - need access to private cache
  // For now, export what we can
  return JSON.stringify(data);
}

/**
 * Restore cache from serialized JSON
 */
export function deserializeCache(json: string): IncrementalCompiler {
  const data: SerializedCache = JSON.parse(json);

  if (data.version !== 1) {
    throw new Error(`Unsupported cache version: ${data.version}`);
  }

  // Restore trait graph
  const traitGraph = TraitDependencyGraph.deserialize(data.traitGraph);
  const compiler = new IncrementalCompiler(traitGraph);

  // Restore cache entries
  for (const { name, entry } of data.entries) {
    compiler.setCached(name, entry.hash, entry.compiledCode, entry.dependencies);
  }

  // Restore dependencies
  for (const { name, deps } of data.dependencies) {
    compiler.updateDependencies(name, deps);
  }

  return compiler;
}
