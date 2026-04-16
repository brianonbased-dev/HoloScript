/**
 * WorldGeneratorAdapter — contract for world generation backends
 *
 * Implementations:
 *   HYWorldAdapter   — Tencent HY-World 2.0 (WorldMirror 2.0, public today)
 *   StableWorldAdapter — future: Stable World / custom endpoint
 *
 * The trait emits 'world:generate'; WorldGeneratorService routes it here.
 */

// =============================================================================
// REQUEST / RESPONSE TYPES
// =============================================================================

export interface WorldGenerationRequest {
  /** Primary text prompt for world generation */
  prompt: string;
  /** Single-view image path or URL for single-image reconstruction */
  input_image?: string;
  /** Multi-view images for HY-World 2.0 multi-view mode */
  input_images?: string[];
  /** Output format */
  format: 'mesh' | '3dgs' | 'both';
  /** Quality tier — adapter maps to backend resolution params */
  quality: 'low' | 'medium' | 'high' | 'ultra';
  /** Reproducible seed */
  seed?: number;
  /** Enable navmesh generation via WorldNav (HY-World 2.0 full pipeline only) */
  navEnabled?: boolean;
  /** Enable physics + collision via WorldLens interactive mode */
  interactiveMode?: boolean;
}

export interface WorldMetadata {
  /** Output format actually produced */
  format: 'mesh' | '3dgs' | 'both';
  /** Axis-aligned bounding box [xMin, yMin, zMin, xMax, yMax, zMax] */
  bounds: [number, number, number, number, number, number];
  /** Suggested agent start position (WorldNav output) */
  agentStart?: [number, number, number];
  /** Waypoints from WorldNav trajectory planning */
  waypoints?: [number, number, number][];
  /** Number of 3DGS splats (if format includes 3dgs) */
  splatCount?: number;
  /** Triangle count (if format includes mesh) */
  triangleCount?: number;
  /** milliseconds taken on the backend */
  generationMs?: number;
}

export interface WorldGenerationResult {
  /** Opaque ID from the backend; used for progress polling and cancellation */
  generationId: string;
  /** Primary asset URL — 3DGS .ply / .splat or mesh .glb */
  assetUrl: string;
  /** Navmesh .glb URL — present when navEnabled was true */
  navmeshUrl?: string;
  /** Point cloud .ply URL — present when format includes 'both' */
  pointCloudUrl?: string;
  /** Provenance and spatial metadata */
  metadata: WorldMetadata;
}

// =============================================================================
// ADAPTER INTERFACE
// =============================================================================

export interface WorldGeneratorAdapter {
  /** Stable identifier — matches WorldGeneratorEngine type */
  readonly id: string;

  /**
   * Kick off world generation. Must resolve with a complete result once done.
   * For long jobs the adapter should poll internally or use a webhook.
   */
  generate(req: WorldGenerationRequest): Promise<WorldGenerationResult>;

  /**
   * Poll generation progress. Returns 0–1.
   * Optional — callers will not call this if not implemented.
   */
  getProgress?(generationId: string): Promise<number>;

  /**
   * Cancel an in-flight generation.
   * Optional — callers will ignore missing implementation gracefully.
   */
  cancel?(generationId: string): Promise<void>;
}

// =============================================================================
// REGISTRY
// =============================================================================

export class WorldAdapterRegistry {
  private readonly adapters = new Map<string, WorldGeneratorAdapter>();

  register(adapter: WorldGeneratorAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(engineId: string): WorldGeneratorAdapter {
    const adapter = this.adapters.get(engineId);
    if (!adapter) {
      throw new Error(
        `[WorldAdapterRegistry] No adapter registered for engine '${engineId}'. ` +
          `Registered: ${[...this.adapters.keys()].join(', ') || '(none)'}`
      );
    }
    return adapter;
  }

  has(engineId: string): boolean {
    return this.adapters.has(engineId);
  }

  list(): string[] {
    return [...this.adapters.keys()];
  }
}

/** Singleton registry used by WorldGeneratorService */
export const worldAdapterRegistry = new WorldAdapterRegistry();
