/**
 * NPC AI Trait
 *
 * LLM-driven behavior, dialogue, and perception for autonomous characters.
 * Integrates with external LLM providers and local inference stubs.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { getDefaultAIAdapter } from '../ai/AIAdapter';

// =============================================================================
// TYPES
// =============================================================================

interface NPCAIState {
  isThinking: boolean;
  lastResponse: string;
  emotionalState: string;
  goals: string[];
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>;
}

interface NPCAIConfig {
  model: string;
  systemPrompt: string;
  intelligence_tier: 'basic' | 'advanced' | 'quantum';
  perception_range: number;
  learning_rate: number;
  personality_profile: string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const npcAIHandler: TraitHandler<NPCAIConfig> = {
  name: 'npc_ai',

  defaultConfig: {
    model: 'hermes-3-70b',
    systemPrompt: 'You are a helpful holographic assistant.',
    intelligence_tier: 'advanced',
    perception_range: 10.0,
    learning_rate: 0.1,
    personality_profile: 'professional',
  },

  onAttach(node, config, context) {
    const state: NPCAIState = {
      isThinking: false,
      lastResponse: '',
      emotionalState: 'neutral',
      goals: ['wait_for_interaction'],
      conversationHistory: [],
    };
    (node as any).__npcAIState = state;

    context.emit?.('npc_ai_initialized', { node });
  },

  onDetach(node, config, context) {
    delete (node as any).__npcAIState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__npcAIState as NPCAIState;
    if (!state || state.isThinking) return;

    // Periodic perception checks or goal evaluation
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__npcAIState as NPCAIState;
    if (!state) return;

    if (event.type === 'npc_ai_prompt') {
      const prompt = event.prompt as string;
      state.isThinking = true;
      state.conversationHistory.push({ role: 'user', content: prompt });

      context.emit?.('npc_ai_think_begin', { node, prompt });

      const adapter = getDefaultAIAdapter();
      if (adapter && adapter.chat) {
        adapter
          .chat(prompt, undefined, state.conversationHistory.slice(0, -1))
          .then((response) => {
            // Re-emit as AI response event
            context.emit?.('npc_ai_response', { node, text: response });
          })
          .catch((error) => {
            state.isThinking = false;
            context.emit?.('npc_ai_error', { node, error: error.message });
          });
      } else {
        // Fallback to local stub if no adapter is registered
        setTimeout(() => {
          context.emit?.('npc_ai_response', {
            node,
            text: `[STUB] I heard "${prompt}", but no AI adapter is registered.`,
          });
        }, 500);
      }
    } else if (event.type === 'npc_ai_response') {
      const response = event.text as string;
      state.isThinking = false;
      state.lastResponse = response;
      state.conversationHistory.push({ role: 'assistant', content: response });

      context.emit?.('npc_ai_think_end', { node, response });

      // Phase 12.1: Action Parsing (Behavior Synthesis)
      const actionRegex = /<action\s+type="([^"]+)"(?:\s+([^>]+))?\s*\/>/g;
      let match;
      while ((match = actionRegex.exec(response)) !== null) {
        const type = match[1];
        const rawParams = match[2] || '';
        const params: Record<string, string> = {};

        // Parse simple attributes: key="value"
        const paramRegex = /(\w+)="([^"]+)"/g;
        let pMatch;
        while ((pMatch = paramRegex.exec(rawParams)) !== null) {
          params[pMatch[1]] = pMatch[2];
        }

        // Emit behavior event
        context.emit?.(`npc_behavior_${type}`, {
          node,
          params,
          source: 'ai_synthesis',
        });

        // Generic action event for global listeners
        context.emit?.('npc_action', { type, node, params });
      }

      // Trigger voice synthesis or text display
      context.emit?.('npc_ai_speak', { node, text: response });
    } else if (event.type === 'npc_ai_set_goal') {
      state.goals = (event.goals as string[]) || state.goals;
    }
  },
};

export default npcAIHandler;
