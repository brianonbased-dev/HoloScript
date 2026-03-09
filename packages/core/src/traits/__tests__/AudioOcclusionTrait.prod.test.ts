/**
 * AudioOcclusionTrait — Production Test Suite
 *
 * audioOcclusionHandler stores state on node.__audioOcclusionState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 9 fields
 * 2. onAttach — state init (lowPassFrequency = low_pass_max_freq), emits register
 * 3. onDetach — emits unregister, removes state
 * 4. onUpdate — mode='none' → no-op; mode='raycast' → rate-limited raycast emit;
 *               low_pass_filter → smoothing toward targetLowPass + audio_set_lowpass;
 *               occlusionAmount > 0 → dB→gain calculation + audio_set_gain
 * 5. onEvent — raycast_result: updates occluders, calculates occlusionAmount (inline helper),
 *              frequency_dependent targetLowPass, emits occlusion_start/end transitions;
 *              source_position_update / listener_position_update
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { audioOcclusionHandler } from '../AudioOcclusionTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'occ_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof audioOcclusionHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...audioOcclusionHandler.defaultConfig!, ...cfg };
  audioOcclusionHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('audioOcclusionHandler.defaultConfig', () => {
  const d = audioOcclusionHandler.defaultConfig!;
  it('mode=raycast', () => expect(d.mode).toBe('raycast'));
  it('frequency_dependent=true', () => expect(d.frequency_dependent).toBe(true));
  it('low_pass_filter=true', () => expect(d.low_pass_filter).toBe(true));
  it('attenuation_factor=0.5', () => expect(d.attenuation_factor).toBe(0.5));
  it('transmission_factor=0.2', () => expect(d.transmission_factor).toBe(0.2));
  it('update_rate=15', () => expect(d.update_rate).toBe(15));
  it('max_occlusion_db=-24', () => expect(d.max_occlusion_db).toBe(-24));
  it('low_pass_min_freq=500', () => expect(d.low_pass_min_freq).toBe(500));
  it('low_pass_max_freq=22000', () => expect(d.low_pass_max_freq).toBe(22000));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('audioOcclusionHandler.onAttach', () => {
  it('initialises __audioOcclusionState', () => {
    const { node } = attach();
    expect((node as any).__audioOcclusionState).toBeDefined();
  });

  it('lowPassFrequency starts at low_pass_max_freq', () => {
    const { node } = attach({ low_pass_max_freq: 18000 });
    expect((node as any).__audioOcclusionState.lowPassFrequency).toBe(18000);
  });

  it('isOccluded=false, occlusionAmount=0 initially', () => {
    const { node } = attach();
    const s = (node as any).__audioOcclusionState;
    expect(s.isOccluded).toBe(false);
    expect(s.occlusionAmount).toBe(0);
  });

  it('emits audio_occlusion_register with mode', () => {
    const { ctx } = attach({ mode: 'simple' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_occlusion_register');
    expect(call).toBeDefined();
    expect(call![1].mode).toBe('simple');
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('audioOcclusionHandler.onDetach', () => {
  it('emits audio_occlusion_unregister', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    audioOcclusionHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('audio_occlusion_unregister', expect.any(Object));
  });

  it('removes __audioOcclusionState', () => {
    const { node, ctx, config } = attach();
    audioOcclusionHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__audioOcclusionState).toBeUndefined();
  });
});

// ─── onUpdate — mode=none ─────────────────────────────────────────────────────

describe('audioOcclusionHandler.onUpdate — mode=none', () => {
  it('is a no-op when mode=none', () => {
    const { node, ctx, config } = attach({ mode: 'none' });
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — raycast rate limiting ────────────────────────────────────────

describe('audioOcclusionHandler.onUpdate — raycast rate limiting', () => {
  it('emits audio_occlusion_raycast when time since last >= 1000/update_rate', () => {
    const { node, ctx, config } = attach({ mode: 'raycast', update_rate: 15 });
    const state = (node as any).__audioOcclusionState;
    // Set lastRaycastTime far in the past so threshold is met
    state.lastRaycastTime = 0;
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('audio_occlusion_raycast', expect.any(Object));
  });

  it('raycast payload includes from and to positions', () => {
    const { node, ctx, config } = attach({ mode: 'raycast' });
    const state = (node as any).__audioOcclusionState;
    state.lastRaycastTime = 0;
    state.sourcePosition = { x: 1, y: 2, z: 3 };
    state.listenerPosition = { x: 4, y: 5, z: 6 };
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_occlusion_raycast');
    expect(call![1].from).toEqual({ x: 1, y: 2, z: 3 });
    expect(call![1].to).toEqual({ x: 4, y: 5, z: 6 });
  });

  it('does NOT emit raycast if called twice rapidly (rate limited)', () => {
    const { node, ctx, config } = attach({ mode: 'raycast', update_rate: 15 }); // interval ≈ 66ms
    const state = (node as any).__audioOcclusionState;
    state.lastRaycastTime = Date.now(); // just updated
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_occlusion_raycast', expect.anything());
  });
});

// ─── onUpdate — low-pass smoothing ───────────────────────────────────────────

describe('audioOcclusionHandler.onUpdate — low-pass smoothing', () => {
  it('emits audio_set_lowpass when low_pass_filter=true', () => {
    const { node, ctx, config } = attach({ mode: 'simple', low_pass_filter: true });
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'audio_set_lowpass',
      expect.objectContaining({ frequency: expect.any(Number) })
    );
  });

  it('lowPassFrequency moves toward targetLowPass (upward)', () => {
    const { node, ctx, config } = attach({
      mode: 'simple',
      low_pass_filter: true,
      low_pass_max_freq: 22000,
    });
    const state = (node as any).__audioOcclusionState;
    state.lowPassFrequency = 1000;
    state.targetLowPass = 22000; // target is above current
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.lowPassFrequency).toBeGreaterThan(1000);
    expect(state.lowPassFrequency).toBeLessThanOrEqual(22000);
  });

  it('lowPassFrequency moves toward targetLowPass (downward)', () => {
    const { node, ctx, config } = attach({ mode: 'simple', low_pass_filter: true });
    const state = (node as any).__audioOcclusionState;
    state.lowPassFrequency = 22000;
    state.targetLowPass = 500; // target is below current
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.lowPassFrequency).toBeLessThan(22000);
    expect(state.lowPassFrequency).toBeGreaterThanOrEqual(500);
  });

  it('does NOT emit audio_set_lowpass when low_pass_filter=false', () => {
    const { node, ctx, config } = attach({ mode: 'simple', low_pass_filter: false });
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_set_lowpass', expect.anything());
  });
});

// ─── onUpdate — gain calculation ──────────────────────────────────────────────

describe('audioOcclusionHandler.onUpdate — gain calculation', () => {
  it('emits audio_set_gain when occlusionAmount > 0', () => {
    const { node, ctx, config } = attach({ mode: 'simple', max_occlusion_db: -24 });
    const state = (node as any).__audioOcclusionState;
    state.occlusionAmount = 0.5;
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_set_gain');
    expect(call).toBeDefined();
    expect(call![1].source).toBe('occlusion');
    // gain = 10^(0.5*(-24)/20) = 10^(-0.6) ≈ 0.251
    expect(call![1].gain).toBeCloseTo(Math.pow(10, -0.6), 2);
  });

  it('does NOT emit audio_set_gain when occlusionAmount = 0', () => {
    const { node, ctx, config } = attach({ mode: 'simple' });
    const state = (node as any).__audioOcclusionState;
    state.occlusionAmount = 0;
    ctx.emit.mockClear();
    audioOcclusionHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_set_gain', expect.anything());
  });
});

// ─── onEvent — raycast_result ────────────────────────────────────────────────

describe('audioOcclusionHandler.onEvent — raycast_result', () => {
  it('sets isOccluded=true when occluders present', () => {
    const { node, ctx, config } = attach();
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'wall', material: 'concrete', distance: 1, transmission: 0.1 }],
    });
    expect((node as any).__audioOcclusionState.isOccluded).toBe(true);
  });

  it('sets isOccluded=false when no occluders', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__audioOcclusionState;
    state.isOccluded = true; // was occluded
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [],
    });
    expect(state.isOccluded).toBe(false);
  });

  it('calculates occlusionAmount using calculateOcclusion helper', () => {
    // occluder.transmission=0.5, config.transmission_factor=0.2
    // materialFactor = 0.5 * 0.2 = 0.1
    // totalOcclusion += 0.5 * (1 - 0.1) = 0.45 → min(1, 0.45) = 0.45
    const { node, ctx, config } = attach({ attenuation_factor: 0.5, transmission_factor: 0.2 });
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'w', material: 'wood', distance: 1, transmission: 0.5 }],
    });
    expect((node as any).__audioOcclusionState.occlusionAmount).toBeCloseTo(0.45, 4);
  });

  it('occlusionAmount capped at 1.0 with multiple occluders', () => {
    const { node, ctx, config } = attach({ attenuation_factor: 1.0, transmission_factor: 0 });
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [
        { id: 'w1', material: 'concrete', distance: 1, transmission: 0 },
        { id: 'w2', material: 'concrete', distance: 2, transmission: 0 },
        { id: 'w3', material: 'concrete', distance: 3, transmission: 0 },
      ],
    });
    expect((node as any).__audioOcclusionState.occlusionAmount).toBeLessThanOrEqual(1.0);
  });

  it('emits audio_occlusion_start on first occlusion (not→occluded)', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'w', material: 'concrete', distance: 1, transmission: 0.1 }],
    });
    expect(ctx.emit).toHaveBeenCalledWith('audio_occlusion_start', expect.any(Object));
  });

  it('emits audio_occlusion_end when occlusion clears (occluded→not)', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__audioOcclusionState;
    state.isOccluded = true;
    ctx.emit.mockClear();
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [],
    });
    expect(ctx.emit).toHaveBeenCalledWith('audio_occlusion_end', expect.any(Object));
  });

  it('does NOT emit start/end when occlusion stays in same state', () => {
    const { node, ctx, config } = attach();
    const evt = {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'w', material: 'c', distance: 1, transmission: 0 }],
    };
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, evt); // not→occluded (emits start)
    ctx.emit.mockClear();
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, evt); // still occluded
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_occlusion_start', expect.anything());
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_occlusion_end', expect.anything());
  });

  it('sets frequency_dependent targetLowPass based on occlusionAmount', () => {
    const { node, ctx, config } = attach({
      frequency_dependent: true,
      low_pass_min_freq: 500,
      low_pass_max_freq: 22000,
      attenuation_factor: 0.5,
      transmission_factor: 0,
    });
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'w', material: 'c', distance: 1, transmission: 0 }],
    });
    const state = (node as any).__audioOcclusionState;
    // occlusionAmount=0.5, freqRange=21500, targetLowPass = 22000 - 0.5*21500 = 11250
    expect(state.targetLowPass).toBeCloseTo(22000 - 0.5 * 21500, 1);
  });

  it('resets targetLowPass to max when not occluded', () => {
    const { node, ctx, config } = attach({ frequency_dependent: true, low_pass_max_freq: 22000 });
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_occlusion_raycast_result',
      occluders: [],
    });
    expect((node as any).__audioOcclusionState.targetLowPass).toBe(22000);
  });
});

// ─── onEvent — position updates ───────────────────────────────────────────────

describe('audioOcclusionHandler.onEvent — position updates', () => {
  it('source_position_update stores position', () => {
    const { node, ctx, config } = attach();
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'source_position_update',
      position: { x: 1, y: 2, z: 3 },
    });
    expect((node as any).__audioOcclusionState.sourcePosition).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('listener_position_update stores position', () => {
    const { node, ctx, config } = attach();
    audioOcclusionHandler.onEvent!(node as any, config, ctx as any, {
      type: 'listener_position_update',
      position: { x: 7, y: 8, z: 9 },
    });
    expect((node as any).__audioOcclusionState.listenerPosition).toEqual({ x: 7, y: 8, z: 9 });
  });
});
