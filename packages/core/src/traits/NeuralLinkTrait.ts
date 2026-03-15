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
    (node as any).__neuralLinkState = state;
    context.emit('neural_link_ready', { nodeId: (node as any).id, model: config.model });
  },

  onDetach(node) {
    const state = (node as any).__neuralLinkState;
    if (state) {
      state.neural_status = 'disconnected';
    }
    delete (node as any).__neuralLinkState;
  },

  onUpdate(node, _config, _context, _delta) {
    const state = (node as any).__neuralLinkState;
    if (!state) return;
    // Background heartbeat or thinking animation pulses could be driven here
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__neuralLinkState;
    if (!state) return;

    if ((event as any).type === 'neural_link_execute') {
      state.neural_status = 'inferring';
      context.emit('on_neural_inference_start', {
        nodeId: (node as any).id,
        model: config.model,
        prompt: (event as any).data?.prompt,
      });
    }

    if ((event as any).type === 'neural_link_response') {
      state.neural_status = 'idle';
      state.last_response = (event as any).data?.text;
      state.last_inference_time = (event as any).data?.generationTime ?? 0;
      context.emit('on_neural_response', {
        nodeId: (node as any).id,
        text: (event as any).data?.text,
      });
    }
  },
};

export default neuralLinkHandler;
