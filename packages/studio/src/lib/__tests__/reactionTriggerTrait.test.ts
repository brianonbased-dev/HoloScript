/**
 * reactionTriggerTrait.test.ts
 *
 * Tests for MEME-009: Animation triggering via ViralPoseTrait
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type {
  ReactionTriggerConfig,
  AnimationEvent,
} from '../traits/reactionTriggerTrait';
import type { ViralPose } from '../character/poseLibrary';

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Track pose change callbacks across mock instances
const poseChangeCallbacks: Array<(pose: ViralPose) => void> = [];

const mockTriggerPose = vi.fn((poseId: string) => {
  // Simulate pose completion after a tick
  setTimeout(() => {
    poseChangeCallbacks.forEach((cb) =>
      cb({ id: poseId, name: poseId, emoji: '', description: '', category: 'viral', popularity: 1, difficulty: 'easy', duration: 1000, bones: [], tags: [] })
    );
  }, 0);
});

const mockOnPoseChange = vi.fn((cb: (pose: ViralPose) => void) => {
  poseChangeCallbacks.push(cb);
  return () => {
    const idx = poseChangeCallbacks.indexOf(cb);
    if (idx > -1) poseChangeCallbacks.splice(idx, 1);
  };
});

vi.mock('../traits/viralPoseTrait', () => {
  class MockViralPoseTrait {
    triggerPose = mockTriggerPose;
    onPoseChange = mockOnPoseChange;
    attachToSkeleton = vi.fn();
    start = vi.fn();
    stop = vi.fn();
    dispose = vi.fn();
    getCurrentPose = vi.fn(() => null);
    getPoseSequence = vi.fn(() => []);
    getState = vi.fn(() => ({
      currentPose: null,
      nextPose: null,
      isTransitioning: false,
      transitionProgress: 0,
      holdTimeRemaining: 0,
      poseIndex: -1,
    }));
  }

  return { ViralPoseTrait: MockViralPoseTrait };
});

vi.mock('../traits/emojiReactionTrait', () => {
  class MockEmojiReactionTrait {
    burst = vi.fn();
    reactToEvent = vi.fn();
    dispose = vi.fn();
  }
  return { EmojiReactionTrait: MockEmojiReactionTrait };
});

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../poseLibrary', () => ({
  getAllPoses: vi.fn(() => []),
  getPoseById: vi.fn(),
  getPosesByCategory: vi.fn(() => []),
  getTrendingPoses: vi.fn(() => []),
  interpolatePoses: vi.fn(() => []),
  applyEasing: vi.fn((t: number) => t),
}));

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { ReactionTriggerTrait } from '../traits/reactionTriggerTrait';
import { ViralPoseTrait } from '../traits/viralPoseTrait';
import { logger as mockLogger } from '@/lib/logger';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createTrait(config?: ReactionTriggerConfig): ReactionTriggerTrait {
  return new ReactionTriggerTrait({
    autoStart: false,
    useDefaults: true,
    ...config,
  });
}

function createViralPoseTrait(): ViralPoseTrait {
  return new ViralPoseTrait();
}

function dispatchReaction(emoji: string, action: string, value: string): void {
  window.dispatchEvent(
    new CustomEvent('discord-reaction-trigger', {
      detail: {
        trigger: { emoji, action, value },
        reaction: {
          emoji,
          emojiName: emoji,
          userId: 'user-1',
          userName: 'TestUser',
          channelId: 'ch-1',
          messageId: 'msg-1',
          timestamp: Date.now(),
        },
      },
    })
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('ReactionTriggerTrait — Animation Triggering (MEME-009)', () => {
  let trait: ReactionTriggerTrait;
  let poseTrait: ViralPoseTrait;

  beforeEach(() => {
    vi.useFakeTimers();
    poseChangeCallbacks.length = 0;
    mockTriggerPose.mockClear();
    mockOnPoseChange.mockClear();

    trait = createTrait();
    poseTrait = createViralPoseTrait();
    trait.attachViralPoseTrait(poseTrait);
  });

  afterEach(() => {
    trait.dispose();
    vi.useRealTimers();
  });

  describe('immediate trigger condition', () => {
    it('triggers animation immediately via ViralPoseTrait', () => {
      trait.start();
      dispatchReaction('🎬', 'animation', 'dab');

      expect(mockTriggerPose).toHaveBeenCalledWith('dab');
    });

    it('dispatches animation-start event', () => {
      const events: AnimationEvent[] = [];
      trait.onAnimation((e) => events.push(e));
      trait.start();

      dispatchReaction('🎬', 'animation', 'floss');

      const startEvent = events.find((e) => e.type === 'animation-start');
      expect(startEvent).toBeDefined();
      expect(startEvent!.animationName).toBe('floss');
      expect(startEvent!.poseId).toBe('floss');
    });

    it('dispatches animation-complete when pose finishes', () => {
      const events: AnimationEvent[] = [];
      trait.onAnimation((e) => events.push(e));
      trait.start();

      dispatchReaction('🎬', 'animation', 'griddy');

      // Pose completion fires asynchronously via setTimeout(0)
      vi.advanceTimersByTime(10);

      const completeEvent = events.find((e) => e.type === 'animation-complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.animationName).toBe('griddy');
    });
  });

  describe('timer trigger condition', () => {
    it('delays animation by configured timerDelay', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'timer', timerDelay: 2000 },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'dab');

      expect(mockTriggerPose).not.toHaveBeenCalled();

      vi.advanceTimersByTime(2000);
      expect(mockTriggerPose).toHaveBeenCalledWith('dab');
    });

    it('cancels pending timer animation', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'timer', timerDelay: 5000 },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'floss');
      trait.cancelAnimation('floss');

      vi.advanceTimersByTime(6000);
      expect(mockTriggerPose).not.toHaveBeenCalled();
    });
  });

  describe('proximity trigger condition', () => {
    it('queues animation until proximity is resolved', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'proximity', proximityRadius: 3.0 },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 't-pose');

      expect(mockTriggerPose).not.toHaveBeenCalled();
      expect(trait.getActiveAnimations().has('t-pose')).toBe(true);
    });

    it('plays animation after proximity resolution', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'proximity' },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'flex');
      trait.resolveProximityAnimation('flex');

      expect(mockTriggerPose).toHaveBeenCalledWith('flex');
    });

    it('warns when resolving non-existent proximity animation', () => {
      const logger = mockLogger;
      trait.resolveProximityAnimation('nonexistent');
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('interaction trigger condition', () => {
    it('queues animation until interaction is resolved', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'interaction' },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'shrug');

      expect(mockTriggerPose).not.toHaveBeenCalled();
      expect(trait.getActiveAnimations().has('shrug')).toBe(true);
    });

    it('plays animation after interaction resolution', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'interaction' },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'dab');
      trait.resolveInteractionAnimation('dab');

      expect(mockTriggerPose).toHaveBeenCalledWith('dab');
    });
  });

  describe('cancelAnimation', () => {
    it('dispatches animation-cancel event', () => {
      const events: AnimationEvent[] = [];
      trait.onAnimation((e) => events.push(e));
      trait.start();

      dispatchReaction('🎬', 'animation', 'floss');
      trait.cancelAnimation('floss');

      const cancelEvent = events.find((e) => e.type === 'animation-cancel');
      expect(cancelEvent).toBeDefined();
      expect(cancelEvent!.animationName).toBe('floss');
    });

    it('removes animation from active set', () => {
      trait.start();
      dispatchReaction('🎬', 'animation', 'griddy');
      trait.cancelAnimation('griddy');

      expect(trait.getActiveAnimations().has('griddy')).toBe(false);
    });
  });

  describe('onAnimation subscription', () => {
    it('returns unsubscribe function that stops events', () => {
      const events: AnimationEvent[] = [];
      const unsub = trait.onAnimation((e) => events.push(e));
      trait.start();

      dispatchReaction('🎬', 'animation', 'dab');
      const countAfterFirst = events.length;
      expect(countAfterFirst).toBeGreaterThan(0);

      unsub();

      // Advance past cooldown
      vi.advanceTimersByTime(1000);
      dispatchReaction('🎬', 'animation', 'floss');

      const flossEvents = events.filter((e) => e.animationName === 'floss');
      expect(flossEvents.length).toBe(0);
    });
  });

  describe('window CustomEvent dispatch', () => {
    it('dispatches holoscript-animation-event on window', () => {
      const windowEvents: CustomEvent[] = [];
      const handler = (e: Event) => windowEvents.push(e as CustomEvent);
      window.addEventListener('holoscript-animation-event', handler);

      trait.start();
      dispatchReaction('🎬', 'animation', 'dab');

      window.removeEventListener('holoscript-animation-event', handler);

      expect(windowEvents.length).toBeGreaterThanOrEqual(1);
      expect(windowEvents[0].detail.animationName).toBe('dab');
    });
  });

  describe('no ViralPoseTrait attached', () => {
    it('warns when animation triggered without ViralPoseTrait', () => {
      const logger = mockLogger;
      const noAttachTrait = createTrait();
      // Do NOT attach poseTrait
      noAttachTrait.start();

      dispatchReaction('🎬', 'animation', 'dab');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('ViralPoseTrait not attached'),
        expect.anything()
      );

      noAttachTrait.dispose();
    });
  });

  describe('dispose cleanup', () => {
    it('clears pending timers on dispose', () => {
      trait = createTrait({
        autoStart: false,
        animationDefaults: { condition: 'timer', timerDelay: 10000 },
      });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'dab');
      trait.dispose();

      vi.advanceTimersByTime(15000);
      expect(mockTriggerPose).not.toHaveBeenCalled();
    });

    it('clears active animations on dispose', () => {
      trait.start();
      dispatchReaction('🎬', 'animation', 'flex');
      trait.dispose();

      expect(trait.getActiveAnimations().size).toBe(0);
    });
  });

  describe('default triggers', () => {
    it('loads default pose triggers', () => {
      const triggers = trait.getTriggers();
      const poseEmojis = triggers.filter((t) => t.action === 'pose');
      expect(poseEmojis.length).toBeGreaterThan(0);
    });

    it('loads default emoji-burst triggers', () => {
      const triggers = trait.getTriggers();
      const burstEmojis = triggers.filter((t) => t.action === 'emoji-burst');
      expect(burstEmojis.length).toBeGreaterThan(0);
    });

    it('loads default event triggers', () => {
      const triggers = trait.getTriggers();
      const eventEmojis = triggers.filter((t) => t.action === 'event');
      expect(eventEmojis.length).toBeGreaterThan(0);
    });
  });

  describe('cooldown enforcement', () => {
    it('ignores rapid consecutive reactions within globalCooldown', () => {
      trait = createTrait({ autoStart: false, globalCooldown: 1000 });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'dab');
      dispatchReaction('🎬', 'animation', 'floss');

      expect(mockTriggerPose).toHaveBeenCalledTimes(1);
      expect(mockTriggerPose).toHaveBeenCalledWith('dab');
    });

    it('allows reaction after cooldown expires', () => {
      trait = createTrait({ autoStart: false, globalCooldown: 500 });
      trait.attachViralPoseTrait(poseTrait);
      trait.start();

      dispatchReaction('🎬', 'animation', 'dab');
      vi.advanceTimersByTime(600);
      dispatchReaction('🎬', 'animation', 'floss');

      expect(mockTriggerPose).toHaveBeenCalledTimes(2);
    });
  });
});
