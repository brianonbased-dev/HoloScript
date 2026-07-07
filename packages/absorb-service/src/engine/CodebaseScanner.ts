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
  WorkerParseJobResult,
  ScanWorkerPayload,
} from './types';
import { toScanWorkerPayload } from './types';
import { AdapterManager } from './AdapterManager';
import { getAdapterForFile, detectLanguage } from './adapters';
import { extractFileDocComment } from './adapters/BaseAdapter';
import { isNativeAdapter, type HoloAdapter } from './adapters/HoloAdapter';
import { WorkerPool } from './workers/WorkerPool';

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
const DEFAULT_SCAN_MODULE_BATCH_SIZE = 500;
const BUILD_ARTIFACT_DIRS = new Set(['dist', 'build', 'out']);

function resolveParseWorkerFile(): string | null {
  const currentExt = path.extname(__filename_esm).toLowerCase();
  const extensions =
    currentExt === '.cjs'
      ? ['.cjs', '.js', '.ts']
      : currentExt === '.ts'
        ? ['.ts', '.js', '.cjs']
        : ['.js', '.cjs', '.ts'];
  const directories =
    currentExt === '.ts'
      ? [
          path.join(__dirname_esm, 'workers'),
          path.join(__dirname_esm, '..', '..', 'dist', 'workers'),
          path.join(__dirname_esm, '..', 'workers'),
        ]
      : [path.join(__dirname_esm, 'workers'), path.join(__dirname_esm, '..', 'workers')];

  for (const ext of extensions) {
    for (const dir of directories) {
      const candidate = path.join(dir, `parse-worker${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

// Binary/asset extensions skipped during file discovery — they can't be absorbed and in
// asset-heavy example dirs would flood the candidate pool and truncate discovery before
// source packages are reached (fair-coverage fix, 2026-07-03).
const NON_ABSORBABLE_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'tif',
  'tiff',
  'avif',
  'heic',
  'mp4',
  'mov',
  'avi',
  'webm',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'aac',
  'm4a',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
  'zip',
  'tar',
  'gz',
  'tgz',
  'bz2',
  'xz',
  'rar',
  '7z',
  'pdf',
  'glb',
  'gltf',
  'fbx',
  'obj',
  'stl',
  'ply',
  'usdz',
  'draco',
  'ktx2',
  'basis',
  'bin',
  'wasm',
  'exe',
  'dll',
  'so',
  'dylib',
  'node',
  'map',
  'onnx',
  'safetensors',
  'gguf',
  'pt',
  'pth',
  'ckpt',
  'npy',
  'npz',
  'parquet',
  'lock',
  'woff',
  'ds_store',
]);

export interface PlannedScanBatch {
  /** 1-based batch index for operator-facing progress. */
  index: number;
  label: string;
  files: string[];
}

export interface ScanPlan {
  rootDir: string;
  rootDirs: string[];
  totalFiles: number;
  batchSize: number;
  batches: PlannedScanBatch[];
}

export interface ScanInBatchesOptions extends ScanOptions {
  /** Maximum files per module batch. Defaults to a bounded monorepo-safe chunk. */
  scanBatchSize?: number;
  /** Precomputed plan from planScan(), avoiding a second discovery walk. */
  scanPlan?: ScanPlan;
  onBatchStart?: (batch: PlannedScanBatch, totalBatches: number) => void;
  onBatchComplete?: (batch: PlannedScanBatch, result: ScanResult, totalBatches: number) => void;
}

export class CodebaseScanner {
  private adapterManager: AdapterManager;
  private workerPool?: WorkerPool; // WorkerPool instance (if available)
  private useWorkers: boolean;

  constructor(adapterManager?: AdapterManager, useWorkers = true) {
    this.adapterManager = adapterManager ?? new AdapterManager();
    this.useWorkers = useWorkers;

    // Initialize worker pool (graceful degradation if unavailable)
    if (this.useWorkers) {
      try {
        const workerFile = resolveParseWorkerFile();
        if (!workerFile) {
          this.useWorkers = false;
          return;
        }
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
    const rootDirsRaw = options.rootDirs ?? (options.rootDir ? [options.rootDir] : []);
    if (rootDirsRaw.length === 0) throw new Error('No rootDir or rootDirs provided to scan');
    const rootDirs = rootDirsRaw.map((r) => path.resolve(r));
    const rootDir = rootDirs[0]; // Primary root for relative path normalization
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const exclude = this.buildExcludeSet(options.exclude, options.includeBuildArtifacts ?? false);
    const readFile = options.readFile ?? ((p: string) => fs.promises.readFile(p, 'utf-8'));
    const onProgress = options.onProgress;

    // 1. Collect files
    const filePathsSet = new Set<string>();
    for (const rDir of rootDirs) {
      if (filePathsSet.size >= maxFiles) break;
      const paths = this.collectFiles(
        rDir,
        exclude,
        maxFiles - filePathsSet.size,
        options.languages,
        maxFileSize
      );
      for (const p of paths) filePathsSet.add(p);
    }
    const filePaths = Array.from(filePathsSet);

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
      const BATCH_SIZE = 16;
      for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batch = filePaths.slice(i, i + BATCH_SIZE);
        const parseResults = await this.parseBatchWithWorkers(
          batch,
          rootDir,
          maxFileSize,
          readFile
        );

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
          errors.push({
            file: filePath,
            error: e instanceof Error ? e.message : String(e),
            phase: 'read',
          });
          continue;
        }

        // Native adapters (HoloScript) bypass tree-sitter entirely.
        if (isNativeAdapter(adapter)) {
          const payload = await this.parseNativeAdapter(
            filePath,
            rootDir,
            content,
            language,
            sizeBytes
          );
          if (payload.error) {
            errors.push(payload.error);
          } else if (payload.file) {
            files.push(payload.file);
            filesByLanguage[payload.file.language] =
              (filesByLanguage[payload.file.language] ?? 0) + 1;
            totalSymbols += payload.file.symbols.length;
            totalImports += payload.file.imports.length;
            totalCalls += payload.file.calls.length;
            totalLoc += payload.file.loc;
            for (const sym of payload.file.symbols) {
              symbolsByType[sym.type] = (symbolsByType[sym.type] ?? 0) + 1;
            }
            onProgress?.(files.length, filePaths.length, payload.file.path);
          }
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
            errors.push({
              file: filePath,
              error: e instanceof Error ? e.message : String(e),
              phase: 'parse',
            });
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

        // Extract symbols, imports, calls, and HoloGraph event sites
        try {
          const symbols = adapter.extractSymbols(tree, relPath);
          const imports = adapter.extractImports(tree, relPath);
          const calls = adapter.extractCalls(tree, relPath);
          // Optional: extractEmitSites / extractListenSites (HoloGraph Phase 1)
          const emitSites = adapter.extractEmitSites?.(tree, relPath);
          const listenSites = adapter.extractListenSites?.(tree, relPath);
          const loc = content.split('\n').length;
          const docComment = extractFileDocComment(tree.rootNode);

          files.push({
            path: relPath,
            language,
            symbols,
            imports,
            calls,
            ...(emitSites && emitSites.length > 0 ? { emitSites } : {}),
            ...(listenSites && listenSites.length > 0 ? { listenSites } : {}),
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
          errors.push({
            file: filePath,
            error: e instanceof Error ? e.message : String(e),
            phase: 'extract',
          });
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

    return { rootDir, rootDirs, files, stats };
  }

  /**
   * Build a deterministic module-aware scan plan without parsing files.
   *
   * Monorepos like HoloScript should not be treated as one anonymous file list:
   * batches keep package/service boundaries visible while preserving the same
   * fair file selection used by `scan()`.
   */
  planScan(options: ScanOptions, scanBatchSize?: number): ScanPlan {
    const rootDirsRaw = options.rootDirs ?? (options.rootDir ? [options.rootDir] : []);
    if (rootDirsRaw.length === 0) throw new Error('No rootDir or rootDirs provided to scan');

    const rootDirs = rootDirsRaw.map((r) => path.resolve(r));
    const rootDir = rootDirs[0];
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
    const exclude = this.buildExcludeSet(options.exclude, options.includeBuildArtifacts ?? false);
    const batchSize = this.normalizeScanBatchSize(scanBatchSize);

    const filePathsSet = new Set<string>();
    for (const rDir of rootDirs) {
      if (filePathsSet.size >= maxFiles) break;
      const paths = this.collectFiles(
        rDir,
        exclude,
        maxFiles - filePathsSet.size,
        options.languages,
        maxFileSize
      );
      for (const p of paths) filePathsSet.add(p);
    }

    const filePaths = Array.from(filePathsSet);
    const groups = new Map<string, string[]>();
    for (const filePath of filePaths) {
      const label = this.scanModuleLabel(rootDir, filePath);
      let group = groups.get(label);
      if (!group) {
        group = [];
        groups.set(label, group);
      }
      group.push(filePath);
    }

    const batches: PlannedScanBatch[] = [];
    for (const [label, files] of groups) {
      for (let i = 0; i < files.length; i += batchSize) {
        const chunk = files.slice(i, i + batchSize);
        const chunkCount = Math.ceil(files.length / batchSize);
        const chunkIndex = Math.floor(i / batchSize) + 1;
        batches.push({
          index: batches.length + 1,
          label: chunkCount > 1 ? `${label} (${chunkIndex}/${chunkCount})` : label,
          files: chunk,
        });
      }
    }

    return { rootDir, rootDirs, totalFiles: filePaths.length, batchSize, batches };
  }

  /**
   * Scan a repo through module-sized batches, then merge into the canonical
   * ScanResult shape expected by CodebaseGraph and GraphRAG.
   */
  async scanInBatches(options: ScanInBatchesOptions): Promise<ScanResult> {
    const startTime = Date.now();
    const plan = options.scanPlan ?? this.planScan(options, options.scanBatchSize);
    const files: ScannedFile[] = [];
    const errors: ScanError[] = [];
    const filesByLanguage: Record<string, number> = {};
    const symbolsByType: Record<string, number> = {};
    let totalSymbols = 0;
    let totalImports = 0;
    let totalCalls = 0;
    let totalLoc = 0;
    let completedCandidateFiles = 0;

    for (const batch of plan.batches) {
      options.onBatchStart?.(batch, plan.batches.length);
      const batchResult = await this.scanFiles(plan.rootDir, batch.files, {
        includeBuildArtifacts: options.includeBuildArtifacts,
        maxFileSize: options.maxFileSize,
        readFile: options.readFile,
        onProgress: (processed, _total, file) => {
          options.onProgress?.(
            Math.min(completedCandidateFiles + processed, plan.totalFiles),
            plan.totalFiles,
            file
          );
        },
      });

      files.push(...batchResult.files);
      errors.push(...batchResult.stats.errors);
      totalSymbols += batchResult.stats.totalSymbols;
      totalImports += batchResult.stats.totalImports;
      totalCalls += batchResult.stats.totalCalls;
      totalLoc += batchResult.stats.totalLoc;

      for (const [language, count] of Object.entries(batchResult.stats.filesByLanguage)) {
        filesByLanguage[language] = (filesByLanguage[language] ?? 0) + count;
      }
      for (const [type, count] of Object.entries(batchResult.stats.symbolsByType)) {
        symbolsByType[type] = (symbolsByType[type] ?? 0) + count;
      }

      completedCandidateFiles += batch.files.length;
      options.onBatchComplete?.(batch, batchResult, plan.batches.length);
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

    return { rootDir: plan.rootDir, rootDirs: plan.rootDirs, files, stats };
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
    const accumulateResult = (result: ScanWorkerPayload): void => {
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
    };

    if (this.useWorkers && this.workerPool) {
      const BATCH_SIZE = 16;
      for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
        const batch = filePaths.slice(i, i + BATCH_SIZE);
        const parseResults = await this.parseBatchWithWorkers(
          batch,
          resolvedRootDir,
          maxFileSize,
          readFile
        );

        for (const result of parseResults) {
          accumulateResult(result);
        }
      }
    } else {
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
          accumulateResult(result);
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

    return { rootDir: resolvedRootDir, rootDirs: [resolvedRootDir], files, stats };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async parseBatchWithWorkers(
    filePaths: string[],
    rootDir: string,
    maxFileSize: number,
    readFile: (p: string) => Promise<string>
  ): Promise<ScanWorkerPayload[]> {
    const workerPool = this.workerPool;
    if (!workerPool) return [];

    const resolvedRootDir = path.resolve(rootDir);
    const readResults = await Promise.all(
      filePaths.map(async (filePath) => {
        const language = detectLanguage(filePath) || 'plaintext';
        const adapter = getAdapterForFile(filePath);

        try {
          const content = await readFile(filePath);
          const sizeBytes = Buffer.byteLength(content, 'utf-8');
          if (sizeBytes > maxFileSize) return null;

          return { filePath, content, language, sizeBytes, adapter };
        } catch (e: unknown) {
          return {
            error: {
              file: filePath,
              error: e instanceof Error ? e.message : String(e),
              phase: 'read' as const,
            },
          };
        }
      })
    );

    const parsePromises: Array<Promise<ScanWorkerPayload>> = [];
    const results: ScanWorkerPayload[] = [];

    for (const item of readResults) {
      if (!item) continue;
      if ('error' in item) {
        results.push({ error: item.error });
        continue;
      }

      const relPath = path.relative(resolvedRootDir, item.filePath).replace(/\\/g, '/');
      if (!item.adapter) {
        const fallbackImports = this.extractLooseImports(item.content, relPath);
        results.push({
          file: {
            path: relPath,
            language: item.language,
            symbols: [],
            imports: fallbackImports,
            calls: [],
            loc: item.content.split('\n').length,
            sizeBytes: item.sizeBytes,
            docComment: undefined,
          },
        });
        continue;
      }

      parsePromises.push(
        workerPool
          .execute<WorkerParseJobResult>({
            filePath: relPath,
            content: item.content,
            language: item.language,
            sizeBytes: item.sizeBytes,
          })
          .then(toScanWorkerPayload)
          .catch(
            (e: unknown): ScanWorkerPayload => ({
              error: {
                file: relPath,
                error: e instanceof Error ? e.message : String(e),
                phase: 'parse',
              },
            })
          )
      );
    }

    return [...(await Promise.all(parsePromises)), ...results];
  }

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
      return {
        error: { file: filePath, error: e instanceof Error ? e.message : String(e), phase: 'read' },
      };
    }

    // Native adapters (HoloScript) bypass tree-sitter entirely.
    if (isNativeAdapter(adapter)) {
      return this.parseNativeAdapter(filePath, rootDir, content, language, sizeBytes);
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
        return {
          error: {
            file: filePath,
            error: e instanceof Error ? e.message : String(e),
            phase: 'parse',
          },
        };
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
      return {
        error: {
          file: filePath,
          error: e instanceof Error ? e.message : String(e),
          phase: 'extract',
        },
      };
    }
  }

  /**
   * Parse a file using a "native" LanguageAdapter that bypasses tree-sitter
   * (currently only HoloAdapter for `.holo`/`.hsplus`). Falls back to the
   * regex import scan when the native parser cannot be loaded (e.g.
   * `@holoscript/core` missing at runtime).
   */
  private async parseNativeAdapter(
    filePath: string,
    rootDir: string,
    content: string,
    language: SupportedLanguage,
    sizeBytes: number
  ): Promise<{ file?: ScannedFile; error?: ScanError }> {
    const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
    const adapter = getAdapterForFile(filePath);
    const loc = content.split('\n').length;

    if (!isNativeAdapter(adapter)) {
      // Defensive: treat as plaintext regex fallback
      const fallbackImports = this.extractLooseImports(content, relPath);
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

    let tree: Awaited<ReturnType<HoloAdapter['parse']>> = null;
    try {
      tree = await adapter.parse(content, filePath);
    } catch (e: unknown) {
      return {
        error: {
          file: filePath,
          error: e instanceof Error ? e.message : String(e),
          phase: 'parse',
        },
      };
    }

    if (!tree) {
      // `@holoscript/core` unavailable — degrade gracefully to the regex
      // import scan so we still emit an edge for `.holo` files that
      // `import "./x.hsplus"` (avoids losing the whole file silently).
      const fallbackImports = this.extractLooseImports(content, relPath);
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

    try {
      const symbols = adapter.extractSymbols(tree, relPath);
      const imports = adapter.extractImports(tree, relPath);
      const calls = adapter.extractCalls(tree, relPath);
      return {
        file: {
          path: relPath,
          language,
          symbols,
          imports,
          calls,
          loc,
          sizeBytes,
          docComment: undefined,
        },
      };
    } catch (e: unknown) {
      return {
        error: {
          file: filePath,
          error: e instanceof Error ? e.message : String(e),
          phase: 'extract',
        },
      };
    }
  }

  private collectFiles(
    rootDir: string,
    exclude: Set<string>,
    maxFiles: number,
    languages?: SupportedLanguage[],
    maxFileSize = DEFAULT_MAX_FILE_SIZE
  ): string[] {
    const langFilter = languages ? new Set(languages) : null;

    // Phase 1 — DISCOVER candidate paths. Skip binary/asset files (they can't be absorbed and,
    // in asset-heavy example dirs, would flood the pool and truncate discovery before packages/
    // is reached). A high ceiling then only guards truly pathological repos.
    const HARD = Math.max(maxFiles * 20, 120000);
    const all: string[] = [];
    const walk = (dir: string): void => {
      if (all.length >= HARD) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (all.length >= HARD) break;
        const name = entry.name;
        if (exclude.has(name)) continue;
        if (name.startsWith('.') && name !== '.') continue;
        const fullPath = path.join(dir, name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          const dot = name.lastIndexOf('.');
          const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
          if (NON_ABSORBABLE_EXT.has(ext)) continue;
          try {
            if (fs.statSync(fullPath).size > maxFileSize) continue;
          } catch {
            continue;
          }
          const lang = detectLanguage(fullPath) || 'plaintext';
          if (langFilter && !langFilter.has(lang)) continue;
          all.push(fullPath);
        }
      }
    };
    walk(rootDir);
    if (all.length <= maxFiles) return all;

    // Phase 2 — FAIR selection. A plain depth-first cap lets whatever directory sorts first
    // (e.g. examples/) exhaust the whole budget before packages/ is ever reached. Group by a
    // coverage key (each monorepo PACKAGE is its own group) and round-robin WITHIN priority
    // tiers so source is covered before examples/docs/fixtures and no single package dominates.
    const CONTAINERS = new Set(['packages', 'apps', 'libs', 'lib', 'modules', 'plugins']);
    const keyOf = (fp: string): string => {
      const segs = path.relative(rootDir, fp).split(path.sep);
      if (segs.length > 1 && CONTAINERS.has(segs[0].toLowerCase())) return `${segs[0]}/${segs[1]}`;
      return segs[0] || '.';
    };
    const SOURCE =
      /(^|[\/\\])(packages|apps?|libs?|src|engine|core|services?|modules|plugins)([\/\\]|$)/i;
    const CHAFF =
      /(^|[\/\\])(examples?|experiments?|demos?|samples?|fixtures?|__fixtures__|docs?|archive|benchmarks?|stress-tests?)([\/\\]|$)/i;
    const tierOf = (key: string): number => (CHAFF.test(key) ? 2 : SOURCE.test(key) ? 0 : 1);

    const groups = new Map<string, string[]>();
    for (const fp of all) {
      const k = keyOf(fp);
      let arr = groups.get(k);
      if (!arr) {
        arr = [];
        groups.set(k, arr);
      }
      arr.push(fp);
    }
    const selected: string[] = [];
    for (const tier of [0, 1, 2]) {
      const tierGroups = [...groups.entries()]
        .filter(([k]) => tierOf(k) === tier)
        .map(([, arr]) => arr);
      let progressed = true;
      while (selected.length < maxFiles && progressed) {
        progressed = false;
        for (const arr of tierGroups) {
          if (selected.length >= maxFiles) break;
          const next = arr.shift();
          if (next !== undefined) {
            selected.push(next);
            progressed = true;
          }
        }
      }
      if (selected.length >= maxFiles) break;
    }
    return selected;
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

  private normalizeScanBatchSize(value?: number): number {
    if (!Number.isFinite(value ?? DEFAULT_SCAN_MODULE_BATCH_SIZE)) {
      return DEFAULT_SCAN_MODULE_BATCH_SIZE;
    }
    return Math.max(1, Math.floor(value ?? DEFAULT_SCAN_MODULE_BATCH_SIZE));
  }

  private scanModuleLabel(rootDir: string, filePath: string): string {
    const relative = path.relative(rootDir, filePath);
    const segments = relative.split(path.sep).filter(Boolean);
    const first = segments[0];
    const second = segments[1];
    const containers = new Set([
      'packages',
      'apps',
      'services',
      'libs',
      'lib',
      'modules',
      'plugins',
    ]);

    if (!first) return '.';
    if (first === '..') {
      const parentName = path.basename(path.dirname(filePath));
      return parentName ? `external/${parentName}` : 'external';
    }
    if (second && containers.has(first.toLowerCase())) return `${first}/${second}`;
    return first;
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
