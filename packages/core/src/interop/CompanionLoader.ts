/**
 * Companion Loader for HoloScript+ @import directive
 *
 * Bridges the gap between @import directives and TypeScript companions.
 * Uses ModuleResolver for actual module loading.
 */

import { ModuleResolver } from './Interoperability';
import type { HSPlusAST } from '../types/HoloScriptPlus';
import { Lazy } from '@holoscript/engine/runtime/RuntimeOptimization';

export interface CompanionLoaderOptions {
  /** Base path for resolving relative imports */
  basePath?: string;
  /** Pre-loaded companions to merge */
  preloaded?: Record<string, Record<string, unknown>>;
  /** Whether to allow dynamic imports (requires Node.js) */
  allowDynamic?: boolean;
}

export interface LoadResult {
  companions: Record<string, Record<string, unknown>>;
  errors: Array<{ path: string; error: Error }>;
  loaded: string[];
}

/**
 * Load TypeScript companions for @import directives
 */
export class CompanionLoader {
  private resolver: ModuleResolver;
  private options: Required<CompanionLoaderOptions>;

  constructor(options: CompanionLoaderOptions = {}) {
    this.options = {
      basePath: options.basePath ?? process.cwd(),
      preloaded: options.preloaded ?? {},
      allowDynamic: options.allowDynamic ?? true,
    };

    this.resolver = new ModuleResolver(this.options.basePath);
  }

  /**
   * Load all companions required by an AST
   *
   * @example
   * const loader = new CompanionLoader({ basePath: './src' });
   * const { companions, errors } = await loader.loadFromAST(ast);
   *
   * const runtime = new HoloScriptPlusRuntime(ast, { companions });
   */
  async loadFromAST(ast: HSPlusAST): Promise<LoadResult> {
    const result: LoadResult = {
      companions: { ...this.options.preloaded },
      errors: [],
      loaded: [],
    };

    for (const imp of ast.imports || []) {
      const modulePath = imp.path || imp.source;
      const alias = imp.alias || imp.source;

      // Create a lazy wrapper for the module
      const lazyModule = new Lazy(() => this.loadModule(modulePath));

      // Use Proxy to provide a synchronous-looking interface to the lazy module
      // The runtime will await it if it's a promise, but here we provide a way
      // to avoid triggering the load until a property is accessed.
      const proxy = new Proxy(
        {} as Record<string, unknown>,
        {
          get: (_target, prop: string) => {
            const mod = lazyModule.get();
            if (mod instanceof Promise) {
              // If it's still loading (async), we return a promise for the property
              return mod.then((m) => (m as Record<string, unknown>)[prop]);
            }
            return (mod as Record<string, unknown>)[prop];
          },
        }
      );

      result.companions[alias] = proxy;
      result.loaded.push(modulePath);
    }

    return result;
  }

  /**
   * Load a single module by path
   */
  async loadModule(modulePath: string): Promise<Record<string, unknown>> {
    if (!this.options.allowDynamic) {
      throw new Error(`Dynamic imports disabled. Provide via preloaded option: ${modulePath}`);
    }

    try {
      // Try to resolve and load the module
      const resolvedPath = this.resolver.resolveModule(modulePath);
      const module = this.resolver.loadModule(resolvedPath);

      // Return all exports as a record
      if (typeof module === 'object' && module !== null) {
        return module as unknown as Record<string, unknown>;
      }

      // Wrap non-object exports
      return { default: module };
    } catch (error) {
      // Fall back to dynamic import for ES modules
      try {
        const resolved = this.resolver.resolveModule(modulePath);
        const mod = await import(resolved);
        return mod;
      } catch (_importError) {
        throw new Error(`Failed to load module "${modulePath}": ${error}`);
      }
    }
  }

  /**
   * Register a pre-loaded companion
   */
  registerCompanion(alias: string, module: Record<string, unknown>): void {
    this.options.preloaded[alias] = module;
  }

  /**
   * Clear module cache
   */
  clearCache(): void {
    this.resolver.clearCache();
  }
}

/**
 * Create a companion loader with options
 */
export function createCompanionLoader(options?: CompanionLoaderOptions): CompanionLoader {
  return new CompanionLoader(options);
}

/**
 * Convenience function to load companions from an AST
 */
export async function loadCompanions(
  ast: HSPlusAST,
  options?: CompanionLoaderOptions
): Promise<LoadResult> {
  const loader = new CompanionLoader(options);
  return loader.loadFromAST(ast);
}
