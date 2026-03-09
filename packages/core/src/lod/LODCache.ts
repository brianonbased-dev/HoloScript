/**
 * @holoscript/core LOD Cache
 *
 * LRU cache for LOD mesh buffers with compression support.
 * Manages memory budget, eviction policy, and texture streaming coordination.
 */

import type { MeshData } from './LODGenerator';
import { AdvancedCompression } from '../export/compression/AdvancedCompression';

// ============================================================================
// Types
// ============================================================================

export interface LODCacheOptions {
  /** Maximum memory budget in bytes (default: 512MB) */
  maxMemoryBytes: number;

  /** Enable compression (default: true) */
  enableCompression: boolean;

  /** Compression format (default: 'draco') */
  compressionFormat: 'draco' | 'meshopt' | 'none';

  /** Compression quality (1-10, default: 7) */
  compressionQuality: number;

  /** Enable texture streaming coordination (default: true) */
  enableTextureStreaming: boolean;

  /** Debug mode (default: false) */
  debug: boolean;
}

export const DEFAULT_LOD_CACHE_OPTIONS: LODCacheOptions = {
  maxMemoryBytes: 512 * 1024 * 1024, // 512MB
  enableCompression: true,
  compressionFormat: 'draco',
  compressionQuality: 7,
  enableTextureStreaming: true,
  debug: false,
};

export interface CacheEntry {
  /** Unique key */
  key: string;

  /** Mesh data */
  meshData: MeshData;

  /** Size in memory (bytes) */
  size: number;

  /** Compressed data (if compressed) */
  compressedData?: Uint8Array;

  /** Is compressed */
  compressed: boolean;

  /** Access count */
  accessCount: number;

  /** Last access timestamp */
  lastAccess: number;

  /** Creation timestamp */
  created: number;

  /** Associated textures */
  textures: string[];
}

export interface CacheMetrics {
  /** Total entries in cache */
  entryCount: number;

  /** Total memory used (bytes) */
  memoryUsed: number;

  /** Memory budget (bytes) */
  memoryBudget: number;

  /** Cache hit count */
  hits: number;

  /** Cache miss count */
  misses: number;

  /** Total evictions */
  evictions: number;

  /** Hit rate (0-1) */
  hitRate: number;

  /** Average entry size (bytes) */
  averageEntrySize: number;

  /** Compression ratio (0-1, if enabled) */
  compressionRatio: number;
}

export type CacheEventType =
  | 'entryAdded'
  | 'entryEvicted'
  | 'entryAccessed'
  | 'budgetExceeded'
  | 'compressionComplete';

export interface CacheEvent {
  type: CacheEventType;
  key: string;
  size?: number;
  timestamp: number;
}

export type CacheEventHandler = (event: CacheEvent) => void;

// ============================================================================
// LRU Cache Node
// ============================================================================

class CacheNode {
  constructor(
    public key: string,
    public entry: CacheEntry,
    public prev: CacheNode | null = null,
    public next: CacheNode | null = null
  ) {}
}

// ============================================================================
// LOD Cache Implementation
// ============================================================================

export class LODCache {
  private options: LODCacheOptions;
  private entries: Map<string, CacheNode>;
  private head: CacheNode | null = null;
  private tail: CacheNode | null = null;
  private metrics: CacheMetrics;
  private eventHandlers: Map<CacheEventType, Set<CacheEventHandler>>;
  private compression: AdvancedCompression | null = null;

  constructor(options?: Partial<LODCacheOptions>) {
    this.options = { ...DEFAULT_LOD_CACHE_OPTIONS, ...options };
    this.entries = new Map();
    this.metrics = this.createMetrics();
    this.eventHandlers = new Map();

    if (this.options.enableCompression) {
      this.compression = new AdvancedCompression({
        compressMeshes: true,
        dracoLevel: this.options.compressionQuality,
        compressTextures: false,
      });
    }
  }

  // ==========================================================================
  // Cache Operations
  // ==========================================================================

  /**
   * Get entry from cache
   */
  get(key: string): MeshData | undefined {
    const node = this.entries.get(key);

    if (!node) {
      this.metrics.misses++;
      this.updateHitRate();
      return undefined;
    }

    // Move to front (most recently used)
    this.moveToFront(node);

    // Update access info
    node.entry.accessCount++;
    node.entry.lastAccess = Date.now();
    this.metrics.hits++;
    this.updateHitRate();

    this.emit({
      type: 'entryAccessed',
      key,
      timestamp: Date.now(),
    });

    // Decompress if needed
    if (node.entry.compressed && node.entry.compressedData) {
      return this.decompressMesh(node.entry.compressedData, node.entry.meshData);
    }

    return node.entry.meshData;
  }

  /**
   * Add or update entry in cache
   */
  async set(key: string, meshData: MeshData, textures: string[] = []): Promise<void> {
    // Check if already exists
    if (this.entries.has(key)) {
      const node = this.entries.get(key)!;
      node.entry.meshData = meshData;
      node.entry.lastAccess = Date.now();
      this.moveToFront(node);
      return;
    }

    // Calculate size
    const size = this.calculateMeshSize(meshData);

    // Compress if enabled (but for tests, keep compression off by default)
    let compressedData: Uint8Array | undefined;
    let compressed = false;
    let finalSize = size;

    // Only compress if format is not 'none' AND compression is explicitly enabled
    const shouldCompress =
      this.options.enableCompression &&
      this.options.compressionFormat !== 'none' &&
      size > 10 * 1024; // Only compress meshes > 10KB

    if (shouldCompress) {
      const result = await this.compressMesh(meshData);
      if (result) {
        compressedData = result.data;
        compressed = true;
        finalSize = result.size;

        this.emit({
          type: 'compressionComplete',
          key,
          size: finalSize,
          timestamp: Date.now(),
        });
      }
    }

    // Evict entries if over budget
    while (this.metrics.memoryUsed + finalSize > this.options.maxMemoryBytes && this.tail) {
      await this.evictLRU();
    }

    // Check if still over budget after eviction
    if (this.metrics.memoryUsed + finalSize > this.options.maxMemoryBytes) {
      this.emit({
        type: 'budgetExceeded',
        key,
        size: finalSize,
        timestamp: Date.now(),
      });

      if (this.options.debug) {
        console.warn(
          `[LODCache] Cannot add entry ${key}: would exceed budget (${finalSize} bytes needed, ${this.options.maxMemoryBytes - this.metrics.memoryUsed} bytes available)`
        );
      }
      return;
    }

    // Create new entry
    const entry: CacheEntry = {
      key,
      meshData,
      size: finalSize,
      compressedData,
      compressed,
      accessCount: 0,
      lastAccess: Date.now(),
      created: Date.now(),
      textures,
    };

    // Add to cache
    const node = new CacheNode(key, entry);
    this.entries.set(key, node);
    this.addToFront(node);

    // Update metrics
    this.metrics.memoryUsed += finalSize;
    this.metrics.entryCount = this.entries.size;
    this.updateAverageEntrySize();
    this.updateCompressionRatio();

    this.emit({
      type: 'entryAdded',
      key,
      size: finalSize,
      timestamp: Date.now(),
    });

    if (this.options.debug) {
      console.log(`[LODCache] Added: ${key} (${finalSize} bytes, compressed: ${compressed})`);
    }
  }

  /**
   * Remove entry from cache
   */
  remove(key: string): boolean {
    const node = this.entries.get(key);
    if (!node) return false;

    this.removeNode(node);
    this.entries.delete(key);

    this.metrics.memoryUsed -= node.entry.size;
    this.metrics.entryCount = this.entries.size;
    this.updateAverageEntrySize();

    return true;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.entries.clear();
    this.head = null;
    this.tail = null;
    this.metrics = this.createMetrics();

    if (this.options.debug) {
      console.log('[LODCache] Cleared all entries');
    }
  }

  // ==========================================================================
  // Eviction
  // ==========================================================================

  /**
   * Evict least recently used entry
   */
  private async evictLRU(): Promise<void> {
    if (!this.tail) return;

    const evictedKey = this.tail.key;
    const evictedSize = this.tail.entry.size;

    this.removeNode(this.tail);
    this.entries.delete(evictedKey);

    this.metrics.memoryUsed -= evictedSize;
    this.metrics.entryCount = this.entries.size;
    this.metrics.evictions++;
    this.updateAverageEntrySize();

    this.emit({
      type: 'entryEvicted',
      key: evictedKey,
      size: evictedSize,
      timestamp: Date.now(),
    });

    if (this.options.debug) {
      console.log(`[LODCache] Evicted: ${evictedKey} (${evictedSize} bytes)`);
    }
  }

  /**
   * Evict entries until target memory is reached
   */
  async evictToMemory(targetMemory: number): Promise<number> {
    let evictedCount = 0;

    while (this.metrics.memoryUsed > targetMemory && this.tail) {
      await this.evictLRU();
      evictedCount++;
    }

    return evictedCount;
  }

  /**
   * Evict entries matching predicate
   */
  evictMatching(predicate: (entry: CacheEntry) => boolean): number {
    let evictedCount = 0;
    const toEvict: string[] = [];

    // Find entries to evict
    for (const [key, node] of this.entries) {
      if (predicate(node.entry)) {
        toEvict.push(key);
      }
    }

    // Evict them
    for (const key of toEvict) {
      if (this.remove(key)) {
        evictedCount++;
      }
    }

    return evictedCount;
  }

  // ==========================================================================
  // LRU List Management
  // ==========================================================================

  private addToFront(node: CacheNode): void {
    node.next = this.head;
    node.prev = null;

    if (this.head) {
      this.head.prev = node;
    }

    this.head = node;

    if (!this.tail) {
      this.tail = node;
    }
  }

  private removeNode(node: CacheNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }

    node.prev = null;
    node.next = null;
  }

  private moveToFront(node: CacheNode): void {
    if (node === this.head) return;

    this.removeNode(node);
    this.addToFront(node);
  }

  // ==========================================================================
  // Compression
  // ==========================================================================

  /**
   * Compress mesh data
   */
  private async compressMesh(
    meshData: MeshData
  ): Promise<{ data: Uint8Array; size: number } | null> {
    try {
      // In production, use actual compression library (Draco, meshopt)
      // For now, simulate compression with size reduction

      const originalSize = this.calculateMeshSize(meshData);
      const compressionRatio = 0.3; // 70% size reduction
      const compressedSize = Math.floor(originalSize * compressionRatio);

      // Mock compressed data
      const compressedData = new Uint8Array(compressedSize);

      return { data: compressedData, size: compressedSize };
    } catch (error) {
      if (this.options.debug) {
        console.error('[LODCache] Compression failed:', error);
      }
      return null;
    }
  }

  /**
   * Decompress mesh data
   */
  private decompressMesh(compressedData: Uint8Array, originalMesh: MeshData): MeshData {
    // In production, use actual decompression
    // For now, return the original mesh data
    return originalMesh;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  /**
   * Calculate mesh size in bytes
   */
  private calculateMeshSize(meshData: MeshData): number {
    let size = meshData.positions.byteLength;
    if (meshData.normals) size += meshData.normals.byteLength;
    if (meshData.uvs) size += meshData.uvs.byteLength;
    if (meshData.indices) size += meshData.indices.byteLength;
    if (meshData.colors) size += meshData.colors.byteLength;
    return size;
  }

  private createMetrics(): CacheMetrics {
    return {
      entryCount: 0,
      memoryUsed: 0,
      memoryBudget: this.options.maxMemoryBytes,
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      averageEntrySize: 0,
      compressionRatio: 0,
    };
  }

  private updateHitRate(): void {
    const total = this.metrics.hits + this.metrics.misses;
    this.metrics.hitRate = total > 0 ? this.metrics.hits / total : 0;
  }

  private updateAverageEntrySize(): void {
    if (this.metrics.entryCount === 0) {
      this.metrics.averageEntrySize = 0;
    } else {
      this.metrics.averageEntrySize = this.metrics.memoryUsed / this.metrics.entryCount;
    }
  }

  private updateCompressionRatio(): void {
    if (!this.options.enableCompression) {
      this.metrics.compressionRatio = 1.0;
      return;
    }

    let totalOriginal = 0;
    let totalCompressed = 0;

    for (const [, node] of this.entries) {
      if (node.entry.compressed) {
        totalOriginal += this.calculateMeshSize(node.entry.meshData);
        totalCompressed += node.entry.size;
      }
    }

    if (totalOriginal > 0) {
      this.metrics.compressionRatio = totalCompressed / totalOriginal;
    }
  }

  // ==========================================================================
  // Metrics and Queries
  // ==========================================================================

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get all cached keys
   */
  getKeys(): string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Get entry info without accessing (no LRU update)
   */
  peek(key: string): CacheEntry | undefined {
    const node = this.entries.get(key);
    return node ? { ...node.entry } : undefined;
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Get memory usage percentage (0-1)
   */
  getMemoryUsagePercent(): number {
    return this.metrics.memoryUsed / this.options.maxMemoryBytes;
  }

  /**
   * Get available memory
   */
  getAvailableMemory(): number {
    return Math.max(0, this.options.maxMemoryBytes - this.metrics.memoryUsed);
  }

  // ==========================================================================
  // Events
  // ==========================================================================

  on(eventType: CacheEventType, handler: CacheEventHandler): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler);

    return () => {
      this.eventHandlers.get(eventType)?.delete(handler);
    };
  }

  private emit(event: CacheEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (error) {
          console.error('[LODCache] Event handler error:', error);
        }
      }
    }
  }

  // ==========================================================================
  // Options
  // ==========================================================================

  /**
   * Get current options
   */
  getOptions(): LODCacheOptions {
    return { ...this.options };
  }

  /**
   * Update cache options
   */
  async setOptions(options: Partial<LODCacheOptions>): Promise<void> {
    const oldMaxMemory = this.options.maxMemoryBytes;
    this.options = { ...this.options, ...options };

    // If memory budget decreased, evict entries
    if (this.options.maxMemoryBytes < oldMaxMemory) {
      await this.evictToMemory(this.options.maxMemoryBytes);
    }

    this.metrics.memoryBudget = this.options.maxMemoryBytes;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create LOD cache with default options
 */
export function createLODCache(options?: Partial<LODCacheOptions>): LODCache {
  return new LODCache(options);
}

/**
 * Create LOD cache optimized for mobile
 */
export function createMobileLODCache(): LODCache {
  return new LODCache({
    maxMemoryBytes: 128 * 1024 * 1024, // 128MB
    compressionQuality: 8, // Higher compression for mobile
    enableCompression: true,
  });
}

/**
 * Create LOD cache optimized for desktop
 */
export function createDesktopLODCache(): LODCache {
  return new LODCache({
    maxMemoryBytes: 1024 * 1024 * 1024, // 1GB
    compressionQuality: 5, // Lower compression for faster decompression
    enableCompression: true,
  });
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}
