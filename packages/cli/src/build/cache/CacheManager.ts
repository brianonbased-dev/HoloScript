import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { HashCalculator } from './HashCalculator';
import { DependencyTracker } from './DependencyTracker';

export interface CacheEntry {
  hash: string;
  depHashes: Record<string, string>;
  compilerVersion: string;
  outputs: string[];
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
    private readonly compilerVersion = '3.13.0'
  ) {
    this.manifest = this.emptyManifest();
  }

  private get manifestPath(): string {
    return join(this.cacheDir, 'manifest.json');
  }

  private emptyManifest(): CacheManifest {
    return { version: '1', compilerVersion: this.compilerVersion, entries: {}, dependencies: {} };
  }

  async load(): Promise<void> {
    try {
      const raw = readFileSync(this.manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as CacheManifest;
      if (parsed.compilerVersion !== this.compilerVersion) {
        this.manifest = this.emptyManifest();
        return;
      }
      this.manifest = parsed;
      if (parsed.dependencies) this.depTracker.fromJSON(parsed.dependencies);
    } catch {
      this.manifest = this.emptyManifest();
    }
  }

  async save(): Promise<void> {
    mkdirSync(this.cacheDir, { recursive: true });
    this.manifest.dependencies = this.depTracker.toJSON();
    writeFileSync(this.manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  isStale(filePath: string, currentHash: string): boolean {
    const entry = this.manifest.entries[filePath];
    if (!entry) return true;
    if (entry.compilerVersion !== this.compilerVersion) return true;
    return entry.hash !== currentHash;
  }

  areDependenciesStale(filePath: string): boolean {
    const entry = this.manifest.entries[filePath];
    if (!entry) return false;
    for (const [dep, savedHash] of Object.entries(entry.depHashes)) {
      const current = this.hasher.hashFile(dep);
      if (current === null || current !== savedHash) return true;
    }
    return false;
  }

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

  invalidate(filePath: string): void {
    delete this.manifest.entries[filePath];
    this.depTracker.removeDependencies(filePath);
  }

  async clean(): Promise<void> {
    if (existsSync(this.cacheDir)) rmSync(this.cacheDir, { recursive: true, force: true });
    this.manifest = this.emptyManifest();
    this.depTracker.clear();
  }

  getStats(): CacheStats {
    const entries = Object.entries(this.manifest.entries);
    const stale = entries.filter(([fp, e]) => {
      const h = this.hasher.hashFile(fp);
      return h === null || h !== e.hash;
    });
    return { totalEntries: entries.length, staleEntries: stale.length, cacheDir: this.cacheDir };
  }

  getManifest(): Readonly<CacheManifest> {
    return this.manifest;
  }
}
