import type { TraitVisualConfig } from '../types';

/** Types of assets that can be resolved. */
export type ResolvedAssetType = 'texture' | 'model' | 'shader';

/** Result of an asset resolution. */
export interface ResolvedAsset {
  /** What kind of asset was produced. */
  type: ResolvedAssetType;
  /** URL to the resolved asset (if external/cached). */
  url?: string;
  /** Raw asset data (if generated in-memory). */
  data?: ArrayBuffer;
  /** Additional metadata (dimensions, format, etc.). */
  metadata?: Record<string, unknown>;
}

/**
 * Plugin interface for asset resolvers.
 *
 * Resolvers are tried in priority order (lower = higher priority).
 * The first resolver that returns a result wins.
 */
export interface AssetResolverPlugin {
  /** Unique name for this resolver (for logging/debugging). */
  name: string;
  /** Priority order — lower values are tried first. */
  priority: number;
  /** Return true if this resolver can handle the given trait. */
  canResolve(trait: string, config: TraitVisualConfig): boolean;
  /** Attempt to resolve an asset for the trait. */
  resolve(trait: string, config: TraitVisualConfig): Promise<ResolvedAsset>;
}
