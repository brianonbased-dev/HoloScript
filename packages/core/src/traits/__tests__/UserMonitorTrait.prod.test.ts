/**
 * UserMonitorTrait — Production Test Suite
 *
 * userMonitorHandler stores state on node.__userMonitorState.
 * performInference is gated on getEmotionDetector → must be mocked.
 *
 * Key behaviours:
 * 1. defaultConfig — all 3 fields
 * 2. onAttach — state init (all zeroes, empty arrays)
 * 3. onDetach — removes state
 * 4. onUpdate — collects head/hand positions, trims buffers to 30, advances lastInferenceTime,
 *               calls performInference when time >= updateRate
 * 5. onEvent 'click' — rapid clicks (< 500ms) increment clickCount;
 *                       slow clicks decrement toward 0
 * 6. calculateStability (tested indirectly: < 2 positions → 1.0)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userMonitorHandler } from '../UserMonitorTrait';

// ─── mock EmotionDetector ─────────────────────────────────────────────────────
// UserMonitorTrait dynamically calls getEmotionDetector inside performInference.
// We mock the module so getEmotionDetector returns null (early return),
// allowing onUpdate time accumulation to be tested without real inference.

vi.mock('../runtime/EmotionDetector', () => ({
  getEmotionDetector: vi.fn(() => null),
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'um_node', properties: {} as Record<string, any> };
}

type Vec3Arr = [number, number, number];

function makeCtx(headPos: Vec3Arr = [0, 0, 0], handPos: Vec3Arr | null = [0.1, 0.9, 0]) {
  return {
    emit: vi.fn(),
    vr: {
      headset: { position: headPos },
      getDominantHand: vi.fn(() => (handPos ? { position: handPos } : null)),
    },
  };
}

function attach(cfg: Partial<typeof userMonitorHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...userMonitorHandler.defaultConfig!, ...cfg };
  userMonitorHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('userMonitorHandler.defaultConfig', () => {
  const d = userMonitorHandler.defaultConfig!;
  it('updateRate=0.2', () => expect(d.updateRate).toBe(0.2));
  it('jitterSensitivity=0.5', () => expect(d.jitterSensitivity).toBe(0.5));
  it('adaptiveAssistance=true', () => expect(d.adaptiveAssistance).toBe(true));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('userMonitorHandler.onAttach', () => {
  it('initialises __userMonitorState', () => {
    const { node } = attach();
    expect((node as any).__userMonitorState).toBeDefined();
  });

  it('all metrics start at 0', () => {
    const { node } = attach();
    const s = (node as any).__userMonitorState;
    expect(s.lastInferenceTime).toBe(0);
    expect(s.clickCount).toBe(0);
    expect(s.frustration).toBe(0);
    expect(s.confusion).toBe(0);
    expect(s.engagement).toBe(0);
  });

  it('headPositions and handPositions start as empty arrays', () => {
    const { node } = attach();
    const s = (node as any).__userMonitorState;
    expect(s.headPositions).toEqual([]);
    expect(s.handPositions).toEqual([]);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('userMonitorHandler.onDetach', () => {
  it('removes __userMonitorState', () => {
    const { node, config } = attach();
    userMonitorHandler.onDetach!(node as any, config as any, {} as any);
    expect((node as any).__userMonitorState).toBeUndefined();
  });
});

// ─── onUpdate — position collection ──────────────────────────────────────────

describe('userMonitorHandler.onUpdate — position collection', () => {
  it('appends headset position to headPositions each frame', () => {
    const node = makeNode();
    const ctx = makeCtx([1, 2, 3]);
    const config = { ...userMonitorHandler.defaultConfig! };
    userMonitorHandler.onAttach!(node as any, config, ctx as any);
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__userMonitorState.headPositions).toHaveLength(1);
  });

  it('appends hand position when getDominantHand returns a position', () => {
    const node = makeNode();
    const ctx = makeCtx([0, 0, 0], [0.5, 1.2, 0]);
    const config = { ...userMonitorHandler.defaultConfig! };
    userMonitorHandler.onAttach!(node as any, config, ctx as any);
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__userMonitorState.handPositions).toHaveLength(1);
  });

  it('does NOT append hand position when getDominantHand returns null', () => {
    const node = makeNode();
    const ctx = makeCtx([0, 0, 0], null);
    const config = { ...userMonitorHandler.defaultConfig! };
    userMonitorHandler.onAttach!(node as any, config, ctx as any);
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__userMonitorState.handPositions).toHaveLength(0);
  });

  it('trims headPositions to 30 when exceeded', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__userMonitorState;
    // Pre-fill 30 entries
    for (let i = 0; i < 30; i++) state.headPositions.push([0, 0, 0]);
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.headPositions.length).toBe(30); // still 30 after shift+push
  });

  it('trims handPositions to 30 when exceeded', () => {
    const node = makeNode();
    const ctx = makeCtx([0, 0, 0], [0, 0, 0]);
    const config = { ...userMonitorHandler.defaultConfig! };
    userMonitorHandler.onAttach!(node as any, config, ctx as any);
    const state = (node as any).__userMonitorState;
    for (let i = 0; i < 30; i++) state.handPositions.push([0, 0, 0]);
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.handPositions.length).toBe(30);
  });
});

// ─── onUpdate — inference timer ──────────────────────────────────────────────

describe('userMonitorHandler.onUpdate — inference timer', () => {
  it('accumulates lastInferenceTime each delta', () => {
    const { node, ctx, config } = attach({ updateRate: 1.0 });
    const state = (node as any).__userMonitorState;
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(state.lastInferenceTime).toBeCloseTo(0.1, 5);
  });

  it('resets lastInferenceTime to 0 when >= updateRate and calls performInference', () => {
    const { node, ctx, config } = attach({ updateRate: 0.2 });
    const state = (node as any).__userMonitorState;
    const spy = vi.fn();
    (userMonitorHandler as any).performInference = spy;
    state.lastInferenceTime = 0.19;
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(state.lastInferenceTime).toBe(0);
    expect(spy).toHaveBeenCalled();
  });

  it('does NOT call performInference when time < updateRate', () => {
    const { node, ctx, config } = attach({ updateRate: 0.5 });
    const spy = vi.fn();
    (userMonitorHandler as any).performInference = spy;
    userMonitorHandler.onUpdate!(node as any, config, ctx as any, 0.1); // 0.1 < 0.5
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── onEvent — click tracking ─────────────────────────────────────────────────

describe('userMonitorHandler.onEvent — click', () => {
  it('rapid click (< 500ms apart) increments clickCount', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__userMonitorState;
    state.lastClickTime = Date.now() - 100; // 100ms ago (< 500ms)
    state.clickCount = 3;
    userMonitorHandler.onEvent!(node as any, config, ctx as any, { type: 'click' });
    expect(state.clickCount).toBe(4);
  });

  it('slow click (>= 500ms apart) decrements clickCount toward 0', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__userMonitorState;
    state.lastClickTime = Date.now() - 1000; // 1000ms ago (>= 500ms)
    state.clickCount = 3;
    userMonitorHandler.onEvent!(node as any, config, ctx as any, { type: 'click' });
    expect(state.clickCount).toBe(2);
  });

  it('clickCount never drops below 0 on slow click', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__userMonitorState;
    state.lastClickTime = Date.now() - 1000;
    state.clickCount = 0;
    userMonitorHandler.onEvent!(node as any, config, ctx as any, { type: 'click' });
    expect(state.clickCount).toBe(0); // max(0, -1) → 0
  });

  it('updates lastClickTime on each click', () => {
    const { node, ctx, config } = attach();
    const before = Date.now();
    userMonitorHandler.onEvent!(node as any, config, ctx as any, { type: 'click' });
    const state = (node as any).__userMonitorState;
    expect(state.lastClickTime).toBeGreaterThanOrEqual(before);
  });

  it('no-op gracefully when __userMonitorState is absent', () => {
    const node = makeNode();
    const ctx = makeCtx();
    const config = userMonitorHandler.defaultConfig!;
    expect(() =>
      userMonitorHandler.onEvent!(node as any, config as any, ctx as any, { type: 'click' })
    ).not.toThrow();
  });
});
