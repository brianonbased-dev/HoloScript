/**
 * Parse Worker — Tree-Sitter Parsing in Worker Thread
 *
 * Executes CPU-bound tree-sitter parsing in a separate thread.
 * Each worker maintains its own AdapterManager instance for thread safety.
 *
 * Message protocol:
 *   IN:  { jobId, filePath, content, language, sizeBytes }
 *   OUT: { jobId, file?: ScannedFile, error?: ParseError }
 *
 * Usage: Spawned by WorkerPool, receives parse jobs via postMessage.
 */

import { parentPort } from 'worker_threads';
import { AdapterManager } from '../AdapterManager';
import { getAdapterForFile } from '../adapters';
import type { SupportedLanguage, ScannedFile } from '../types';

interface ParseJob {
  jobId: string;
  filePath: string;
  content: string;
  language: SupportedLanguage;
  sizeBytes: number;
}

interface ParseResult {
  jobId: string;
  file?: ScannedFile;
  error?: {
    file: string;
    phase: string;
    message: string;
  };
}

// Initialize AdapterManager for this worker thread
const adapterManager = new AdapterManager();

parentPort?.on('message', async (job: ParseJob) => {
  const { jobId, filePath, content, language, sizeBytes } = job;

  try {
    // Get adapter for this file type
    const adapter = getAdapterForFile(filePath);
    if (!adapter) {
      parentPort?.postMessage({
        jobId,
        error: {
          file: filePath,
          phase: 'adapter',
          message: 'No adapter found for file type',
        },
      } as ParseResult);
      return;
    }

    // Parse with tree-sitter
    const tree = await adapterManager.parse(content, language);
    if (!tree) {
      parentPort?.postMessage({
        jobId,
        error: {
          file: filePath,
          phase: 'parse',
          message: 'Parser returned null (grammar not available)',
        },
      } as ParseResult);
      return;
    }

    // Extract symbols, imports, calls
    const symbols = adapter.extractSymbols(tree, filePath);
    const imports = adapter.extractImports(tree, filePath);
    const calls = adapter.extractCalls(tree, filePath);
    const loc = content.split('\n').length;

    // Send result back to main thread
    parentPort?.postMessage({
      jobId,
      file: {
        path: filePath,
        language,
        symbols,
        imports,
        calls,
        loc,
        sizeBytes,
      },
    } as ParseResult);
  } catch (err) {
    parentPort?.postMessage({
      jobId,
      error: {
        file: filePath,
        phase: 'extract',
        message: err instanceof Error ? err.message : String(err),
      },
    } as ParseResult);
  }
});

// Send ready signal to pool manager
parentPort?.postMessage({ type: 'ready' });
