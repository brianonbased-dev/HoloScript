/**
 * EmbeddingTrait — v5.1
 *
 * Generate vector embeddings from text or structured data.
 *
 * Events:
 *  embedding:generate  { input, model, dimensions }
 *  embedding:result    { vector, dimensions, model }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface EmbeddingConfig {
  default_model: string;
  default_dimensions: number;
}

export const embeddingHandler: TraitHandler<EmbeddingConfig> = {
  name: 'embedding',
  defaultConfig: { default_model: 'text-embedding-3-small', default_dimensions: 1536 },

  onAttach(node: HSPlusNode): void {
    node.__embeddingState = { generated: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__embeddingState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    config: EmbeddingConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__embeddingState as { generated: number } | undefined;
    if (!state) return;
    if ((typeof event === 'string' ? event : event.type) === 'embedding:generate') {
      state.generated++;
      const dims = (event.dimensions as number) ?? config.default_dimensions;
      context.emit?.('embedding:result', {
        vector: new Float32Array(dims), // placeholder
        dimensions: dims,
        model: (event.model as string) ?? config.default_model,
        index: state.generated,
      });
    }
  },
};

export default embeddingHandler;
