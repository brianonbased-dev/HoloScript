/**
 * ImportResolver — HoloScript+ Asset Pipeline
 *
 * Resolves @import directives, preventing circular dependencies and
 * merging exported nodes from imported modules into the importing scope.
 *
 * Design:
 * - Async-first (readFile injection → works in Node, browser, WASM, XR runtimes)
 * - Resolved module cache keyed by absolute/canonical path (avoids double-parsing)
 * - DFS cycle detection with a "currently resolving" set
 * - Only @exported nodes are made available to importers
 * - Named imports filter the exported set to just the named identifiers
 * - Wildcard imports inject everything under an alias namespace
 *
 * @module ImportResolver
 * @version 1.1.0
 */

import type { HSPlusCompileResult, HSPlusNode } from './HoloScriptPlusParser';

// =============================================================================
// TYPES
// =============================================================================

/** Options for the resolver */
export interface ImportResolveOptions {
  /** Base directory for resolving relative import paths */
  baseDir: string;
  /**
   * Async file-reader function injected by the host environment.
   * - Node: `(p) => fs.promises.readFile(p, 'utf8')`
   * - Browser: `(p) => fetch(p).then(r => r.text())`
   * - Test: in-memory map
   * Defaults to Node fs if omitted and running in Node.
   */
  readFile?: (absolutePath: string) => Promise<string>;
  /** Maximum import depth to prevent stack overflow on deeply nested deps. Default: 32 */
  maxDepth?: number;
  /** If true, @import is a no-op (useful for REPL / sandboxed eval). Default: false */
  disabled?: boolean;
}

/** A fully resolved module with its exported bindings */
export interface ResolvedModule {
  /** Canonical (absolute) path used as cache key */
  canonicalPath: string;
  /** Original parse result for this module */
  result: HSPlusCompileResult;
  /**
   * Exported nodes: name → node.
   * Populated from nodes preceded by @export directive.
   */
  exports: Map<string, HSPlusNode>;
  /** Canonical paths of modules this module imports (for graph edges) */
  dependencies: string[];
}

/** Import descriptor produced by the parser */
export interface ParsedImport {
  path: string;
  alias: string;
  namedImports?: string[];
  isWildcard?: boolean;
}

/** Result of resolving all imports for a top-level source */
export interface ImportResolutionResult {
  /** Merged scope: name → node, spanning all imports */
  scope: Map<string, HSPlusNode>;
  /** All resolved modules (including transitive) */
  modules: Map<string, ResolvedModule>;
  /** Any resolution errors (non-fatal — missing files etc.) */
  errors: ImportResolutionError[];
}

export interface ImportResolutionError {
  /** The import path that failed */
  importPath: string;
  /** Error message */
  message: string;
  /** 'cycle' | 'not_found' | 'parse_error' | 'named_not_exported' */
  code: 'cycle' | 'not_found' | 'parse_error' | 'named_not_exported' | 'max_depth';
  /** The cycle chain if code === 'cycle' (e.g., ['a.hs', 'b.hs', 'a.hs']) */
  cycle?: string[];
}

// =============================================================================
// PATH UTILITIES
// =============================================================================

/**
 * Resolve a potentially relative import path against a base directory.
 * Handles `./ ../` prefixes. Absolute paths are returned as-is.
 * Forward slashes are normalised on all platforms.
 */
export function resolveImportPath(importPath: string, baseDir: string): string {
  // Normalise to forward slashes
  importPath = importPath.replace(/\\/g, '/');
  baseDir = baseDir.replace(/\\/g, '/');

  // Absolute import path — return as-is (normalised)
  if (importPath.startsWith('/') || /^[A-Za-z]:/.test(importPath)) {
    return importPath;
  }

  // Resolve base dir itself (may contain .. or .)
  const baseResolved = normalizePath(baseDir);

  // Strip trailing slash from base
  const base = baseResolved.replace(/\/$/, '');

  // Combine base + import segments
  const combined = base + '/' + importPath;
  return normalizePath(combined);
}

/** Normalise a path string: resolve `.` and `..` segments, preserve leading `/` */
function normalizePath(p: string): string {
  const isAbsolute = p.startsWith('/');

  const parts = p.split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '' || part === '.') {
      // Preserve the leading empty string for absolute paths
      if (resolved.length === 0 && part === '' && isAbsolute) {
        resolved.push('');
      }
      continue;
    }
    if (part === '..') {
      // Pop last segment (but don't pop the root sentinel)
      if (resolved.length > (isAbsolute ? 1 : 0)) {
        resolved.pop();
      }
    } else {
      resolved.push(part);
    }
  }

  let result = resolved.join('/');
  if (isAbsolute && !result.startsWith('/')) result = '/' + result;
  return result || '/';
}

// =============================================================================
// IMPORT RESOLVER
// =============================================================================

export class ImportResolver {
  /** Already-resolved modules keyed by canonical path */
  private cache = new Map<string, ResolvedModule>();

  /** Paths currently being resolved (DFS cycle detection) */
  private inProgress = new Set<string>();

  /**
   * Resolve all @import directives from a parsed result and return a merged scope.
   *
   * @param result - The top-level parse result (from HoloScriptPlusParser.parse)
   * @param sourceFile - Canonical path of the file that produced `result`
   * @param options - Resolution options
   */
  async resolve(
    result: HSPlusCompileResult,
    sourceFile: string,
    options: ImportResolveOptions
  ): Promise<ImportResolutionResult> {
    if (options.disabled) {
      return { scope: new Map(), modules: new Map(), errors: [] };
    }

    const scope = new Map<string, HSPlusNode>();
    const modules = new Map<string, ResolvedModule>();
    const errors: ImportResolutionError[] = [];

    const imports: ParsedImport[] = (result.ast?.imports ?? []) as ParsedImport[];
    if (imports.length === 0) {
      return { scope, modules, errors };
    }

    const baseDir = options.baseDir.replace(/\\/g, '/');

    for (const imp of imports) {
      const canonicalPath = resolveImportPath(imp.path, baseDir);

      // ── Resolve the module (cycle errors bubble up via throw) ─────────────
      let mod: ResolvedModule;
      try {
        mod = await this._resolveModule(canonicalPath, sourceFile, options, 0, errors);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push({
          importPath: imp.path,
          message: msg,
          code: msg.startsWith('Circular')
            ? 'cycle'
            : msg.startsWith('Max depth')
              ? 'max_depth'
              : msg.startsWith('Parse error')
                ? 'parse_error'
                : 'not_found',
          ...(msg.startsWith('Circular') ? { cycle: [canonicalPath] } : {}),
        });
        continue;
      }

      modules.set(canonicalPath, mod);

      // ── Inject into scope ─────────────────────────────────────────────────
      if (imp.namedImports && imp.namedImports.length > 0) {
        // Named imports: only import the listed names
        for (const named of imp.namedImports) {
          const node = mod.exports.get(named);
          if (!node) {
            errors.push({
              importPath: imp.path,
              message: `'${named}' is not exported from '${imp.path}'`,
              code: 'named_not_exported',
            });
          } else {
            scope.set(named, node);
          }
        }
      } else if (imp.isWildcard) {
        // Wildcard: inject all exports under namespace alias
        for (const [exportName, node] of mod.exports) {
          scope.set(`${imp.alias}.${exportName}`, node);
        }
      } else {
        // Default namespace import: inject all exports under alias
        for (const [exportName, node] of mod.exports) {
          scope.set(`${imp.alias}.${exportName}`, node);
        }
      }
    }

    return { scope, modules, errors };
  }

  /**
   * Recursively resolve a single module file.
   * Cycle detection: if `canonicalPath` is already in `inProgress`, throws.
   * Transitive errors (cycles, missing, max depth) are pushed to `errors` array.
   */
  private async _resolveModule(
    canonicalPath: string,
    importedBy: string,
    options: ImportResolveOptions,
    depth: number,
    errors: ImportResolutionError[]
  ): Promise<ResolvedModule> {
    const maxDepth = options.maxDepth ?? 32;
    if (depth > maxDepth) {
      throw new Error(`Max depth (${maxDepth}) exceeded resolving '${canonicalPath}'`);
    }

    // ── Cycle detection ──────────────────────────────────────────────────────
    if (this.inProgress.has(canonicalPath)) {
      const chain = [...this.inProgress, canonicalPath];
      throw new Error(`Circular import detected: ${chain.join(' → ')}`);
    }

    // Cache hit — already fully resolved
    if (this.cache.has(canonicalPath)) {
      return this.cache.get(canonicalPath)!;
    }

    this.inProgress.add(canonicalPath);

    try {
      // ── Read source ─────────────────────────────────────────────────────
      let source: string;
      try {
        const reader = options.readFile ?? this._defaultReader();
        source = await reader(canonicalPath);
      } catch {
        throw new Error(`File not found: '${canonicalPath}' (imported from '${importedBy}')`);
      }

      // ── Parse ────────────────────────────────────────────────────────────
      // Lazy-import the parser to avoid circular module dependencies at load time
      const { HoloScriptPlusParser } = await import('./HoloScriptPlusParser');
      const parser = new HoloScriptPlusParser({ enableTypeScriptImports: true });
      const result = parser.parse(source);

      if (!result.success && result.errors.length > 0) {
        throw new Error(
          `Parse error in '${canonicalPath}': ${result.errors[0]?.message ?? 'unknown error'}`
        );
      }

      // ── Extract exports ──────────────────────────────────────────────────
      const exports = this._extractExports(result);

      // ── Resolve transitive imports ────────────────────────────────────────
      const transitiveDeps: string[] = [];
      const subImports: ParsedImport[] = (result.ast?.imports ?? []) as ParsedImport[];
      const baseDir = canonicalPath.replace(/\/[^/]+$/, '');

      for (const subImp of subImports) {
        const subPath = resolveImportPath(subImp.path, baseDir);
        transitiveDeps.push(subPath);

        if (!this.cache.has(subPath)) {
          try {
            const subMod = await this._resolveModule(
              subPath,
              canonicalPath,
              options,
              depth + 1,
              errors
            );
            // Merge sub-module exports into this module's available scope
            for (const [k, v] of subMod.exports) {
              if (!exports.has(k)) exports.set(k, v); // don't override own exports
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push({
              importPath: subImp.path,
              message: msg,
              code: msg.startsWith('Circular')
                ? 'cycle'
                : msg.startsWith('Max depth')
                  ? 'max_depth'
                  : msg.startsWith('Parse error')
                    ? 'parse_error'
                    : 'not_found',
              ...(msg.startsWith('Circular') ? { cycle: [subPath] } : {}),
            });
          }
        }
      }

      const mod: ResolvedModule = {
        canonicalPath,
        result,
        exports,
        dependencies: transitiveDeps,
      };

      this.cache.set(canonicalPath, mod);
      return mod;
    } finally {
      this.inProgress.delete(canonicalPath);
    }
  }

  /**
   * Extract @exported nodes from a parse result.
   *
   * Handles two AST shapes that HoloScriptPlusParser can produce:
   * 1. Single node file: result.ast.root IS the node; its directives contain @export
   * 2. Fragment file: result.ast.root.children[] are nodes, each may have @export directives
   */
  private _extractExports(result: HSPlusCompileResult): Map<string, HSPlusNode> {
    const exports = new Map<string, HSPlusNode>();

    const ast = result.ast as any;
    const root = ast?.root;
    if (!root) return exports;

    // Build a flat list of all nodes to inspect (deduplicated)
    const seen = new Set<HSPlusNode>();
    const nodesToCheck: HSPlusNode[] = [];

    const addNode = (n: unknown) => {
      if (!n || typeof n !== 'object') return;
      const node = n as HSPlusNode;
      if (!seen.has(node)) {
        seen.add(node);
        nodesToCheck.push(node);
      }
    };

    // Case 1: root itself (single-node file — root IS the exported node)
    addNode(root);

    // Case 2: root.children (fragment file)
    if (Array.isArray(root.children)) {
      for (const child of root.children) addNode(child);
    }

    // Case 3: ast.body / ast.children at program level
    if (Array.isArray(ast.body)) {
      for (const n of ast.body) addNode(n);
    }
    if (Array.isArray(ast.children)) {
      for (const n of ast.children) addNode(n);
    }

    for (const node of nodesToCheck) {
      const directives: any[] = (node as any).directives ?? [];
      const exportDir = directives.find((d: any) => d?.type === 'export');
      if (exportDir) {
        const exportName: string =
          exportDir.exportName ?? (node as any).id ?? (node as any).name ?? (node as any).type;
        exports.set(exportName, node);
      }
    }

    return exports;
  }

  /**
   * Default Node.js file reader. Only used on server-side / CLI.
   * Throws in environments without the 'fs' module (browser, XR).
   */
  private _defaultReader(): (path: string) => Promise<string> {
    return async (filePath: string) => {
      try {
        // Dynamic import to avoid bundler issues
        const fs = await import('fs/promises');
        return await fs.readFile(filePath, 'utf-8');
      } catch {
        throw new Error(
          `Cannot read '${filePath}': no readFile option provided and fs is unavailable`
        );
      }
    };
  }

  /** Clear the module cache (useful between test runs) */
  clearCache(): void {
    this.cache.clear();
    this.inProgress.clear();
  }

  /** Return the set of canonical paths currently cached */
  getCachedPaths(): string[] {
    return [...this.cache.keys()];
  }

  /** Return a resolved module from cache, or undefined */
  getCached(canonicalPath: string): ResolvedModule | undefined {
    return this.cache.get(canonicalPath);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

/** Shared resolver instance. Call clearCache() between independent projects. */
export const globalImportResolver = new ImportResolver();
