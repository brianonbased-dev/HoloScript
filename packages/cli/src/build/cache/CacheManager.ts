/**
 * CacheManager
 *
 * Persistent build-artifact cache.  Each source file has an entry storing:
 *   - its content hash at last build
 *   - hashes of its dependencies at last build
 *   - the compiler version used
 *
 * A cache entry is stale when any of those values change.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { HashCalculator } from './HashCalculator';
import { DependencyTracker } from './DependencyTracker';

export interface CacheEntry {
  /** Hash of the source file at last build */
  hash: string;
  /** Map from dependency path → hash at last build */
  depHashes: Record<string, string>;
  /** Compiler version used */
  compilerVersion: string;
  /** Output file paths produced */
  outputs: string[];
  /** Unix timestamp of last build */
  buildTime: number;
}

export interface CacheManifest {
  version: string;
  compilerVersion: string;
  entries: Record<string, CacheEntry>;
  dependencies: Record<string, import('./DependencyTracker').DependencyInfo>;
}

export interface CacheStats {
  totalEntries: number;
  staleEntries: number;
  cacheDir: string;
}

export class CacheManager {
  private manifest: CacheManifest;
  private hasher = new HashCalculator();
  public readonly depTracker = new DependencyTracker();

  constructor(
    private readonly cacheDir = '.holoscript-cache',
    private readonly compilerVersion = '3.13.0',
  ) {
    this.manifest = this.emptyManifest();
  }

  private get manifestPath(): string {
    return join(this.cacheDir, 'manifest.json');
  }

  private emptyManifest(): CacheManifest {
    return {
      version: '1',
      compilerVersion: this.compilerVersion,
      entries: {},
      dependencies: {},
    };
  }

  /** Load the manifest from disk. No-ops if the cache does not exist. */
  async load(): Promise<void> {
    try {
      const raw = readFileSync(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as CacheManifest;
      // Invalidate entire cache when compiler version changes
      if (parsed.compilerVersion !== this.compilerVersion) {
        this.manifest = this.emptyManifest();
        return;
      }
      this.manifest = parsed;
      if (parsed.dependencies) {
        this.depTracker.fromJSON(parsed.dependencies);
      }
    } catch {
      this.manifest = this.emptyManifest();
    }
  }

  /** Persist the manifest to disk. */
  async save(): Promise<void> {
    mkdirSync(this.cacheDir, { recursive: true });
    this.manifest.dependencies = this.depTracker.toJSON();
    writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  /**
   * Returns true when the file needs to be rebuilt.
   * @param filePath   source file
   * @param currentHash  hash of the source file right now
   */
  isStale(filePath: string, currentHash: string): boolean {
    const entry = this.manifest.entries[filePath];
    if (!entry) return true;
    if (entry.compilerVersion !== this.compilerVersion) return true;
    return entry.hash !== currentHash;
  }

  /**
   * Returns true when any tracked dependency of `filePath` has changed.
   */
  areDependenciesStale(filePath: string): boolean {
    const entry = this.manifest.entries[filePath];
    if (!entry) return false;
    for (const [dep, savedHash] of Object.entries(entry.depHashes)) {
      const current = this.hasher.hashFile(dep);
      if (current === null || current !== savedHash) return true;
    }
    return false;
  }

  /**
   * Record a successful build for `filePath`.
   */
  update(filePath: string, hash: string, deps: string[], outputs: string[]): void {
    const depHashes: Record<string, string> = {};
    for (const dep of deps) {
      const h = this.hasher.hashFile(dep);
      if (h) depHashes[dep] = h;
      this.depTracker.addDependency(filePath, dep);
    }
    this.manifest.entries[filePath] = {
      hash,
      depHashes,
      compilerVersion: this.compilerVersion,
      outputs,
      buildTime: Date.now(),
    };
  }

  /** Remove the cache entry for `filePath`. */
  invalidate(filePath: string): void {
    delete this.manifest.entries[filePath];
    this.depTracker.removeDependencies(filePath);
  }

  /** Delete all cache files. */
  async clean(): Promise<void> {
    if (existsSync(this.cacheDir)) {
      rmSync(this.cacheDir, { recursive: true, force: true });
    }
    this.manifest = this.emptyManifest();
    this.depTracker.clear();
  }

  getStats(): CacheStats {
    const entries = Object.entries(this.manifest.entries);
    const stale = entries.filter(([fp, e]) => {
      const h = this.hasher.hashFile(fp);
      return h === null || h !== e.hash;
    });
    return {
      totalEntries: entries.length,
      staleEntries: stale.length,
      cacheDir: this.cacheDir,
    };
  }

  getManifest(): Readonly<CacheManifest> {
    return this.manifest;
  }
}
