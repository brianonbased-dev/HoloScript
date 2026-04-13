/**
 * HapticCueTrait — Production Test Suite
 *
 * hapticCueHandler stores state on node.__hapticCueState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 8 fields
 * 2. onAttach — state init, emits haptic_cue_register
 * 3. onDetach — emits haptic_cue_stop, removes state
 * 4. onUpdate — repeat loop: increments repeat after delay, emits haptic_play per repeat,
 *               stops playing once repeats exhausted
 * 5. onEvent — trigger_on / haptic_trigger: sets isPlaying, emits haptic_play + on_haptic_start,
 *              custom_pattern parsing, spatial_direction normalisation
 *              haptic_stop emits haptic_cancel, haptic_set_intensity emits update_intensity
 */
import { describe, it, expect, vi } from 'vitest';
import { hapticCueHandler } from '../HapticCueTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(extras: Record<string, any> = {}) {
  return { id: 'hap_node', properties: {}, ...extras };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof hapticCueHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...hapticCueHandler.defaultConfig!, ...cfg };
  hapticCueHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('hapticCueHandler.defaultConfig', () => {
  const d = hapticCueHandler.defaultConfig!;
  it('pattern=pulse', () => expect(d.pattern).toBe('pulse'));
  it('intensity=0.5', () => expect(d.intensity).toBe(0.5));
  it('duration=100', () => expect(d.duration).toBe(100));
  it('repeat=0', () => expect(d.repeat).toBe(0));
  it('repeat_delay=200', () => expect(d.repeat_delay).toBe(200));
  it('spatial_direction=false', () => expect(d.spatial_direction).toBe(false));
  it('trigger_on=interact', () => expect(d.trigger_on).toBe('interact'));
  it('custom_pattern=[]', () => expect(d.custom_pattern).toEqual([]));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('hapticCueHandler.onAttach', () => {
  it('initialises __hapticCueState on node', () => {
    const { node } = attach();
    expect((node as any).__hapticCueState).toBeDefined();
  });

  it('state: isPlaying=false initially', () => {
    const { node } = attach();
    expect((node as any).__hapticCueState.isPlaying).toBe(false);
  });

  it('state: currentRepeat=0, repeatTimer=0', () => {
    const { node } = attach();
    const s = (node as any).__hapticCueState;
    expect(s.currentRepeat).toBe(0);
    expect(s.repeatTimer).toBe(0);
  });

  it('emits haptic_cue_register with pattern and triggerEvent', () => {
    const { ctx, config } = attach({ pattern: 'click', trigger_on: 'select' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'haptic_cue_register');
    expect(call).toBeDefined();
    expect(call![1].pattern).toBe('click');
    expect(call![1].triggerEvent).toBe('select');
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('hapticCueHandler.onDetach', () => {
  it('emits haptic_cue_stop', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hapticCueHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('haptic_cue_stop', expect.any(Object));
  });

  it('removes __hapticCueState', () => {
    const { node, ctx, config } = attach();
    hapticCueHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__hapticCueState).toBeUndefined();
  });
});

// ─── onUpdate — repeat loop ───────────────────────────────────────────────────

describe('hapticCueHandler.onUpdate — repeat loop', () => {
  it('no-op when isPlaying=false', () => {
    const { node, ctx, config } = attach({ repeat: 2, repeat_delay: 200 });
    ctx.emit.mockClear();
    hapticCueHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('accumulates repeatTimer while below repeat_delay', () => {
    const { node, ctx, config } = attach({ repeat: 2, repeat_delay: 200 });
    const state = (node as any).__hapticCueState;
    state.isPlaying = true;
    ctx.emit.mockClear(); // clear emit from onAttach (haptic_cue_register)
    // 100ms worth of frames (delta in seconds: 0.1)
    hapticCueHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(state.repeatTimer).toBeCloseTo(100, 1);
    expect(ctx.emit).not.toHaveBeenCalled(); // delay not hit yet
  });

  it('fires haptic_play and increments currentRepeat when delay exceeded', () => {
    const { node, ctx, config } = attach({ repeat: 2, repeat_delay: 100 });
    const state = (node as any).__hapticCueState;
    state.isPlaying = true;
    ctx.emit.mockClear();
    // delta = 0.15s → 150ms > 100ms repeat_delay
    hapticCueHandler.onUpdate!(node as any, config, ctx as any, 0.15);
    expect(state.currentRepeat).toBe(1);
    expect(state.repeatTimer).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('haptic_play', expect.any(Object));
  });

  it('sets isPlaying=false when currentRepeat >= repeat', () => {
    const { node, ctx, config } = attach({ repeat: 1, repeat_delay: 50 });
    const state = (node as any).__hapticCueState;
    state.isPlaying = true;
    state.currentRepeat = 1; // already hit the limit
    hapticCueHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(state.isPlaying).toBe(false);
  });

  it('resets repeatTimer to 0 after triggering repeat', () => {
    const { node, ctx, config } = attach({ repeat: 3, repeat_delay: 50 });
    const state = (node as any).__hapticCueState;
    state.isPlaying = true;
    hapticCueHandler.onUpdate!(node as any, config, ctx as any, 0.1); // 100ms > 50ms
    expect(state.repeatTimer).toBe(0);
  });
});

// ─── onEvent — trigger ───────────────────────────────────────────────────────

describe('hapticCueHandler.onEvent — trigger', () => {
  it('config.trigger_on event sets isPlaying=true', () => {
    const { node, ctx, config } = attach({ trigger_on: 'select' });
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'select' });
    expect((node as any).__hapticCueState.isPlaying).toBe(true);
  });

  it('haptic_trigger event also triggers regardless of trigger_on', () => {
    const { node, ctx, config } = attach({ trigger_on: 'select' });
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'haptic_trigger' });
    expect((node as any).__hapticCueState.isPlaying).toBe(true);
  });

  it('resets currentRepeat and repeatTimer on trigger', () => {
    const { node, ctx, config } = attach({ trigger_on: 'interact' });
    const state = (node as any).__hapticCueState;
    state.currentRepeat = 3;
    state.repeatTimer = 150;
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    expect(state.currentRepeat).toBe(0);
    expect(state.repeatTimer).toBe(0);
  });

  it('emits haptic_play with pattern, intensity, duration', () => {
    const { node, ctx, config } = attach({ pattern: 'buzz', intensity: 0.7, duration: 200 });
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'haptic_play');
    expect(call).toBeDefined();
    expect(call![1].intensity).toBe(0.7);
    expect(call![1].duration).toBe(200);
  });

  it('emits on_haptic_start with pattern name', () => {
    const { node, ctx, config } = attach({ pattern: 'success' });
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    expect(ctx.emit).toHaveBeenCalledWith('on_haptic_start', {
      node: expect.anything(),
      pattern: 'success',
    });
  });

  it('unrelated event type does not trigger haptic', () => {
    const { node, ctx, config } = attach({ trigger_on: 'interact' });
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'hover' });
    expect(ctx.emit).not.toHaveBeenCalledWith('haptic_play', expect.anything());
    expect((node as any).__hapticCueState.isPlaying).toBe(false);
  });
});

// ─── onEvent — custom_pattern parsing ────────────────────────────────────────

describe('hapticCueHandler.onEvent — custom_pattern', () => {
  it('parses custom_pattern pairs [intensity, duration, ...]', () => {
    const { node, ctx, config } = attach({
      pattern: 'custom',
      custom_pattern: [0.5, 100, 1.0, 50],
    });
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'haptic_play');
    expect(call![1].pattern).toEqual([
      { intensity: 0.5, duration: 100 },
      { intensity: 1.0, duration: 50 },
    ]);
  });

  it('falls back to HAPTIC_PATTERNS for custom pattern with empty custom_pattern', () => {
    const { node, ctx, config } = attach({ pattern: 'custom', custom_pattern: [] });
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'haptic_play');
    // HAPTIC_PATTERNS.custom = [] so pattern should be []
    expect(call![1].pattern).toEqual([]);
  });
});

// ─── onEvent — spatial_direction ─────────────────────────────────────────────

describe('hapticCueHandler.onEvent — spatial_direction', () => {
  it('computes normalised direction from node.position when spatial_direction=true', () => {
    const node = makeNode({ position: [3, 0, 4] }); // len=5
    const ctx = makeCtx();
    const config = { ...hapticCueHandler.defaultConfig!, spatial_direction: true };
    hapticCueHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'haptic_play');
    expect(call![1].direction.x).toBeCloseTo(0.6, 3);
    expect(call![1].direction.z).toBeCloseTo(0.8, 3);
  });

  it('no direction emitted when spatial_direction=false', () => {
    const node = makeNode({ position: [3, 0, 4] });
    const ctx = makeCtx();
    const config = { ...hapticCueHandler.defaultConfig!, spatial_direction: false };
    hapticCueHandler.onAttach!(node as any, config, ctx as any);
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'interact' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'haptic_play');
    expect(call![1].direction).toBeUndefined();
  });
});

// ─── onEvent — haptic_stop / haptic_set_intensity ─────────────────────────────

describe('hapticCueHandler.onEvent — stop & intensity', () => {
  it('haptic_stop sets isPlaying=false and emits haptic_cancel', () => {
    const { node, ctx, config } = attach();
    (node as any).__hapticCueState.isPlaying = true;
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, { type: 'haptic_stop' });
    expect((node as any).__hapticCueState.isPlaying).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('haptic_cancel', expect.any(Object));
  });

  it('haptic_set_intensity emits haptic_update_intensity with value', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hapticCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'haptic_set_intensity',
      intensity: 0.9,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'haptic_update_intensity',
      expect.objectContaining({ intensity: 0.9 })
    );
  });
});
