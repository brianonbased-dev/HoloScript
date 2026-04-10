/**
 * Asset manifest format for pre-bundled trait → model mappings.
 *
 * A manifest describes a bundle of pre-made 3D models / textures that ship
 * alongside a HoloScript package or scene. The `ManifestResolver` loads
 * these at startup and makes them available without any network calls.
 *
 * Format (JSON):
 * ```json
 * {
 *   "version": "1.0.0",
 *   "name": "@myteam/vr-assets",
 *   "entries": [
 *     { "trait": "chair", "url": "./models/chair.glb", "type": "model" },
 *     { "trait": "wooden", "url": "./textures/wood.png", "type": "texture" }
 *   ]
 * }
 * ```
 */

import type { TraitVisualConfig } from '../types';
import type { AssetResolverPlugin, ResolvedAsset, ResolvedAssetType } from './types';

// ─── Schema ───────────────────────────────────────────────────────────────────

/** A single entry mapping a trait name to a pre-bundled asset. */
export interface ManifestEntry {
  /** Trait name this asset satisfies. */
  trait: string;
  /** URL to the asset file (relative to manifest location or absolute). */
  url: string;
  /** Asset type. */
  type: ResolvedAssetType;
  /** Metadata to forward in the resolved asset. */
  metadata?: Record<string, unknown>;
}

/** Top-level manifest document. */
export interface AssetManifestDocument {
  /** Manifest schema version. */
  version: string;
  /** Display name for the asset bundle. */
  name: string;
  /** Base URL for resolving relative asset paths. */
  baseUrl?: string;
  /** Entries in this manifest. */
  entries: ManifestEntry[];
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Thrown when a manifest document is invalid. */
export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(`AssetManifest validation error: ${message}`);
    this.name = 'ManifestValidationError';
  }
}

/**
 * Validate and parse a manifest object.
 * Throws `ManifestValidationError` on any structural issues.
 */
export function parseManifest(raw: unknown): AssetManifestDocument {
  if (typeof raw !== 'object' || raw === null) {
    throw new ManifestValidationError('manifest must be a JSON object');
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.version !== 'string' || !obj.version) {
    throw new ManifestValidationError('"version" must be a non-empty string');
  }
  if (typeof obj.name !== 'string' || !obj.name) {
    throw new ManifestValidationError('"name" must be a non-empty string');
  }
  if (!Array.isArray(obj.entries)) {
    throw new ManifestValidationError('"entries" must be an array');
  }

  const entries: ManifestEntry[] = [];
  for (let i = 0; i < obj.entries.length; i++) {
    const e = obj.entries[i] as Record<string, unknown>;
    if (typeof e.trait !== 'string' || !e.trait) {
      throw new ManifestValidationError(`entry[${i}].trait must be a non-empty string`);
    }
    if (typeof e.url !== 'string' || !e.url) {
      throw new ManifestValidationError(`entry[${i}].url must be a non-empty string`);
    }
    const validTypes: ResolvedAssetType[] = ['model', 'texture', 'shader'];
    if (!validTypes.includes(e.type as ResolvedAssetType)) {
      throw new ManifestValidationError(
        `entry[${i}].type must be one of: ${validTypes.join(', ')}`
      );
    }
    entries.push({
      trait: e.trait as string,
      url: e.url as string,
      type: e.type as ResolvedAssetType,
      metadata:
        typeof e.metadata === 'object' && e.metadata !== null
          ? (e.metadata as Record<string, unknown>)
          : undefined,
    });
  }

  return {
    version: obj.version as string,
    name: obj.name as string,
    baseUrl: typeof obj.baseUrl === 'string' ? obj.baseUrl : undefined,
    entries,
  };
}

// ─── ManifestResolver ─────────────────────────────────────────────────────────

/**
 * Resolves assets from a pre-built manifest of bundled files.
 *
 * Highest priority resolver (priority 5) — checks the manifest first
 * before attempting any generation. Assets are loaded lazily on first use
 * via `fetch()` and the result cached.
 */
export class ManifestResolver implements AssetResolverPlugin {
  readonly name = 'manifest';
  readonly priority = 5; // Highest — checked before procedural or AI

  private index = new Map<string, ManifestEntry>();
  private loadedCache = new Map<string, ResolvedAsset>();
  private baseUrl: string;

  constructor(manifest: AssetManifestDocument) {
    this.baseUrl = manifest.baseUrl ?? '';
    for (const entry of manifest.entries) {
      this.index.set(entry.trait, entry);
    }
  }

  /** Build a ManifestResolver from a raw JSON object. */
  static fromJSON(raw: unknown): ManifestResolver {
    return new ManifestResolver(parseManifest(raw));
  }

  /** Total number of traits covered by this manifest. */
  get size(): number {
    return this.index.size;
  }

  /** All trait names covered. */
  get traits(): string[] {
    return [...this.index.keys()];
  }

  canResolve(trait: string, _config: TraitVisualConfig): boolean {
    return this.index.has(trait);
  }

  async resolve(trait: string, _config: TraitVisualConfig): Promise<ResolvedAsset> {
    // Return cached result if already loaded
    const cached = this.loadedCache.get(trait);
    if (cached) return cached;

    const entry = this.index.get(trait);
    if (!entry) throw new Error(`ManifestResolver: no entry for trait "${trait}"`);

    const url = entry.url.startsWith('http') ? entry.url : `${this.baseUrl}${entry.url}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ManifestResolver: failed to fetch "${url}" (HTTP ${response.status})`);
    }

    const data = await response.arrayBuffer();
    const asset: ResolvedAsset = {
      type: entry.type,
      url,
      data,
      metadata: {
        ...entry.metadata,
        source: 'manifest',
        manifest: 'pre-bundled',
        trait,
      },
    };

    this.loadedCache.set(trait, asset);
    return asset;
  }

  /** Clear the loaded asset cache (e.g. on hot-reload). */
  clearCache(): void {
    this.loadedCache.clear();
  }
}

// ─── Helpers for building manifests programmatically ─────────────────────────

/** Builder for constructing manifests in code. */
export class AssetManifestBuilder {
  private doc: AssetManifestDocument;

  constructor(name: string, version = '1.0.0', baseUrl?: string) {
    this.doc = { version, name, baseUrl, entries: [] };
  }

  /** Add a model entry. */
  model(trait: string, url: string, metadata?: Record<string, unknown>): this {
    this.doc.entries.push({ trait, url, type: 'model', metadata });
    return this;
  }

  /** Add a texture entry. */
  texture(trait: string, url: string, metadata?: Record<string, unknown>): this {
    this.doc.entries.push({ trait, url, type: 'texture', metadata });
    return this;
  }

  /** Finalise and return the manifest document. */
  build(): AssetManifestDocument {
    return { ...this.doc, entries: [...this.doc.entries] };
  }

  /** Serialise to JSON string. */
  toJSON(indent = 2): string {
    return JSON.stringify(this.build(), null, indent);
  }
}
