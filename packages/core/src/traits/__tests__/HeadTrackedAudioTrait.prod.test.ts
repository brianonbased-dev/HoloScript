/**
 * HeadTrackedAudioTrait — Production Test Suite
 *
 * headTrackedAudioHandler stores state on node.__headTrackedAudioState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 8 fields
 * 2. onAttach — state init, worldPosition from node.position, audio_load_source when source,
 *               autoplay sets isPlaying=true
 * 3. onDetach — audio_stop when playing, audio_dispose_source always, removes state
 * 4. onUpdate — no-op when !isPlaying; anchor_mode='world': stabilization blend + audio_set_position;
 *               'head': relative position; 'hybrid': blended position
 * 5. onEvent — head_rotation_update, audio_source_loaded + autoplay, audio_play, audio_stop,
 *              audio_set_world_position, audio_set_relative_position
 */
import { describe, it, expect, vi } from 'vitest';
import { headTrackedAudioHandler } from '../HeadTrackedAudioTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode(pos?: { x: number; y: number; z: number }) {
  return { id: 'hta_node', properties: {}, ...(pos ? { position: pos } : {}) };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof headTrackedAudioHandler.defaultConfig> = {}, pos?: { x: number; y: number; z: number }) {
  const node = makeNode(pos);
  const ctx = makeCtx();
  const config = { ...headTrackedAudioHandler.defaultConfig!, ...cfg };
  headTrackedAudioHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('headTrackedAudioHandler.defaultConfig', () => {
  const d = headTrackedAudioHandler.defaultConfig!;
  it('source=""', () => expect(d.source).toBe(''));
  it('anchor_mode=world', () => expect(d.anchor_mode).toBe('world'));
  it('tracking_latency_compensation=true', () => expect(d.tracking_latency_compensation).toBe(true));
  it('stabilization=0.5', () => expect(d.stabilization).toBe(0.5));
  it('bypass_spatialization=false', () => expect(d.bypass_spatialization).toBe(false));
  it('volume=1.0', () => expect(d.volume).toBe(1.0));
  it('loop=false', () => expect(d.loop).toBe(false));
  it('autoplay=false', () => expect(d.autoplay).toBe(false));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('headTrackedAudioHandler.onAttach', () => {
  it('initialises __headTrackedAudioState', () => {
    const { node } = attach();
    expect((node as any).__headTrackedAudioState).toBeDefined();
  });

  it('isPlaying=false initially when autoplay=false', () => {
    const { node } = attach({ autoplay: false, source: 'test.ogg' });
    expect((node as any).__headTrackedAudioState.isPlaying).toBe(false);
  });

  it('captures node.position as worldPosition', () => {
    const { node } = attach({}, { x: 3, y: 4, z: 5 });
    expect((node as any).__headTrackedAudioState.worldPosition).toEqual({ x: 3, y: 4, z: 5 });
  });

  it('worldPosition stays {0,0,0} when node has no position', () => {
    const { node } = attach();
    expect((node as any).__headTrackedAudioState.worldPosition).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('emits audio_load_source when source is provided', () => {
    const { ctx } = attach({ source: 'audio/bg.ogg', bypass_spatialization: false, loop: true, volume: 0.8 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_load_source');
    expect(call).toBeDefined();
    expect(call![1].url).toBe('audio/bg.ogg');
    expect(call![1].spatial).toBe(true); // !bypass_spatialization
    expect(call![1].loop).toBe(true);
    expect(call![1].volume).toBe(0.8);
  });

  it('does NOT emit audio_load_source when source is empty', () => {
    const { ctx } = attach({ source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_load_source', expect.anything());
  });

  it('spatial=false when bypass_spatialization=true', () => {
    const { ctx } = attach({ source: 'test.ogg', bypass_spatialization: true });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_load_source');
    expect(call![1].spatial).toBe(false);
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('headTrackedAudioHandler.onDetach', () => {
  it('always emits audio_dispose_source', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    headTrackedAudioHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('audio_dispose_source', expect.any(Object));
  });

  it('emits audio_stop when isPlaying=true', () => {
    const { node, ctx, config } = attach();
    (node as any).__headTrackedAudioState.isPlaying = true;
    ctx.emit.mockClear();
    headTrackedAudioHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('audio_stop', expect.any(Object));
  });

  it('does NOT emit audio_stop when isPlaying=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    headTrackedAudioHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('audio_stop', expect.anything());
  });

  it('removes __headTrackedAudioState', () => {
    const { node, ctx, config } = attach();
    headTrackedAudioHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__headTrackedAudioState).toBeUndefined();
  });
});

// ─── onUpdate — no-op ─────────────────────────────────────────────────────────

describe('headTrackedAudioHandler.onUpdate — no-op when not playing', () => {
  it('does not emit when isPlaying=false', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    headTrackedAudioHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — anchor_mode=world ────────────────────────────────────────────

describe('headTrackedAudioHandler.onUpdate — anchor_mode=world', () => {
  it('emits audio_set_position when isPlaying=true', () => {
    const { node, ctx, config } = attach({ anchor_mode: 'world', stabilization: 0.5 });
    const state = (node as any).__headTrackedAudioState;
    state.isPlaying = true;
    ctx.emit.mockClear();
    headTrackedAudioHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('audio_set_position', expect.objectContaining({ position: expect.any(Object) }));
  });

  it('stabilization=0 → stabilizedPosition converges to compensated immediately', () => {
    const { node, ctx, config } = attach({ anchor_mode: 'world', stabilization: 0 });
    const state = (node as any).__headTrackedAudioState;
    state.isPlaying = true;
    state.worldPosition = { x: 1, y: 0, z: 0 };
    state.headRotation = { x: 0, y: 0, z: 0, w: 1 }; // identity → no rotation
    state.stabilizedPosition = { x: 99, y: 99, z: 99 }; // starts far away
    ctx.emit.mockClear();
    headTrackedAudioHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    // With identity quaternion applyInverseRotation({x:1,y:0,z:0}, {0,0,0,1}) should ≈ {x:1,y:0,z:0}
    // With s=0 → stabilizedPos = prev*0 + compensated*1 = compensated
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_set_position');
    // Should be close to {x:1,y:0,z:0} (identity rotation preserves position)
    expect(Math.abs(call![1].position.x - 1)).toBeLessThan(0.1);
  });

  it('stabilization=1 → stabilizedPosition stays at old position', () => {
    const { node, ctx, config } = attach({ anchor_mode: 'world', stabilization: 1.0 });
    const state = (node as any).__headTrackedAudioState;
    state.isPlaying = true;
    state.stabilizedPosition = { x: 5, y: 0, z: 0 };
    ctx.emit.mockClear();
    headTrackedAudioHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    // s=1.0 → newPos = old*1 + compensated*0 = old
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_set_position');
    expect(call![1].position.x).toBeCloseTo(5, 1);
  });
});

// ─── onUpdate — anchor_mode=head ─────────────────────────────────────────────

describe('headTrackedAudioHandler.onUpdate — anchor_mode=head', () => {
  it('emits audio_set_position with relativePosition', () => {
    const { node, ctx, config } = attach({ anchor_mode: 'head' });
    const state = (node as any).__headTrackedAudioState;
    state.isPlaying = true;
    state.relativePosition = { x: 0.5, y: 0, z: -1 };
    ctx.emit.mockClear();
    headTrackedAudioHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'audio_set_position');
    expect(call![1].position).toEqual({ x: 0.5, y: 0, z: -1 });
  });
});

// ─── onUpdate — anchor_mode=hybrid ───────────────────────────────────────────

describe('headTrackedAudioHandler.onUpdate — anchor_mode=hybrid', () => {
  it('emits audio_set_position with blended position', () => {
    const { node, ctx, config } = attach({ anchor_mode: 'hybrid', stabilization: 0.5 });
    const state = (node as any).__headTrackedAudioState;
    state.isPlaying = true;
    state.relativePosition = { x: 0, y: 0, z: 0 };
    state.worldPosition = { x: 0, y: 0, z: 0 };
    ctx.emit.mockClear();
    headTrackedAudioHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('audio_set_position', expect.any(Object));
  });
});

// ─── onEvent ──────────────────────────────────────────────────────────────────

describe('headTrackedAudioHandler.onEvent', () => {
  it('head_rotation_update stores rotation', () => {
    const { node, ctx, config } = attach();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, {
      type: 'head_rotation_update',
      rotation: { x: 0.1, y: 0.2, z: 0.3, w: 0.9 },
    });
    expect((node as any).__headTrackedAudioState.headRotation).toEqual({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 });
  });

  it('audio_source_loaded stores sourceId', () => {
    const { node, ctx, config } = attach();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_source_loaded',
      sourceId: 'src_42',
    });
    expect((node as any).__headTrackedAudioState.audioSourceId).toBe('src_42');
  });

  it('audio_source_loaded + autoplay=true starts playing + emits audio_play', () => {
    const { node, ctx, config } = attach({ autoplay: true });
    ctx.emit.mockClear();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_source_loaded',
      sourceId: 'src_1',
    });
    expect((node as any).__headTrackedAudioState.isPlaying).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('audio_play', expect.any(Object));
  });

  it('audio_play sets isPlaying=true and emits audio_start', () => {
    const { node, ctx, config } = attach({ loop: false, volume: 0.6 });
    ctx.emit.mockClear();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_play' });
    expect((node as any).__headTrackedAudioState.isPlaying).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('audio_start', expect.objectContaining({ loop: false, volume: 0.6 }));
  });

  it('audio_stop sets isPlaying=false and emits audio_stop', () => {
    const { node, ctx, config } = attach();
    (node as any).__headTrackedAudioState.isPlaying = true;
    ctx.emit.mockClear();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, { type: 'audio_stop' });
    expect((node as any).__headTrackedAudioState.isPlaying).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('audio_stop', expect.any(Object));
  });

  it('audio_set_world_position updates worldPosition', () => {
    const { node, ctx, config } = attach();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_set_world_position',
      position: { x: 10, y: 5, z: -3 },
    });
    expect((node as any).__headTrackedAudioState.worldPosition).toEqual({ x: 10, y: 5, z: -3 });
  });

  it('audio_set_relative_position updates relativePosition', () => {
    const { node, ctx, config } = attach();
    headTrackedAudioHandler.onEvent!(node as any, config, ctx as any, {
      type: 'audio_set_relative_position',
      position: { x: 0, y: -0.5, z: 1 },
    });
    expect((node as any).__headTrackedAudioState.relativePosition).toEqual({ x: 0, y: -0.5, z: 1 });
  });
});
