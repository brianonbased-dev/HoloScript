import type { TraitVisualConfig } from '../types';
import type { AssetResolverPlugin, ResolvedAsset } from './types';

/**
 * Configuration for the AI texture generation service.
 */
export interface TextureServiceConfig {
  /** Base URL of the texture generation API. */
  endpoint: string;
  /** API key for authentication (optional). */
  apiKey?: string;
  /** Request timeout in ms (default: 30000). */
  timeout?: number;
  /** Texture resolution to request (default: 512). */
  resolution?: number;
}

/**
 * AI-powered texture resolver.
 *
 * Sends trait descriptions to an external text-to-texture service
 * and returns the generated texture. Gracefully degrades when the
 * service is unavailable — callers should fall back to PBR values.
 *
 * This is a service adapter; the actual AI generation happens externally.
 * Configure via `TextureServiceConfig` at construction time.
 */
export class TextureResolver implements AssetResolverPlugin {
  readonly name = 'ai-texture';
  readonly priority = 20; // Low priority — try procedural first

  private config: TextureServiceConfig;

  constructor(config: TextureServiceConfig) {
    this.config = config;
  }

  canResolve(_trait: string, config: TraitVisualConfig): boolean {
    // Can attempt to resolve any trait that has material or tags
    return !!(config.material || config.tags?.length);
  }

  async resolve(trait: string, config: TraitVisualConfig): Promise<ResolvedAsset> {
    const prompt = this.buildPrompt(trait, config);
    const resolution = this.config.resolution ?? 512;
    const timeout = this.config.timeout ?? 30_000;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          resolution,
          format: 'rgba8',
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Texture service returned ${response.status}: ${response.statusText}`);
      }

      const data = await response.arrayBuffer();

      return {
        type: 'texture',
        data,
        metadata: {
          generator: 'ai-texture',
          prompt,
          width: resolution,
          height: resolution,
          format: 'rgba8',
          trait,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Build a descriptive prompt from trait name and visual config. */
  private buildPrompt(trait: string, config: TraitVisualConfig): string {
    const parts: string[] = [`PBR texture for "${trait.replace(/_/g, ' ')}"`];

    if (config.tags?.length) {
      parts.push(`style: ${config.tags.join(', ')}`);
    }

    if (config.material?.color) {
      parts.push(`base color: ${config.material.color}`);
    }

    if (config.material?.metalness !== undefined) {
      parts.push(config.material.metalness > 0.5 ? 'metallic surface' : 'non-metallic surface');
    }

    if (config.material?.roughness !== undefined) {
      parts.push(config.material.roughness > 0.7 ? 'rough finish' : 'smooth finish');
    }

    return parts.join(', ') + '. Seamless tileable texture.';
  }
}
