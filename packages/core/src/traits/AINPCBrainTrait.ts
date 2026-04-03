/**
 * AINPC Brain Trait
 *
 * NPC personality and dialogue system built on LLMAgentTrait.
 * Adds dialogue range, voice, memory integration, and player relationship tracking.
 *
 * @version 1.0.0 (V43 Tier 3)
 */

import type { TraitHandler } from './TraitTypes';
import { llmAgentHandler } from './LLMAgentTrait';
import type { LLMConfig } from './LLMAgentTrait';

// =============================================================================
// TYPES
// =============================================================================

export interface AINPCBrainConfig extends LLMConfig {
  // NPC-specific additions
  dialogue_range: number; // Meters
  voice_enabled: boolean;
  personality: string; // 'helpful' | 'sarcastic' | 'wise' | 'cheerful' | 'mysterious'
  memory_size: number;
  conversation_history: boolean;
  player_relationship: number; // -1.0 (hostile) to 1.0 (friendly)
  idle_behavior?: 'static' | 'wander' | 'patrol';
}

// =============================================================================
// HANDLER
// =============================================================================

export const ainpcBrainHandler: TraitHandler<AINPCBrainConfig> = {
  ...llmAgentHandler,
  name: 'ai_npc_brain',

  defaultConfig: {
    ...(llmAgentHandler.defaultConfig as LLMConfig),
    // NPC defaults
    dialogue_range: 5.0,
    voice_enabled: true,
    personality: 'helpful',
    memory_size: 20,
    conversation_history: true,
    player_relationship: 0.5,
    idle_behavior: 'static',
  },

  onAttach(node, config, context) {
    // Call base LLMAgent attach
    llmAgentHandler.onAttach?.(node, config, context);

    // Add NPC-specific state
    const npcState = {
      in_dialogue: false,
      last_interaction_time: 0,
      conversation_count: 0,
      relationship_delta: 0,
    };
    node.__npcState = npcState;

    // Override system prompt for NPC personality
    const personalityPrompts: Record<string, string> = {
      helpful:
        'You are a helpful NPC who provides assistance to players. Be friendly and informative.',
      sarcastic: 'You are a sarcastic NPC with a dry wit. Be humorous but still helpful.',
      wise: 'You are a wise elder NPC who speaks in riddles and parables. Share knowledge cryptically.',
      cheerful: 'You are an enthusiastically cheerful NPC. Be upbeat and encouraging.',
      mysterious: 'You are a mysterious NPC who speaks in vague hints. Be enigmatic.',
    };

    const personalityPrompt = personalityPrompts[config.personality] || personalityPrompts.helpful;

    context.emit?.('ainpc_init', {
      node,
      personality: config.personality,
      dialogueRange: config.dialogue_range,
      voiceEnabled: config.voice_enabled,
      systemPrompt: personalityPrompt,
    });
  },

  onDetach(node, config, context) {
    llmAgentHandler.onDetach?.(node, config, context);
    delete node.__npcState;
  },

  onUpdate(node, config, context, delta) {
    llmAgentHandler.onUpdate?.(node, config, context, delta);

    const npcState = node.__npcState;
    if (!npcState) return;

    // Decay player relationship slowly over time
    if (npcState.relationship_delta !== 0) {
      npcState.relationship_delta *= 0.99; // Decay factor
    }
  },

  onEvent(node, config, context, event) {
    // Handle NPC-specific events
    const npcState = node.__npcState;

    if (event.type === 'player_enter_dialogue_range') {
      if (!npcState.in_dialogue) {
        context.emit?.('on_player_nearby', {
          node,
          playerId: event.playerId,
          distance: event.distance,
        });
      }
    } else if (event.type === 'player_exit_dialogue_range') {
      if (npcState.in_dialogue) {
        npcState.in_dialogue = false;
        context.emit?.('on_dialogue_end', { node });
      }
    } else if (event.type === 'player_interact') {
      npcState.in_dialogue = true;
      npcState.last_interaction_time = Date.now();
      npcState.conversation_count++;

      context.emit?.('on_dialogue_start', {
        node,
        playerId: event.playerId,
        conversationCount: npcState.conversation_count,
      });
    } else if (event.type === 'relationship_change') {
      const delta = event.delta as number;
      config.player_relationship = Math.max(-1, Math.min(1, config.player_relationship + delta));
      npcState.relationship_delta = delta;

      context.emit?.('on_relationship_updated', {
        node,
        relationship: config.player_relationship,
        delta,
      });
    }

    // Forward to base LLMAgent handler
    llmAgentHandler.onEvent?.(node, config, context, event);
  },
};
