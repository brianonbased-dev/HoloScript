/**
 * SpatialAudioCueTrait — Production Test Suite
 *
 * spatialAudioCueHandler stores state on node.__spatialAudioCueState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 9 fields including PRIORITY_VALUES map
 * 2. onAttach — state init, emits audio_cue_register with priority value + earcon preload
 * 3. onDetach — emits audio_cue_unregister, removes state
 * 4. onUpdate — no-op when !isActive; repeat_interval timer accumulation;
 *               fires audio_cue_play when timer >= interval (earcon); increments playCount
 * 5. onEvent — audio_cue_trigger: interrupt check, isPlaying=true, emits audio_cue_play + tts_speak,
 *              increments playCount; audio_cue_complete; audio_cue_stop; activate/deactivate;
 *              listener_distance_update auto-trigger
 */
import { describe, it, expect, vi } from 'vitest';
import { spatialAudioCueHandler } from '../SpatialAudioCueTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'sac_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof spatialAudioCueHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...spatialAudioCueHandler.defaultConfig!, ...cfg };
  spatialAudioCueHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('spatialAudioCueHandler.defaultConfig', () => {
  const d = spatialAudioCueHandler.defaultConfig!;
  it('cue_type=navigation', () => expect(d.cue_type).toBe('navigation'));
  it('earcon=""', () => expect(d.earcon).toBe(''));
  it('spatial=true', () => expect(d.spatial).toBe(true));
  it('repeat_interval=0', () => expect(d.repeat_interval).toBe(0));
  it('volume=1.0', () => expect(d.volume).toBe(1.0));
  it('priority=medium', () => expect(d.priority).toBe('medium'));
  it('max_distance=10', () => expect(d.max_distance).toBe(10));
  it('tts_message=""', () => expect(d.tts_message).toBe(''));
  it('interrupt_lower_priority=true', () => expect(d.interrupt_lower_priority).toBe(true));
});

// ─── PRIORITY_VALUES (tested via register event) ──────────────────────────────

describe('spatialAudioCueHandler — PRIORITY_VALUES', () => {
  function getPriorityValue(priority: 'low' | 'medium' | 'high' | 'critical') {
    const { ctx } = attach({ priority });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_cue_register');
    return call![1].priority;
  }

  it('low → 0', () => expect(getPriorityValue('low')).toBe(0));
  it('medium → 1', () => expect(getPriorityValue('medium')).toBe(1));
  it('high → 2', () => expect(getPriorityValue('high')).toBe(2));
  it('critical → 3', () => expect(getPriorityValue('critical')).toBe(3));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('spatialAudioCueHandler.onAttach', () => {
  it('initialises __spatialAudioCueState', () => {
    const { node } = attach();
    expect((node as any).__spatialAudioCueState).toBeDefined();
  });

  it('state: isPlaying=false, isActive=true, playCount=0, repeatTimer=0', () => {
    const { node } = attach();
    const s = (node as any).__spatialAudioCueState;
    expect(s.isPlaying).toBe(false);
    expect(s.isActive).toBe(true);
    expect(s.playCount).toBe(0);
    expect(s.repeatTimer).toBe(0);
  });

  it('emits audio_cue_register with type, priority, spatial, maxDistance', () => {
    const { ctx } = attach({
      cue_type: 'alert',
      priority: 'high',
      spatial: false,
      max_distance: 15,
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_cue_register');
    expect(call).toBeDefined();
    expect(call![1].type).toBe('alert');
    expect(call![1].priority).toBe(2); // high → 2
    expect(call![1].spatial).toBe(false);
    expect(call![1].maxDistance).toBe(15);
  });

  it('emits audio_preload when earcon is specified', () => {
    const { ctx } = attach({ earcon: 'sfx/ding.ogg' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_preload',
      expect.objectContaining({ url: 'sfx/ding.ogg' })
    );
  });

  it('does NOT emit audio_preload when earcon is empty', () => {
    const { ctx } = attach({ earcon: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_preload', expect.anything());
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('spatialAudioCueHandler.onDetach', () => {
  it('emits audio_cue_unregister', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    spatialAudioCueHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('audio_cue_unregister', expect.any(Object));
  });

  it('removes __spatialAudioCueState', () => {
    const { node, ctx, config } = attach();
    spatialAudioCueHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__spatialAudioCueState).toBeUndefined();
  });
});

// ─── onUpdate — repeat interval ───────────────────────────────────────────────

describe('spatialAudioCueHandler.onUpdate — repeat interval', () => {
  it('no-op when isActive=false', () => {
    const { node, ctx, config } = attach({ repeat_interval: 1 });
    (node as any).__spatialAudioCueState.isActive = false;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 0.5);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when repeat_interval=0', () => {
    const { node, ctx, config } = attach({ repeat_interval: 0 });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 0.5);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('accumulates repeatTimer while below interval', () => {
    const { node, ctx, config } = attach({ repeat_interval: 2, earcon: 'sfx/ding.ogg' });
    const state = (node as any).__spatialAudioCueState;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 1);
    // 1s < 2s → no play
    expect(state.repeatTimer).toBeCloseTo(1, 5);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_cue_play', expect.anything());
  });

  it('fires audio_cue_play when timer >= repeat_interval', () => {
    const { node, ctx, config } = attach({
      repeat_interval: 2,
      earcon: 'sfx/ding.ogg',
      volume: 0.7,
      spatial: true,
      priority: 'low',
    });
    const state = (node as any).__spatialAudioCueState;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 2.5); // 2.5 >= 2
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_cue_play',
      expect.objectContaining({
        url: 'sfx/ding.ogg',
        volume: 0.7,
        spatial: true,
        priority: 0, // low
      })
    );
  });

  it('resets repeatTimer to 0 after firing', () => {
    const { node, ctx, config } = attach({ repeat_interval: 1, earcon: 'sfx/ding.ogg' });
    const state = (node as any).__spatialAudioCueState;
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 1.5);
    expect(state.repeatTimer).toBe(0);
  });

  it('increments playCount on repeat fire', () => {
    const { node, ctx, config } = attach({ repeat_interval: 1, earcon: 'sfx/ding.ogg' });
    const state = (node as any).__spatialAudioCueState;
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 1.5);
    expect(state.playCount).toBe(1);
  });

  it('does NOT fire audio_cue_play when isPlaying=true (already playing)', () => {
    const { node, ctx, config } = attach({ repeat_interval: 1, earcon: 'sfx/ding.ogg' });
    (node as any).__spatialAudioCueState.isPlaying = true;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onUpdate!(node as any, config, ctx as any, 1.5);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_cue_play', expect.anything());
  });
});

// ─── onEvent — audio_cue_trigger ────────────────────────────────────────────

describe('spatialAudioCueHandler.onEvent — audio_cue_trigger', () => {
  it('sets isPlaying=true', () => {
    const { node, ctx, config } = attach({ earcon: 'sfx/alert.ogg' });
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect((node as any).__spatialAudioCueState.isPlaying).toBe(true);
  });

  it('emits audio_cue_play with URL and priority', () => {
    const { node, ctx, config } = attach({
      earcon: 'sfx/alert.ogg',
      priority: 'critical',
      volume: 0.9,
      spatial: false,
    });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_cue_play',
      expect.objectContaining({
        url: 'sfx/alert.ogg',
        volume: 0.9,
        spatial: false,
        priority: 3, // critical
      })
    );
  });

  it('increments playCount on trigger', () => {
    const { node, ctx, config } = attach({ earcon: 'sfx/a.ogg' });
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect((node as any).__spatialAudioCueState.playCount).toBe(1);
  });

  it('emits tts_speak when config.tts_message is set', () => {
    const { node, ctx, config } = attach({ tts_message: 'Checkpoint reached' });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'tts_speak',
      expect.objectContaining({ message: 'Checkpoint reached' })
    );
  });

  it('emits tts_speak with event.message overriding config.tts_message', () => {
    const { node, ctx, config } = attach({ tts_message: 'default' });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_cue_trigger',
      message: 'override message',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'tts_speak');
    expect(call![1].message).toBe('override message');
  });

  it('does NOT emit tts_speak when no message configured or provided', () => {
    const { node, ctx, config } = attach({ tts_message: '' });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect(ctx.emit).not.toHaveBeenCalledWith('tts_speak', expect.anything());
  });

  it('returns early (no emission) when isPlaying=true AND interrupt_lower_priority=false', () => {
    const { node, ctx, config } = attach({ interrupt_lower_priority: false, earcon: 'sfx/a.ogg' });
    (node as any).__spatialAudioCueState.isPlaying = true;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_cue_play', expect.anything());
  });

  it('interrupts when isPlaying=true AND interrupt_lower_priority=true', () => {
    const { node, ctx, config } = attach({ interrupt_lower_priority: true, earcon: 'sfx/a.ogg' });
    (node as any).__spatialAudioCueState.isPlaying = true;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_trigger' });
    expect(ctx.emit).toHaveBeenCalledWith('audio_cue_play', expect.anything());
  });
});

// ─── onEvent — other events ───────────────────────────────────────────────────

describe('spatialAudioCueHandler.onEvent — other events', () => {
  it('audio_cue_complete → isPlaying=false', () => {
    const { node, ctx, config } = attach();
    (node as any).__spatialAudioCueState.isPlaying = true;
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_cue_complete',
    });
    expect((node as any).__spatialAudioCueState.isPlaying).toBe(false);
  });

  it('audio_cue_stop → isPlaying=false + resets repeatTimer + emits audio_stop', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__spatialAudioCueState;
    state.isPlaying = true;
    state.repeatTimer = 1.5;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_cue_stop' });
    expect(state.isPlaying).toBe(false);
    expect(state.repeatTimer).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('audio_stop', expect.any(Object));
  });

  it('audio_cue_activate → isActive=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__spatialAudioCueState.isActive = false;
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_cue_activate',
    });
    expect((node as any).__spatialAudioCueState.isActive).toBe(true);
  });

  it('audio_cue_deactivate → isActive=false', () => {
    const { node, ctx, config } = attach();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_cue_deactivate',
    });
    expect((node as any).__spatialAudioCueState.isActive).toBe(false);
  });

  it('audio_cue_deactivate stops playing audio if isPlaying=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__spatialAudioCueState.isPlaying = true;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_cue_deactivate',
    });
    expect(ctx.emit).toHaveBeenCalledWith('audio_stop', expect.any(Object));
  });

  it('listener_distance_update within max_distance → emits audio_cue_trigger', () => {
    const { node, ctx, config } = attach({ max_distance: 10 });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'listener_distance_update',
      distance: 8, // inside 10
    });
    expect(ctx.emit).toHaveBeenCalledWith('audio_cue_trigger', expect.any(Object));
  });

  it('listener_distance_update beyond max_distance → no trigger', () => {
    const { node, ctx, config } = attach({ max_distance: 10 });
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'listener_distance_update',
      distance: 15, // outside 10
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_cue_trigger', expect.anything());
  });

  it('listener_distance_update does NOT trigger when already playing', () => {
    const { node, ctx, config } = attach({ max_distance: 10 });
    (node as any).__spatialAudioCueState.isPlaying = true;
    ctx.emit.mockClear();
    spatialAudioCueHandler.onEvent!(node as any, config, ctx as any, {
      type: 'listener_distance_update',
      distance: 5,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_cue_trigger', expect.anything());
  });
});
