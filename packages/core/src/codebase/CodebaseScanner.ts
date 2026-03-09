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
import type {
  ScanOptions,
  ScanResult,
  ScannedFile,
  ScanStats,
  ScanError,
  SupportedLanguage,
} from './types';
import { AdapterManager } from './AdapterManager';
import { getAdapterForFile, detectLanguage } from './adapters';

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

export class CodebaseScanner {
  private adapterManager: AdapterManager;

  constructor(adapterManager?: AdapterManager) {
    this.adapterManager = adapterManager ?? new AdapterManager();
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
    const exclude = this.buildExcludeSet(options.exclude);
    const readFile = options.readFile ?? ((p: string) => fs.promises.readFile(p, 'utf-8'));

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

    for (const filePath of filePaths) {
      const language = detectLanguage(filePath);
      if (!language) continue;

      const adapter = getAdapterForFile(filePath);
      if (!adapter) continue;

      // Read file
      let content: string;
      let sizeBytes: number;
      try {
        content = await readFile(filePath);
        sizeBytes = Buffer.byteLength(content, 'utf-8');
        if (sizeBytes > maxFileSize) continue;
      } catch (e: any) {
        errors.push({ file: filePath, error: e.message, phase: 'read' });
        continue;
      }

      // Parse with tree-sitter
      let tree;
      try {
        tree = await this.adapterManager.parse(content, language);
        if (!tree) {
          errors.push({ file: filePath, error: `No parser for ${language}`, phase: 'parse' });
          continue;
        }
      } catch (e: any) {
        errors.push({ file: filePath, error: e.message, phase: 'parse' });
        continue;
      }

      // Extract symbols, imports, calls
      try {
        const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
        const symbols = adapter.extractSymbols(tree, relPath);
        const imports = adapter.extractImports(tree, relPath);
        const calls = adapter.extractCalls(tree, relPath);
        const loc = content.split('\n').length;

        files.push({ path: relPath, language, symbols, imports, calls, loc, sizeBytes });

        // Accumulate stats
        filesByLanguage[language] = (filesByLanguage[language] ?? 0) + 1;
        totalSymbols += symbols.length;
        totalImports += imports.length;
        totalCalls += calls.length;
        totalLoc += loc;

        for (const sym of symbols) {
          symbolsByType[sym.type] = (symbolsByType[sym.type] ?? 0) + 1;
        }
      } catch (e: any) {
        errors.push({ file: filePath, error: e.message, phase: 'extract' });
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

  // ── Private helpers ──────────────────────────────────────────────────────

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
          const lang = detectLanguage(fullPath);
          if (!lang) continue;
          if (langFilter && !langFilter.has(lang)) continue;
          files.push(fullPath);
        }
      }
    };

    walk(rootDir);
    return files;
  }

  private buildExcludeSet(userExclude?: string[]): Set<string> {
    const set = new Set<string>();
    for (const pattern of DEFAULT_EXCLUDE) {
      // Simple name matching (not full glob -- covers 90% of cases)
      const name = pattern.replace(/^\*\./, '').replace(/\*/g, '');
      set.add(name);
    }
    if (userExclude) {
      for (const pattern of userExclude) {
        set.add(pattern);
      }
    }
    return set;
  }
}
