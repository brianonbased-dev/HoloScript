/**
 * @ai_companion Trait — Hybrid AI NPC Behavior
 *
 * Combines PPA (Procedural Personality Architecture), RAG (Retrieval-Augmented
 * Generation), and SNN (Spiking Neural Network) for believable NPC companions.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

interface AICompanionConfig {
  /** Personality profile name (default: 'friendly') */
  personality: string;
  /** Interaction range in world units (default: 10) */
  interaction_range: number;
  /** Response latency in seconds (default: 0.5) */
  response_latency: number;
  /** Memory capacity (max stored interactions, default: 100) */
  memory_capacity: number;
  /** Enable RAG knowledge retrieval (default: true) */
  use_rag: boolean;
  /** Enable SNN emotion model (default: true) */
  use_snn: boolean;
  /** Idle behavior: 'wander' | 'patrol' | 'stationary' (default: 'wander') */
  idle_behavior: 'wander' | 'patrol' | 'stationary';
  /** Emotional decay rate per second (default: 0.01) */
  emotion_decay: number;
}

interface EmotionState {
  happiness: number;
  curiosity: number;
  fear: number;
  trust: number;
}

interface AICompanionState {
  active: boolean;
  emotion: EmotionState;
  memoryCount: number;
  currentAction: string;
  interactingWith: string | null;
  lastResponseTime: number;
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, AICompanionState>();

export const aiCompanionHandler: TraitHandler<AICompanionConfig> = {
  name: 'ai_companion',
  defaultConfig: {
    personality: 'friendly',
    interaction_range: 10,
    response_latency: 0.5,
    memory_capacity: 100,
    use_rag: true,
    use_snn: true,
    idle_behavior: 'wander',
    emotion_decay: 0.01,
  },

  onAttach(node, config, context) {
    const state: AICompanionState = {
      active: true,
      emotion: { happiness: 0.5, curiosity: 0.5, fear: 0, trust: 0.5 },
      memoryCount: 0,
      currentAction: 'idle',
      interactingWith: null,
      lastResponseTime: 0,
    };
    traitState.set(node, state);

    context.emit('ai_companion_create', {
      personality: config.personality,
      interactionRange: config.interaction_range,
      idleBehavior: config.idle_behavior,
      useRAG: config.use_rag,
      useSNN: config.use_snn,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('ai_companion_destroy', { nodeId: node.id });
      traitState.delete(node);
    }
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    // Decay emotions toward neutral
    const decay = config.emotion_decay * delta;
    state.emotion.happiness += (0.5 - state.emotion.happiness) * decay;
    state.emotion.curiosity += (0.5 - state.emotion.curiosity) * decay;
    state.emotion.fear *= 1 - decay;
    state.emotion.trust += (0.5 - state.emotion.trust) * decay * 0.5;

    context.emit('ai_companion_update', {
      deltaTime: delta,
      emotion: { ...state.emotion },
      currentAction: state.currentAction,
      interactingWith: state.interactingWith,
    });
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'ai_companion_interact': {
        state.interactingWith = (event.playerId as string) ?? null;
        state.currentAction = 'interacting';
        state.emotion.curiosity = Math.min(1, state.emotion.curiosity + 0.2);
        context.emit('ai_companion_response_start', {
          playerId: event.playerId,
          message: event.message,
          latency: config.response_latency,
        });
        break;
      }
      case 'ai_companion_response': {
        state.lastResponseTime = Date.now();
        state.memoryCount = Math.min(state.memoryCount + 1, config.memory_capacity);
        context.emit('on_ai_companion_speak', {
          text: event.text,
          emotion: { ...state.emotion },
        });
        break;
      }
      case 'ai_companion_emotion_stimulus': {
        if (event.happiness !== undefined)
          state.emotion.happiness = Math.max(
            0,
            Math.min(1, state.emotion.happiness + (event.happiness as number))
          );
        if (event.fear !== undefined)
          state.emotion.fear = Math.max(
            0,
            Math.min(1, state.emotion.fear + (event.fear as number))
          );
        if (event.trust !== undefined)
          state.emotion.trust = Math.max(
            0,
            Math.min(1, state.emotion.trust + (event.trust as number))
          );
        break;
      }
      case 'ai_companion_set_action':
        state.currentAction = (event.action as string) ?? 'idle';
        break;
      case 'ai_companion_end_interaction':
        state.interactingWith = null;
        state.currentAction = config.idle_behavior === 'stationary' ? 'idle' : config.idle_behavior;
        break;
    }
  },
};
