/**
 * WorldStreamer.ts
 *
 * Chunk-based world streaming: loading/unloading by distance,
 * async chunk generation, seamless transitions, and memory budgets.
 *
 * @module world
 */

// =============================================================================
// TYPES
// =============================================================================

export type ChunkState = 'unloaded' | 'loading' | 'loaded' | 'unloading';

export interface WorldChunk {
  id: string;
  x: number;
  z: number;
  state: ChunkState;
  data: Record<string, unknown> | null;
  priority: number;
  lastAccessTime: number;
  size: number; // bytes
}

export interface StreamingConfig {
  chunkSize: number; // world units
  loadRadius: number; // in chunks
  unloadRadius: number; // in chunks (> loadRadius)
  maxConcurrentLoads: number;
  memoryBudget: number; // bytes
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_STREAMING: StreamingConfig = {
  chunkSize: 64,
  loadRadius: 3,
  unloadRadius: 5,
  maxConcurrentLoads: 4,
  memoryBudget: 256 * 1024 * 1024, // 256MB
};

// =============================================================================
// WORLD STREAMER
// =============================================================================

export class WorldStreamer {
  private config: StreamingConfig;
  private chunks: Map<string, WorldChunk> = new Map();
  private viewerPosition = { x: 0, z: 0 };
  private totalMemory = 0;
  private loadQueue: string[] = [];
  private activeLoads = 0;
  private chunkGenerator: ((x: number, z: number) => Record<string, unknown>) | null = null;

  constructor(config?: Partial<StreamingConfig>) {
    this.config = { ...DEFAULT_STREAMING, ...config };
  }

  // ---------------------------------------------------------------------------
  // Chunk Generator
  // ---------------------------------------------------------------------------

  setChunkGenerator(gen: (x: number, z: number) => Record<string, unknown>): void {
    this.chunkGenerator = gen;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  setViewerPosition(x: number, z: number): void {
    this.viewerPosition = { x, z };
  }

  update(): void {
    const cx = Math.floor(this.viewerPosition.x / this.config.chunkSize);
    const cz = Math.floor(this.viewerPosition.z / this.config.chunkSize);

    // Determine which chunks to load
    for (let dx = -this.config.loadRadius; dx <= this.config.loadRadius; dx++) {
      for (let dz = -this.config.loadRadius; dz <= this.config.loadRadius; dz++) {
        const chunkX = cx + dx;
        const chunkZ = cz + dz;
        const id = `${chunkX},${chunkZ}`;

        if (!this.chunks.has(id)) {
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist <= this.config.loadRadius) {
            this.requestLoad(chunkX, chunkZ, this.config.loadRadius - dist);
          }
        }
      }
    }

    // Process load queue
    this.processLoadQueue();

    // Unload distant chunks
    for (const [id, chunk] of this.chunks) {
      if (chunk.state !== 'loaded') continue;
      const dx = chunk.x - cx;
      const dz = chunk.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist > this.config.unloadRadius) {
        this.unloadChunk(id);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / Unloading
  // ---------------------------------------------------------------------------

  private requestLoad(x: number, z: number, priority: number): void {
    const id = `${x},${z}`;
    if (this.chunks.has(id)) return;

    const chunk: WorldChunk = {
      id,
      x,
      z,
      state: 'loading',
      data: null,
      priority,
      lastAccessTime: Date.now(),
      size: 0,
    };
    this.chunks.set(id, chunk);
    this.loadQueue.push(id);
    this.loadQueue.sort((a, b) => {
      const ca = this.chunks.get(a)!,
        cb = this.chunks.get(b)!;
      return cb.priority - ca.priority;
    });
  }

  private processLoadQueue(): void {
    while (this.loadQueue.length > 0 && this.activeLoads < this.config.maxConcurrentLoads) {
      const id = this.loadQueue.shift()!;
      const chunk = this.chunks.get(id);
      if (!chunk || chunk.state !== 'loading') continue;

      this.activeLoads++;

      // Simulate sync load (in real engine would be async)
      if (this.chunkGenerator) {
        chunk.data = this.chunkGenerator(chunk.x, chunk.z);
        const serialized = JSON.stringify(chunk.data);
        chunk.size = serialized.length;
        this.totalMemory += chunk.size;
      } else {
        chunk.data = { x: chunk.x, z: chunk.z };
        chunk.size = 64;
        this.totalMemory += 64;
      }
      chunk.state = 'loaded';
      chunk.lastAccessTime = Date.now();
      this.activeLoads--;
    }
  }

  private unloadChunk(id: string): void {
    const chunk = this.chunks.get(id);
    if (!chunk) return;
    this.totalMemory -= chunk.size;
    this.chunks.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Manual Load
  // ---------------------------------------------------------------------------

  loadChunk(x: number, z: number): WorldChunk {
    const id = `${x},${z}`;
    const existing = this.chunks.get(id);
    if (existing) return existing;

    this.requestLoad(x, z, 999);
    this.processLoadQueue();
    return this.chunks.get(id)!;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getChunk(x: number, z: number): WorldChunk | undefined {
    return this.chunks.get(`${x},${z}`);
  }

  getLoadedChunks(): WorldChunk[] {
    return [...this.chunks.values()].filter((c) => c.state === 'loaded');
  }

  getLoadedCount(): number {
    let count = 0;
    for (const c of this.chunks.values()) if (c.state === 'loaded') count++;
    return count;
  }

  getTotalMemory(): number {
    return this.totalMemory;
  }
  isOverBudget(): boolean {
    return this.totalMemory > this.config.memoryBudget;
  }
  getChunkSize(): number {
    return this.config.chunkSize;
  }
}

