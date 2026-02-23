/**
 * Trait Dependency Graph - Sprint 2 Priority 3
 *
 * Tracks trait dependencies for optimized incremental recompilation:
 * - Trait → Trait dependencies (inheritance, composition)
 * - Object → Trait usage mapping
 * - File → Trait mapping for change propagation
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TraitUsage {
  /** Trait name */
  name: string;
  /** Configuration passed to the trait */
  config: Record<string, unknown>;
  /** Hash of the config for change detection */
  configHash: string;
}

export interface ObjectTraitInfo {
  /** Object name */
  objectName: string;
  /** File/chunk the object is defined in */
  sourceId: string;
  /** Traits used by this object */
  traits: TraitUsage[];
  /** Template this object extends (if any) */
  template?: string;
}

export interface TraitDefinition {
  /** Trait name */
  name: string;
  /** Traits this trait requires/depends on */
  requires: string[];
  /** Traits this trait conflicts with */
  conflicts: string[];
}

export interface TraitChangeInfo {
  /** Name of the changed trait */
  traitName: string;
  /** Type of change */
  changeType: 'added' | 'removed' | 'config_changed';
  /** Previous config hash (if config changed) */
  oldConfigHash?: string;
  /** New config hash (if config changed) */
  newConfigHash?: string;
}

export interface AffectedSet {
  /** Objects that need recompilation */
  objects: Set<string>;
  /** Source files/chunks that need recompilation */
  sources: Set<string>;
  /** Reason for each affected object */
  reasons: Map<string, string>;
}

// =============================================================================
// HASH UTILITY
// =============================================================================

/**
 * Fast hash function for config objects
 * Uses a stable JSON representation + DJB2 hash
 */
function hashConfig(config: Record<string, unknown>): string {
  // Sort keys for stable ordering
  const keys = Object.keys(config).sort();
  const parts: string[] = [];

  for (const key of keys) {
    const value = config[key];
    // Handle nested objects, arrays, and primitives
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

// =============================================================================
// TRAIT DEPENDENCY GRAPH
// =============================================================================

export class TraitDependencyGraph {
  /** Trait → required traits (what this trait depends on) */
  private traitDependencies: Map<string, Set<string>> = new Map();

  /** Trait → conflicting traits */
  private traitConflicts: Map<string, Set<string>> = new Map();

  /** Object → trait info (current state) */
  private objectTraits: Map<string, ObjectTraitInfo> = new Map();

  /** Trait → objects using this trait */
  private traitToObjects: Map<string, Set<string>> = new Map();

  /** Source → objects defined in this source */
  private sourceToObjects: Map<string, Set<string>> = new Map();

  /** Template → objects extending this template */
  private templateToObjects: Map<string, Set<string>> = new Map();

  /** Previous state for diff comparison */
  private previousObjectTraits: Map<string, ObjectTraitInfo> = new Map();

  // ---------------------------------------------------------------------------
  // IMPORT GRAPH — cross-file dependency edges
  // ---------------------------------------------------------------------------

  /**
   * File → set of files it directly imports.
   * Edge: `importer → importee`
   * e.g., 'a.hs' → { 'b.hs', 'c.hs' }
   */
  private importEdges: Map<string, Set<string>> = new Map();

  /**
   * Reverse map: file → set of files that import it.
   * Edge: `importee → importers`
   * e.g., 'b.hs' → { 'a.hs', 'd.hs' }
   */
  private reverseImportEdges: Map<string, Set<string>> = new Map();

  // ===========================================================================
  // TRAIT REGISTRATION
  // ===========================================================================

  /**
   * Register a trait definition with its dependencies and conflicts
   */
  registerTrait(definition: TraitDefinition): void {
    const { name, requires, conflicts } = definition;

    // Store dependencies
    if (!this.traitDependencies.has(name)) {
      this.traitDependencies.set(name, new Set());
    }
    for (const req of requires) {
      this.traitDependencies.get(name)!.add(req);
    }

    // Store conflicts
    if (!this.traitConflicts.has(name)) {
      this.traitConflicts.set(name, new Set());
    }
    for (const conflict of conflicts) {
      this.traitConflicts.get(name)!.add(conflict);
    }
  }

  /**
   * Register common VR trait dependencies
   */
  registerBuiltinTraits(): void {
    // Physics traits
    this.registerTrait({
      name: 'physics',
      requires: [],
      conflicts: ['static'],
    });
    this.registerTrait({
      name: 'static',
      requires: [],
      conflicts: ['physics', 'kinematic'],
    });
    this.registerTrait({
      name: 'kinematic',
      requires: [],
      conflicts: ['static'],
    });

    // Interaction traits (most require physics or collidable)
    this.registerTrait({
      name: 'collidable',
      requires: [],
      conflicts: [],
    });
    this.registerTrait({
      name: 'grabbable',
      requires: ['collidable'],
      conflicts: [],
    });
    this.registerTrait({
      name: 'throwable',
      requires: ['grabbable'],
      conflicts: [],
    });
    this.registerTrait({
      name: 'draggable',
      requires: ['collidable'],
      conflicts: [],
    });

    // Visual traits
    this.registerTrait({
      name: 'visible',
      requires: [],
      conflicts: ['invisible'],
    });
    this.registerTrait({
      name: 'invisible',
      requires: [],
      conflicts: ['visible'],
    });

    // Audio traits
    this.registerTrait({
      name: 'audio',
      requires: [],
      conflicts: [],
    });
    this.registerTrait({
      name: 'spatial_audio',
      requires: ['audio'],
      conflicts: [],
    });
  }

  // ===========================================================================
  // IMPORT EDGE TRACKING (@import cross-file dependencies)
  // ===========================================================================

  /**
   * Register a cross-file @import relationship.
   *
   * Call this once per `@import` directive after parsing.
   * Idempotent — registering the same edge twice is safe.
   *
   * @param importingFile  Canonical path of the file that contains `@import`
   * @param importedFile   Canonical path of the file being imported
   */
  registerImport(importingFile: string, importedFile: string): void {
    // Forward edge: importer → importee
    if (!this.importEdges.has(importingFile)) {
      this.importEdges.set(importingFile, new Set());
    }
    this.importEdges.get(importingFile)!.add(importedFile);

    // Reverse edge: importee → importers
    if (!this.reverseImportEdges.has(importedFile)) {
      this.reverseImportEdges.set(importedFile, new Set());
    }
    this.reverseImportEdges.get(importedFile)!.add(importingFile);
  }

  /**
   * Remove all import edges for a file (call before re-registering after a parse).
   * Cleans both the forward edge and the corresponding reverse entries.
   */
  clearImportsForFile(importingFile: string): void {
    const imported = this.importEdges.get(importingFile);
    if (!imported) return;

    for (const dep of imported) {
      this.reverseImportEdges.get(dep)?.delete(importingFile);
    }
    this.importEdges.delete(importingFile);
  }

  /**
   * Return the set of files that `sourceFile` directly imports.
   */
  getImportedFiles(sourceFile: string): Set<string> {
    return new Set(this.importEdges.get(sourceFile) ?? []);
  }

  /**
   * Return the set of files that directly import `sourceFile`.
   */
  getFilesThatImport(sourceFile: string): Set<string> {
    return new Set(this.reverseImportEdges.get(sourceFile) ?? []);
  }

  /**
   * Walk the reverse-import graph (BFS) to compute the full set of files that
   * need to be recompiled when `changedFiles` are modified.
   *
   * Includes the changed files themselves and all direct/transitive importers.
   *
   * @param changedFiles Canonical paths of the files that changed on disk
   * @returns Set of canonical paths that need recompilation
   */
  getFilesAffectedByChange(changedFiles: string[]): Set<string> {
    const affected = new Set<string>(changedFiles);
    const queue = [...changedFiles];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const importers = this.reverseImportEdges.get(current);
      if (!importers) continue;

      for (const importer of importers) {
        if (!affected.has(importer)) {
          affected.add(importer);
          queue.push(importer);
        }
      }
    }

    return affected;
  }

  // ===========================================================================
  // OBJECT TRACKING
  // ===========================================================================

  /**
   * Register an object and its trait usage
   */
  registerObject(info: ObjectTraitInfo): void {
    const { objectName, sourceId, traits, template } = info;

    // Compute config hashes if not provided
    const traitsWithHashes: TraitUsage[] = traits.map((t) => ({
      ...t,
      configHash: t.configHash || hashConfig(t.config),
    }));

    const fullInfo: ObjectTraitInfo = {
      ...info,
      traits: traitsWithHashes,
    };

    // Store object info
    this.objectTraits.set(objectName, fullInfo);

    // Update trait → object mapping
    for (const trait of traitsWithHashes) {
      if (!this.traitToObjects.has(trait.name)) {
        this.traitToObjects.set(trait.name, new Set());
      }
      this.traitToObjects.get(trait.name)!.add(objectName);
    }

    // Update source → objects mapping
    if (!this.sourceToObjects.has(sourceId)) {
      this.sourceToObjects.set(sourceId, new Set());
    }
    this.sourceToObjects.get(sourceId)!.add(objectName);

    // Update template → objects mapping
    if (template) {
      if (!this.templateToObjects.has(template)) {
        this.templateToObjects.set(template, new Set());
      }
      this.templateToObjects.get(template)!.add(objectName);
    }
  }

  /**
   * Remove an object from tracking
   */
  unregisterObject(objectName: string): void {
    const info = this.objectTraits.get(objectName);
    if (!info) return;

    // Remove from trait → object mapping
    for (const trait of info.traits) {
      this.traitToObjects.get(trait.name)?.delete(objectName);
    }

    // Remove from source → objects mapping
    this.sourceToObjects.get(info.sourceId)?.delete(objectName);

    // Remove from template → objects mapping
    if (info.template) {
      this.templateToObjects.get(info.template)?.delete(objectName);
    }

    // Remove object info
    this.objectTraits.delete(objectName);
  }

  // ===========================================================================
  // CHANGE DETECTION
  // ===========================================================================

  /**
   * Save current state for comparison
   */
  saveSnapshot(): void {
    this.previousObjectTraits = new Map(
      Array.from(this.objectTraits.entries()).map(([k, v]) => [
        k,
        {
          ...v,
          traits: [...v.traits],
        },
      ])
    );
  }

  /**
   * Detect trait changes for an object
   */
  detectTraitChanges(objectName: string, newTraits: TraitUsage[]): TraitChangeInfo[] {
    const changes: TraitChangeInfo[] = [];
    const oldInfo = this.previousObjectTraits.get(objectName);

    // Compute hashes for new traits
    const newTraitsWithHashes = newTraits.map((t) => ({
      ...t,
      configHash: t.configHash || hashConfig(t.config),
    }));

    const oldTraitMap = new Map<string, TraitUsage>();
    const newTraitMap = new Map<string, TraitUsage>();

    if (oldInfo) {
      for (const t of oldInfo.traits) {
        oldTraitMap.set(t.name, t);
      }
    }

    for (const t of newTraitsWithHashes) {
      newTraitMap.set(t.name, t);
    }

    // Check for added traits
    for (const [name, newTrait] of newTraitMap) {
      if (!oldTraitMap.has(name)) {
        changes.push({
          traitName: name,
          changeType: 'added',
          newConfigHash: newTrait.configHash,
        });
      }
    }

    // Check for removed traits
    for (const [name, oldTrait] of oldTraitMap) {
      if (!newTraitMap.has(name)) {
        changes.push({
          traitName: name,
          changeType: 'removed',
          oldConfigHash: oldTrait.configHash,
        });
      }
    }

    // Check for config changes
    for (const [name, newTrait] of newTraitMap) {
      const oldTrait = oldTraitMap.get(name);
      if (oldTrait && oldTrait.configHash !== newTrait.configHash) {
        changes.push({
          traitName: name,
          changeType: 'config_changed',
          oldConfigHash: oldTrait.configHash,
          newConfigHash: newTrait.configHash,
        });
      }
    }

    return changes;
  }

  // ===========================================================================
  // AFFECTED SET CALCULATION
  // ===========================================================================

  /**
   * Get all objects using a specific trait
   */
  getObjectsUsingTrait(traitName: string): Set<string> {
    return new Set(this.traitToObjects.get(traitName) || []);
  }

  /**
   * Get all traits that depend on a given trait
   */
  getDependentTraits(traitName: string): Set<string> {
    const dependents = new Set<string>();

    for (const [trait, deps] of this.traitDependencies) {
      if (deps.has(traitName)) {
        dependents.add(trait);
      }
    }

    return dependents;
  }

  /**
   * Calculate the affected set when traits change
   */
  calculateAffectedSet(changes: TraitChangeInfo[]): AffectedSet {
    const objects = new Set<string>();
    const sources = new Set<string>();
    const reasons = new Map<string, string>();

    for (const change of changes) {
      const { traitName, changeType } = change;

      // Get objects directly using this trait
      const directUsers = this.getObjectsUsingTrait(traitName);
      for (const obj of directUsers) {
        objects.add(obj);
        reasons.set(obj, `Uses trait @${traitName} (${changeType})`);

        // Add source file
        const info = this.objectTraits.get(obj);
        if (info) {
          sources.add(info.sourceId);
        }
      }

      // Get traits that depend on this trait and their users
      const dependentTraits = this.getDependentTraits(traitName);
      for (const depTrait of dependentTraits) {
        const depUsers = this.getObjectsUsingTrait(depTrait);
        for (const obj of depUsers) {
          if (!objects.has(obj)) {
            objects.add(obj);
            reasons.set(obj, `Uses trait @${depTrait} which depends on @${traitName}`);

            const info = this.objectTraits.get(obj);
            if (info) {
              sources.add(info.sourceId);
            }
          }
        }
      }
    }

    return { objects, sources, reasons };
  }

  /**
   * Calculate minimal recompilation set for changed objects
   * Considers trait dependencies and template inheritance
   */
  calculateRecompilationSet(changedObjects: string[]): Set<string> {
    const toRecompile = new Set<string>(changedObjects);
    const queue = [...changedObjects];

    while (queue.length > 0) {
      const current = queue.shift()!;
      const info = this.objectTraits.get(current);

      if (!info) continue;

      // If this is a template, add all objects extending it
      const extending = this.templateToObjects.get(current);
      if (extending) {
        for (const obj of extending) {
          if (!toRecompile.has(obj)) {
            toRecompile.add(obj);
            queue.push(obj);
          }
        }
      }
    }

    return toRecompile;
  }

  // ===========================================================================
  // SERIALIZATION (for cache persistence)
  // ===========================================================================

  /**
   * Serialize the graph for persistence
   */
  serialize(): string {
    const data = {
      version: 2,
      traitDependencies: Array.from(this.traitDependencies.entries()).map(([k, v]) => [
        k,
        Array.from(v),
      ]),
      traitConflicts: Array.from(this.traitConflicts.entries()).map(([k, v]) => [k, Array.from(v)]),
      objectTraits: Array.from(this.objectTraits.entries()),
      importEdges: Array.from(this.importEdges.entries()).map(([k, v]) => [k, Array.from(v)]),
      timestamp: Date.now(),
    };

    return JSON.stringify(data);
  }

  /**
   * Deserialize the graph from persisted data
   */
  static deserialize(json: string): TraitDependencyGraph {
    const graph = new TraitDependencyGraph();
    const data = JSON.parse(json);

    if (data.version !== 1 && data.version !== 2) {
      throw new Error(`Unsupported trait graph version: ${data.version}`);
    }

    // Restore trait dependencies
    for (const [trait, deps] of data.traitDependencies) {
      graph.traitDependencies.set(trait, new Set(deps));
    }

    // Restore trait conflicts
    for (const [trait, conflicts] of data.traitConflicts) {
      graph.traitConflicts.set(trait, new Set(conflicts));
    }

    // Restore object traits
    for (const [_name, info] of data.objectTraits) {
      graph.registerObject(info);
    }

    // Restore import edges (v2+)
    if (data.importEdges) {
      for (const [importer, imported] of data.importEdges as [string, string[]][]) {
        for (const dep of imported) {
          graph.registerImport(importer, dep);
        }
      }
    }

    return graph;
  }

  // ===========================================================================
  // STATS & DEBUGGING
  // ===========================================================================

  /**
   * Get graph statistics
   */
  getStats(): {
    traitCount: number;
    objectCount: number;
    sourceCount: number;
    dependencyEdges: number;
    importEdges: number;
  } {
    let dependencyEdges = 0;
    for (const deps of this.traitDependencies.values()) {
      dependencyEdges += deps.size;
    }

    let importEdges = 0;
    for (const deps of this.importEdges.values()) {
      importEdges += deps.size;
    }

    return {
      traitCount: this.traitDependencies.size,
      objectCount: this.objectTraits.size,
      sourceCount: this.sourceToObjects.size,
      dependencyEdges,
      importEdges,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.traitDependencies.clear();
    this.traitConflicts.clear();
    this.objectTraits.clear();
    this.traitToObjects.clear();
    this.sourceToObjects.clear();
    this.templateToObjects.clear();
    this.previousObjectTraits.clear();
    this.importEdges.clear();
    this.reverseImportEdges.clear();
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

export const globalTraitGraph = new TraitDependencyGraph();

// Initialize with builtin traits
globalTraitGraph.registerBuiltinTraits();
