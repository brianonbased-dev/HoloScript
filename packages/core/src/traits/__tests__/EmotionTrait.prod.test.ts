/**
 * EmotionTrait — Production Tests (TraitHandler pattern)
 *
 * Tests the emotionHandler by invoking onAttach/onDetach/onUpdate/onEvent
 * against a mock node, and validates the pure helper logic accessible
 * through state observations.
 *
 * Covers:
 * - defaultConfig values
 * - onAttach: PAD state init from default_mood, history empty, intensity=0
 * - onDetach: cleanup
 * - onUpdate: blend toward target, decay toward neutral, classify emotion, emit emotion_changed
 * - onUpdate: history limit, social_contagion broadcast
 * - onEvent 'feel': blend target pad, blendSpeed
 * - onEvent 'emotion_stimulus': direct pad blend
 * - onEvent 'emotion_broadcast': contagion when social_contagion=true, ignored when false
 * - No-op when no state on node
 */
import { describe, it, expect, vi } from 'vitest';
import { emotionHandler } from '../EmotionTrait';

// ─── Helpers ─────────────────────────────────────────────────────────────────────

type EmotionConfig = NonNullable<Parameters<typeof emotionHandler.onAttach>[1]>;

function mkConfig(overrides: Partial<EmotionConfig> = {}): EmotionConfig {
  return { ...emotionHandler.defaultConfig!, ...overrides };
}

function mkNode() {
  return {} as Record<string, any>;
}

function mkCtx() {
  const ctx = {
    emitted: [] as Array<{ type: string; payload: any }>,
    emit: vi.fn(),
  };
  ctx.emit = vi.fn((type: string, payload: any) => {
    ctx.emitted.push({ type, payload });
  }) as any;
  return ctx;
}

function attach(node: any, config: EmotionConfig, ctx: ReturnType<typeof mkCtx>) {
  emotionHandler.onAttach!(node, config, ctx as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────────

describe('emotionHandler — defaultConfig', () => {
  it('model = pad', () => {
    expect(emotionHandler.defaultConfig?.model).toBe('pad');
  });

  it('default_mood = neutral', () => {
    expect(emotionHandler.defaultConfig?.default_mood).toBe('neutral');
  });

  it('decay_rate = 0.1', () => {
    expect(emotionHandler.defaultConfig?.decay_rate).toBeCloseTo(0.1);
  });

  it('reactivity = 0.5', () => {
    expect(emotionHandler.defaultConfig?.reactivity).toBeCloseTo(0.5);
  });

  it('social_contagion = false', () => {
    expect(emotionHandler.defaultConfig?.social_contagion).toBe(false);
  });

  it('history_limit = 50', () => {
    expect(emotionHandler.defaultConfig?.history_limit).toBe(50);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────────

describe('emotionHandler — onAttach', () => {
  it('creates __emotionState on node', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    expect(node.__emotionState).toBeDefined();
  });

  it('initial currentEmotion = default_mood (neutral)', () => {
    const node = mkNode();
    attach(node, mkConfig({ default_mood: 'neutral' }), mkCtx());
    expect(node.__emotionState.currentEmotion).toBe('neutral');
  });

  it('initial currentEmotion = joy when default_mood=joy', () => {
    const node = mkNode();
    attach(node, mkConfig({ default_mood: 'joy' }), mkCtx());
    expect(node.__emotionState.currentEmotion).toBe('joy');
  });

  it('history is empty initially', () => {
    const node = mkNode();
    attach(node, mkConfig(), mkCtx());
    expect(node.__emotionState.history).toHaveLength(0);
  });

  it('intensity = 0 when default_mood = neutral (pad is zero)', () => {
    const node = mkNode();
    attach(node, mkConfig({ default_mood: 'neutral' }), mkCtx());
    // neutral pad = {0,0,0} → intensity = distance from neutral = 0
    expect(node.__emotionState.intensity).toBeCloseTo(0);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────────

describe('emotionHandler — onDetach', () => {
  it('removes __emotionState from node', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    emotionHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__emotionState).toBeUndefined();
  });
});

// ─── onUpdate — blending and decay ───────────────────────────────────────────────

describe('emotionHandler — onUpdate blending', () => {
  it('PAD stays near neutral for neutral config after update', () => {
    const node = mkNode();
    const cfg = mkConfig({ default_mood: 'neutral', reactivity: 1.0, decay_rate: 0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    emotionHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    const { pad } = node.__emotionState;
    expect(pad.pleasure).toBeCloseTo(0, 3);
    expect(pad.arousal).toBeCloseTo(0, 3);
    expect(pad.dominance).toBeCloseTo(0, 3);
  });

  it('after feel joy + sufficient updates, emotion classifies as joy', () => {
    const node = mkNode();
    const cfg = mkConfig({ reactivity: 1.0, decay_rate: 0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    // Trigger joy at full intensity
    emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'joy', intensity: 1.0 } as any);
    // Advance 5 big updates to push PAD close to joy target
    for (let i = 0; i < 5; i++) {
      emotionHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    }
    expect(node.__emotionState.currentEmotion).toBe('joy');
  });

  it('emotion_changed event emitted on emotion change', () => {
    const node = mkNode();
    // Start as neutral, force into joy
    const cfg = mkConfig({ reactivity: 1.0, decay_rate: 0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'joy', intensity: 1.0 } as any);
    ctx.emitted.length = 0;
    // Run enough updates to trigger classification change
    for (let i = 0; i < 5; i++) {
      emotionHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    }
    const changeEvt = ctx.emitted.find((e) => e.type === 'emotion_changed');
    expect(changeEvt).toBeDefined();
    expect(changeEvt?.payload.to).toBe('joy');
  });

  it('targetPad decays toward neutral over time', () => {
    const node = mkNode();
    const cfg = mkConfig({ reactivity: 0, decay_rate: 1.0 }); // reactivity=0: no blend, only decay
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    // Set a non-neutral targetPad directly
    node.__emotionState.targetPad = { pleasure: 1, arousal: 1, dominance: 1 };
    emotionHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    const { targetPad } = node.__emotionState;
    // Decay lerp: target = lerp({1,1,1}, {0,0,0}, 1.0*1.0) = {0,0,0}
    expect(targetPad.pleasure).toBeCloseTo(0, 3);
    expect(targetPad.arousal).toBeCloseTo(0, 3);
  });

  it('history grows when emotion changes, capped at history_limit', () => {
    const node = mkNode();
    const cfg = mkConfig({ reactivity: 1.0, decay_rate: 0, history_limit: 3 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    // Alternate between joy and anger to generate history entries
    const emotions = ['joy', 'anger', 'fear', 'sadness', 'surprise'];
    for (const emo of emotions) {
      emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: emo, intensity: 1.0 } as any);
      for (let i = 0; i < 3; i++) {
        emotionHandler.onUpdate!(node, cfg, ctx as any, 1.0);
      }
    }
    expect(node.__emotionState.history.length).toBeLessThanOrEqual(3);
  });

  it('social contagion emits emotion_broadcast when intensity > 0.3', () => {
    const node = mkNode();
    const cfg = mkConfig({ social_contagion: true, reactivity: 1.0, decay_rate: 0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    // Set state to joy with high intensity directly
    node.__emotionState.currentEmotion = 'joy';
    node.__emotionState.pad = { pleasure: 0.8, arousal: 0.5, dominance: 0.6 };
    node.__emotionState.targetPad = { pleasure: 0.8, arousal: 0.5, dominance: 0.6 };
    // Manually set intensity above threshold
    node.__emotionState.intensity = 0.5;
    // Need to also have the emotion stay as joy during update to trigger broadcast
    // Override currentEmotion so no emotion_changed fires
    const prevEmotion = node.__emotionState.currentEmotion;
    ctx.emitted.length = 0;
    emotionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const broadcast = ctx.emitted.find((e) => e.type === 'emotion_broadcast');
    expect(broadcast).toBeDefined();
  });

  it('social contagion NOT emitted when social_contagion=false', () => {
    const node = mkNode();
    const cfg = mkConfig({ social_contagion: false, reactivity: 0, decay_rate: 0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    node.__emotionState.intensity = 0.9;
    emotionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emitted.find((e) => e.type === 'emotion_broadcast')).toBeUndefined();
  });
});

// ─── onEvent 'feel' ───────────────────────────────────────────────────────────────

describe('emotionHandler — onEvent feel', () => {
  it('feel with joy blends targetPad toward joy values', () => {
    const node = mkNode();
    const cfg = mkConfig({ reactivity: 1.0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    const prevPleasure = node.__emotionState.targetPad.pleasure;
    emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'joy', intensity: 1.0 } as any);
    // joy PAD = {pleasure: 0.8, arousal: 0.5, dominance: 0.6}
    // targetPad += joy.pleasure * intensity * reactivity = 0 + 0.8*1*1 = 0.8
    expect(node.__emotionState.targetPad.pleasure).toBeGreaterThan(prevPleasure);
  });

  it('feel sets blendSpeed proportional to intensity', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'anger', intensity: 0.8 } as any);
    // blendSpeed = intensity * 2 = 1.6
    expect(node.__emotionState.blendSpeed).toBeCloseTo(1.6);
  });

  it('feel with unknown emotion does not throw', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    expect(() => {
      emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'confusion', intensity: 0.5 } as any);
    }).not.toThrow();
  });

  it('feel clamps targetPad to [-1, 1]', () => {
    const node = mkNode();
    const cfg = mkConfig({ reactivity: 1.0 });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    // Apply joy many times to push past 1
    for (let i = 0; i < 20; i++) {
      emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'joy', intensity: 1.0 } as any);
    }
    const { targetPad } = node.__emotionState;
    expect(targetPad.pleasure).toBeLessThanOrEqual(1);
    expect(targetPad.arousal).toBeLessThanOrEqual(1);
    expect(targetPad.dominance).toBeLessThanOrEqual(1);
  });
});

// ─── onEvent 'emotion_stimulus' ──────────────────────────────────────────────────

describe('emotionHandler — onEvent emotion_stimulus', () => {
  it('direct PAD stimulus blends into targetPad', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    const before = { ...node.__emotionState.targetPad };
    emotionHandler.onEvent!(node, cfg, ctx as any, {
      type: 'emotion_stimulus',
      pad: { pleasure: 1.0, arousal: 0.0, dominance: 0.0 },
      intensity: 0.5,
    } as any);
    expect(node.__emotionState.targetPad.pleasure).toBeGreaterThan(before.pleasure);
  });

  it('stimulus with intensity=0 changes nothing', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    const before = { ...node.__emotionState.targetPad };
    emotionHandler.onEvent!(node, cfg, ctx as any, {
      type: 'emotion_stimulus',
      pad: { pleasure: 1.0, arousal: 1.0, dominance: 1.0 },
      intensity: 0,
    } as any);
    expect(node.__emotionState.targetPad.pleasure).toBeCloseTo(before.pleasure);
  });
});

// ─── onEvent 'emotion_broadcast' (contagion) ──────────────────────────────────────

describe('emotionHandler — onEvent emotion_broadcast', () => {
  it('receives contagion from another source when social_contagion=true', () => {
    const node = mkNode();
    const cfg = mkConfig({ social_contagion: true });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    const before = node.__emotionState.targetPad.pleasure;
    emotionHandler.onEvent!(node, cfg, ctx as any, {
      type: 'emotion_broadcast',
      source: {}, // different object = different node
      emotion: 'joy',
      intensity: 0.8,
    } as any);
    // joy.pleasure * 0.8 * 0.3 = 0.192 added to targetPad
    expect(node.__emotionState.targetPad.pleasure).toBeGreaterThan(before);
  });

  it('ignores emotion_broadcast from self', () => {
    const node = mkNode();
    const cfg = mkConfig({ social_contagion: true });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    const before = node.__emotionState.targetPad.pleasure;
    emotionHandler.onEvent!(node, cfg, ctx as any, {
      type: 'emotion_broadcast',
      source: node, // same node
      emotion: 'joy',
      intensity: 0.8,
    } as any);
    expect(node.__emotionState.targetPad.pleasure).toBeCloseTo(before);
  });

  it('ignores emotion_broadcast when social_contagion=false', () => {
    const node = mkNode();
    const cfg = mkConfig({ social_contagion: false });
    const ctx = mkCtx();
    attach(node, cfg, ctx);
    const before = node.__emotionState.targetPad.pleasure;
    emotionHandler.onEvent!(node, cfg, ctx as any, {
      type: 'emotion_broadcast',
      source: {},
      emotion: 'joy',
      intensity: 0.8,
    } as any);
    expect(node.__emotionState.targetPad.pleasure).toBeCloseTo(before);
  });
});

// ─── edge cases ──────────────────────────────────────────────────────────────────

describe('emotionHandler — edge cases', () => {
  it('onEvent no-ops when no __emotionState on node', () => {
    const node = mkNode(); // no state
    const cfg = mkConfig();
    const ctx = mkCtx();
    expect(() => {
      emotionHandler.onEvent!(node, cfg, ctx as any, { type: 'feel', emotion: 'joy', intensity: 0.5 } as any);
    }).not.toThrow();
  });

  it('onUpdate no-ops when no __emotionState on node', () => {
    const node = mkNode();
    const cfg = mkConfig();
    const ctx = mkCtx();
    expect(() => {
      emotionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    }).not.toThrow();
  });
});
