/**
 * BuildCache - Persistent disk-based build caching system
 *
 * Sprint 4 Priority 3: Build Caching
 *
 * Features:
 * - Content-addressable storage (hash-based)
 * - File modification time tracking
 * - Cross-session persistence
 * - Cache invalidation strategies
 * - Compression support
 * - Cache size management (LRU eviction)
 *
 * @version 1.0.0
 */

import { createHash } from 'crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  statSync,
} from 'fs';
import { join } from 'path';
import { deflateSync, inflateSync } from 'node:zlib';

/**
 * Cache entry types
 */
export type CacheEntryType = 'ast' | 'compiled' | 'bundle' | 'sourcemap' | 'metadata';

/**
 * Cache entry metadata
 */
export interface CacheEntryMeta {
  type: CacheEntryType;
  sourceHash: string;
  sourcePath: string;
  sourceModifiedTime: number;
  createdAt: number;
  accessedAt: number;
  accessCount: number;
  size: number;
  compressed: boolean;
  version: string;
  dependencies?: string[];
  tags?: string[];
}

/**
 * Cache entry with data
 */
export interface CacheEntry<T = unknown> {
  meta: CacheEntryMeta;
  data: T;
}

/**
 * Cache lookup result
 */
export interface CacheLookupResult<T = unknown> {
  hit: boolean;
  entry?: CacheEntry<T>;
  reason?: 'not_found' | 'stale' | 'version_mismatch' | 'corrupted';
}

/**
 * Build cache options
 */
export interface BuildCacheOptions {
  /** Cache directory path */
  cacheDir: string;
  /** Maximum cache size in bytes (default: 500MB) */
  maxSize?: number;
  /** Cache version (changes invalidate all entries) */
  version?: string;
  /** Enable compression for large entries */
  enableCompression?: boolean;
  /** Compression threshold in bytes (default: 10KB) */
  compressionThreshold?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** TTL in milliseconds (default: 7 days) */
  ttl?: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  entriesByType: Record<CacheEntryType, number>;
  oldestEntry: number;
  newestEntry: number;
}

/**
 * Content hash function using SHA-256
 */
export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * File hash function
 */
function hashFile(filePath: string): string {
  if (!existsSync(filePath)) {
    return 'missing';
  }
  const content = readFileSync(filePath, 'utf-8');
  return hashContent(content);
}

/**
 * Get file modification time
 */
function getModTime(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }
  return statSync(filePath).mtimeMs;
}

/**
 * Compress data using zlib deflate, encoded as base64 for storage
 */
function compress(data: string): string {
  return deflateSync(Buffer.from(data)).toString('base64');
}

/**
 * Decompress base64-encoded zlib data
 */
function decompress(data: string): string {
  return inflateSync(Buffer.from(data, 'base64')).toString('utf-8');
}

/**
 * BuildCache - Persistent disk-based caching
 */
export class BuildCache {
  private cacheDir: string;
  private indexPath: string;
  private index: Map<string, CacheEntryMeta> = new Map();
  private options: Required<BuildCacheOptions>;
  private hitCount: number = 0;
  private missCount: number = 0;
  private initialized: boolean = false;

  constructor(options: BuildCacheOptions) {
    this.options = {
      cacheDir: options.cacheDir,
      maxSize: options.maxSize ?? 500 * 1024 * 1024, // 500MB
      version: options.version ?? '1.0.0',
      enableCompression: options.enableCompression ?? true,
      compressionThreshold: options.compressionThreshold ?? 10 * 1024, // 10KB
      debug: options.debug ?? false,
      ttl: options.ttl ?? 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.cacheDir = options.cacheDir;
    this.indexPath = join(this.cacheDir, 'cache-index.json');
  }

  /**
   * Initialize the cache (create directories, load index)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create cache directory
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    // Create subdirectories for each type
    const types: CacheEntryType[] = ['ast', 'compiled', 'bundle', 'sourcemap', 'metadata'];
    for (const type of types) {
      const typeDir = join(this.cacheDir, type);
      if (!existsSync(typeDir)) {
        mkdirSync(typeDir, { recursive: true });
      }
    }

    // Load existing index
    await this.loadIndex();
    this.initialized = true;
    this.log('Cache initialized');
  }

  /**
   * Load cache index from disk
   */
  private async loadIndex(): Promise<void> {
    if (existsSync(this.indexPath)) {
      try {
        const indexData = readFileSync(this.indexPath, 'utf-8');
        const parsed = JSON.parse(indexData);

        // Validate version
        if (parsed.version !== this.options.version) {
          this.log(
            `Version mismatch (${parsed.version} vs ${this.options.version}), clearing cache`
          );
          await this.clear();
          return;
        }

        // Load entries
        for (const entry of parsed.entries) {
          this.index.set(entry.key, entry.meta);
        }

        this.log(`Loaded ${this.index.size} cache entries`);
      } catch (error) {
        this.log(`Failed to load index: ${error}`);
        this.index.clear();
      }
    }
  }

  /**
   * Save cache index to disk
   */
  private async saveIndex(): Promise<void> {
    const indexData = {
      version: this.options.version,
      entries: Array.from(this.index.entries()).map(([key, meta]) => ({ key, meta })),
      savedAt: Date.now(),
    };

    writeFileSync(this.indexPath, JSON.stringify(indexData, null, 2));
  }

  /**
   * Generate cache key from source path and type
   */
  private getCacheKey(sourcePath: string, type: CacheEntryType): string {
    const normalizedPath = sourcePath.replace(/\\/g, '/');
    return `${type}:${hashContent(normalizedPath)}`;
  }

  /**
   * Get file path for a cache entry
   */
  private getEntryPath(key: string, type: CacheEntryType): string {
    const hash = key.split(':')[1] || hashContent(key);
    return join(this.cacheDir, type, `${hash}.json`);
  }

  /**
   * Check if a cache entry is valid
   */
  private isEntryValid(meta: CacheEntryMeta, sourcePath: string): boolean {
    // Check if source file still exists
    if (!existsSync(sourcePath)) {
      return false;
    }

    // Check modification time
    const currentModTime = getModTime(sourcePath);
    if (currentModTime > meta.sourceModifiedTime) {
      return false;
    }

    // Check TTL
    if (Date.now() - meta.createdAt > this.options.ttl) {
      return false;
    }

    // Check version
    if (meta.version !== this.options.version) {
      return false;
    }

    return true;
  }

  /**
   * Get a cache entry
   */
  async get<T>(sourcePath: string, type: CacheEntryType): Promise<CacheLookupResult<T>> {
    if (!this.initialized) {
      await this.initialize();
    }

    const key = this.getCacheKey(sourcePath, type);
    const meta = this.index.get(key);

    if (!meta) {
      this.missCount++;
      return { hit: false, reason: 'not_found' };
    }

    // Validate entry
    if (!this.isEntryValid(meta, sourcePath)) {
      this.missCount++;
      // Remove stale entry
      this.index.delete(key);
      const entryPath = this.getEntryPath(key, type);
      if (existsSync(entryPath)) {
        unlinkSync(entryPath);
      }
      return { hit: false, reason: 'stale' };
    }

    // Read entry data
    const entryPath = this.getEntryPath(key, type);
    if (!existsSync(entryPath)) {
      this.missCount++;
      this.index.delete(key);
      return { hit: false, reason: 'not_found' };
    }

    try {
      const rawData = readFileSync(entryPath, 'utf-8');
      let data: T;

      if (meta.compressed) {
        data = JSON.parse(decompress(rawData));
      } else {
        data = JSON.parse(rawData);
      }

      // Update access stats
      meta.accessedAt = Date.now();
      meta.accessCount++;
      this.index.set(key, meta);

      this.hitCount++;
      this.log(`Cache hit: ${sourcePath} (${type})`);

      return {
        hit: true,
        entry: { meta, data },
      };
    } catch (error) {
      this.missCount++;
      this.log(`Cache read error: ${error}`);
      return { hit: false, reason: 'corrupted' };
    }
  }

  /**
   * Set a cache entry
   */
  async set<T>(
    sourcePath: string,
    type: CacheEntryType,
    data: T,
    options?: {
      dependencies?: string[];
      tags?: string[];
    }
  ): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const key = this.getCacheKey(sourcePath, type);
    const serialized = JSON.stringify(data);
    const shouldCompress =
      this.options.enableCompression && serialized.length > this.options.compressionThreshold;

    const entryData = shouldCompress ? compress(serialized) : serialized;

    const meta: CacheEntryMeta = {
      type,
      sourceHash: hashFile(sourcePath),
      sourcePath,
      sourceModifiedTime: getModTime(sourcePath),
      createdAt: Date.now(),
      accessedAt: Date.now(),
      accessCount: 0,
      size: entryData.length,
      compressed: shouldCompress,
      version: this.options.version,
      dependencies: options?.dependencies,
      tags: options?.tags,
    };

    // Write entry to disk
    const entryPath = this.getEntryPath(key, type);
    writeFileSync(entryPath, entryData);

    // Update index
    this.index.set(key, meta);
    await this.saveIndex();

    this.log(`Cache set: ${sourcePath} (${type}), size: ${meta.size}`);

    // Check if we need to evict entries
    await this.enforceMaxSize();
  }

  /**
   * Invalidate cache entries for a source file
   */
  async invalidate(sourcePath: string, types?: CacheEntryType[]): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    const typesToInvalidate: CacheEntryType[] = types || [
      'ast',
      'compiled',
      'bundle',
      'sourcemap',
      'metadata',
    ];
    let invalidatedCount = 0;

    for (const type of typesToInvalidate) {
      const key = this.getCacheKey(sourcePath, type);
      if (this.index.has(key)) {
        const entryPath = this.getEntryPath(key, type);
        if (existsSync(entryPath)) {
          unlinkSync(entryPath);
        }
        this.index.delete(key);
        invalidatedCount++;
      }
    }

    if (invalidatedCount > 0) {
      await this.saveIndex();
      this.log(`Invalidated ${invalidatedCount} entries for ${sourcePath}`);
    }

    return invalidatedCount;
  }

  /**
   * Invalidate all entries with a specific tag
   */
  async invalidateByTag(tag: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    let invalidatedCount = 0;
    const keysToRemove: string[] = [];

    for (const [key, meta] of this.index) {
      if (meta.tags?.includes(tag)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const meta = this.index.get(key)!;
      const entryPath = this.getEntryPath(key, meta.type);
      if (existsSync(entryPath)) {
        unlinkSync(entryPath);
      }
      this.index.delete(key);
      invalidatedCount++;
    }

    if (invalidatedCount > 0) {
      await this.saveIndex();
      this.log(`Invalidated ${invalidatedCount} entries with tag: ${tag}`);
    }

    return invalidatedCount;
  }

  /**
   * Invalidate entries that depend on a source file
   */
  async invalidateDependents(sourcePath: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    const normalizedPath = sourcePath.replace(/\\/g, '/');
    let invalidatedCount = 0;
    const keysToRemove: string[] = [];

    for (const [key, meta] of this.index) {
      if (meta.dependencies?.some((dep) => dep.replace(/\\/g, '/') === normalizedPath)) {
        keysToRemove.push(key);
      }
    }

    for (const key of keysToRemove) {
      const meta = this.index.get(key)!;
      const entryPath = this.getEntryPath(key, meta.type);
      if (existsSync(entryPath)) {
        unlinkSync(entryPath);
      }
      this.index.delete(key);
      invalidatedCount++;
    }

    if (invalidatedCount > 0) {
      await this.saveIndex();
      this.log(`Invalidated ${invalidatedCount} dependent entries for ${sourcePath}`);
    }

    return invalidatedCount;
  }

  /**
   * Enforce maximum cache size using LRU eviction
   */
  private async enforceMaxSize(): Promise<void> {
    let totalSize = 0;
    for (const meta of this.index.values()) {
      totalSize += meta.size;
    }

    if (totalSize <= this.options.maxSize) {
      return;
    }

    // Sort entries by access time (oldest first)
    const entries = Array.from(this.index.entries()).sort(
      (a, b) => a[1].accessedAt - b[1].accessedAt
    );

    let evictedCount = 0;
    for (const [key, meta] of entries) {
      if (totalSize <= this.options.maxSize * 0.8) {
        // Target 80% capacity
        break;
      }

      const entryPath = this.getEntryPath(key, meta.type);
      if (existsSync(entryPath)) {
        unlinkSync(entryPath);
      }
      this.index.delete(key);
      totalSize -= meta.size;
      evictedCount++;
    }

    if (evictedCount > 0) {
      await this.saveIndex();
      this.log(`Evicted ${evictedCount} entries (LRU)`);
    }
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const types: CacheEntryType[] = ['ast', 'compiled', 'bundle', 'sourcemap', 'metadata'];

    for (const type of types) {
      const typeDir = join(this.cacheDir, type);
      if (existsSync(typeDir)) {
        const files = readdirSync(typeDir);
        for (const file of files) {
          unlinkSync(join(typeDir, file));
        }
      }
    }

    this.index.clear();
    this.hitCount = 0;
    this.missCount = 0;

    if (existsSync(this.indexPath)) {
      unlinkSync(this.indexPath);
    }

    this.log('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    let totalSize = 0;
    let oldestEntry = Date.now();
    let newestEntry = 0;
    const entriesByType: Record<CacheEntryType, number> = {
      ast: 0,
      compiled: 0,
      bundle: 0,
      sourcemap: 0,
      metadata: 0,
    };

    for (const meta of this.index.values()) {
      totalSize += meta.size;
      entriesByType[meta.type]++;
      if (meta.createdAt < oldestEntry) {
        oldestEntry = meta.createdAt;
      }
      if (meta.createdAt > newestEntry) {
        newestEntry = meta.createdAt;
      }
    }

    const totalRequests = this.hitCount + this.missCount;

    return {
      totalEntries: this.index.size,
      totalSize,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: totalRequests > 0 ? this.hitCount / totalRequests : 0,
      entriesByType,
      oldestEntry: this.index.size > 0 ? oldestEntry : 0,
      newestEntry: this.index.size > 0 ? newestEntry : 0,
    };
  }

  /**
   * Get list of all cached source files
   */
  getCachedFiles(): string[] {
    const files = new Set<string>();
    for (const meta of this.index.values()) {
      files.add(meta.sourcePath);
    }
    return Array.from(files);
  }

  /**
   * Check if a source file has a valid cache entry
   */
  async hasValidCache(sourcePath: string, type: CacheEntryType): Promise<boolean> {
    const result = await this.get(sourcePath, type);
    return result.hit;
  }

  /**
   * Prune expired entries
   */
  async prune(): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    let prunedCount = 0;
    const keysToRemove: string[] = [];

    for (const [key, meta] of this.index) {
      // Check TTL
      if (Date.now() - meta.createdAt > this.options.ttl) {
        keysToRemove.push(key);
        continue;
      }

      // Check if source still exists
      if (!existsSync(meta.sourcePath)) {
        keysToRemove.push(key);
        continue;
      }
    }

    for (const key of keysToRemove) {
      const meta = this.index.get(key)!;
      const entryPath = this.getEntryPath(key, meta.type);
      if (existsSync(entryPath)) {
        unlinkSync(entryPath);
      }
      this.index.delete(key);
      prunedCount++;
    }

    if (prunedCount > 0) {
      await this.saveIndex();
      this.log(`Pruned ${prunedCount} expired entries`);
    }

    return prunedCount;
  }

  /**
   * Warm cache by pre-computing entries for multiple files
   */
  async warmCache<T>(
    files: string[],
    type: CacheEntryType,
    compute: (filePath: string) => Promise<T>
  ): Promise<{ cached: number; computed: number }> {
    if (!this.initialized) {
      await this.initialize();
    }

    let cached = 0;
    let computed = 0;

    for (const file of files) {
      const result = await this.get<T>(file, type);
      if (result.hit) {
        cached++;
      } else {
        const data = await compute(file);
        await this.set(file, type, data);
        computed++;
      }
    }

    this.log(`Cache warm: ${cached} cached, ${computed} computed`);
    return { cached, computed };
  }

  /**
   * Debug logging
   */
  private log(message: string): void {
    if (this.options.debug) {
      console.info(`[BuildCache] ${message}`);
    }
  }
}

/**
 * Create a build cache instance
 */
export function createBuildCache(options: BuildCacheOptions): BuildCache {
  return new BuildCache(options);
}

/**
 * Default cache directory (relative to project)
 */
export function getDefaultCacheDir(): string {
  return join(process.cwd(), '.holoscript-cache');
}

/**
 * Content-addressable store for build artifacts
 */
export class ContentAddressableStore {
  private storeDir: string;
  private debug: boolean;

  constructor(storeDir: string, options?: { debug?: boolean }) {
    this.storeDir = storeDir;
    this.debug = options?.debug ?? false;

    if (!existsSync(storeDir)) {
      mkdirSync(storeDir, { recursive: true });
    }
  }

  /**
   * Store content and return its hash
   */
  store(content: string): string {
    const hash = hashContent(content);
    const filePath = this.getPath(hash);

    if (!existsSync(filePath)) {
      writeFileSync(filePath, content);
      this.log(`Stored: ${hash}`);
    }

    return hash;
  }

  /**
   * Retrieve content by hash
   */
  retrieve(hash: string): string | null {
    const filePath = this.getPath(hash);

    if (existsSync(filePath)) {
      return readFileSync(filePath, 'utf-8');
    }

    return null;
  }

  /**
   * Check if content exists
   */
  has(hash: string): boolean {
    return existsSync(this.getPath(hash));
  }

  /**
   * Remove content by hash
   */
  remove(hash: string): boolean {
    const filePath = this.getPath(hash);

    if (existsSync(filePath)) {
      unlinkSync(filePath);
      return true;
    }

    return false;
  }

  /**
   * Get file path for a hash
   */
  private getPath(hash: string): string {
    // Use first 2 chars as directory for distribution
    const dir = hash.slice(0, 2);
    const dirPath = join(this.storeDir, dir);

    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }

    return join(dirPath, hash);
  }

  private log(message: string): void {
    if (this.debug) {
      console.info(`[CAS] ${message}`);
    }
  }
}

/**
 * Build artifact types
 */
export interface BuildArtifact {
  type: 'js' | 'wasm' | 'sourcemap' | 'declaration' | 'metadata';
  hash: string;
  size: number;
  createdAt: number;
  sourceFiles: string[];
}

/**
 * Build manifest for tracking all artifacts from a build
 */
export interface BuildManifest {
  version: string;
  buildId: string;
  createdAt: number;
  sourceHashes: Record<string, string>;
  artifacts: BuildArtifact[];
  metadata: Record<string, unknown>;
}

/**
 * Create a build manifest
 */
export function createBuildManifest(
  sourceFiles: string[],
  artifacts: BuildArtifact[],
  metadata?: Record<string, unknown>
): BuildManifest {
  const sourceHashes: Record<string, string> = {};
  for (const file of sourceFiles) {
    sourceHashes[file] = hashFile(file);
  }

  return {
    version: '1.0.0',
    buildId: `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    sourceHashes,
    artifacts,
    metadata: metadata ?? {},
  };
}

/**
 * Validate a build manifest against current source files
 */
export function validateBuildManifest(manifest: BuildManifest): {
  valid: boolean;
  changedFiles: string[];
  missingFiles: string[];
} {
  const changedFiles: string[] = [];
  const missingFiles: string[] = [];

  for (const [file, hash] of Object.entries(manifest.sourceHashes)) {
    if (!existsSync(file)) {
      missingFiles.push(file);
    } else {
      const currentHash = hashFile(file);
      if (currentHash !== hash) {
        changedFiles.push(file);
      }
    }
  }

  return {
    valid: changedFiles.length === 0 && missingFiles.length === 0,
    changedFiles,
    missingFiles,
  };
}
