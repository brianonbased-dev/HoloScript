/**
 * ParallelParser - Parallel file parsing using worker threads
 *
 * Features:
 * - Multi-threaded parsing with configurable pool size
 * - File dependency resolution
 * - Progress tracking and cancellation
 * - Graceful fallback to sequential parsing
 * - Memory-bounded operation
 * - Browser-compatible (falls back to sequential parsing)
 * - Hybrid chunking support (structure/fixed/semantic strategies)
 *
 * @version 1.2.0 - Added HybridChunker integration
 */

import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import { HybridChunker, createHybridChunker } from './HybridChunker';
import type { HSPlusParserOptions } from '../types/AdvancedTypeSystem';
import type { ParseTaskData, ParseTaskResult } from './ParseWorker';
import type { ChunkingOptions, SourceChunk } from './HybridChunker';

// Environment detection
const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined';

// Simple EventEmitter implementation for browser compatibility
class SimpleEventEmitter {
  private listeners: Map<string, Array<(...args: any[]) => void>> = new Map();

  on(event: string, callback: (...args: any[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
    return this;
  }

  off(event: string, callback: (...args: any[]) => void): this {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
    return this;
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      for (const listener of eventListeners) {
        listener(...args);
      }
      return true;
    }
    return false;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
    return this;
  }
}

/** Minimal interface for dynamically-imported WorkerPool */
interface DynamicWorkerPool {
  initialize(): Promise<void>;
  executeAll(type: string, tasks: unknown[]): Promise<ParseTaskResult[]>;
  getStats(): WorkerPoolStats | null;
  shutdown(): Promise<void>;
}

// Dynamic imports for Node.js modules (only executed in Node environment)
async function loadNodeModules(): Promise<{
  cpuCount: number;
  path: typeof import('path');
  fileURLToPath: typeof import('url').fileURLToPath;
  WorkerPool: unknown;
  createWorkerPool: (path: string, opts: { poolSize: number; debug: boolean }) => DynamicWorkerPool;
} | null> {
  if (isBrowser) return null;

  try {
    const os = await import('os');
    const path = await import('path');
    const { fileURLToPath } = await import('url');
    const workerPoolModule = await import('./WorkerPool');

    return {
      cpuCount: os.cpus().length,
      path,
      fileURLToPath,
      WorkerPool: workerPoolModule.WorkerPool,
      createWorkerPool: workerPoolModule.createWorkerPool,
    };
  } catch {
    return null;
  }
}

export interface FileInput {
  /** File path (used for error reporting and dependency resolution) */
  path: string;
  /** Source code content */
  content: string;
}

export interface WorkerPoolStats {
  poolSize: number;
  activeWorkers: number;
  busyWorkers: number;
  idleWorkers: number;
  totalTasksProcessed: number;
  queuedTasks: number;
  avgTaskTime: number;
}

export interface ParallelParseResult {
  /** Individual file results */
  results: Map<string, ParseTaskResult>;
  /** Total parse time in ms */
  totalTime: number;
  /** Number of successful parses */
  successCount: number;
  /** Number of failed parses */
  failCount: number;
  /** Whether all files parsed successfully */
  success: boolean;
  /** Merged symbol table */
  symbolTable: Map<string, SymbolInfo>;
  /** File dependency graph */
  dependencyGraph: Map<string, string[]>;
}

export interface SymbolInfo {
  name: string;
  type: 'orb' | 'template' | 'composition' | 'function' | 'variable' | 'export';
  sourceFile: string;
  line?: number;
  column?: number;
}

export interface ParallelParserOptions {
  /** Number of worker threads (defaults to CPU cores) */
  workerCount?: number;
  /** Parser options passed to workers */
  parserOptions?: HSPlusParserOptions;
  /** Maximum files to parse in parallel per batch */
  batchSize?: number;
  /** Enable progress events */
  enableProgress?: boolean;
  /** Fall back to sequential parsing if workers unavailable */
  fallbackToSequential?: boolean;
  /** Debug logging */
  debug?: boolean;
  /** Enable hybrid chunking (structure/fixed/semantic strategies) */
  enableHybridChunking?: boolean;
  /** Chunking options for HybridChunker */
  chunkingOptions?: ChunkingOptions;
}

export interface ParseProgress {
  total: number;
  completed: number;
  failed: number;
  currentFile?: string;
  percentage: number;
}

/**
 * ParallelParser coordinates multi-threaded file parsing
 * Falls back to sequential parsing in browser environments
 */
export class ParallelParser extends SimpleEventEmitter {
  private workerPool: DynamicWorkerPool | null = null;
  private options: Required<ParallelParserOptions>;
  private workerPath: string = '';
  private isInitialized: boolean = false;
  private fallbackParser: HoloScriptPlusParser | null = null;
  private nodeModules: Awaited<ReturnType<typeof loadNodeModules>> = null;
  private hybridChunker: HybridChunker | null = null;

  constructor(options: ParallelParserOptions = {}) {
    super();

    // Default worker count - will be updated in Node.js environment
    const defaultWorkerCount = isBrowser ? 1 : 4;

    this.options = {
      workerCount: options.workerCount ?? defaultWorkerCount,
      parserOptions: options.parserOptions ?? {},
      batchSize: options.batchSize ?? 50,
      enableProgress: options.enableProgress ?? true,
      fallbackToSequential: options.fallbackToSequential ?? true,
      debug: options.debug ?? false,
      enableHybridChunking: options.enableHybridChunking ?? true,
      chunkingOptions: options.chunkingOptions ?? {},
    };

    // Initialize HybridChunker if enabled
    if (this.options.enableHybridChunking) {
      this.hybridChunker = createHybridChunker({
        ...this.options.chunkingOptions,
        debug: this.options.debug,
      });
      this.log('HybridChunker enabled for optimized file parsing');
    }
  }

  /**
   * Get current directory in ESM-compatible way (Node.js only)
   */
  private getCurrentDir(): string {
    if (!this.nodeModules) return '';

    try {
      const __filename = this.nodeModules.fileURLToPath(import.meta.url);
      return this.nodeModules.path.dirname(__filename);
    } catch {
      // Fallback for test environments
      return '';
    }
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<boolean> {
    if (this.isInitialized) return true;

    // Load Node.js modules if available
    this.nodeModules = await loadNodeModules();

    // In browser or if Node modules unavailable, use fallback
    if (!this.nodeModules) {
      this.log('Running in browser or Node modules unavailable - using sequential parsing');
      this.fallbackParser = new HoloScriptPlusParser(this.options.parserOptions);
      this.isInitialized = true;
      return true;
    }

    // Update worker count based on CPU cores
    if (this.options.workerCount === 4) {
      this.options.workerCount = this.nodeModules.cpuCount;
    }

    // Use same extension as current file for worker script (handles .ts in dev/test and .js in prod)
    let workerExt = '.js';
    try {
      const __filename = this.nodeModules.fileURLToPath(import.meta.url);
      workerExt = this.nodeModules.path.extname(__filename) || '.js';
    } catch {
      // Intentionally swallowed: fallback to .js extension if import.meta.url is unavailable
    }
    this.workerPath = this.nodeModules.path.join(this.getCurrentDir(), `ParseWorker${workerExt}`);

    try {
      this.workerPool = this.nodeModules.createWorkerPool(this.workerPath, {
        poolSize: this.options.workerCount,
        debug: this.options.debug,
      });

      await this.workerPool.initialize();
      this.isInitialized = true;
      this.log(`Initialized with ${this.options.workerCount} workers`);
      return true;
    } catch (error: unknown) {
      this.log(`Failed to initialize workers: ${(error as Error).message}`);

      if (this.options.fallbackToSequential) {
        this.log('Falling back to sequential parsing');
        this.fallbackParser = new HoloScriptPlusParser(this.options.parserOptions);
        this.isInitialized = true;
        return true;
      }

      throw error;
    }
  }

  /**
   * Pre-chunk files using HybridChunker for optimal worker distribution
   */
  private prechunkFiles(files: FileInput[]): FileInput[] {
    if (!this.hybridChunker) {
      return files;
    }

    const chunkedFiles: FileInput[] = [];

    for (const file of files) {
      const chunks = this.hybridChunker.chunk(file.content, file.path);

      // If file was split into multiple chunks, create separate FileInputs
      if (chunks.length > 1) {
        this.log(
          `Pre-chunked ${file.path} into ${chunks.length} chunks (strategy: ${chunks[0].strategy})`
        );

        for (const chunk of chunks) {
          chunkedFiles.push({
            path: `${file.path}#chunk${chunk.id}`,
            content: chunk.content,
          });
        }
      } else {
        // Single chunk, use original file
        chunkedFiles.push(file);
      }
    }

    return chunkedFiles;
  }

  /**
   * Parse multiple files in parallel
   */
  async parseFiles(files: FileInput[]): Promise<ParallelParseResult> {
    const startTime = Date.now();

    // Ensure initialized
    if (!this.isInitialized) {
      await this.initialize();
    }

    // Pre-chunk files using HybridChunker if enabled
    let processFiles = files;
    if (this.options.enableHybridChunking) {
      processFiles = this.prechunkFiles(files);
      this.log(`Hybrid chunking: ${files.length} files → ${processFiles.length} chunks`);
    }

    // Sort files by size (largest first for better load balancing)
    const sortedFiles = [...processFiles].sort((a, b) => b.content.length - a.content.length);

    // Use fallback if no worker pool
    if (!this.workerPool && this.fallbackParser) {
      return this.parseSequential(sortedFiles, startTime);
    }

    // Parse in parallel batches
    const results = new Map<string, ParseTaskResult>();
    const symbolTable = new Map<string, SymbolInfo>();
    const dependencyGraph = new Map<string, string[]>();

    let successCount = 0;
    let failCount = 0;

    // Process in batches
    for (let i = 0; i < sortedFiles.length; i += this.options.batchSize) {
      const batch = sortedFiles.slice(i, i + this.options.batchSize);
      const batchResults = await this.parseBatch(batch);

      for (const result of batchResults) {
        results.set(result.filePath, result);

        if (result.success) {
          successCount++;

          // Build symbol table
          for (const exportName of result.exports) {
            symbolTable.set(exportName, {
              name: exportName,
              type: 'export',
              sourceFile: result.filePath,
            });
          }

          // Build dependency graph
          const dependencies = result.imports.map((imp) => imp.path);
          dependencyGraph.set(result.filePath, dependencies);
        } else {
          failCount++;
        }

        // Emit progress
        if (this.options.enableProgress) {
          this.emitProgress({
            total: sortedFiles.length,
            completed: successCount + failCount,
            failed: failCount,
            currentFile: result.filePath,
            percentage: ((successCount + failCount) / sortedFiles.length) * 100,
          });
        }
      }
    }

    // Resolve cross-file references
    this.resolveReferences(results, symbolTable);

    return {
      results,
      totalTime: Date.now() - startTime,
      successCount,
      failCount,
      success: failCount === 0,
      symbolTable,
      dependencyGraph,
    };
  }

  /**
   * Parse a single file (uses worker if available)
   */
  async parseFile(file: FileInput): Promise<ParseTaskResult> {
    const results = await this.parseFiles([file]);
    return results.results.get(file.path)!;
  }

  /**
   * Get worker pool statistics
   */
  getStats(): WorkerPoolStats | null {
    return this.workerPool?.getStats() ?? null;
  }

  /**
   * Shutdown the parser and worker pool
   */
  async shutdown(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.shutdown();
      this.workerPool = null;
    }
    this.isInitialized = false;
    this.log('Parser shutdown complete');
  }

  /**
   * Parse a batch of files in parallel
   */
  private async parseBatch(files: FileInput[]): Promise<ParseTaskResult[]> {
    if (!this.workerPool) {
      throw new Error('Worker pool not initialized');
    }

    const tasks: ParseTaskData[] = files.map((file, index) => ({
      fileId: `file_${index}_${Date.now()}`,
      filePath: file.path,
      source: file.content,
      options: this.options.parserOptions,
    }));

    try {
      const results: ParseTaskResult[] = await this.workerPool.executeAll('parse', tasks);
      return results;
    } catch (error: unknown) {
      this.log(`Batch parse error: ${(error as Error).message}`);

      // Return error results for all files in batch
      return tasks.map((task) => ({
        fileId: task.fileId,
        filePath: task.filePath,
        ast: null,
        success: false,
        errors: [
          {
            message: (error as Error).message,
            line: 0,
            column: 0,
            code: 'WORKER_ERROR',
          },
        ],
        warnings: [],
        exports: [],
        imports: [],
        parseTime: 0,
      }));
    }
  }

  /**
   * Sequential fallback parsing
   */
  private parseSequential(files: FileInput[], startTime: number): ParallelParseResult {
    const results = new Map<string, ParseTaskResult>();
    const symbolTable = new Map<string, SymbolInfo>();
    const dependencyGraph = new Map<string, string[]>();

    let successCount = 0;
    let failCount = 0;

    const parser = this.fallbackParser!;

    for (const file of files) {
      const fileStartTime = Date.now();

      try {
        const parseResult = parser.parse(file.content);

        const result: ParseTaskResult = {
          fileId: `file_${Date.now()}`,
          filePath: file.path,
          ast: parseResult.ast,
          success: parseResult.success,
          errors: parseResult.errors || [],
          warnings: parseResult.warnings || [],
          exports: this.extractExports(parseResult.ast),
          imports: this.extractImports(parseResult.ast),
          parseTime: Date.now() - fileStartTime,
        };

        results.set(file.path, result);

        if (result.success) {
          successCount++;

          for (const exportName of result.exports) {
            symbolTable.set(exportName, {
              name: exportName,
              type: 'export',
              sourceFile: file.path,
            });
          }

          const dependencies = result.imports.map((imp) => imp.path);
          dependencyGraph.set(file.path, dependencies);
        } else {
          failCount++;
        }

        if (this.options.enableProgress) {
          this.emitProgress({
            total: files.length,
            completed: successCount + failCount,
            failed: failCount,
            currentFile: file.path,
            percentage: ((successCount + failCount) / files.length) * 100,
          });
        }
      } catch (error: unknown) {
        failCount++;
        results.set(file.path, {
          fileId: `file_${Date.now()}`,
          filePath: file.path,
          ast: null,
          success: false,
          errors: [
            {
              message: (error as Error).message,
              line: 0,
              column: 0,
              code: 'PARSE_CRASH',
            },
          ],
          warnings: [],
          exports: [],
          imports: [],
          parseTime: Date.now() - fileStartTime,
        });
      }
    }

    return {
      results,
      totalTime: Date.now() - startTime,
      successCount,
      failCount,
      success: failCount === 0,
      symbolTable,
      dependencyGraph,
    };
  }

  /**
   * Resolve cross-file symbol references
   */
  private resolveReferences(
    results: Map<string, ParseTaskResult>,
    symbolTable: Map<string, SymbolInfo>
  ): void {
    for (const [_filePath, result] of results) {
      if (!result.success || !result.ast) continue;

      // Check that imported symbols exist
      for (const importInfo of result.imports) {
        for (const symbol of importInfo.symbols) {
          if (!symbolTable.has(symbol)) {
            result.warnings.push({
              message: `Unresolved import: '${symbol}' from '${importInfo.path}'`,
              line: 0,
              column: 0,
              code: 'UNRESOLVED_IMPORT',
            });
          }
        }
      }
    }
  }

  /**
   * Extract exports from AST
   */
  private extractExports(ast: unknown): string[] {
    const exports: string[] = [];

    if (!ast) return exports;

    const astObj = ast as Record<string, unknown>;
    const root = (astObj.root || astObj) as Record<string, unknown>;
    const children = (root.body || root.children || []) as Record<string, unknown>[];

    for (const node of children) {
      if (node.type === 'export') {
        if (node.exports) exports.push(...(node.exports as string[]));
        const decl = node.declaration as Record<string, unknown> | undefined;
        if (decl?.name) exports.push(decl.name as string);
      }
      if (node.name && ['orb', 'template', 'composition'].includes(node.type as string)) {
        exports.push(node.name as string);
      }
    }

    return exports;
  }

  /**
   * Extract imports from AST
   */
  private extractImports(ast: unknown): Array<{ path: string; symbols: string[] }> {
    const imports: Array<{ path: string; symbols: string[] }> = [];

    if (!ast) return imports;

    const astObj = ast as Record<string, unknown>;
    const root = (astObj.root || astObj) as Record<string, unknown>;
    const children = (root.body || root.children || []) as Record<string, unknown>[];

    for (const node of children) {
      if (node.type === 'import') {
        const importInfo = {
          path: (node.modulePath || node.from) as string,
          symbols: [] as string[],
        };
        if (node.imports) importInfo.symbols.push(...(node.imports as string[]));
        if (node.defaultImport) importInfo.symbols.push(node.defaultImport as string);
        imports.push(importInfo);
      }
    }

    return imports;
  }

  /**
   * Emit progress event
   */
  private emitProgress(progress: ParseProgress): void {
    this.emit('progress', progress);
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.log(`[ParallelParser] ${message}`);
    }
  }
}

/**
 * Create a parallel parser with default options
 */
export function createParallelParser(options?: ParallelParserOptions): ParallelParser {
  return new ParallelParser(options);
}

/**
 * Convenience function to parse files in parallel
 */
export async function parseFilesParallel(
  files: FileInput[],
  options?: ParallelParserOptions
): Promise<ParallelParseResult> {
  const parser = createParallelParser(options);

  try {
    await parser.initialize();
    return await parser.parseFiles(files);
  } finally {
    await parser.shutdown();
  }
}
