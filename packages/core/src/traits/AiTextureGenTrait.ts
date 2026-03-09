/**
 * AI Texture Generation Trait (V43 Tier 2)
 *
 * Generates seamless PBR textures for 3D objects using diffusion models.
 * Supports text-to-texture, image-to-texture, and style-transfer workflows
 * with configurable resolution, tiling, and material channel outputs.
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type TextureStyle =
  | 'photorealistic'
  | 'stylized'
  | 'cartoon'
  | 'sci-fi'
  | 'fantasy'
  | 'abstract';
export type TextureResolution = 256 | 512 | 1024 | 2048 | 4096;
export type MaterialType = 'diffuse' | 'pbr' | 'emissive' | 'transparent';

export interface AiTextureGenConfig {
  style: TextureStyle;
  resolution: TextureResolution;
  seamless: boolean;
  tiling_factor: number; // how many times the texture tiles across UV space
  uv_space: 'object' | 'world' | 'triplanar';
  material_type: MaterialType;
  generate_normal_map: boolean;
  generate_roughness_map: boolean;
}

interface GeneratedTexture {
  id: string;
  prompt: string;
  diffuseUrl: string;
  normalUrl: string | null;
  roughnessUrl: string | null;
  generatedAt: number;
}

interface AiTextureGenState {
  isGenerating: boolean;
  queue: string[]; // queued prompt IDs
  textures: Map<string, GeneratedTexture>;
  activeTextureId: string | null;
  totalGenerated: number;
  avgGenTimeMs: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const aiTextureGenHandler: TraitHandler<AiTextureGenConfig> = {
  name: 'ai_texture_gen' as any,

  defaultConfig: {
    style: 'photorealistic',
    resolution: 1024,
    seamless: true,
    tiling_factor: 1.0,
    uv_space: 'object',
    material_type: 'pbr',
    generate_normal_map: true,
    generate_roughness_map: true,
  },

  onAttach(node, config, context) {
    const state: AiTextureGenState = {
      isGenerating: false,
      queue: [],
      textures: new Map(),
      activeTextureId: null,
      totalGenerated: 0,
      avgGenTimeMs: 0,
    };
    context.setState({ aiTextureGen: state });
    context.emit('texture_gen:ready', {
      style: config.style,
      resolution: config.resolution,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().aiTextureGen as AiTextureGenState | undefined;
    if (state?.isGenerating) {
      context.emit('texture_gen:cancelled');
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().aiTextureGen as AiTextureGenState | undefined;
    if (!state) return;

    if (event.type === 'texture_gen:generate') {
      const payload = event.payload as any;
      const prompt: string = payload?.prompt ?? '';
      const requestId: string = payload?.requestId ?? `req_${Date.now()}`;

      if (state.isGenerating) {
        state.queue.push(requestId);
        context.emit('texture_gen:queued', { requestId, queueLength: state.queue.length });
      } else {
        state.isGenerating = true;
        context.emit('texture_gen:started', {
          requestId,
          prompt,
          resolution: config.resolution,
          style: config.style,
        });
      }
    } else if (event.type === 'texture_gen:complete') {
      const payload = event.payload as any;
      const texture: GeneratedTexture = {
        id: payload?.requestId ?? `tex_${Date.now()}`,
        prompt: payload?.prompt ?? '',
        diffuseUrl: payload?.diffuseUrl ?? '',
        normalUrl: config.generate_normal_map ? (payload?.normalUrl ?? null) : null,
        roughnessUrl: config.generate_roughness_map ? (payload?.roughnessUrl ?? null) : null,
        generatedAt: Date.now(),
      };

      state.textures.set(texture.id, texture);
      state.activeTextureId = texture.id;
      state.isGenerating = false;
      state.totalGenerated += 1;

      const elapsed: number = payload?.elapsedMs ?? 0;
      state.avgGenTimeMs =
        state.totalGenerated > 1
          ? (state.avgGenTimeMs * (state.totalGenerated - 1) + elapsed) / state.totalGenerated
          : elapsed;

      context.emit('texture_gen:applied', {
        textureId: texture.id,
        diffuseUrl: texture.diffuseUrl,
        elapsedMs: elapsed,
      });

      // Process queue
      if (state.queue.length > 0) {
        const nextId = state.queue.shift()!;
        state.isGenerating = true;
        context.emit('texture_gen:started', { requestId: nextId });
      }
    } else if (event.type === 'texture_gen:apply') {
      const textureId = (event.payload as any)?.textureId as string;
      if (textureId && state.textures.has(textureId)) {
        state.activeTextureId = textureId;
        context.emit('texture_gen:applied', { textureId });
      }
    }
  },
};
