/**
 * ModuleResolver — HoloScript Module System
 *
 * Resolves @import / @export directives across .hs files:
 *  - Canonical path resolution relative to the importing file
 *  - AST-level caching to avoid re-parsing unchanged modules
 *  - Circular import detection (throws CircularImportError)
 *  - TraitDependencyGraph integration for incremental recompilation
 *
 * @version 1.0.0
 */

import * as path from 'path';
import { TraitDependencyGraph } from './TraitDependencyGraph';

// =============================================================================
// TYPES
// =============================================================================

/** A single @import specifier resolved to a canonical path */
export interface ResolvedImport {
  /** Canonical (absolute) path to the imported file */
  canonicalPath: string;
  /** Trait/symbol names imported, or ['*'] for wildcard */
  specifiers: string[];
  /** Optional alias: @import @physics as @p */
  alias?: string;
}

/** Result of parsing a single .hs file's header */
export interface ModuleHeader {
  /** Resolved imports declared in this file */
  imports: ResolvedImport[];
  /** Names exported by this file (empty = file is not a module) */
  exports: string[];
}

/** Parsed and cached module entry */
export interface CachedModule {
  canonicalPath: string;
  header: ModuleHeader;
  /** Raw source parsed from this module */
  rawSource: string;
  /** Timestamp of when this cache entry was created */
  cachedAt: number;
}

// =============================================================================
// ERRORS
// =============================================================================

export class CircularImportError extends Error {
  constructor(public readonly cycle: string[]) {
    super(`Circular @import detected: ${cycle.join(' → ')}`);
    this.name = 'CircularImportError';
  }
}

export class ModuleNotFoundError extends Error {
  constructor(
    public readonly requestedPath: string,
    public readonly fromFile: string
  ) {
    super(`Cannot find module "${requestedPath}" imported from "${fromFile}"`);
    this.name = 'ModuleNotFoundError';
  }
}

// =============================================================================
// MODULE RESOLVER
// =============================================================================

export class ModuleResolver {
  /** Canonical path → cached parsed module */
  private cache: Map<string, CachedModule> = new Map();

  /** Set of canonical paths currently being resolved (cycle detection) */
  private resolving: Set<string> = new Set();

  /** Optional dependency graph for incremental recompilation */
  private graph?: TraitDependencyGraph;

  /** Source loader — override in tests or non-Node environments */
  private loader: (canonicalPath: string) => string;

  constructor(options?: {
    graph?: TraitDependencyGraph;
    loader?: (canonicalPath: string) => string;
  }) {
    this.graph = options?.graph;
    // Default loader uses fs (Node.js). Replaced in browser/test contexts.
    this.loader =
      options?.loader ??
      ((p: string) => {
         
        const fs = require('fs') as typeof import('fs');
        if (!fs.existsSync(p)) throw new ModuleNotFoundError(p, '');
        return fs.readFileSync(p, 'utf8');
      });
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Resolve a module path relative to an importing file.
   * Returns the canonical absolute path.
   */
  resolve(modulePath: string, fromFile: string): string {
    if (modulePath.startsWith('.') || path.isAbsolute(modulePath)) {
      // Relative or absolute: resolve from fromFile's directory
      const dir = path.dirname(fromFile);
      return path.resolve(dir, modulePath);
    }
    // Bare specifier — resolve from workspace root (simplest convention)
    return path.resolve(modulePath);
  }

  /**
   * Load and parse a module, returning its header (imports + exports).
   * Results are cached; subsequent calls are free.
   *
   * @throws {CircularImportError} if a cycle is detected
   * @throws {ModuleNotFoundError} if the file cannot be found
   */
  load(canonicalPath: string, fromFile = '<entry>'): CachedModule {
    // Cache hit
    const cached = this.cache.get(canonicalPath);
    if (cached) return cached;

    // Cycle detection
    if (this.resolving.has(canonicalPath)) {
      const cycle = [...this.resolving, canonicalPath];
      throw new CircularImportError(cycle);
    }

    this.resolving.add(canonicalPath);

    try {
      const source = this.loader(canonicalPath);
      const header = this.parseHeader(source, canonicalPath);

      // Register import edges in the dependency graph
      if (this.graph) {
        this.graph.clearImportsForFile(canonicalPath);
        for (const imp of header.imports) {
          this.graph.registerImport(canonicalPath, imp.canonicalPath);
        }
      }

      // Recursively load all imports to validate (and populate cache)
      for (const imp of header.imports) {
        this.load(imp.canonicalPath, canonicalPath);
      }

      const entry: CachedModule = {
        canonicalPath,
        header,
        rawSource: source,
        cachedAt: Date.now(),
      };

      this.cache.set(canonicalPath, entry);
      return entry;
    } finally {
      this.resolving.delete(canonicalPath);
    }
  }

  /**
   * Invalidate a cached module (e.g. after the file changes on disk).
   * Also clears graph import edges so they are re-registered on next load.
   */
  invalidate(canonicalPath: string): void {
    this.cache.delete(canonicalPath);
    this.graph?.clearImportsForFile(canonicalPath);
  }

  /** Return the cached module header without triggering a load. */
  getCached(canonicalPath: string): CachedModule | undefined {
    return this.cache.get(canonicalPath);
  }

  /** Clear the entire cache (e.g. for full rebuilds). */
  clearAll(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Header Parsing
  // ---------------------------------------------------------------------------

  /**
   * Extract @import and @export declarations from the top of a source file.
   * We only scan top-level lines; we don't need the full AST here.
   *
   * Supported syntax:
   *   @import @physics, @ai_npc from "./physics.hs"
   *   @import * from "./shared.hs"
   *   @import @physics as @p from "./physics.hs"
   *   @export @turret, @enemy
   */
  parseHeader(source: string, fromFile: string): ModuleHeader {
    const imports: ResolvedImport[] = [];
    const exports: string[] = [];

    const lines = source.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();

      // @import @a, @b from "path"
      // @import * from "path"
      const importMatch = line.match(
        /^@import\s+([\w@*,\s]+?)(?:\s+as\s+(@\w+))?\s+from\s+["']([^"']+)["']/
      );
      if (importMatch) {
        const specifiersPart = importMatch[1].trim();
        const alias = importMatch[2]?.replace('@', '');
        const modulePath = importMatch[3];
        const canonicalPath = this.resolve(modulePath, fromFile);

        const specifiers =
          specifiersPart === '*'
            ? ['*']
            : specifiersPart
                .split(',')
                .map((s) => s.trim().replace('@', ''))
                .filter(Boolean);

        imports.push({ canonicalPath, specifiers, alias });
        continue;
      }

      // @export @a, @b
      const exportMatch = line.match(/^@export\s+([\w@,\s]+)/);
      if (exportMatch) {
        const names = exportMatch[1]
          .split(',')
          .map((s) => s.trim().replace('@', ''))
          .filter(Boolean);
        exports.push(...names);
        continue;
      }

      // Stop scanning at the first non-import/export/comment/blank line
      // (imports must appear at the top of the file)
      if (line && !line.startsWith('//') && !line.startsWith('#')) {
        break;
      }
    }

    return { imports, exports };
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /** Number of modules currently in cache. */
  get cacheSize(): number {
    return this.cache.size;
  }
}
