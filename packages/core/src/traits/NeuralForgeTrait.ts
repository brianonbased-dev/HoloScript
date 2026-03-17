/**
 * Neural Forge Trait
 *
 * Connects NPCs to the uAA2++ Cognitive Engine (Neural Forge).
 * Enables the synthesis of "Shards" (compressed experience) from chat logs.
 * Allows NPCs to absorb these shards to evolve their neural state.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface NeuralShard {
  id: string;
  sourceId: string;
  timestamp: number;
  type: 'memory' | 'skill' | 'personality';
  data: any;
  weight: number; // Influence strength (0.0 - 1.0)
}

export interface NeuralState {
  shards: NeuralShard[];
  weights: Record<string, number>; // Dynamic personality vectors
  experienceLog: string[];
  lastSynthesis: number;
}

interface NeuralConfig {
  auto_synthesize: boolean;
  synthesis_threshold: number; // Number of interactions before auto-synth
  base_weights: Record<string, number>;
}

// =============================================================================
// HANDLER
// =============================================================================

export const neuralForgeHandler: TraitHandler<NeuralConfig> = {
  name: 'neural_forge',

  defaultConfig: {
    auto_synthesize: true,
    synthesis_threshold: 10,
    base_weights: {
      openness: 0.5,
      conscientiousness: 0.5,
      extroversion: 0.5,
      agreeableness: 0.5,
      neuroticism: 0.5,
    },
  },

  onAttach(node, config, context) {
    const state: NeuralState = {
      shards: [],
      weights: { ...config.base_weights },
      experienceLog: [],
      lastSynthesis: Date.now(),
    };
    node.__neuralState = state;

    context.emit?.('neural_forge_connected', { node });
  },

  onDetach(node, config, context) {
    delete node.__neuralState;
  },

  onEvent(node, config, context, event) {
    const state = node.__neuralState as NeuralState;
    if (!state) return;

    if (event.type === 'npc_ai_response') {
      const text = (event as Record<string, unknown>).text as string;
      state.experienceLog.push(text);

      // Auto-Synthesis Check
      if (config.auto_synthesize && state.experienceLog.length >= config.synthesis_threshold) {
        context.emit?.('neural_synthesis_request', { node });

        // Mock Synthesis (Real would call LLM)
        const shard: NeuralShard = {
          id: `shard_${Date.now()}`,
          sourceId: node.id || 'unknown',
          timestamp: Date.now(),
          type: 'memory',
          data: { summary: `Experienced ${state.experienceLog.length} interactions.` },
          weight: 0.1,
        };

        // Self-Absorb
        state.shards.push(shard);
        state.experienceLog = []; // Clear log after synthesis
        state.lastSynthesis = Date.now();

        context.emit?.('neural_shard_created', { node, shard });
        context.emit?.('neural_cognition_evolved', { node, currentWeights: state.weights });
      }
    } else if (event.type === 'neural_absorb_shard') {
      const shard = (event as Record<string, unknown>).shard as NeuralShard;
      state.shards.push(shard);

      // Simple personality modulation based on shard type (mock logic)
      if (shard.type === 'personality') {
        const modifiers = shard.data.modifiers as Record<string, number>;
        for (const [key, mod] of Object.entries(modifiers)) {
          if (state.weights[key] !== undefined) {
            state.weights[key] = Math.max(0, Math.min(1, state.weights[key] + mod * shard.weight));
          }
        }
      }

      context.emit?.('neural_cognition_evolved', { node, currentWeights: state.weights });
    }
  },
};

export default neuralForgeHandler;
