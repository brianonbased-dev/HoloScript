import { HoloObjectDecl } from '@holoscript/core';
import { HSPlusRuntime } from '@holoscript/core';

/** Extended runtime interface for chunk loading operations */
interface ChunkLoadableRuntime extends HSPlusRuntime {
  vrContext: { headset: { position: number[] } };
  mountObject?(obj: HoloObjectDecl): void;
  instantiateNode?(obj: HoloObjectDecl, root: unknown): void;
  rootInstance?: unknown;
}

// Type definitions for chunk loading
export interface ChunkInfo {
  file: string;
  bounds?: number[][];
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface Manifest {
  version: string;
  chunks: Record<string, ChunkInfo>;
}

export interface LoaderOptions {
  manifestUrl: string;
  baseUrl?: string;
}

export class ChunkLoader {
  private runtime: HSPlusRuntime;
  private manifest: Manifest | null = null;
  private loadedChunks: Set<string> = new Set();
  private loadingChunks: Set<string> = new Set();
  private options: LoaderOptions;

  constructor(runtime: HSPlusRuntime, options: LoaderOptions) {
    this.runtime = runtime;
    this.options = options;
  }

  /**
   * Initialize the loader by fetching the manifest
   */
  public async init(): Promise<void> {
    try {
      const response = await fetch(this.options.manifestUrl);
      this.manifest = await response.json();
    } catch (e) {
      console.error('[ChunkLoader] Failed to load manifest', e);
    }
  }

  /**
   * Update the loader (check for spatial triggers)
   */
  public update(): void {
    if (!this.manifest) return;

    const playerPos = (this.runtime as unknown as ChunkLoadableRuntime).vrContext.headset.position;
    if (!playerPos) return;

    for (const [chunkId, info] of Object.entries(this.manifest.chunks)) {
      if (this.loadedChunks.has(chunkId) || this.loadingChunks.has(chunkId)) continue;

      if (info.bounds && this.isPointInBounds(playerPos, info.bounds)) {
        this.loadChunk(chunkId);
      }
    }
  }

  /**
   * Manually load a chunk
   */
  public async loadChunk(chunkId: string): Promise<void> {
    if (!this.manifest || !this.manifest.chunks[chunkId]) return;
    if (this.loadedChunks.has(chunkId) || this.loadingChunks.has(chunkId)) return;

    this.loadingChunks.add(chunkId);
    try {
      const info = this.manifest.chunks[chunkId];
      const url = this.options.baseUrl ? `${this.options.baseUrl}/${info.file}` : info.file;

      const response = await fetch(url);
      const chunkData = await response.json();

      // Integrate chunk objects into runtime
      await this.integrateChunk(chunkData);

      this.loadedChunks.add(chunkId);
    } catch (e) {
      console.error(`[ChunkLoader] Failed to load chunk ${chunkId}`, e);
    } finally {
      this.loadingChunks.delete(chunkId);
    }
  }

  private async integrateChunk(chunk: Record<string, unknown>): Promise<void> {
    const objects = chunk.objects as HoloObjectDecl[] | undefined;
    if (!objects) return;

    const extRuntime = this.runtime as unknown as ChunkLoadableRuntime;

    for (const obj of objects) {
      // Use the runtime's internal instantiateNode if accessible,
      // or a public method if we add one.
      // For now, we assume we've added a mountObject method to the runtime interface.
      if (extRuntime.mountObject) {
        extRuntime.mountObject(obj);
      } else if (extRuntime.instantiateNode) {
        // Fallback or internal access
        extRuntime.instantiateNode(obj, extRuntime.rootInstance);
      }
    }
  }

  private isPointInBounds(point: number[], bounds: number[][]): boolean {
    if (bounds.length < 2) return false;
    const [min, max] = bounds;
    return (
      point[0] >= min[0] &&
      point[0] <= max[0] &&
      point[1] >= min[1] &&
      point[1] <= max[1] &&
      point[2] >= min[2] &&
      point[2] <= max[2]
    );
  }
}
