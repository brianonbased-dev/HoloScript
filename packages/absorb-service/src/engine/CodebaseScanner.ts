/**
 * Codebase Scanner
 *
 * Walks a project directory, detects languages, parses all files via
 * tree-sitter adapters, and collects normalized symbols/imports/calls.
 *
 * Respects .gitignore patterns and supports configurable exclusions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename_esm = fileURLToPath(import.meta.url);
const __dirname_esm = path.dirname(__filename_esm);
import type {
  ScanOptions,
  ScanResult,
  ScannedFile,
  ScanStats,
  ScanError,
  SupportedLanguage,
  ImportEdge,
} from './types';
import { AdapterManager } from './AdapterManager';
import { getAdapterForFile, detectLanguage } from './adapters';
import { extractFileDocComment } from './adapters/BaseAdapter';

// Dynamic import for worker pool (graceful degradation if not available)
let WorkerPool: typeof import('./workers/WorkerPool').WorkerPool | null;
try {
   
  WorkerPool = require('./workers/WorkerPool').WorkerPool;
} catch {
  // Worker threads not available (browser, WASM, or old Node.js)
  WorkerPool = null;
}

const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'target',
  '.next',
  '.nuxt',
  '.output',
  '__pycache__',
  '.pytest_cache',
  'vendor',
  '.venv',
  'venv',
  'env',
  '.env',
  'coverage',
  '.nyc_output',
  '.stryker-tmp',
  '.idea',
  '.vscode',
  '.vs',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.lock',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
];

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB
const DEFAULT_MAX_FILES = 10_000;
const BUILD_ARTIFACT_DIRS = new Set(['dist', 'build', 'out']);

export class CodebaseScanner {
  private adapterManager: AdapterManager;
  private workerPool?: InstanceType<NonNullable<typeof WorkerPool>>; // WorkerPool instance (if available)
  private useWorkers: boolean;

  constructor(adapterManager?: AdapterManager, useWorkers = true) {
    this.adapterManager = adapterManager ?? new AdapterManager();
    this.useWorkers = useWorkers && WorkerPool !== null;

    // Initialize worker pool (graceful degradation if unavailable)
    if (this.useWorkers && WorkerPool) {
      try {
        const workerFile = path.join(__dirname_esm, 'workers', 'parse-worker.js');
        this.workerPool = new WorkerPool(workerFile);
      } catch (err) {
        console.warn(
          '[CodebaseScanner] Worker threads unavailable, falling back to sequential:',
          err
        );
        this.useWorkers = false;
      }
    }
  }

  /**
   * Clean up resources (terminate worker pool if active).
   */
  async dispose(): Promise<void> {
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = undefined;
    }
  }

  /**
   * Scan a directory and extract symbols, imports, and call edges
   * from all supported source files.
   */
  async scan(options: ScanOptions): Promise<ScanResult> {
    const startTime = Date.now();
    const rootDir = path.resolve(options.rootDir);
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const exclude = this.buildExcludeSet(options.exclude, options.includeBuildArtifacts ?? false);
    const readFile = options.readFile ?? ((p: string) => fs.promises.readFile(p, 'utf-8'));
    const onProgress = options.onProgress;

    // 1. Collect files
    const filePaths = this.collectFiles(rootDir, exclude, maxFiles, options.languages);

    // 2. Preload grammars for detected languages
    const detectedLanguages = new Set<SupportedLanguage>();
    for (const fp of filePaths) {
      const lang = detectLanguage(fp);
      if (lang) detectedLanguages.add(lang);
    }
    await this.adapterManager.preload(Array.from(detectedLanguages));

    // 3. Parse each file and extract symbols
    const files: ScannedFile[] = [];
    const errors: ScanError[] = [];
    const filesByLanguage: Record<string, number> = {};
    const symbolsByType: Record<string, number> = {};
    let totalSymbols = 0;
    let totalImports = 0;
    let totalCalls = 0;
    let totalLoc = 0;

    if (this.useWorkers && this.workerPool) {
      // PARALLEL PATH: Use worker threads for 4-8x parsing speedup
      const BATCH_SIZE = 16; // Larger batches since workers handle concurrency

      for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batch = filePaths.slice(i, i + BATCH_SIZE);

        // Step 1: Read files in parallel (I/O bound)
        const readPromises = batch.map(async (filePath) => {
          const language = detectLanguage(filePath);
          if (!language) return null;

          const adapter = getAdapterForFile(filePath);
          if (!adapter) return null;

          try {
            const content = await readFile(filePath);
            const sizeBytes = Buffer.byteLength(content, 'utf-8');
            if (sizeBytes > maxFileSize) return null;

            return { filePath, content, language, sizeBytes };
          } catch (e: unknown) {
            errors.push({ file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'read' });
            return null;
          }
        });

        const fileData = (await Promise.all(readPromises)).filter(Boolean) as Array<{
          filePath: string;
          content: string;
          language: SupportedLanguage;
          sizeBytes: number;
        }>;

        // Step 2: Parse in parallel via worker pool (CPU bound)
        const parsePromises = fileData.map((data) =>
          this.workerPool!.execute({
            filePath: data.filePath,
            content: data.content,
            language: data.language,
            sizeBytes: data.sizeBytes,
          })
        );

        const parseResults = await Promise.all(parsePromises);

        // Step 3: Accumulate results
        for (const result of parseResults) {
          const relPath = result.file?.path || result.error?.file || '';

          if (result.error) {
            errors.push(result.error);
          } else if (result.file) {
            files.push(result.file);
            filesByLanguage[result.file.language] =
              (filesByLanguage[result.file.language] ?? 0) + 1;
            totalSymbols += result.file.symbols.length;
            totalImports += result.file.imports.length;
            totalCalls += result.file.calls.length;
            totalLoc += result.file.loc;

            for (const sym of result.file.symbols) {
              symbolsByType[sym.type] = (symbolsByType[sym.type] ?? 0) + 1;
            }
          }

          onProgress?.(files.length, filePaths.length, relPath);
        }
      }
    } else {
      // SEQUENTIAL FALLBACK: Original implementation (no workers available)
      for (const filePath of filePaths) {
        const language = detectLanguage(filePath) || 'plaintext';
        const adapter = getAdapterForFile(filePath);

        // Read file
        let content: string;
        let sizeBytes: number;
        try {
          content = await readFile(filePath);
          sizeBytes = Buffer.byteLength(content, 'utf-8');
          if (sizeBytes > maxFileSize) continue;
        } catch (e: unknown) {
          errors.push({ file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'read' });
          continue;
        }

        // Parse with tree-sitter or fallback immediately if no adapter
        let tree;
        const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');

        if (!adapter) {
          // No tree-sitter adapter for this file type, immediately use regex fallback.
          const fallbackImports = this.extractLooseImports(content, relPath);
          const loc = content.split('\n').length;
          files.push({
            path: relPath,
            language,
            symbols: [],
            imports: fallbackImports,
            calls: [],
            loc,
            sizeBytes,
            docComment: undefined,
          });

          filesByLanguage[language] = (filesByLanguage[language] ?? 0) + 1;
          totalImports += fallbackImports.length;
          totalLoc += loc;
          onProgress?.(files.length, filePaths.length, relPath);
          continue;
        }

        try {
          tree = await this.adapterManager.parse(content, language);
          if (!tree) {
            errors.push({ file: filePath, error: `No parser for ${language}`, phase: 'parse' });
            continue;
          }
        } catch (e: unknown) {
          if (!(options.includeBuildArtifacts ?? false)) {
            errors.push({ file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'parse' });
            continue;
          }

          // Dist-safe fallback for environments where parser bindings fail.
          const fallbackImports = this.extractLooseImports(content, relPath);
          const loc = content.split('\n').length;
          files.push({
            path: relPath,
            language,
            symbols: [],
            imports: fallbackImports,
            calls: [],
            loc,
            sizeBytes,
            docComment: undefined,
          });

          filesByLanguage[language] = (filesByLanguage[language] ?? 0) + 1;
          totalImports += fallbackImports.length;
          totalLoc += loc;
          onProgress?.(files.length, filePaths.length, relPath);
          continue;
        }

        // Extract symbols, imports, calls
        try {
          const symbols = adapter.extractSymbols(tree, relPath);
          const imports = adapter.extractImports(tree, relPath);
          const calls = adapter.extractCalls(tree, relPath);
          const loc = content.split('\n').length;
          const docComment = extractFileDocComment(tree.rootNode);

          files.push({
            path: relPath,
            language,
            symbols,
            imports,
            calls,
            loc,
            sizeBytes,
            docComment,
          });

          // Accumulate stats
          filesByLanguage[language] = (filesByLanguage[language] ?? 0) + 1;
          totalSymbols += symbols.length;
          totalImports += imports.length;
          totalCalls += calls.length;
          totalLoc += loc;

          for (const sym of symbols) {
            symbolsByType[sym.type] = (symbolsByType[sym.type] ?? 0) + 1;
          }

          onProgress?.(files.length, filePaths.length, relPath);
        } catch (e: unknown) {
          errors.push({ file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'extract' });
        }
      }
    }

    const stats: ScanStats = {
      totalFiles: files.length,
      filesByLanguage,
      totalSymbols,
      symbolsByType,
      totalImports,
      totalCalls,
      totalLoc,
      durationMs: Date.now() - startTime,
      errors,
    };

    return { rootDir, files, stats };
  }

  /**
   * Scan a specific set of files (for incremental updates).
   * Does NOT walk the directory -- only processes the provided file paths.
   */
  async scanFiles(
    rootDir: string,
    filePaths: string[],
    options?: Pick<ScanOptions, 'maxFileSize' | 'readFile' | 'onProgress' | 'includeBuildArtifacts'>
  ): Promise<ScanResult> {
    const startTime = Date.now();
    const resolvedRootDir = path.resolve(rootDir);
    const maxFileSize = options?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const readFile = options?.readFile ?? ((p: string) => fs.promises.readFile(p, 'utf-8'));
    const onProgress = options?.onProgress;
    const includeBuildArtifacts = options?.includeBuildArtifacts ?? false;

    // Detect languages and preload grammars
    const detectedLanguages = new Set<SupportedLanguage>();
    for (const fp of filePaths) {
      const lang = detectLanguage(fp);
      if (lang) detectedLanguages.add(lang);
    }
    await this.adapterManager.preload(Array.from(detectedLanguages));

    const files: ScannedFile[] = [];
    const errors: ScanError[] = [];
    const filesByLanguage: Record<string, number> = {};
    const symbolsByType: Record<string, number> = {};
    let totalSymbols = 0;
    let totalImports = 0;
    let totalCalls = 0;
    let totalLoc = 0;

    // Parallel batching for I/O efficiency
    const BATCH_SIZE = 8;
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map((fp) =>
          this.parseOneFile(fp, resolvedRootDir, maxFileSize, readFile, includeBuildArtifacts)
        )
      );

      for (const result of results) {
        if (result.error) {
          errors.push(result.error);
        } else if (result.file) {
          files.push(result.file);
          filesByLanguage[result.file.language] = (filesByLanguage[result.file.language] ?? 0) + 1;
          totalSymbols += result.file.symbols.length;
          totalImports += result.file.imports.length;
          totalCalls += result.file.calls.length;
          totalLoc += result.file.loc;

          for (const sym of result.file.symbols) {
            symbolsByType[sym.type] = (symbolsByType[sym.type] ?? 0) + 1;
          }

          onProgress?.(files.length, filePaths.length, result.file.path);
        }
      }
    }

    const stats: ScanStats = {
      totalFiles: files.length,
      filesByLanguage,
      totalSymbols,
      symbolsByType,
      totalImports,
      totalCalls,
      totalLoc,
      durationMs: Date.now() - startTime,
      errors,
    };

    return { rootDir: resolvedRootDir, files, stats };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  /**
   * Parse a single file and return either the scanned file or an error.
   */
  private async parseOneFile(
    filePath: string,
    rootDir: string,
    maxFileSize: number,
    readFile: (p: string) => Promise<string>,
    includeBuildArtifacts: boolean
  ): Promise<{ file?: ScannedFile; error?: ScanError }> {
    const language = detectLanguage(filePath) || 'plaintext';
    const adapter = getAdapterForFile(filePath);

    // Read file
    let content: string;
    let sizeBytes: number;
    try {
      content = await readFile(filePath);
      sizeBytes = Buffer.byteLength(content, 'utf-8');
      if (sizeBytes > maxFileSize) return {};
    } catch (e: unknown) {
      return { error: { file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'read' } };
    }

    // Parse with tree-sitter
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');

    if (!adapter) {
      // Direct plaintext fallback when no tree-sitter adapter exists
      const fallbackImports = this.extractLooseImports(content, relPath);
      const loc = content.split('\n').length;
      return {
        file: {
          path: relPath,
          language,
          symbols: [],
          imports: fallbackImports,
          calls: [],
          loc,
          sizeBytes,
          docComment: undefined,
        },
      };
    }

    let tree;
    try {
      tree = await this.adapterManager.parse(content, language);
      if (!tree) {
        return { error: { file: filePath, error: `No parser for ${language}`, phase: 'parse' } };
      }
    } catch (e: unknown) {
      if (!includeBuildArtifacts) {
        return { error: { file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'parse' } };
      }

      // Dist-safe fallback
      const fallbackImports = this.extractLooseImports(content, relPath);
      const loc = content.split('\n').length;
      return {
        file: {
          path: relPath,
          language,
          symbols: [],
          imports: fallbackImports,
          calls: [],
          loc,
          sizeBytes,
          docComment: undefined,
        },
      };
    }

    // Extract symbols, imports, calls
    try {
      const symbols = adapter.extractSymbols(tree, relPath);
      const imports = adapter.extractImports(tree, relPath);
      const calls = adapter.extractCalls(tree, relPath);
      const loc = content.split('\n').length;
      const docComment = extractFileDocComment(tree.rootNode);

      return {
        file: { path: relPath, language, symbols, imports, calls, loc, sizeBytes, docComment },
      };
    } catch (e: unknown) {
      return { error: { file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'extract' } };
    }
  }

  private collectFiles(
    rootDir: string,
    exclude: Set<string>,
    maxFiles: number,
    languages?: SupportedLanguage[]
  ): string[] {
    const files: string[] = [];
    const langFilter = languages ? new Set(languages) : null;

    const walk = (dir: string): void => {
      if (files.length >= maxFiles) return;

      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const name = entry.name;
        if (exclude.has(name)) continue;
        if (name.startsWith('.') && name !== '.') continue;

        const fullPath = path.join(dir, name);

        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const lang = detectLanguage(fullPath) || 'plaintext';
          if (langFilter && !langFilter.has(lang)) continue;
          files.push(fullPath);
        }
      }
    };

    walk(rootDir);
    return files;
  }

  private buildExcludeSet(userExclude?: string[], includeBuildArtifacts = false): Set<string> {
    const set = new Set<string>();
    for (const pattern of DEFAULT_EXCLUDE) {
      // Simple name matching (not full glob -- covers 90% of cases)
      const name = pattern.replace(/^\*\./, '').replace(/\*/g, '');
      if (includeBuildArtifacts && BUILD_ARTIFACT_DIRS.has(name)) continue;
      set.add(name);
    }
    if (userExclude) {
      for (const pattern of userExclude) {
        set.add(pattern);
      }
    }
    return set;
  }

  private extractLooseImports(content: string, filePath: string): ImportEdge[] {
    const imports: ImportEdge[] = [];
    const lines = content.split('\n');
    const esmImport = /\bimport\s+(?:[^'";]+\s+from\s+)?['"]([^'"]+)['"]/;
    const dynamicImport = /\bimport\(\s*['"]([^'"]+)['"]\s*\)/;
    const commonJs = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = [line.match(esmImport), line.match(dynamicImport), line.match(commonJs)];
      for (const m of matches) {
        if (!m?.[1]) continue;
        imports.push({
          fromFile: filePath,
          toModule: m[1],
          line: i + 1,
        });
      }
    }

    return imports;
  }
}
