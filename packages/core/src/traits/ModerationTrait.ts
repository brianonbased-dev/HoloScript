/**
 * @moderation Trait — AI Content Moderation
 *
 * Real-time content moderation for user-generated text, voice, and objects.
 * Configurable sensitivity levels and category filters.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

interface ModerationConfig {
  /** Moderation sensitivity: 'low' | 'medium' | 'high' | 'strict' (default: 'medium') */
  sensitivity: 'low' | 'medium' | 'high' | 'strict';
  /** Content categories to moderate */
  categories: string[];
  /** Action on violation: 'warn' | 'mute' | 'kick' | 'ban' (default: 'warn') */
  action: 'warn' | 'mute' | 'kick' | 'ban';
  /** Whether to moderate text chat (default: true) */
  moderate_text: boolean;
  /** Whether to moderate voice (requires transcription, default: false) */
  moderate_voice: boolean;
  /** Whether to moderate placed objects (default: true) */
  moderate_objects: boolean;
  /** Auto-escalation after N violations (default: 3) */
  escalation_threshold: number;
  /** Cooldown period in seconds after violation (default: 30) */
  cooldown_seconds: number;
}

interface ModerationState {
  active: boolean;
  violations: Map<string, number>; // userId -> count
  cooldowns: Map<string, number>; // userId -> expiry timestamp
  totalBlocked: number;
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, ModerationState>();

export const moderationHandler: TraitHandler<ModerationConfig> = {
  name: 'moderation',
  defaultConfig: {
    sensitivity: 'medium',
    categories: ['harassment', 'hate_speech', 'sexual', 'violence', 'spam'],
    action: 'warn',
    moderate_text: true,
    moderate_voice: false,
    moderate_objects: true,
    escalation_threshold: 3,
    cooldown_seconds: 30,
  },

  onAttach(node, config, context) {
    const state: ModerationState = {
      active: true,
      violations: new Map(),
      cooldowns: new Map(),
      totalBlocked: 0,
    };
    traitState.set(node, state);

    context.emit('moderation_create', {
      sensitivity: config.sensitivity,
      categories: config.categories,
      moderateText: config.moderate_text,
      moderateVoice: config.moderate_voice,
      moderateObjects: config.moderate_objects,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('moderation_destroy', { nodeId: node.id });
      traitState.delete(node);
    }
  },

  onUpdate(_node, _config, _context, _delta) {
    // Moderation is event-driven, no per-frame work
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state?.active) return;

    switch (event.type) {
      case 'moderation_check': {
        const userId = (event.userId as string) ?? 'unknown';
        const now = Date.now();

        // Check cooldown
        const cooldownExpiry = state.cooldowns.get(userId) ?? 0;
        if (now < cooldownExpiry) {
          context.emit('moderation_blocked', {
            userId,
            reason: 'cooldown',
            remainingSeconds: (cooldownExpiry - now) / 1000,
          });
          return;
        }

        // Forward to AI moderation service
        context.emit('moderation_analyze', {
          userId,
          contentType: (event.contentType as string) ?? 'text',
          content: event.content,
          sensitivity: config.sensitivity,
          categories: config.categories,
        });
        break;
      }
      case 'moderation_violation': {
        const userId = (event.userId as string) ?? 'unknown';
        const count = (state.violations.get(userId) ?? 0) + 1;
        state.violations.set(userId, count);
        state.totalBlocked++;

        // Determine action (escalate after threshold)
        let action = config.action;
        if (count >= config.escalation_threshold) {
          action = action === 'warn' ? 'mute' : action === 'mute' ? 'kick' : 'ban';
        }

        // Set cooldown
        state.cooldowns.set(userId, Date.now() + config.cooldown_seconds * 1000);

        context.emit('moderation_action', {
          userId,
          action,
          violationCount: count,
          category: event.category,
          content: event.content,
        });

        context.emit('on_moderation_violation', {
          userId,
          action,
          category: event.category,
        });
        break;
      }
      case 'moderation_clear_violations': {
        const userId = event.userId as string | undefined;
        if (userId) {
          state.violations.delete(userId);
          state.cooldowns.delete(userId);
        } else {
          state.violations.clear();
          state.cooldowns.clear();
        }
        break;
      }
    }
  },
};
