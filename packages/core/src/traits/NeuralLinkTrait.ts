/**
 * NeuralLink Trait
 *
 * Connects HoloScript agents to local GGUF neural model weights.
 * Enables the @trait(neural_link) directive for local model inference.
 *
 * Usage in HS+:
 *   @trait(neural_link, model="brittney-v4.gguf", temperature=0.7)
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface NeuralLinkConfig {
  model: string;
  temperature: number;
  max_tokens: number;
  sync: 'local' | 'mesh';
  personality_anchor: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const neuralLinkHandler: TraitHandler<NeuralLinkConfig> = {
  name: 'neural_link',

  defaultConfig: {
    model: 'brittney-v4.gguf',
    temperature: 0.7,
    max_tokens: 2048,
    sync: 'local',
    personality_anchor: '',
  },

  onAttach(node, config, context) {
    const state: Record<string, unknown> = {
      neural_status: 'connected',
      active_model: config.model,
      last_inference_time: 0,
      last_response: null,
    };
    node.__neuralLinkState = state;
    context.emit('neural_link_ready', { nodeId: node.id, model: config.model });
  },

  onDetach(node) {
    const state = node.__neuralLinkState;
    if (state) {
      // @ts-expect-error
      state.neural_status = 'disconnected';
    }
    delete node.__neuralLinkState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = node.__neuralLinkState;
    if (!state) return;
    // Background heartbeat or thinking animation pulses could be driven here
  },

  onEvent(node, config, context, event) {
    const state = node.__neuralLinkState;
    if (!state) return;

    const data = (event as Record<string, unknown>).data as Record<string, unknown> | undefined;

    if (event.type === 'neural_link_execute') {
      // @ts-expect-error
      state.neural_status = 'inferring';
      context.emit('on_neural_inference_start', {
        nodeId: node.id,
        model: config.model,
        prompt: data?.prompt,
      });
    }

    if (event.type === 'neural_link_response') {
      // @ts-expect-error
      state.neural_status = 'idle';
      // @ts-expect-error
      state.last_response = data?.text;
      // @ts-expect-error
      state.last_inference_time = (data?.generationTime as number) ?? 0;
      context.emit('on_neural_response', {
        nodeId: node.id,
        text: data?.text,
      });
    }
  },
};

export default neuralLinkHandler;
