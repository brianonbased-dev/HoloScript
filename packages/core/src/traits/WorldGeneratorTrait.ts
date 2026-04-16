/**
 * World Generator Trait
 *
 * Sovereign 3D world generation using native HoloScript foundations (Brittney v43+).
 * Generates 3D Gaussian Splats, Meshes, or Neural Fields from text/image prompts.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type WorldGeneratorEngine = 'sovereign-3d' | 'stable-world' | 'custom';
export type WorldGeneratorFormat = '3dgs' | 'mesh' | 'both' | 'neural_field';
export type WorldGeneratorQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface WorldGeneratorConfig {
  /** The text prompt for generation */
  prompt: string;
  /** Optional input image for single-view reconstruction */
  input_image?: string;
  /** Multi-view input images for native multi-view reconstruction */
  input_images?: string[];
  /** The generation engine to use (default: sovereign-3d) */
  engine: WorldGeneratorEngine;
  /** Output format preference (sovereign engine supports neural_field, mesh, 3dgs) */
  format: WorldGeneratorFormat | 'neural_field';
  /** Quality level (affects resolution and Gaussian count) */
  quality: WorldGeneratorQuality;
  /** Whether to automatically render the output on completion */
  auto_render: boolean;
  /** Random seed for reproducible generation */
  seed?: number;
  /** Enable navmesh output when supported by backend */
  navEnabled?: boolean;
  /** Enable physics/collision interactive mode when supported by backend */
  interactiveMode?: boolean;
}

export interface WorldGeneratorState {
  isGenerating: boolean;
  progress: number;
  assetUrl?: string;
  error?: string;
  generationId?: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const worldGeneratorHandler: TraitHandler<WorldGeneratorConfig> = {
  name: 'world_generator',

  defaultConfig: {
    prompt: '',
    engine: 'sovereign-3d',
    format: '3dgs',
    quality: 'medium',
    auto_render: true,
  },

  onAttach(node, config, context) {
    const state: WorldGeneratorState = {
      isGenerating: false,
      progress: 0,
    };
    node.__worldGeneratorState = state;

    if (config.prompt) {
      triggerGeneration(node, config, context);
    }
  },

  onDetach(node, _config, _context) {
    delete node.__worldGeneratorState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Progress polling or other updates could go here
  },

  onEvent(node, config, context, event) {
    const state = node.__worldGeneratorState as WorldGeneratorState;
    if (!state) return;

    switch (event.type) {
      case 'world:generation_started':
        state.isGenerating = true;
        state.progress = 0;
        state.generationId = event.generationId as string;
        context.emit('on_world_gen_started', { node, generationId: state.generationId });
        break;

      case 'world:generation_progress':
        state.progress = event.progress as number;
        context.emit('on_world_gen_progress', { node, progress: state.progress });
        break;

      case 'world:generation_complete':
        state.isGenerating = false;
        state.progress = 1;
        state.assetUrl = event.assetUrl as string;

        context.emit('on_world_gen_complete', {
          node,
          assetUrl: state.assetUrl,
          format: config.format,
        });

        if (config.auto_render && state.assetUrl) {
          // Automatic rendering logic
          if (config.format === '3dgs' || config.format === 'both') {
            context.emit('splat_set_source', {
              node,
              source: state.assetUrl,
              quality: config.quality,
            });
          } else if (config.format === 'neural_field') {
            context.emit('world:stream_ready', {
              node,
              streamUrl: state.assetUrl,
              provider: 'sovereign-3d',
            });
          }
        }
        break;

      case 'world:generation_error':
        state.isGenerating = false;
        state.error = event.error as string;
        context.emit('on_world_gen_error', { node, error: state.error });
        break;

      case 'world_gen_trigger':
        // Allow manual trigger via event
        triggerGeneration(node, config, context);
        break;
    }
  },
};

// =============================================================================
// HELPERS
// =============================================================================

function triggerGeneration(
  node: unknown,
  config: WorldGeneratorConfig,
  context: { emit: (event: string, data: unknown) => void }
): void {
  context.emit('world:generate', {
    node,
    prompt: config.prompt,
    input_image: config.input_image,
    ...(config.input_images ? { input_images: config.input_images } : {}),
    engine: config.engine,
    format: config.format,
    quality: config.quality,
    seed: config.seed,
    ...(config.navEnabled !== undefined ? { navEnabled: config.navEnabled } : {}),
    ...(config.interactiveMode !== undefined ? { interactiveMode: config.interactiveMode } : {}),
  });
}

export default worldGeneratorHandler;
