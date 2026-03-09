/**
 * GaussianCodecRegistry - Central registry for Gaussian splat codecs
 *
 * Manages codec lifecycle, format detection, and codec selection. Provides
 * a single entry point for the rendering pipeline to discover and use codecs
 * without coupling to any specific implementation.
 *
 * Features:
 *   - Auto-detection of file format from buffer magic bytes or URL extension
 *   - Priority-based codec selection when multiple codecs support a format
 *   - Lazy initialization of codecs on first use
 *   - Global singleton pattern for application-wide codec access
 *
 * Usage:
 *   ```typescript
 *   // Get the global registry (auto-populated with built-in codecs)
 *   const registry = getGlobalCodecRegistry();
 *
 *   // Decode a file by URL
 *   const result = await registry.decode('scene.spz');
 *
 *   // Or manually select a codec
 *   const spz = registry.getCodec('khr.spz.v2');
 *   const result = await spz.decode(buffer);
 *
 *   // Register a custom codec
 *   registry.register(new MyCustomCodec());
 *   ```
 *
 * Architecture decision (W.038):
 *   The registry decouples the rendering pipeline from specific codec implementations,
 *   enabling seamless transition from KHR/SPZ to MPEG GSC when the standard ships.
 *
 * @module gpu/codecs
 * @version 1.0.0
 */

import type { IGaussianCodec } from './IGaussianCodec.js';
import type {
  GaussianCodecId,
  GaussianFileExtension,
  GaussianCodecCapabilities,
  GaussianSplatData,
  GaussianDecodeOptions,
  CodecResult,
} from './types.js';
import { SpzCodec } from './SpzCodec.js';
import { MpegGscCodec } from './MpegGscCodec.js';
import { GltfGaussianSplatCodec } from './GltfGaussianSplatCodec.js';

// =============================================================================
// Registry Types
// =============================================================================

/**
 * Options for codec auto-detection.
 */
export interface CodecDetectOptions {
  /** URL of the file (used for extension-based detection) */
  url?: string;

  /** First bytes of the file (used for magic byte detection) */
  headerBytes?: ArrayBuffer;

  /** Explicit codec ID to use (bypasses detection) */
  codecId?: GaussianCodecId;

  /** Only consider codecs with these maturity levels */
  maturityFilter?: Array<'production' | 'beta' | 'experimental' | 'stub'>;
}

/**
 * Information about a registered codec.
 */
export interface RegisteredCodec {
  /** The codec instance */
  codec: IGaussianCodec;

  /** Codec capabilities */
  capabilities: GaussianCodecCapabilities;

  /** Registration priority (higher = preferred) */
  priority: number;

  /** Whether the codec has been initialized */
  initialized: boolean;
}

// =============================================================================
// GaussianCodecRegistry
// =============================================================================

export class GaussianCodecRegistry {
  private codecs = new Map<string, RegisteredCodec>();

  // ─── Registration ─────────────────────────────────────────────────────────

  /**
   * Register a codec with the registry.
   *
   * @param codec - Codec instance to register
   * @param priority - Priority for codec selection (default: 0, higher = preferred)
   * @returns The registry instance (for chaining)
   */
  register(codec: IGaussianCodec, priority: number = 0): this {
    const capabilities = codec.getCapabilities();
    this.codecs.set(capabilities.id, {
      codec,
      capabilities,
      priority,
      initialized: false,
    });
    return this;
  }

  /**
   * Unregister a codec by ID.
   *
   * @param codecId - ID of the codec to unregister
   * @returns true if the codec was found and removed
   */
  unregister(codecId: GaussianCodecId): boolean {
    const entry = this.codecs.get(codecId);
    if (entry) {
      entry.codec.dispose();
      this.codecs.delete(codecId);
      return true;
    }
    return false;
  }

  // ─── Codec Access ─────────────────────────────────────────────────────────

  /**
   * Get a specific codec by ID.
   *
   * @param codecId - Codec identifier
   * @returns The codec instance, or undefined if not registered
   */
  getCodec(codecId: GaussianCodecId): IGaussianCodec | undefined {
    return this.codecs.get(codecId)?.codec;
  }

  /**
   * Get a specific codec by ID, throwing if not found.
   *
   * @param codecId - Codec identifier
   * @returns The codec instance
   * @throws Error if the codec is not registered
   */
  requireCodec(codecId: GaussianCodecId): IGaussianCodec {
    const codec = this.getCodec(codecId);
    if (!codec) {
      throw new Error(
        `Codec '${codecId}' is not registered. Available codecs: ${this.getRegisteredIds().join(', ')}`
      );
    }
    return codec;
  }

  /**
   * Get all registered codec IDs.
   */
  getRegisteredIds(): GaussianCodecId[] {
    return Array.from(this.codecs.keys());
  }

  /**
   * Get capabilities of all registered codecs.
   */
  getAllCapabilities(): GaussianCodecCapabilities[] {
    return Array.from(this.codecs.values()).map((entry) => entry.capabilities);
  }

  /**
   * Check if a specific codec is registered.
   */
  hasCodec(codecId: GaussianCodecId): boolean {
    return this.codecs.has(codecId);
  }

  // ─── Auto-Detection ───────────────────────────────────────────────────────

  /**
   * Auto-detect the best codec for a given file.
   *
   * Detection priority:
   *   1. Explicit codecId in options (bypass detection)
   *   2. Magic byte detection from headerBytes
   *   3. File extension detection from URL
   *   4. Priority-based fallback among matching codecs
   *
   * @param options - Detection options (URL, header bytes, etc.)
   * @returns Best-matching codec, or undefined if no codec can handle the file
   */
  detectCodec(options: CodecDetectOptions): IGaussianCodec | undefined {
    // 1. Explicit codec ID
    if (options.codecId) {
      return this.getCodec(options.codecId);
    }

    const candidates: RegisteredCodec[] = [];

    // 2. Magic byte detection
    if (options.headerBytes) {
      for (const entry of this.codecs.values()) {
        if (this.matchesMaturity(entry, options.maturityFilter)) {
          if (entry.codec.canDecode(options.headerBytes)) {
            candidates.push(entry);
          }
        }
      }
    }

    // 3. File extension detection
    if (candidates.length === 0 && options.url) {
      const ext = this.extractExtension(options.url);
      if (ext) {
        for (const entry of this.codecs.values()) {
          if (this.matchesMaturity(entry, options.maturityFilter)) {
            if (entry.capabilities.fileExtensions.includes(ext)) {
              candidates.push(entry);
            }
          }
        }
      }
    }

    // 4. Priority-based selection
    if (candidates.length === 0) return undefined;

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].codec;
  }

  /**
   * Auto-detect and decode a buffer.
   *
   * Convenience method that combines detection and decode in one call.
   *
   * @param buffer - Raw binary data
   * @param options - Decode options + detection options
   * @returns Decoded Gaussian data
   * @throws Error if no codec can handle the data
   */
  async decode(
    buffer: ArrayBuffer,
    options?: GaussianDecodeOptions & CodecDetectOptions
  ): Promise<CodecResult<GaussianSplatData>> {
    const codec = this.detectCodec({
      codecId: options?.codecId,
      headerBytes: buffer.slice(0, Math.min(buffer.byteLength, 64)),
      url: options?.url,
      maturityFilter: options?.maturityFilter,
    });

    if (!codec) {
      throw new Error(
        'No codec found that can decode this data. ' +
          `Registered codecs: ${this.getRegisteredIds().join(', ')}. ` +
          'Ensure the correct codec is registered or specify codecId explicitly.'
      );
    }

    // Lazy initialization
    await this.ensureInitialized(codec);

    return codec.decode(buffer, options);
  }

  /**
   * Auto-detect codec from URL and decode via streaming.
   *
   * @param url - URL to fetch and decode
   * @param options - Decode and detection options
   * @returns Decoded Gaussian data
   */
  async decodeFromUrl(
    url: string,
    options?: GaussianDecodeOptions & CodecDetectOptions
  ): Promise<CodecResult<GaussianSplatData>> {
    const codec = this.detectCodec({
      codecId: options?.codecId,
      url,
      maturityFilter: options?.maturityFilter ?? ['production', 'beta'],
    });

    if (!codec) {
      throw new Error(
        `No codec found for URL '${url}'. ` +
          `Registered codecs: ${this.getRegisteredIds().join(', ')}`
      );
    }

    await this.ensureInitialized(codec);

    // Fetch and decode
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
    }

    const buffer = await response.arrayBuffer();
    return codec.decode(buffer, options);
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  /**
   * Initialize all registered codecs.
   *
   * Useful for pre-warming at application startup.
   */
  async initializeAll(): Promise<void> {
    const entries = Array.from(this.codecs.values());
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.initialized) {
          await entry.codec.initialize();
          entry.initialized = true;
        }
      })
    );
  }

  /**
   * Dispose all registered codecs and clear the registry.
   */
  disposeAll(): void {
    for (const entry of this.codecs.values()) {
      entry.codec.dispose();
    }
    this.codecs.clear();
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async ensureInitialized(codec: IGaussianCodec): Promise<void> {
    const id = codec.getCapabilities().id;
    const entry = this.codecs.get(id);
    if (entry && !entry.initialized) {
      await codec.initialize();
      entry.initialized = true;
    }
  }

  private extractExtension(url: string): GaussianFileExtension | undefined {
    const clean = url.split(/[?#]/)[0];
    const ext = clean.split('.').pop()?.toLowerCase();
    return ext as GaussianFileExtension | undefined;
  }

  private matchesMaturity(
    entry: RegisteredCodec,
    filter?: Array<'production' | 'beta' | 'experimental' | 'stub'>
  ): boolean {
    if (!filter) return true;
    return filter.includes(entry.capabilities.maturity);
  }
}

// =============================================================================
// Default Registry with Built-in Codecs
// =============================================================================

/**
 * Create a registry pre-populated with all built-in codecs.
 *
 * Built-in codecs:
 *   - SpzCodec (khr.spz.v2): Production, priority 100
 *   - GltfGaussianSplatCodec (khr.gltf.gaussian): Beta, priority 50
 *   - MpegGscCodec (mpeg.gsc.v1): Stub, priority 0
 */
export function createDefaultCodecRegistry(): GaussianCodecRegistry {
  const registry = new GaussianCodecRegistry();

  // Register SPZ codec with high priority (production-ready)
  registry.register(new SpzCodec(), 100);

  // Register glTF Gaussian splatting codec (KHR_gaussian_splatting extension family)
  registry.register(new GltfGaussianSplatCodec(), 50);

  // Register MPEG GSC stub with low priority (not yet usable)
  registry.register(new MpegGscCodec(), 0);

  return registry;
}

// =============================================================================
// Global Singleton
// =============================================================================

let globalRegistry: GaussianCodecRegistry | null = null;

/**
 * Get or create the global codec registry.
 *
 * The global registry is pre-populated with all built-in codecs.
 * Additional codecs can be registered at any time.
 *
 * @example
 * ```typescript
 * const registry = getGlobalCodecRegistry();
 *
 * // Decode an SPZ file
 * const result = await registry.decode(spzBuffer);
 *
 * // Register a custom codec
 * registry.register(new MyCustomCodec(), 50);
 * ```
 */
export function getGlobalCodecRegistry(): GaussianCodecRegistry {
  if (!globalRegistry) {
    globalRegistry = createDefaultCodecRegistry();
  }
  return globalRegistry;
}

/**
 * Reset the global codec registry.
 *
 * Disposes all codecs and creates a fresh registry with built-in codecs.
 * Useful for testing or when reinitializing the application.
 */
export function resetGlobalCodecRegistry(): void {
  if (globalRegistry) {
    globalRegistry.disposeAll();
    globalRegistry = null;
  }
}
