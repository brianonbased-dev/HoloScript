/**
 * @holoscript/core Interoperability
 *
 * TypeScript module resolution, proper import/export handling,
 * async/await support, error boundaries
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Module resolver for TypeScript/JavaScript integration
 */
interface ModuleInfo {
  path: string;
  exports: Record<string, unknown>;
}

export class ModuleResolver {
  private cache: Map<string, ModuleInfo> = new Map();
  private resolvedPaths: Map<string, string> = new Map();
  private basePath: string;

  constructor(basePath: string = process.cwd()) {
    this.basePath = basePath;
  }

  /**
   * Resolve module path
   */
  resolveModule(modulePath: string, fromPath?: string): string {
    const cacheKey = `${modulePath}:${fromPath || 'root'}`;

    if (this.resolvedPaths.has(cacheKey)) {
      return this.resolvedPaths.get(cacheKey)!;
    }

    const resolved = this.performResolve(modulePath, fromPath);
    this.resolvedPaths.set(cacheKey, resolved);
    return resolved;
  }

  /**
   * Perform actual module resolution
   */
  private performResolve(modulePath: string, fromPath?: string): string {
    // Handle built-in modules
    if (this.isBuiltinModule(modulePath)) {
      return modulePath;
    }

    // Handle relative imports
    if (modulePath.startsWith('.')) {
      const basePath = fromPath ? path.dirname(fromPath) : this.basePath;
      const resolved = path.resolve(basePath, modulePath);
      return this.findModuleFile(resolved);
    }

    // Handle node_modules
    if (modulePath.startsWith('@')) {
      // Scoped package
      return this.resolveNodeModule(modulePath);
    }

    // Standard package
    return this.resolveNodeModule(modulePath);
  }

  /**
   * Check if built-in module
   */
  private isBuiltinModule(modulePath: string): boolean {
    const builtins = ['fs', 'path', 'crypto', 'util', 'stream', 'events'];
    return builtins.includes(modulePath);
  }

  /**
   * Resolve from node_modules
   */
  private resolveNodeModule(modulePath: string): string {
    let current = this.basePath;

    while (current !== path.dirname(current)) {
      const nodeModulesPath = path.join(current, 'node_modules', modulePath);

      if (fs.existsSync(nodeModulesPath)) {
        return nodeModulesPath;
      }

      // Try package.json main field
      const packageJsonPath = path.join(nodeModulesPath, 'package.json');

      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        return this.findModuleFile(path.join(nodeModulesPath, packageJson.main || 'index.js'));
      }

      current = path.dirname(current);
    }

    throw new Error(`Module not found: ${modulePath}`);
  }

  /**
   * Find module file with various extensions
   */
  private findModuleFile(basePath: string): string {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json'];

    // Try exact file
    if (fs.existsSync(basePath)) {
      return basePath;
    }

    // Try with extensions
    for (const ext of extensions) {
      const withExt = basePath + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    // Try index
    const indexPath = path.join(basePath, 'index');
    for (const ext of extensions) {
      const withExt = indexPath + ext;
      if (fs.existsSync(withExt)) {
        return withExt;
      }
    }

    throw new Error(`Cannot resolve file: ${basePath}`);
  }

  /**
   * Load module (with caching)
   */
  loadModule(modulePath: string, fromPath?: string): ModuleInfo {
    const resolved = this.resolveModule(modulePath, fromPath);
    const cacheKey = resolved;

    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // For now, return module info (real implementation would execute)
    const module: ModuleInfo = {
      path: resolved,
      exports: {},
    };

    this.cache.set(cacheKey, module);
    return module;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    this.resolvedPaths.clear();
  }
}

/**
 * Named export/import handler
 */
export class ExportImportHandler {
  private exports: Map<string, Map<string, unknown>> = new Map();

  /**
   * Define named export
   */
  defineExport(modulePath: string, name: string, value: unknown): void {
    if (!this.exports.has(modulePath)) {
      this.exports.set(modulePath, new Map());
    }

    this.exports.get(modulePath)!.set(name, value);
  }

  /**
   * Get named export
   */
  getExport(modulePath: string, name: string): unknown {
    const moduleExports = this.exports.get(modulePath);

    if (!moduleExports) {
      throw new Error(`Module not found: ${modulePath}`);
    }

    if (!moduleExports.has(name)) {
      throw new Error(`Named export '${name}' not found in ${modulePath}`);
    }

    return moduleExports.get(name);
  }

  /**
   * Get all exports from module
   */
  getAllExports(modulePath: string): Record<string, unknown> {
    const moduleExports = this.exports.get(modulePath);

    if (!moduleExports) {
      return {};
    }

    const result: Record<string, unknown> = {};

    for (const [name, value] of moduleExports) {
      result[name] = value;
    }

    return result;
  }

  /**
   * Check if export exists
   */
  hasExport(modulePath: string, name: string): boolean {
    return this.exports.has(modulePath) && this.exports.get(modulePath)!.has(name);
  }
}

/**
 * Async function handler
 */
export class AsyncFunctionHandler {
  /**
   * Wrap async function for HoloScript
   */
  wrapAsyncFunction(
    fn: (...args: unknown[]) => Promise<unknown>
  ): (...args: unknown[]) => Promise<unknown> {
    return async (...args: unknown[]) => {
      try {
        return await fn(...args);
      } catch (error) {
        throw this.normalizeError(error);
      }
    };
  }

  /**
   * Check if function is async
   */
  isAsync(fn: unknown): boolean {
    if (typeof fn !== 'function') {
      return false;
    }

    const fnStr = fn.toString().trim();
    return fnStr.startsWith('async ') || fn.constructor.name === 'AsyncFunction';
  }

  /**
   * Convert callback to promise
   */
  callbackToPromise(
    fn: (callback: (err: unknown, result: unknown) => void) => void
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      fn((err: unknown, result: unknown) => {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Normalize error from async function
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error(JSON.stringify(error));
  }
}

/**
 * Error boundary for isolation
 */
export class ErrorBoundary {
  private errors: Error[] = [];
  private onError?: (error: Error) => void;

  constructor(onError?: (error: Error) => void) {
    this.onError = onError;
  }

  /**
   * Wrap function with error boundary
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrap<T extends (...args: any[]) => any>(fn: T): T {
    return ((...args: unknown[]) => {
      try {
        const result = fn(...args);

        // Handle async functions
        if (result instanceof Promise) {
          return result.catch((error: unknown) => {
            this.handleError(error);
            throw error;
          });
        }

        return result;
      } catch (error: unknown) {
        this.handleError(error);
        throw error;
      }
    }) as T;
  }

  /**
   * Wrap async function with error boundary
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wrapAsync<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: unknown[]) => {
      try {
        return await fn(...args);
      } catch (error: unknown) {
        this.handleError(error);
        throw error;
      }
    }) as T;
  }

  /**
   * Execute function in boundary
   */
  execute<T>(fn: () => T): T {
    try {
      return fn();
    } catch (error: unknown) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Execute async function in boundary
   */
  async executeAsync<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error: unknown) {
      this.handleError(error);
      throw error;
    }
  }

  /**
   * Handle error
   */
  private handleError(error: unknown): void {
    const normalized = this.normalizeError(error);
    this.errors.push(normalized);

    if (this.onError) {
      this.onError(normalized);
    }
  }

  /**
   * Get errors
   */
  getErrors(): Error[] {
    return [...this.errors];
  }

  /**
   * Clear errors
   */
  clearErrors(): void {
    this.errors = [];
  }

  /**
   * Normalize error
   */
  private normalizeError(error: unknown): Error {
    if (error instanceof Error) {
      return error;
    }

    if (typeof error === 'string') {
      return new Error(error);
    }

    return new Error(JSON.stringify(error));
  }
}

/**
 * TypeScript type loader
 */
export class TypeScriptTypeLoader {
  /**
   * Load types from TypeScript declaration file
   */
  loadTypes(_filePath: string): Map<string, unknown> {
    const types = new Map<string, unknown>();

    // In real implementation, would parse .d.ts file
    // For now, return empty map
    return types;
  }

  /**
   * Convert TypeScript type to HoloScript type
   */
  convertType(tsType: unknown): unknown {
    // Basic type mapping
    const mapping: Record<string, string> = {
      string: 'text',
      number: 'numeric',
      boolean: 'logical',
      void: 'void',
      any: 'dynamic',
      unknown: 'dynamic',
      null: 'null',
      undefined: 'void',
    };

    if (typeof tsType === 'string') {
      return mapping[tsType] || tsType;
    }

    if (Array.isArray(tsType)) {
      return {
        kind: 'array',
        elementType: this.convertType(tsType[0]),
      };
    }

    if (typeof tsType === 'object') {
      return {
        kind: 'object',
        properties: Object.entries(tsType as Record<string, unknown>).reduce(
          (acc, [key, val]) => {
            acc[key] = this.convertType(val);
            return acc;
          },
          {} as Record<string, unknown>
        ),
      };
    }

    return tsType;
  }
}

/**
 * Unified interop context
 */
export class InteropContext {
  private moduleResolver: ModuleResolver;
  private exportImportHandler: ExportImportHandler;
  private asyncHandler: AsyncFunctionHandler;
  private errorBoundary: ErrorBoundary;
  private typeLoader: TypeScriptTypeLoader;

  constructor(basePath?: string) {
    this.moduleResolver = new ModuleResolver(basePath);
    this.exportImportHandler = new ExportImportHandler();
    this.asyncHandler = new AsyncFunctionHandler();
    this.errorBoundary = new ErrorBoundary();
    this.typeLoader = new TypeScriptTypeLoader();
  }

  getModuleResolver(): ModuleResolver {
    return this.moduleResolver;
  }

  getExportImportHandler(): ExportImportHandler {
    return this.exportImportHandler;
  }

  getAsyncHandler(): AsyncFunctionHandler {
    return this.asyncHandler;
  }

  getErrorBoundary(): ErrorBoundary {
    return this.errorBoundary;
  }

  getTypeLoader(): TypeScriptTypeLoader {
    return this.typeLoader;
  }
}
