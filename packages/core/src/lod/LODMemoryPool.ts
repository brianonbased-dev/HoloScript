/**
 * @holoscript/core LOD Memory Pool
 *
 * Memory pooling system for LOD meshes to reduce allocations
 * and improve performance through buffer reuse.
 *
 * v3.5 Performance Optimization
 */

// ============================================================================
// Types
// ============================================================================

export interface PooledBuffer {
  id: string;
  vertices: Float32Array;
  indices: Uint32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  inUse: boolean;
  lastUsed: number;
  size: number;
}

export interface PoolStatistics {
  totalBuffers: number;
  buffersInUse: number;
  buffersAvailable: number;
  totalMemoryBytes: number;
  usedMemoryBytes: number;
  availableMemoryBytes: number;
  allocationCount: number;
  reuseCount: number;
  defragmentationCount: number;
  hitRate: number;
}

export interface MemoryPoolOptions {
  initialPoolSize: number;
  maxPoolSize: number;
  bufferSizes: number[];
  enableDefragmentation: boolean;
  defragmentationThreshold: number;
  memoryPressureThreshold: number;
  autoAdjustLODBias: boolean;
}

// ============================================================================
// LOD Memory Pool
// ============================================================================

/**
 * Memory pool for pre-allocated mesh buffers
 */
export class LODMemoryPool {
  private options: MemoryPoolOptions;
  private pools: Map<number, PooledBuffer[]> = new Map();
  private stats: PoolStatistics;
  private nextBufferId: number = 0;
  private memoryPressureCallbacks: Set<(pressure: number) => void> = new Set();

  constructor(options?: Partial<MemoryPoolOptions>) {
    this.options = {
      initialPoolSize: 10,
      maxPoolSize: 100,
      bufferSizes: [1000, 5000, 10000, 50000, 100000],
      enableDefragmentation: true,
      defragmentationThreshold: 0.3,
      memoryPressureThreshold: 0.8,
      autoAdjustLODBias: true,
      ...options,
    };

    this.stats = this.createEmptyStats();
    this.initializePools();
  }

  // ==========================================================================
  // Initialization
  // ==========================================================================

  /**
   * Initialize buffer pools for each size tier
   */
  private initializePools(): void {
    for (const size of this.options.bufferSizes) {
      const pool: PooledBuffer[] = [];

      for (let i = 0; i < this.options.initialPoolSize; i++) {
        pool.push(this.createBuffer(size));
      }

      this.pools.set(size, pool);
    }

    this.updateStatistics();
  }

  /**
   * Create a new pooled buffer
   */
  private createBuffer(vertexCount: number): PooledBuffer {
    const id = `buffer_${this.nextBufferId++}`;
    const triangleCount = Math.floor(vertexCount / 3);

    // Allocate typed arrays
    const vertices = new Float32Array(vertexCount * 3); // x, y, z
    const indices = new Uint32Array(triangleCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);

    const buffer: PooledBuffer = {
      id,
      vertices,
      indices,
      normals,
      uvs,
      inUse: false,
      lastUsed: 0,
      size: vertexCount,
    };

    this.stats.allocationCount++;

    return buffer;
  }

  // ==========================================================================
  // Buffer Allocation and Release
  // ==========================================================================

  /**
   * Acquire a buffer from the pool
   */
  acquire(vertexCount: number): PooledBuffer | null {
    // Find appropriate size tier
    const sizeKey = this.findSizeTier(vertexCount);
    if (!sizeKey) {
      console.warn(`[MemoryPool] No suitable buffer size for ${vertexCount} vertices`);
      return null;
    }

    const pool = this.pools.get(sizeKey);
    if (!pool) return null;

    // Find available buffer
    let buffer = pool.find((b) => !b.inUse);

    if (!buffer) {
      // Try to grow pool if under max size
      if (pool.length < this.options.maxPoolSize) {
        buffer = this.createBuffer(sizeKey);
        pool.push(buffer);
      } else {
        // Pool exhausted, try to defragment or return null
        this.defragment();
        buffer = pool.find((b) => !b.inUse);

        if (!buffer) {
          console.warn(`[MemoryPool] Pool exhausted for size ${sizeKey}`);
          this.checkMemoryPressure();
          return null;
        }
      }
    }

    // Mark buffer as in use
    buffer.inUse = true;
    buffer.lastUsed = Date.now();

    if (buffer.id.startsWith('buffer_')) {
      this.stats.reuseCount++;
    }

    this.updateStatistics();
    return buffer;
  }

  /**
   * Release a buffer back to the pool
   */
  release(buffer: PooledBuffer): void {
    buffer.inUse = false;
    buffer.lastUsed = Date.now();

    // Clear buffer data (optional, for security)
    // Skipped for performance - just mark as available

    this.updateStatistics();
  }

  /**
   * Release buffer by ID
   */
  releaseById(bufferId: string): void {
    for (const pool of this.pools.values()) {
      const buffer = pool.find((b) => b.id === bufferId);
      if (buffer) {
        this.release(buffer);
        return;
      }
    }
  }

  // ==========================================================================
  // Memory Management
  // ==========================================================================

  /**
   * Find appropriate size tier for requested vertex count
   */
  private findSizeTier(vertexCount: number): number | null {
    // Find smallest tier that fits
    for (const size of this.options.bufferSizes) {
      if (size >= vertexCount) {
        return size;
      }
    }

    // If larger than all tiers, use largest
    return this.options.bufferSizes[this.options.bufferSizes.length - 1] || null;
  }

  /**
   * Defragment memory pools
   */
  defragment(): void {
    if (!this.options.enableDefragmentation) return;

    const startTime = performance.now();

    for (const [size, pool] of this.pools) {
      // Remove unused buffers that haven't been used recently
      const now = Date.now();
      const unusedTime = 60000; // 1 minute

      const activeBuffers = pool.filter((b) => {
        if (b.inUse) return true;
        if (now - b.lastUsed < unusedTime) return true;
        return false;
      });

      // Keep at least initial pool size
      const toKeep = Math.max(this.options.initialPoolSize, activeBuffers.length);
      this.pools.set(size, activeBuffers.slice(0, toKeep));
    }

    this.stats.defragmentationCount++;
    this.updateStatistics();

    const duration = performance.now() - startTime;
    console.log(`[MemoryPool] Defragmentation completed in ${duration.toFixed(2)}ms`);
  }

  /**
   * Check memory pressure and trigger callbacks
   */
  private checkMemoryPressure(): void {
    const pressure = this.getMemoryPressure();

    if (pressure > this.options.memoryPressureThreshold) {
      // Notify callbacks
      for (const callback of this.memoryPressureCallbacks) {
        try {
          callback(pressure);
        } catch (error) {
          console.error('[MemoryPool] Memory pressure callback error:', error);
        }
      }

      // Auto-adjust LOD bias if enabled
      if (this.options.autoAdjustLODBias && pressure > 0.9) {
        console.warn(`[MemoryPool] High memory pressure: ${(pressure * 100).toFixed(1)}%`);
      }
    }
  }

  /**
   * Calculate current memory pressure (0-1)
   */
  getMemoryPressure(): number {
    if (this.stats.totalMemoryBytes === 0) return 0;
    return this.stats.usedMemoryBytes / this.stats.totalMemoryBytes;
  }

  /**
   * Register memory pressure callback
   */
  onMemoryPressure(callback: (pressure: number) => void): () => void {
    this.memoryPressureCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.memoryPressureCallbacks.delete(callback);
    };
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Create empty statistics object
   */
  private createEmptyStats(): PoolStatistics {
    return {
      totalBuffers: 0,
      buffersInUse: 0,
      buffersAvailable: 0,
      totalMemoryBytes: 0,
      usedMemoryBytes: 0,
      availableMemoryBytes: 0,
      allocationCount: 0,
      reuseCount: 0,
      defragmentationCount: 0,
      hitRate: 0,
    };
  }

  /**
   * Update pool statistics
   */
  private updateStatistics(): void {
    let totalBuffers = 0;
    let buffersInUse = 0;
    let totalMemory = 0;
    let usedMemory = 0;

    for (const pool of this.pools.values()) {
      for (const buffer of pool) {
        totalBuffers++;

        // Calculate memory footprint
        const vertexMem = buffer.vertices.byteLength;
        const indexMem = buffer.indices.byteLength;
        const normalMem = buffer.normals?.byteLength || 0;
        const uvMem = buffer.uvs?.byteLength || 0;
        const bufferMem = vertexMem + indexMem + normalMem + uvMem;

        totalMemory += bufferMem;

        if (buffer.inUse) {
          buffersInUse++;
          usedMemory += bufferMem;
        }
      }
    }

    this.stats.totalBuffers = totalBuffers;
    this.stats.buffersInUse = buffersInUse;
    this.stats.buffersAvailable = totalBuffers - buffersInUse;
    this.stats.totalMemoryBytes = totalMemory;
    this.stats.usedMemoryBytes = usedMemory;
    this.stats.availableMemoryBytes = totalMemory - usedMemory;

    // Calculate hit rate
    const totalRequests = this.stats.allocationCount + this.stats.reuseCount;
    this.stats.hitRate = totalRequests > 0 ? this.stats.reuseCount / totalRequests : 0;
  }

  /**
   * Get pool statistics
   */
  getStatistics(): PoolStatistics {
    return { ...this.stats };
  }

  /**
   * Get formatted statistics
   */
  getFormattedStatistics(): string {
    const stats = this.stats;
    const mb = 1024 * 1024;

    return `
LOD Memory Pool Statistics:
  Buffers: ${stats.buffersInUse} / ${stats.totalBuffers} in use (${stats.buffersAvailable} available)
  Memory: ${(stats.usedMemoryBytes / mb).toFixed(2)} MB / ${(stats.totalMemoryBytes / mb).toFixed(2)} MB
  Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%
  Allocations: ${stats.allocationCount} (${stats.reuseCount} reuses)
  Defragmentations: ${stats.defragmentationCount}
  Memory Pressure: ${(this.getMemoryPressure() * 100).toFixed(1)}%
    `.trim();
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Clear all pools
   */
  clear(): void {
    for (const pool of this.pools.values()) {
      pool.length = 0;
    }
    this.pools.clear();
    this.stats = this.createEmptyStats();
    this.nextBufferId = 0;
  }

  /**
   * Reset pools to initial state
   */
  reset(): void {
    this.clear();
    this.initializePools();
  }

  /**
   * Get pool for specific size
   */
  getPool(size: number): PooledBuffer[] | undefined {
    return this.pools.get(size);
  }

  /**
   * Get all pool sizes
   */
  getPoolSizes(): number[] {
    return Array.from(this.pools.keys());
  }

  /**
   * Set options
   */
  setOptions(options: Partial<MemoryPoolOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get options
   */
  getOptions(): MemoryPoolOptions {
    return { ...this.options };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create memory pool with default options
 */
export function createLODMemoryPool(options?: Partial<MemoryPoolOptions>): LODMemoryPool {
  return new LODMemoryPool(options);
}

/**
 * Create memory pool optimized for VR
 */
export function createVRMemoryPool(): LODMemoryPool {
  return new LODMemoryPool({
    initialPoolSize: 20,
    maxPoolSize: 200,
    bufferSizes: [500, 2000, 5000, 10000, 20000],
    enableDefragmentation: true,
    defragmentationThreshold: 0.4,
    memoryPressureThreshold: 0.7,
    autoAdjustLODBias: true,
  });
}

/**
 * Create memory pool optimized for mobile
 */
export function createMobileMemoryPool(): LODMemoryPool {
  return new LODMemoryPool({
    initialPoolSize: 5,
    maxPoolSize: 50,
    bufferSizes: [500, 1000, 2000, 5000],
    enableDefragmentation: true,
    defragmentationThreshold: 0.5,
    memoryPressureThreshold: 0.6,
    autoAdjustLODBias: true,
  });
}
