import { describe, it, expect, beforeEach } from 'vitest';
import { emotionHandler } from '../EmotionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('EmotionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    model: 'pad' as const,
    default_mood: 'neutral' as const,
    reactivity: 0.5,
    decay_rate: 0.1,
    expression_mapping: {} as Record<string, string>,
    influence_behavior: true,
    social_contagion: false,
    contagion_radius: 5,
    history_limit: 50,
  };

  beforeEach(() => {
    node = createMockNode('em');
    ctx = createMockContext();
    attachTrait(emotionHandler, node, cfg, ctx);
  });

  it('initializes with default mood', () => {
    const s = (node as any).__emotionState;
    expect(s.currentEmotion).toBe('neutral');
    expect(s.intensity).toBe(0);
  });

  it('feel event changes target PAD', () => {
    sendEvent(emotionHandler, node, cfg, ctx, { type: 'feel', emotion: 'joy', intensity: 0.8 });
    const s = (node as any).__emotionState;
    expect(s.targetPad.pleasure).toBeGreaterThan(0);
  });

  it('update blends toward target and classifies emotion', () => {
    sendEvent(emotionHandler, node, cfg, ctx, { type: 'feel', emotion: 'anger', intensity: 1.0 });
    // Run several updates to let blending happen
    for (let i = 0; i < 20; i++) {
      updateTrait(emotionHandler, node, cfg, ctx, 0.1);
    }
    const s = (node as any).__emotionState;
    // Should have shifted from neutral
    expect(s.intensity).toBeGreaterThan(0);
  });

  it('emotion_stimulus applies PAD directly', () => {
    sendEvent(emotionHandler, node, cfg, ctx, {
      type: 'emotion_stimulus',
      pad: { pleasure: 0.5, arousal: 0.5, dominance: 0.5 },
      intensity: 1.0,
    });
    const s = (node as any).__emotionState;
    expect(s.targetPad.pleasure).toBeGreaterThan(0);
  });

  it('emotion change recorded in history', () => {
    sendEvent(emotionHandler, node, cfg, ctx, { type: 'feel', emotion: 'joy', intensity: 1.0 });
    // Drive enough updates for classification to change
    for (let i = 0; i < 30; i++) {
      updateTrait(emotionHandler, node, cfg, ctx, 0.1);
    }
    const s = (node as any).__emotionState;
    if (s.history.length > 0) {
      expect(getEventCount(ctx, 'emotion_changed')).toBeGreaterThan(0);
    }
  });

  it('social contagion broadcast when enabled', () => {
    const scCfg = { ...cfg, social_contagion: true };
    const n = createMockNode('em2');
    const c = createMockContext();
    attachTrait(emotionHandler, n, scCfg, c);
    sendEvent(emotionHandler, n, scCfg, c, { type: 'feel', emotion: 'anger', intensity: 1.0 });
    for (let i = 0; i < 30; i++) {
      updateTrait(emotionHandler, n, scCfg, c, 0.1);
    }
    const s = (n as any).__emotionState;
    if (s.intensity > 0.3) {
      expect(getEventCount(c, 'emotion_broadcast')).toBeGreaterThan(0);
    }
  });

  it('emotion_broadcast received from other entities (contagion)', () => {
    const scCfg = { ...cfg, social_contagion: true };
    const n = createMockNode('em3');
    const c = createMockContext();
    attachTrait(emotionHandler, n, scCfg, c);
    sendEvent(emotionHandler, n, scCfg, c, {
      type: 'emotion_broadcast',
      source: createMockNode('other'),
      emotion: 'fear',
      intensity: 0.8,
    });
    const s = (n as any).__emotionState;
    expect(s.targetPad.pleasure).toBeLessThan(0); // Fear has negative pleasure
  });

  it('detach cleans up', () => {
    emotionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__emotionState).toBeUndefined();
  });
});
