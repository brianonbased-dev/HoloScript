import type { TraitVisualConfig } from '../types';
import type { AssetResolverPlugin, ResolvedAsset } from './types';

// ─── Provider config ──────────────────────────────────────────────────────────

/** Supported text-to-3D provider IDs. */
export type Text3DProviderName = 'meshy' | 'tripo' | 'rodin' | 'custom';

/** Configuration shared across all providers. */
export interface Text3DProviderConfig {
  /** Which provider to use. */
  provider: Text3DProviderName;
  /** API key for authentication. */
  apiKey: string;
  /** Custom base URL (overrides default for the provider). */
  endpoint?: string;
  /** Request timeout in ms (default: 60000). */
  timeout?: number;
  /** Output mesh format (default: 'glb'). */
  format?: 'glb' | 'obj' | 'fbx' | 'usdz';
}

/** Default endpoints per provider. */
const PROVIDER_ENDPOINTS: Record<Text3DProviderName, string> = {
  meshy: 'https://api.meshy.ai/v1/text-to-3d',
  tripo: 'https://api.tripo3d.ai/v2/openapi/task',
  rodin: 'https://hyperhuman.deemos.com/api/v2/rodin',
  custom: '',
};

// ─── Traits eligible for 3D generation ───────────────────────────────────────

/**
 * Traits that map well to text-to-3D generation.
 * The value is the descriptive prompt fragment sent to the provider.
 */
export const TEXT_TO_3D_TRAITS: Record<string, string> = {
  // Animals
  dragon: 'a detailed dragon creature with scales and wings',
  wolf: 'a wolf standing alert',
  eagle: 'an eagle with wings spread',
  shark: 'a great white shark',
  horse: 'a horse standing upright',
  bear: 'a brown bear',
  lion: 'a lion with a full mane',
  // Furniture & Objects
  chair: 'a wooden chair with four legs',
  throne: 'an ornate royal throne',
  table: 'a rectangular wooden table',
  desk: 'a study desk with a flat surface',
  bed: 'a simple bed frame with a mattress',
  sofa: 'a comfortable couch',
  bookshelf: 'a tall bookshelf with multiple shelves',
  lamp: 'a floor lamp',
  // Structures
  lighthouse: 'a tall cylindrical lighthouse with a light at the top',
  tower: 'a stone tower',
  bridge: 'a stone arch bridge',
  arch: 'a stone archway',
  pillar: 'a classical marble pillar',
  well: 'a stone water well with a bucket',
  // Vehicles
  spaceship: 'a futuristic spaceship',
  car: 'a modern car',
  boat: 'a wooden sailing boat',
  // Weapons & Tools
  sword: 'a fantasy broadsword',
  shield: 'a circular metal shield',
  bow: 'a wooden longbow',
  staff: 'a magical wizard staff',
  hammer: 'a large warhammer',
  // Nature
  tree: 'a stylized low-poly tree with a trunk and round canopy',
  rock: 'a jagged boulder',
  mushroom: 'a large fantasy mushroom',
  crystal: 'a pointed crystal cluster',
};

// ─── Provider-specific request builders ──────────────────────────────────────

function buildMeshyRequest(prompt: string, format: string): Record<string, unknown> {
  return {
    mode: 'preview',
    prompt,
    art_style: 'realistic',
    negative_prompt: 'low quality, noisy, flat',
    topology: 'quad',
    target_polycount: 10000,
    format,
  };
}

function buildTripoRequest(prompt: string, format: string): Record<string, unknown> {
  return {
    type: 'text_to_model',
    prompt,
    model_version: 'v2.5-20250123',
    face_limit: 10000,
    texture: true,
    pbr: true,
    format,
  };
}

function buildRodinRequest(prompt: string, format: string): Record<string, unknown> {
  return {
    prompt,
    geometry_file_format: format,
    quality: 'high',
    material: 'PBR',
  };
}

// ─── Text3DAdapter ────────────────────────────────────────────────────────────

/**
 * Text-to-3D asset resolver.
 *
 * Sends trait descriptions to an external text-to-3D API (Meshy, Tripo, or Rodin)
 * and returns the resulting 3D model. Eligible traits are defined in
 * `TEXT_TO_3D_TRAITS`. All other traits are passed through to lower-priority
 * resolvers.
 *
 * API calls are async with a configurable timeout. On failure the pipeline falls
 * back to procedural geometry or primitive shapes.
 */
export class Text3DAdapter implements AssetResolverPlugin {
  readonly name = 'text-to-3d';
  readonly priority = 30; // Low priority — after procedural, before manifest fallback

  private config: Text3DProviderConfig;
  private endpoint: string;

  constructor(config: Text3DProviderConfig) {
    this.config = config;
    this.endpoint = config.endpoint ?? PROVIDER_ENDPOINTS[config.provider];
    if (!this.endpoint) {
      throw new Error(`Text3DAdapter: no endpoint for provider "${config.provider}"`);
    }
  }

  canResolve(trait: string, _config: TraitVisualConfig): boolean {
    return trait in TEXT_TO_3D_TRAITS;
  }

  async resolve(trait: string, _config: TraitVisualConfig): Promise<ResolvedAsset> {
    const description = TEXT_TO_3D_TRAITS[trait];
    if (!description) throw new Error(`Text3DAdapter: unknown trait "${trait}"`);

    const format = this.config.format ?? 'glb';
    const timeout = this.config.timeout ?? 60_000;

    const body = this.buildRequest(description, format);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(
          `Text3DAdapter (${this.config.provider}): HTTP ${response.status} ${response.statusText}`
        );
      }

      // Providers return either the model data directly or a task ID to poll.
      // For MVP we assume direct binary response (synchronous providers).
      const data = await response.arrayBuffer();

      return {
        type: 'model',
        data,
        metadata: {
          generator: `text-to-3d:${this.config.provider}`,
          prompt: description,
          format,
          trait,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildRequest(prompt: string, format: string): Record<string, unknown> {
    switch (this.config.provider) {
      case 'meshy':
        return buildMeshyRequest(prompt, format);
      case 'tripo':
        return buildTripoRequest(prompt, format);
      case 'rodin':
        return buildRodinRequest(prompt, format);
      default:
        return { prompt, format };
    }
  }
}
