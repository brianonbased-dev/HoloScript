/**
 * @holoscript/core Asset Streamer Interface
 *
 * Defines the @builtin runtime interface for predictive asset streaming.
 * Runtimes implement this to manage low-priority background loading and decompression.
 */

/**
 * Asset streaming priority
 */
export enum StreamPriority {
  IMMEDIATE = 0,
  PREDICTIVE_HIGH = 1,
  PREDICTIVE_LOW = 2,
  BACKGROUND = 3,
}

/**
 * Asset metadata for streaming
 */
export interface AssetStreamRequest {
  id: string;
  url: string;
  type: 'mesh' | 'texture' | 'audio' | 'script';
  priority: StreamPriority;
  size?: number;
  compression?: 'draco' | 'meshopt' | 'none';
}

/**
 * Streaming status
 */
export interface StreamStatus {
  id: string;
  progress: number; // 0-1
  state: 'queued' | 'loading' | 'decompressing' | 'ready' | 'error';
  error?: string;
}

/**
 * AssetStreamer @builtin Interface
 */
export interface AssetStreamer {
  /** Initialize the streamer with config */
  initialize(config: { workerPoolSize?: number; memoryLimitMB?: number }): Promise<void>;

  /**
   * Request an asset to be streamed.
   * If priority is PREDICTIVE, it will be loaded in the background.
   */
  requestAsset(request: AssetStreamRequest): void;

  /** Cancel a pending stream request */
  cancelRequest(id: string): void;

  /** Get the status of a specific asset stream */
  getStatus(id: string): StreamStatus | undefined;

  /** Purge old or distant assets from memory */
  purgeAssets(distanceThreshold: number, currentPlayerPos: [number, number, number]): void;

  /** Dispose resources */
  dispose(): void;
}

/**
 * Global registry for builtin AssetStreamers
 */
export const assetStreamerRegistry = new Map<string, AssetStreamer>();

/**
 * Register an asset streamer implementation
 */
export function registerAssetStreamer(name: string, streamer: AssetStreamer): void {
  assetStreamerRegistry.set(name, streamer);
}

/**
 * Get a registered asset streamer
 */
export function getAssetStreamer(name: string): AssetStreamer | undefined {
  return assetStreamerRegistry.get(name);
}
