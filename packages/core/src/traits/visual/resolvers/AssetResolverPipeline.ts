import type { TraitVisualConfig } from '../types';
import type { AssetResolverPlugin, ResolvedAsset } from './types';
import { CacheManager } from './CacheManager';
import { RateLimiter } from './RateLimiter';

/** Options for AssetResolverPipeline. */
export interface AssetResolverPipelineOptions {
  /** Pre-configured cache instance. */
  cache?: CacheManager;
  /**
   * When true, skip any plugin whose name starts with "ai-" or "text-to-".
   * Procedural and manifest resolvers still run. Prevents network calls in
   * offline/embedded environments. Defaults to false.
   */
  offline?: boolean;
  /**
   * Optional rate limiter applied to all API-based plugins.
   * Pass a configured `RateLimiter` to cap external API spend.
   */
  rateLimiter?: RateLimiter;
}

/** Primitive fallback returned when all resolvers fail. */
export interface PrimitiveFallback {
  shape: 'box' | 'sphere' | 'cylinder' | 'plane';
  size: [number, number, number];
  /** Deterministic colour hex derived from the trait name. */
  color: string;
}

function traitColor(trait: string): string {
  let hash = 0;
  for (let i = 0; i < trait.length; i++) {
    hash = (hash << 5) - hash + trait.charCodeAt(i);
    hash |= 0;
  }
  const r = (hash & 0xff0000) >> 16;
  const g = (hash & 0x00ff00) >> 8;
  const b = hash & 0x0000ff;
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function isApiPlugin(plugin: AssetResolverPlugin): boolean {
  return plugin.name.startsWith('ai-') || plugin.name.startsWith('text-to-');
}

/**
 * Orchestrates multiple asset resolvers in priority order.
 *
 * Resolution pipeline:
 * 1. Check cache → return immediately if hit
 * 2. Try each registered plugin in priority order (lower = first)
 *    - API plugins are skipped when `offline: true`
 *    - API plugins must acquire a rate-limiter token before running
 * 3. Cache the result on success
 * 4. Return a `PrimitiveFallback` descriptor if all resolvers fail
 *    (never returns null — always safe to render something)
 */
export class AssetResolverPipeline {
  private plugins: AssetResolverPlugin[] = [];
  private cache: CacheManager;
  private offline: boolean;
  private rateLimiter?: RateLimiter;

  constructor(options?: AssetResolverPipelineOptions | CacheManager) {
    if (options instanceof CacheManager) {
      // Legacy constructor: new AssetResolverPipeline(cache)
      this.cache = options;
      this.offline = false;
    } else {
      this.cache = options?.cache ?? new CacheManager();
      this.offline = options?.offline ?? false;
      this.rateLimiter = options?.rateLimiter;
    }
  }

  /** Register a resolver plugin. Plugins are sorted by priority. */
  register(plugin: AssetResolverPlugin): void {
    this.plugins.push(plugin);
    this.plugins.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Attempt to resolve an asset for the given trait.
   *
   * @returns Resolved asset on success, or a `PrimitiveFallback` when all
   *          resolvers fail (never returns null).
   */
  async resolve(trait: string, config: TraitVisualConfig): Promise<ResolvedAsset | PrimitiveFallback> {
    // 1. Cache hit
    const cached = this.cache.get(trait);
    if (cached) return cached;

    // 2. Try plugins in priority order
    for (const plugin of this.plugins) {
      if (this.offline && isApiPlugin(plugin)) continue;

      if (!plugin.canResolve(trait, config)) continue;

      if (isApiPlugin(plugin) && this.rateLimiter) {
        try {
          await this.rateLimiter.acquire();
        } catch {
          continue; // Rate limit exceeded — skip plugin
        }
      }

      try {
        const result = await plugin.resolve(trait, config);
        this.cache.set(trait, result);
        return result;
      } catch {
        continue;
      }
    }

    // 4. Graceful degradation — primitive fallback
    return this.buildFallback(trait);
  }

  private buildFallback(trait: string): PrimitiveFallback {
    let shape: PrimitiveFallback['shape'] = 'box';
    let size: [number, number, number] = [1, 1, 1];
    const t = trait.toLowerCase();
    if (t.includes('tree') || t.includes('tower') || t.includes('pillar')) {
      shape = 'cylinder'; size = [0.3, 2, 0.3];
    } else if (t.includes('rock') || t.includes('sphere') || t.includes('ball')) {
      shape = 'sphere'; size = [0.8, 0.8, 0.8];
    } else if (t.includes('ground') || t.includes('floor') || t.includes('terrain')) {
      shape = 'plane'; size = [4, 0.01, 4];
    }
    return { shape, size, color: traitColor(trait) };
  }

  /** Switch offline mode at runtime. */
  setOffline(offline: boolean): void { this.offline = offline; }

  /** Attach or replace the rate limiter. */
  setRateLimiter(limiter: RateLimiter | undefined): void { this.rateLimiter = limiter; }

  /** Get the cache manager (for stats/clearing). */
  getCache(): CacheManager { return this.cache; }

  /** Number of registered plugins. */
  get pluginCount(): number { return this.plugins.length; }

  /** Number of API plugins subject to rate limiting / offline skip. */
  get apiPluginCount(): number { return this.plugins.filter(isApiPlugin).length; }
}
