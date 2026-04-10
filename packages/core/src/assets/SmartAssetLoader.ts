/**
 * @holoscript/core Smart Asset Loader
 *
 * Intelligent asset loading with platform awareness, automatic optimization,
 * streaming support, and memory management.
 */

import { AssetMetadata } from './AssetMetadata';
import { AssetRegistry, getAssetRegistry } from './AssetRegistry';
import { resolveAssetAlias } from './AssetAliases';

// ============================================================================
// Loader Configuration
// ============================================================================

export type Platform = 'web' | 'mobile' | 'vr' | 'ar' | 'desktop';
export type Quality = 'low' | 'medium' | 'high' | 'ultra';
export type LoadPriority = 'critical' | 'high' | 'normal' | 'low' | 'background';

export interface LoaderConfig {
  /** Target platform */
  platform: Platform;

  /** Quality preset */
  quality: Quality;

  /** Memory budget in bytes */
  memoryBudget: number;

  /** Enable streaming for large assets */
  enableStreaming: boolean;

  /** Streaming chunk size */
  streamingChunkSize: number;

  /** Enable automatic LOD selection */
  autoLOD: boolean;

  /** Base URL for assets */
  baseUrl: string;

  /** CDN URL (optional) */
  cdnUrl?: string;

  /** Retry configuration */
  retry: {
    maxAttempts: number;
    delayMs: number;
    backoffMultiplier: number;
  };

  /** Timeout in milliseconds */
  timeout: number;

  /** Injectable model parser */
  modelParser?: <T>(buffer: ArrayBuffer, metadata: AssetMetadata) => Promise<T>;
}

// ============================================================================
// Load Request
// ============================================================================

export interface LoadRequest {
  /** Asset ID or path */
  asset: string | AssetMetadata;

  /** Load priority */
  priority?: LoadPriority;

  /** Force specific LOD level */
  forceLOD?: number;

  /** Force specific quality */
  forceQuality?: Quality;

  /** Skip cache */
  skipCache?: boolean;

  /** Progress callback */
  onProgress?: (progress: LoadProgress) => void;

  /** Custom headers */
  headers?: Record<string, string>;
}

export interface LoadProgress {
  /** Asset ID */
  assetId: string;

  /** Bytes loaded */
  loaded: number;

  /** Total bytes */
  total: number;

  /** Progress percentage (0-100) */
  percent: number;

  /** Current phase */
  phase: 'connecting' | 'downloading' | 'processing' | 'complete';
}

// ============================================================================
// Load Result
// ============================================================================

export interface LoadResult<T = unknown> {
  /** Asset ID */
  assetId: string;

  /** Asset metadata */
  metadata: AssetMetadata;

  /** Loaded data */
  data: T;

  /** Actual LOD level loaded */
  lodLevel: number;

  /** Actual quality */
  quality: Quality;

  /** Load time in milliseconds */
  loadTime: number;

  /** Was loaded from cache? */
  fromCache: boolean;

  /** Final URL used */
  url: string;
}

// ============================================================================
// Smart Asset Loader
// ============================================================================

export class SmartAssetLoader {
  private config: LoaderConfig;
  private registry: AssetRegistry;
  private loadQueue: Map<string, Promise<LoadResult>> = new Map();
  private currentMemoryUsage = 0;

  constructor(config: Partial<LoaderConfig> = {}) {
    this.config = {
      platform: this.detectPlatform(),
      quality: 'medium',
      memoryBudget: 512 * 1024 * 1024, // 512MB
      enableStreaming: true,
      streamingChunkSize: 1024 * 1024, // 1MB
      autoLOD: true,
      baseUrl: '/',
      retry: {
        maxAttempts: 3,
        delayMs: 1000,
        backoffMultiplier: 2,
      },
      timeout: 30000,
      ...config,
    };

    this.registry = getAssetRegistry();
  }

  /**
   * Load an asset with smart optimization
   */
  async load<T = unknown>(request: LoadRequest): Promise<LoadResult<T>> {
    const startTime = performance.now();

    // Resolve asset name/alias
    const assetKey =
      typeof request.asset === 'string' ? resolveAssetAlias(request.asset) : request.asset.id;

    // Resolve asset metadata
    const metadata =
      typeof request.asset === 'string'
        ? (this.registry.getAsset(assetKey) ?? this.registry.getAssetByPath(assetKey))
        : request.asset;

    if (!metadata) {
      throw new Error(`Asset not found: ${request.asset}`);
    }

    // Check if already loading
    const existingLoad = this.loadQueue.get(metadata.id);
    if (existingLoad && !request.skipCache) {
      return existingLoad as Promise<LoadResult<T>>;
    }

    // Create load promise
    const loadPromise = this.doLoad<T>(metadata, request, startTime);
    this.loadQueue.set(metadata.id, loadPromise as Promise<LoadResult>);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loadQueue.delete(metadata.id);
    }
  }

  /**
   * Internal load implementation
   */
  private async doLoad<T>(
    metadata: AssetMetadata,
    request: LoadRequest,
    startTime: number
  ): Promise<LoadResult<T>> {
    // Check cache first
    if (!request.skipCache) {
      const cached = this.registry.getCached<T>(metadata.id);
      if (cached !== undefined) {
        return {
          assetId: metadata.id,
          metadata,
          data: cached,
          lodLevel: 0,
          quality: this.config.quality,
          loadTime: performance.now() - startTime,
          fromCache: true,
          url: '',
        };
      }
    }

    // Determine optimal LOD level
    const lodLevel = request.forceLOD ?? this.selectLODLevel(metadata);

    // Determine quality
    const quality = request.forceQuality ?? this.selectQuality(metadata);

    // Build URL
    const url = this.buildAssetUrl(metadata, lodLevel, quality);

    // Report progress: connecting
    request.onProgress?.({
      assetId: metadata.id,
      loaded: 0,
      total: metadata.fileSize,
      percent: 0,
      phase: 'connecting',
    });

    // Fetch with retry
    const data = await this.fetchWithRetry<T>(url, metadata, request);

    // Update memory tracking
    this.currentMemoryUsage += metadata.estimatedGPUMemory + metadata.estimatedCPUMemory;

    // Cache the result
    this.registry.setCached(metadata.id, data, metadata.fileSize);

    // Report progress: complete
    request.onProgress?.({
      assetId: metadata.id,
      loaded: metadata.fileSize,
      total: metadata.fileSize,
      percent: 100,
      phase: 'complete',
    });

    return {
      assetId: metadata.id,
      metadata,
      data,
      lodLevel,
      quality,
      loadTime: performance.now() - startTime,
      fromCache: false,
      url,
    };
  }

  /**
   * Fetch asset with retry logic
   */
  private async fetchWithRetry<T>(
    url: string,
    metadata: AssetMetadata,
    request: LoadRequest
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.config.retry.delayMs;

    for (let attempt = 0; attempt < this.config.retry.maxAttempts; attempt++) {
      try {
        return await this.fetchAsset<T>(url, metadata, request);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.retry.maxAttempts - 1) {
          await this.sleep(delay);
          delay *= this.config.retry.backoffMultiplier;
        }
      }
    }

    throw lastError ?? new Error('Failed to load asset');
  }

  /**
   * Fetch single asset
   */
  private async fetchAsset<T>(
    url: string,
    metadata: AssetMetadata,
    request: LoadRequest
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: request.headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Track download progress
      if (request.onProgress && response.body) {
        const reader = response.body.getReader();
        const contentLength = parseInt(response.headers.get('content-length') ?? '0', 10);
        const chunks: Uint8Array[] = [];
        let loaded = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          chunks.push(value);
          loaded += value.length;

          request.onProgress({
            assetId: metadata.id,
            loaded,
            total: contentLength || metadata.fileSize,
            percent: contentLength ? (loaded / contentLength) * 100 : 0,
            phase: 'downloading',
          });
        }

        // Report processing phase
        request.onProgress({
          assetId: metadata.id,
          loaded,
          total: contentLength || metadata.fileSize,
          percent: 100,
          phase: 'processing',
        });

        // Combine chunks and parse
        const allChunks = new Uint8Array(loaded);
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }

        return this.parseAssetData<T>(allChunks.buffer, metadata);
      }

      // No progress tracking, just parse
      const buffer = await response.arrayBuffer();
      return this.parseAssetData<T>(buffer, metadata);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse asset data based on type
   */
  private parseAssetData<T>(buffer: ArrayBuffer, metadata: AssetMetadata): T {
    switch (metadata.assetType) {
      case 'texture':
        return this.parseTexture(buffer, metadata) as T;
      case 'model':
      case 'scene':
        if (this.config.modelParser) {
          return this.config.modelParser<T>(buffer, metadata) as unknown as T;
        }
        return buffer as T;
      case 'audio':
        return buffer as T;
      case 'video':
        return new Blob([buffer], { type: metadata.mimeType }) as T;
      case 'script':
      case 'data':
        const text = new TextDecoder().decode(buffer);
        if (
          metadata.format === 'holo' ||
          metadata.format === 'hsplus' ||
          metadata.format === 'hs'
        ) {
          return text as T;
        }
        try {
          return JSON.parse(text) as T;
        } catch {
          return text as T;
        }
      default:
        return buffer as T;
    }
  }

  /**
   * Parse texture data
   */
  private parseTexture(buffer: ArrayBuffer, _metadata: AssetMetadata): ImageBitmap | ArrayBuffer {
    // For compressed formats, return raw buffer
    // Runtime will decode using GPU
    return buffer;
  }

  /**
   * Select optimal LOD level based on platform and quality
   */
  private selectLODLevel(metadata: AssetMetadata): number {
    if (!this.config.autoLOD || !metadata.lodLevels || metadata.lodLevels.length === 0) {
      return 0;
    }

    // Platform-based LOD selection
    let targetLOD = 0;

    switch (this.config.platform) {
      case 'mobile':
        targetLOD = Math.min(2, metadata.lodLevels.length - 1);
        break;
      case 'vr':
        targetLOD = this.config.quality === 'low' ? 1 : 0;
        break;
      case 'ar':
        targetLOD = 1;
        break;
      default:
        targetLOD = 0;
    }

    // Quality adjustment
    switch (this.config.quality) {
      case 'low':
        targetLOD = Math.min(targetLOD + 2, metadata.lodLevels.length - 1);
        break;
      case 'medium':
        targetLOD = Math.min(targetLOD + 1, metadata.lodLevels.length - 1);
        break;
      case 'ultra':
        targetLOD = 0;
        break;
    }

    return Math.max(0, targetLOD);
  }

  /**
   * Select quality based on platform and memory
   */
  private selectQuality(metadata: AssetMetadata): Quality {
    // Check memory budget
    const projectedUsage = this.currentMemoryUsage + metadata.estimatedGPUMemory;
    if (projectedUsage > this.config.memoryBudget * 0.9) {
      return 'low';
    }
    if (projectedUsage > this.config.memoryBudget * 0.7) {
      return 'medium';
    }

    // Platform-based quality
    switch (this.config.platform) {
      case 'mobile':
        return 'low';
      case 'vr':
      case 'ar':
        return 'medium';
      case 'desktop':
        return this.config.quality;
      default:
        return 'medium';
    }
  }

  /**
   * Build asset URL with LOD and quality parameters
   */
  private buildAssetUrl(metadata: AssetMetadata, lodLevel: number, quality: Quality): string {
    // Use CDN if available
    const baseUrl = this.config.cdnUrl ?? this.config.baseUrl;

    // Get LOD-specific path
    let assetPath = metadata.sourcePath;
    if (metadata.lodLevels && metadata.lodLevels[lodLevel]?.assetPath) {
      assetPath = metadata.lodLevels[lodLevel].assetPath!;
    }

    // Combine URL
    let url: URL;
    try {
      url = new URL(assetPath, baseUrl);
    } catch {
      // Fallback: If baseUrl is not absolute (e.g. '/'), try making it absolute with a placeholder
      // or just join paths if it's meant for local use (though fetch expects URL)
      const absoluteBase = baseUrl.startsWith('http')
        ? baseUrl
        : `http://localhost${baseUrl.startsWith('/') ? '' : '/'}${baseUrl}`;
      try {
        url = new URL(assetPath, absoluteBase);
      } catch {
        // Ultimate fallback: just use a dummy URL to avoid crash, logging warning
        url = new URL(assetPath, 'http://localhost/');
      }
    }

    // Add quality parameter for texture formats that support it
    if (metadata.assetType === 'texture' && quality !== 'high') {
      url.searchParams.set('quality', quality);
    }

    return url.toString();
  }

  /**
   * Detect current platform
   */
  private detectPlatform(): Platform {
    if (typeof navigator === 'undefined') {
      return 'web';
    }

    // Check for XR support
    if ('xr' in navigator) {
      return 'vr';
    }

    // Check for mobile
    const userAgent = navigator.userAgent.toLowerCase();
    if (/android|iphone|ipad|ipod|mobile/i.test(userAgent)) {
      return 'mobile';
    }

    return 'desktop';
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Batch Loading ───────────────────────────────────────────────────────

  /**
   * Load multiple assets
   */
  async loadMany<T = unknown>(
    requests: LoadRequest[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<LoadResult<T>[]> {
    const total = requests.length;
    let completed = 0;

    const results = await Promise.all(
      requests.map(async (request) => {
        const result = await this.load<T>(request);
        completed++;
        onProgress?.(completed, total);
        return result;
      })
    );

    return results;
  }

  /**
   * Load assets by group
   */
  async loadGroup<T = unknown>(groupId: string): Promise<LoadResult<T>[]> {
    const manifest = this.registry.getActiveManifest();
    if (!manifest) {
      throw new Error('No active manifest');
    }

    const assets = manifest.getGroupAssets(groupId);
    return this.loadMany<T>(assets.map((a: AssetMetadata) => ({ asset: a })));
  }

  // ─── Memory Management ───────────────────────────────────────────────────

  /**
   * Get current memory usage
   */
  getMemoryUsage(): { current: number; budget: number; percent: number } {
    return {
      current: this.currentMemoryUsage,
      budget: this.config.memoryBudget,
      percent: (this.currentMemoryUsage / this.config.memoryBudget) * 100,
    };
  }

  /**
   * Release memory by unloading assets
   */
  releaseMemory(_targetBytes: number): string[] {
    const unloaded: string[] = [];
    // Delegate to registry's cache eviction
    // This is simplified - real implementation would track loaded assets
    return unloaded;
  }

  // ─── Configuration ───────────────────────────────────────────────────────

  /**
   * Get configuration
   */
  getConfig(): LoaderConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LoaderConfig>): void {
    Object.assign(this.config, updates);
  }

  /**
   * Set platform
   */
  setPlatform(platform: Platform): void {
    this.config.platform = platform;
  }

  /**
   * Set quality
   */
  setQuality(quality: Quality): void {
    this.config.quality = quality;
  }

  /**
   * Inject a model parser
   */
  setModelParser(parser: <T>(buffer: ArrayBuffer, metadata: AssetMetadata) => Promise<T>): void {
    this.config.modelParser = parser;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

let defaultLoader: SmartAssetLoader | null = null;

/**
 * Get default smart asset loader
 */
export function getSmartAssetLoader(config?: Partial<LoaderConfig>): SmartAssetLoader {
  if (!defaultLoader) {
    defaultLoader = new SmartAssetLoader(config);
  }
  return defaultLoader;
}

/**
 * Create a new smart asset loader
 */
export function createSmartAssetLoader(config?: Partial<LoaderConfig>): SmartAssetLoader {
  return new SmartAssetLoader(config);
}

/**
 * Load asset using default loader
 */
export async function smartLoad<T = unknown>(request: LoadRequest): Promise<LoadResult<T>> {
  return getSmartAssetLoader().load<T>(request);
}
