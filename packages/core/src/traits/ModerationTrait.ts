/**
 * @moderation Trait — AI Content Moderation
 *
 * Real-time content moderation for user-generated text, voice, and objects.
 * Configurable sensitivity levels and category filters.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';

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
  violations: Map<string, number>; // userId → count
  cooldowns: Map<string, number>; // userId → expiry timestamp
  totalBlocked: number;
}

export const moderationHandler: TraitHandler<ModerationConfig> = {
  name: 'moderation' as any,
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
    (node as any).__moderationState = state;

    context.emit('moderation_create', {
      sensitivity: config.sensitivity,
      categories: config.categories,
      moderateText: config.moderate_text,
      moderateVoice: config.moderate_voice,
      moderateObjects: config.moderate_objects,
    });
  },

  onDetach(node, _config, context) {
    if ((node as any).__moderationState) {
      context.emit('moderation_destroy', { nodeId: node.id });
      delete (node as any).__moderationState;
    }
  },

  onUpdate(_node, _config, _context, _delta) {
    // Moderation is event-driven, no per-frame work
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__moderationState as ModerationState | undefined;
    if (!state?.active) return;

    switch (event.type) {
      case 'moderation_check': {
        const e = event as any;
        const userId = e.userId ?? 'unknown';
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
          contentType: e.contentType ?? 'text',
          content: e.content,
          sensitivity: config.sensitivity,
          categories: config.categories,
        });
        break;
      }
      case 'moderation_violation': {
        const e = event as any;
        const userId = e.userId ?? 'unknown';
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
          category: e.category,
          content: e.content,
        });

        context.emit('on_moderation_violation', {
          userId,
          action,
          category: e.category,
        });
        break;
      }
      case 'moderation_clear_violations': {
        const userId = (event as any).userId;
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
