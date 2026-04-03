/**
 * ParseWorker - Worker thread for parallel file parsing
 *
 * This module runs in a separate thread and handles parsing tasks.
 * It communicates with the main thread via message passing.
 *
 * @version 1.0.0
 */

import { parentPort, workerData, isMainThread } from 'worker_threads';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import type { HSPlusParserOptions } from '../types/AdvancedTypeSystem';

// Prevent running in main thread
if (isMainThread) {
  throw new Error('ParseWorker must be run in a worker thread');
}

export interface ParseTaskData {
  /** Unique file identifier */
  fileId: string;
  /** File path (for error reporting) */
  filePath: string;
  /** Source code content */
  source: string;
  /** Parser options */
  options?: HSPlusParserOptions;
}

export interface ParseTaskResult {
  /** Unique file identifier */
  fileId: string;
  /** File path */
  filePath: string;
  /** Parsed AST */
  ast: any;
  /** Whether parsing was successful */
  success: boolean;
  /** Parse errors */
  errors: any[];
  /** Parse warnings */
  warnings: any[];
  /** Symbols exported from this file */
  exports: string[];
  /** Symbols imported by this file */
  imports: Array<{ path: string; symbols: string[] }>;
  /** Parse time in milliseconds */
  parseTime: number;
}

interface WorkerMessage {
  taskId: string;
  type: string;
  data: any;
}

/**
 * Parse Worker instance
 * Handles incoming parse tasks and returns results
 */
class ParseWorkerInstance {
  private parser: HoloScriptPlusParser;
  private defaultOptions: HSPlusParserOptions;

  constructor(options?: HSPlusParserOptions) {
    this.defaultOptions = options || {};
    this.parser = new HoloScriptPlusParser(this.defaultOptions);
  }

  /**
   * Process a parse task
   */
  processTask(data: ParseTaskData): ParseTaskResult {
    const startTime = Date.now();

    try {
      // Create parser with task-specific options
      const options = { ...this.defaultOptions, ...data.options };
      const parser = new HoloScriptPlusParser(options);

      const result = parser.parse(data.source);

      return {
        fileId: data.fileId,
        filePath: data.filePath,
        ast: result.ast,
        success: result.success,
        errors: result.errors || [],
        warnings: result.warnings || [],
        exports: this.extractExports(result.ast),
        imports: this.extractImports(result.ast),
        parseTime: Date.now() - startTime,
      };
    } catch (error: unknown) {
      return {
        fileId: data.fileId,
        filePath: data.filePath,
        ast: null,
        success: false,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
            line: 0,
            column: 0,
            code: 'PARSE_CRASH',
          },
        ],
        warnings: [],
        exports: [],
        imports: [],
        parseTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Extract exported symbols from AST
   */
  private extractExports(ast: any): string[] {
    const exports: string[] = [];

    if (!ast) return exports;

    const root = ast.root || ast;
    const children = root.body || root.children || [];

    for (const node of children) {
      // Export statements
      if (node.type === 'export') {
        if (node.exports) {
          exports.push(...node.exports);
        }
        if (node.declaration?.name) {
          exports.push(node.declaration.name);
        }
      }

      // Top-level named declarations are implicit exports
      if (node.name && ['orb', 'template', 'composition'].includes(node.type)) {
        exports.push(node.name);
      }
    }

    return exports;
  }

  /**
   * Extract imported symbols from AST
   */
  private extractImports(ast: any): Array<{ path: string; symbols: string[] }> {
    const imports: Array<{ path: string; symbols: string[] }> = [];

    if (!ast) return imports;

    const root = ast.root || ast;
    const children = root.body || root.children || [];

    for (const node of children) {
      if (node.type === 'import') {
        const importInfo: { path: string; symbols: string[] } = {
          path: node.modulePath || node.from,
          symbols: [],
        };

        if (node.imports) {
          importInfo.symbols.push(...node.imports);
        }
        if (node.defaultImport) {
          importInfo.symbols.push(node.defaultImport);
        }

        imports.push(importInfo);
      }
    }

    return imports;
  }

  /**
   * Handle shutdown request
   */
  shutdown(): void {
    // Cleanup if needed
    process.exit(0);
  }
}

// Initialize worker instance
const workerInstance = new ParseWorkerInstance(workerData?.options);

// Handle messages from main thread
parentPort?.on('message', (message: WorkerMessage) => {
  if (message.type === 'shutdown') {
    workerInstance.shutdown();
    return;
  }

  if (message.type === 'parse') {
    try {
      const result = workerInstance.processTask(message.data as ParseTaskData);
      parentPort?.postMessage({
        taskId: message.taskId,
        result,
      });
    } catch (error: unknown) {
      parentPort?.postMessage({
        taskId: message.taskId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});

// Signal ready
parentPort?.postMessage({ type: 'ready' });

export { ParseWorkerInstance };
