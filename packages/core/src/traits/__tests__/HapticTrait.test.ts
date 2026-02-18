import { describe, it, expect, beforeEach } from 'vitest';
import { hapticHandler } from '../HapticTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent } from './traitTestHelpers';

/**
 * HapticTrait relies on context.haptics.pulse() and context.vr.getDominantHand()
 * which the standard mock doesn't provide. We extend the mock to include stubs.
 */
function createHapticMockContext() {
  const ctx = createMockContext();
  (ctx as any).haptics = {
    pulse: () => {},
  };
  (ctx as any).vr = {
    getDominantHand: () => ({ id: 'right', position: [0, 0, 0] }),
  };
  return ctx;
}

describe('HapticTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    intensity: 0.5,
    proximity_enabled: false,
    proximity_distance: 0.5,
    collision_pattern: 'soft' as const,
    hands: 'dominant' as const,
    duration: 100,
  };

  beforeEach(() => {
    node = createMockNode('haptic');
    ctx = createHapticMockContext();
    attachTrait(hapticHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const state = (node as any).__hapticState;
    expect(state).toBeDefined();
    expect(state.isPlaying).toBe(false);
    expect(state.currentPattern).toBeNull();
  });

  it('collision event triggers pattern', () => {
    sendEvent(hapticHandler, node, cfg, ctx, { type: 'collision' });
    const state = (node as any).__hapticState;
    expect(state.isPlaying).toBe(true);
    expect(state.currentPattern).toBeDefined();
    expect(state.currentPattern.name).toBe('soft');
  });

  it('collision with hard pattern', () => {
    const hardCfg = { ...cfg, collision_pattern: 'hard' as const };
    sendEvent(hapticHandler, node, hardCfg, ctx, { type: 'collision' });
    expect((node as any).__hapticState.currentPattern.name).toBe('hard');
  });

  it('play_pattern starts named pattern', () => {
    sendEvent(hapticHandler, node, cfg, ctx, { type: 'play_pattern', pattern: 'heartbeat' });
    const state = (node as any).__hapticState;
    expect(state.isPlaying).toBe(true);
    expect(state.currentPattern.name).toBe('heartbeat');
  });

  it('stop_pattern halts playback', () => {
    sendEvent(hapticHandler, node, cfg, ctx, { type: 'collision' });
    sendEvent(hapticHandler, node, cfg, ctx, { type: 'stop_pattern' });
    expect((node as any).__hapticState.isPlaying).toBe(false);
    expect((node as any).__hapticState.currentPattern).toBeNull();
  });

  it('detach cleans up', () => {
    hapticHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__hapticState).toBeUndefined();
  });
});
