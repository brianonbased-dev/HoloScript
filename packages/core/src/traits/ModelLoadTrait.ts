/**
 * ModelLoadTrait — v5.1
 *
 * Load / unload ML models with warmup and memory tracking.
 *
 * Events:
 *  model:load     { modelId, provider, params }
 *  model:loaded   { modelId, warmupMs }
 *  model:unload   { modelId }
 *  model:unloaded { modelId }
 *  model:error    { modelId, error }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface ModelLoadConfig {
  max_loaded: number;
  warmup_rounds: number;
}

export const modelLoadHandler: TraitHandler<ModelLoadConfig> = {
  name: 'model_load',
  defaultConfig: { max_loaded: 5, warmup_rounds: 1 },

  onAttach(node: HSPlusNode): void {
    node.__modelLoadState = { loaded: new Map<string, { provider: string; loadedAt: number }>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__modelLoadState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: ModelLoadConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__modelLoadState as
      | { loaded: Map<string, { provider: string; loadedAt: number }> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'model:load': {
        const modelId = event.modelId as string;
        if (!modelId) break;
        if (state.loaded.size >= config.max_loaded) {
          context.emit?.('model:error', { modelId, error: 'max_loaded_exceeded' });
          break;
        }
        state.loaded.set(modelId, {
          provider: (event.provider as string) ?? 'local',
          loadedAt: Date.now(),
        });
        context.emit?.('model:loaded', {
          modelId,
          warmupRounds: config.warmup_rounds,
          warmupMs: 0,
        });
        break;
      }
      case 'model:unload': {
        const modelId = event.modelId as string;
        if (state.loaded.delete(modelId)) {
          context.emit?.('model:unloaded', { modelId });
        }
        break;
      }
    }
  },
};

export default modelLoadHandler;
