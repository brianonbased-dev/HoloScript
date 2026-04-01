/**
 * reactionTriggerTrait.ts — Character Response Trait for Discord Reactions
 *
 * MEME-009: Discord reaction triggers
 * Priority: Medium | Estimate: 10 hours
 *
 * Features:
 * - Listen to Discord reaction events
 * - Trigger character poses based on emoji
 * - Trigger emoji bursts based on reaction
 * - Trigger animations based on reaction
 * - Configurable emoji → action mappings
 * - Cooldown management
 */

import type { DiscordReaction, ReactionTrigger } from '../../integrations/discordWebhook';
import { ViralPoseTrait } from './viralPoseTrait';
import { EmojiReactionTrait } from './emojiReactionTrait';
import { logger } from '@/lib/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReactionTriggerConfig {
  /**
   * Auto-start listening on initialization
   */
  autoStart?: boolean;

  /**
   * Custom emoji → action mappings
   */
  triggers?: ReactionTrigger[];

  /**
   * Enable default emoji triggers
   */
  useDefaults?: boolean;

  /**
   * Global cooldown for all reactions (ms)
   */
  globalCooldown?: number;

  /**
   * Enable visual feedback on reaction
   */
  showFeedback?: boolean;

  /**
   * Feedback duration (ms)
   */
  feedbackDuration?: number;
}

export interface ReactionFeedback {
  emoji: string;
  userName: string;
  timestamp: number;
  action: string;
  value: string;
}

// ─── Reaction Trigger Trait ──────────────────────────────────────────────────

export class ReactionTriggerTrait {
  private config: Required<ReactionTriggerConfig>;
  private isListening: boolean = false;
  private triggers: Map<string, ReactionTrigger> = new Map();
  private lastTriggerTime: Map<string, number> = new Map();
  private feedbackHistory: ReactionFeedback[] = [];
  private onReactionCallbacks: Array<(reaction: DiscordReaction) => void> = [];

  // Reference to other traits for triggering
  private viralPoseTrait: ViralPoseTrait | null = null;
  private emojiReactionTrait: EmojiReactionTrait | null = null;

  constructor(config: ReactionTriggerConfig = {}) {
    this.config = {
      autoStart: config.autoStart ?? true,
      triggers: config.triggers || [],
      useDefaults: config.useDefaults ?? true,
      globalCooldown: config.globalCooldown ?? 500, // 500ms default
      showFeedback: config.showFeedback ?? true,
      feedbackDuration: config.feedbackDuration ?? 3000, // 3 seconds
    };

    // Load default triggers if enabled
    if (this.config.useDefaults) {
      this.loadDefaultTriggers();
    }

    // Load custom triggers
    this.config.triggers.forEach((trigger) => {
      this.triggers.set(trigger.emoji, trigger);
    });

    // Auto-start listening if configured
    if (this.config.autoStart) {
      this.start();
    }

    logger.debug('[ReactionTriggerTrait] Initialized with', this.triggers.size, 'triggers');
  }

  /**
   * Load default emoji triggers
   */
  private loadDefaultTriggers(): void {
    const defaults: ReactionTrigger[] = [
      // Poses
      { emoji: '🔥', action: 'pose', value: 'flex' },
      { emoji: '💀', action: 'pose', value: 'dab' },
      { emoji: '💎', action: 'pose', value: 'griddy' },
      { emoji: '💯', action: 'pose', value: 't-pose' },
      { emoji: '👀', action: 'pose', value: 'thinking' },
      { emoji: '⚡', action: 'pose', value: 'floss' },
      { emoji: '🤷', action: 'pose', value: 'shrug' },
      { emoji: '💪', action: 'pose', value: 'flex' },

      // Emoji bursts
      { emoji: '😂', action: 'emoji-burst', value: '😂' },
      { emoji: '❤️', action: 'emoji-burst', value: '❤️' },
      { emoji: '🚀', action: 'emoji-burst', value: '🚀' },
      { emoji: '🎉', action: 'emoji-burst', value: '🎉' },
      { emoji: '👍', action: 'emoji-burst', value: '👍' },
      { emoji: '✨', action: 'emoji-burst', value: '✨' },

      // Events
      { emoji: '🎯', action: 'event', value: 'achievement' },
      { emoji: '💰', action: 'event', value: 'money' },
      { emoji: '💕', action: 'event', value: 'love' },
      { emoji: '☠️', action: 'event', value: 'death' },
    ];

    defaults.forEach((trigger) => {
      this.triggers.set(trigger.emoji, trigger);
    });
  }

  /**
   * Start listening for Discord reactions
   */
  start(): void {
    if (this.isListening) {
      logger.warn('[ReactionTriggerTrait] Already listening');
      return;
    }

    this.isListening = true;

    // Listen to Discord reaction events
    window.addEventListener('discord-reaction-trigger', this.handleReactionEvent as EventListener);

    logger.debug('[ReactionTriggerTrait] Started listening for reactions');
  }

  /**
   * Stop listening for Discord reactions
   */
  stop(): void {
    this.isListening = false;
    window.removeEventListener(
      'discord-reaction-trigger',
      this.handleReactionEvent as EventListener
    );
    logger.debug('[ReactionTriggerTrait] Stopped listening');
  }

  /**
   * Handle Discord reaction event
   */
  private handleReactionEvent = (event: CustomEvent): void => {
    const { trigger, reaction } = event.detail as {
      trigger: ReactionTrigger;
      reaction: DiscordReaction;
    };

    // Check global cooldown
    const lastTime = this.lastTriggerTime.get('global') || 0;
    const now = Date.now();

    if (now - lastTime < this.config.globalCooldown) {
      logger.debug('[ReactionTriggerTrait] Global cooldown active, ignoring');
      return;
    }

    this.lastTriggerTime.set('global', now);

    // Execute trigger action
    this.executeTrigger(trigger, reaction);

    // Add feedback
    if (this.config.showFeedback) {
      this.addFeedback({
        emoji: reaction.emoji,
        userName: reaction.userName,
        timestamp: now,
        action: trigger.action,
        value: trigger.value,
      });
    }

    // Notify callbacks
    this.onReactionCallbacks.forEach((callback) => {
      try {
        callback(reaction);
      } catch (error) {
        logger.error('[ReactionTriggerTrait] Callback error:', error);
      }
    });
  };

  /**
   * Execute trigger action
   */
  private executeTrigger(trigger: ReactionTrigger, reaction: DiscordReaction): void {
    logger.debug('[ReactionTriggerTrait] Executing:', trigger.action, trigger.value);

    switch (trigger.action) {
      case 'pose':
        this.triggerPose(trigger.value);
        break;

      case 'emoji-burst':
        this.triggerEmojiBurst(trigger.value);
        break;

      case 'event':
        this.triggerEvent(trigger.value);
        break;

      case 'animation':
        this.triggerAnimation(trigger.value);
        break;

      default:
        logger.warn('[ReactionTriggerTrait] Unknown action:', trigger.action);
    }
  }

  /**
   * Trigger viral pose
   */
  private triggerPose(poseId: string): void {
    if (!this.viralPoseTrait) {
      logger.warn('[ReactionTriggerTrait] ViralPoseTrait not attached');
      return;
    }

    this.viralPoseTrait.triggerPose(poseId);
    logger.debug('[ReactionTriggerTrait] Triggered pose:', poseId);
  }

  /**
   * Trigger emoji burst
   */
  private triggerEmojiBurst(emoji: string): void {
    if (!this.emojiReactionTrait) {
      logger.warn('[ReactionTriggerTrait] EmojiReactionTrait not attached');
      return;
    }

    this.emojiReactionTrait.burst(5, emoji); // Burst 5 emojis
    logger.debug('[ReactionTriggerTrait] Triggered emoji burst:', emoji);
  }

  /**
   * Trigger emoji reaction event
   */
  private triggerEvent(eventType: string): void {
    if (!this.emojiReactionTrait) {
      logger.warn('[ReactionTriggerTrait] EmojiReactionTrait not attached');
      return;
    }

    this.emojiReactionTrait.reactToEvent(eventType);
    logger.debug('[ReactionTriggerTrait] Triggered event:', eventType);
  }

  /**
   * Trigger animation
   */
  private triggerAnimation(animationName: string): void {
    // TODO: Implement animation triggering
    logger.debug('[ReactionTriggerTrait] Triggered animation:', animationName);
  }

  /**
   * Attach viral pose trait for pose triggering
   */
  attachViralPoseTrait(trait: ViralPoseTrait): void {
    this.viralPoseTrait = trait;
    logger.debug('[ReactionTriggerTrait] Attached ViralPoseTrait');
  }

  /**
   * Attach emoji reaction trait for emoji burst triggering
   */
  attachEmojiReactionTrait(trait: EmojiReactionTrait): void {
    this.emojiReactionTrait = trait;
    logger.debug('[ReactionTriggerTrait] Attached EmojiReactionTrait');
  }

  /**
   * Add custom trigger
   */
  addTrigger(emoji: string, action: string, value: string, cooldown?: number): void {
    this.triggers.set(emoji, {
      emoji,
      action,
      value,
      cooldown,
    });

    logger.debug('[ReactionTriggerTrait] Added trigger:', emoji, '→', action, value);
  }

  /**
   * Remove trigger
   */
  removeTrigger(emoji: string): void {
    this.triggers.delete(emoji);
    logger.debug('[ReactionTriggerTrait] Removed trigger:', emoji);
  }

  /**
   * Get all triggers
   */
  getTriggers(): ReactionTrigger[] {
    return Array.from(this.triggers.values());
  }

  /**
   * Add feedback to history
   */
  private addFeedback(feedback: ReactionFeedback): void {
    this.feedbackHistory.push(feedback);

    // Auto-remove after feedback duration
    setTimeout(() => {
      const index = this.feedbackHistory.indexOf(feedback);
      if (index > -1) {
        this.feedbackHistory.splice(index, 1);
      }
    }, this.config.feedbackDuration);
  }

  /**
   * Get recent feedback
   */
  getFeedback(): ReactionFeedback[] {
    return [...this.feedbackHistory];
  }

  /**
   * Clear feedback history
   */
  clearFeedback(): void {
    this.feedbackHistory = [];
  }

  /**
   * Subscribe to reaction events
   */
  onReaction(callback: (reaction: DiscordReaction) => void): () => void {
    this.onReactionCallbacks.push(callback);

    return () => {
      const index = this.onReactionCallbacks.indexOf(callback);
      if (index > -1) {
        this.onReactionCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Get listening status
   */
  isActive(): boolean {
    return this.isListening;
  }

  /**
   * Dispose trait
   */
  dispose(): void {
    this.stop();
    this.onReactionCallbacks = [];
    this.triggers.clear();
    this.lastTriggerTime.clear();
    this.feedbackHistory = [];
    this.viralPoseTrait = null;
    this.emojiReactionTrait = null;
  }
}

// ─── React Hook ──────────────────────────────────────────────────────────────

/**
 * React hook for reaction trigger trait
 */
export function useReactionTrigger(
  viralPoseTrait: ViralPoseTrait | null,
  emojiReactionTrait: EmojiReactionTrait | null,
  config?: ReactionTriggerConfig
) {
  const [trait, setTrait] = React.useState<ReactionTriggerTrait | null>(null);
  const [feedback, setFeedback] = React.useState<ReactionFeedback[]>([]);
  const [lastReaction, setLastReaction] = React.useState<DiscordReaction | null>(null);

  React.useEffect(() => {
    const reactionTrait = new ReactionTriggerTrait(config);

    // Attach other traits
    if (viralPoseTrait) {
      reactionTrait.attachViralPoseTrait(viralPoseTrait);
    }
    if (emojiReactionTrait) {
      reactionTrait.attachEmojiReactionTrait(emojiReactionTrait);
    }

    // Subscribe to reactions
    const unsubscribe = reactionTrait.onReaction((reaction) => {
      setLastReaction(reaction);
    });

    // Update feedback every 100ms
    const feedbackInterval = setInterval(() => {
      setFeedback(reactionTrait.getFeedback());
    }, 100);

    setTrait(reactionTrait);

    return () => {
      unsubscribe();
      clearInterval(feedbackInterval);
      reactionTrait.dispose();
    };
  }, [viralPoseTrait, emojiReactionTrait, config]);

  const addTrigger = React.useCallback(
    (emoji: string, action: string, value: string, cooldown?: number) => {
      trait?.addTrigger(emoji, action, value, cooldown);
    },
    [trait]
  );

  const removeTrigger = React.useCallback(
    (emoji: string) => {
      trait?.removeTrigger(emoji);
    },
    [trait]
  );

  const clearFeedback = React.useCallback(() => {
    trait?.clearFeedback();
    setFeedback([]);
  }, [trait]);

  return {
    trait,
    feedback,
    lastReaction,
    addTrigger,
    removeTrigger,
    clearFeedback,
    triggers: trait?.getTriggers() || [],
    isActive: trait?.isActive() || false,
  };
}

// Lazy React import
let React: typeof import('react');
if (typeof window !== 'undefined') {
  React = require('react');
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export default ReactionTriggerTrait;
