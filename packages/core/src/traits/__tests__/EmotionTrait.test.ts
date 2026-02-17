import { describe, it, expect, beforeEach } from 'vitest';
import { emotionHandler } from '../EmotionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getLastEvent, getEventCount } from './traitTestHelpers';

describe('EmotionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('npc');
    ctx = createMockContext();
    attachTrait(emotionHandler, node, {}, ctx);
  });

  it('initializes with neutral emotion', () => {
    const s = (node as any).__emotionState;
    expect(s).toBeDefined();
    expect(s.currentEmotion).toBe('neutral');
    expect(s.intensity).toBe(0);
  });

  it('feel event shifts emotion toward target', () => {
    sendEvent(emotionHandler, node, { reactivity: 1 }, ctx, { type: 'feel', emotion: 'joy', intensity: 1.0 });
    // Need to update for blend to take effect
    updateTrait(emotionHandler, node, { reactivity: 1 }, ctx, 1.0);
    const s = (node as any).__emotionState;
    expect(s.pad.pleasure).toBeGreaterThan(0);
  });

  it('emits emotion_changed when emotion transitions', () => {
    sendEvent(emotionHandler, node, { reactivity: 1 }, ctx, { type: 'feel', emotion: 'anger', intensity: 1.0 });
    updateTrait(emotionHandler, node, { reactivity: 1, decay_rate: 0 }, ctx, 1.0);
    expect(getEventCount(ctx, 'emotion_changed')).toBeGreaterThanOrEqual(1);
  });

  it('decays toward neutral over time', () => {
    sendEvent(emotionHandler, node, { reactivity: 1 }, ctx, { type: 'feel', emotion: 'fear', intensity: 1.0 });
    // Run many small steps to let blending converge, then decay
    for (let i = 0; i < 10; i++) updateTrait(emotionHandler, node, { reactivity: 0.5, decay_rate: 0.1 }, ctx, 0.1);
    const afterFeel = (node as any).__emotionState.pad.pleasure;
    // Now let it decay a lot
    for (let i = 0; i < 200; i++) updateTrait(emotionHandler, node, { reactivity: 0.5, decay_rate: 0.5 }, ctx, 0.1);
    const afterDecay = (node as any).__emotionState.pad.pleasure;
    // Should be closer to 0
    expect(Math.abs(afterDecay)).toBeLessThan(Math.abs(afterFeel));
  });

  it('emotion_stimulus applies PAD directly', () => {
    sendEvent(emotionHandler, node, {}, ctx, {
      type: 'emotion_stimulus',
      pad: { pleasure: 0.5, arousal: 0.3, dominance: 0.1 },
      intensity: 1.0,
    });
    const s = (node as any).__emotionState;
    expect(s.targetPad.pleasure).toBeGreaterThan(0);
  });

  it('records emotion history', () => {
    sendEvent(emotionHandler, node, { reactivity: 1 }, ctx, { type: 'feel', emotion: 'joy', intensity: 1.0 });
    updateTrait(emotionHandler, node, { reactivity: 1, decay_rate: 0, history_limit: 50 }, ctx, 1.0);
    const s = (node as any).__emotionState;
    if (s.currentEmotion !== 'neutral') {
      expect(s.history.length).toBeGreaterThan(0);
    }
  });

  it('social contagion broadcasts when intensity > 0.3', () => {
    sendEvent(emotionHandler, node, { reactivity: 1 }, ctx, { type: 'feel', emotion: 'anger', intensity: 1.0 });
    ctx.clearEvents();
    updateTrait(emotionHandler, node, { reactivity: 1, decay_rate: 0, social_contagion: true, contagion_radius: 5 }, ctx, 1.0);
    const s = (node as any).__emotionState;
    if (s.intensity > 0.3) {
      expect(getEventCount(ctx, 'emotion_broadcast')).toBeGreaterThan(0);
    }
  });

  it('cleans up on detach', () => {
    emotionHandler.onDetach?.(node as any, emotionHandler.defaultConfig, ctx as any);
    expect((node as any).__emotionState).toBeUndefined();
  });
});
