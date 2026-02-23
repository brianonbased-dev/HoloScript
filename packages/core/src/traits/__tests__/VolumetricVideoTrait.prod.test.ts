/**
 * VolumetricVideoTrait Production Tests
 *
 * 4D Gaussian Splatting / volumetric capture playback.
 * Covers: defaultConfig, onAttach (preload vs init paths),
 * onDetach (playing guard), onUpdate (frame advance + loop/complete + buffering),
 * and all 9 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { volumetricVideoHandler } from '../VolumetricVideoTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'vv_test' } as any; }
function makeCtx() { return { emit: vi.fn() }; }

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...volumetricVideoHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  volumetricVideoHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) { return node.__volumetricVideoState as any; }
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  volumetricVideoHandler.onEvent!(node, cfg, ctx as any, evt as any);
}
function update(node: any, cfg: any, ctx: any, delta = 16) {
  volumetricVideoHandler.onUpdate!(node, cfg, ctx as any, delta);
}

/** Promote to a playing, loaded state with known fps/totalFrames/duration */
function setPlaying(node: any, fps = 30, totalFrames = 90, extraFrames = 60) {
  st(node).isLoaded = true;
  st(node).totalFrames = totalFrames;
  st(node).fps = fps;
  st(node).duration = totalFrames / fps;
  st(node).bufferedFrames = extraFrames; // above buffer_size default=30
  st(node).playbackState = 'playing';
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('VolumetricVideoTrait — defaultConfig', () => {
  it('has 11 fields with correct defaults', () => {
    const d = volumetricVideoHandler.defaultConfig!;
    expect(d.source).toBe('');
    expect(d.format).toBe('4dgs');
    expect(d.loop).toBe(false);
    expect(d.playback_rate).toBeCloseTo(1.0);
    expect(d.preload).toBe(false);
    expect(d.buffer_size).toBe(30);
    expect(d.spatial_audio).toBe(true);
    expect(d.audio_source).toBe('');
    expect(d.quality).toBe('auto');
    expect(d.start_time).toBe(0);
    expect(d.end_time).toBe(0);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('VolumetricVideoTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node, { source: '' });
    const s = st(node);
    expect(s.playbackState).toBe('stopped');
    expect(s.currentFrame).toBe(0);
    expect(s.currentTime).toBe(0);
    expect(s.totalFrames).toBe(0);
    expect(s.duration).toBe(0);
    expect(s.fps).toBe(30);
    expect(s.bufferedFrames).toBe(0);
    expect(s.isLoaded).toBe(false);
  });

  it('emits volumetric_load when source set and preload=true', () => {
    const node = makeNode();
    const { ctx } = attach(node, { source: 'capture.4dgs', preload: true, format: '4dgs', quality: 'high', buffer_size: 60 });
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_load', expect.objectContaining({
      source: 'capture.4dgs', format: '4dgs', quality: 'high', bufferSize: 60,
    }));
  });

  it('emits volumetric_init (not load) when source set and preload=false', () => {
    const node = makeNode();
    const { ctx } = attach(node, { source: 'capture.4dgs', preload: false, format: 'v3d' });
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_init', expect.objectContaining({
      source: 'capture.4dgs', format: 'v3d',
    }));
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_load', expect.any(Object));
  });

  it('no emit when source is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { source: '' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('VolumetricVideoTrait — onDetach', () => {
  it('emits volumetric_stop when playing, then always volumetric_unload', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).playbackState = 'playing';
    ctx.emit.mockClear();
    volumetricVideoHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_stop', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_unload', expect.any(Object));
  });

  it('always emits volumetric_unload even when stopped', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    volumetricVideoHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('volumetric_stop', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_unload', expect.any(Object));
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('VolumetricVideoTrait — onUpdate', () => {
  it('no-op when playbackState is not playing', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).playbackState = 'paused';
    ctx.emit.mockClear();
    update(node, cfg, ctx, 16);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('advances frame and emits volumetric_render_frame + on_volume_frame when playing', () => {
    const node = makeNode();
    const { cfg } = attach(node, { playback_rate: 1.0 });
    const ctx = makeCtx();
    volumetricVideoHandler.onAttach!(node, cfg, ctx as any);
    setPlaying(node, 30, 900);
    ctx.emit.mockClear();
    update(node, cfg, ctx, 16); // 16ms → 0.016s → frame += 0.016/1000 * 30 * 1 = 0.48
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_render_frame', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_frame', expect.any(Object));
    expect(st(node).currentFrame).toBeGreaterThan(0);
  });

  it('loops when end reached and loop=true', () => {
    const node = makeNode();
    const { cfg } = attach(node, { loop: true, start_time: 0, end_time: 0, playback_rate: 1.0 });
    const ctx = makeCtx();
    volumetricVideoHandler.onAttach!(node, cfg, ctx as any);
    // Set currentTime just at end to trigger loop on next update
    setPlaying(node, 30, 30); // duration = 1.0s
    st(node).currentTime = 1.0; // at duration
    st(node).currentFrame = 30;
    ctx.emit.mockClear();
    update(node, cfg, ctx, 16);
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_loop', expect.any(Object));
    expect(st(node).playbackState).toBe('playing'); // still playing after loop
  });

  it('stops and emits on_volume_complete when loop=false and end reached', () => {
    const node = makeNode();
    const { cfg } = attach(node, { loop: false, end_time: 0, playback_rate: 1.0 });
    const ctx = makeCtx();
    volumetricVideoHandler.onAttach!(node, cfg, ctx as any);
    setPlaying(node, 30, 30); // duration = 1.0s
    st(node).currentTime = 1.01; // past end
    st(node).currentFrame = 31;
    ctx.emit.mockClear();
    update(node, cfg, ctx, 16);
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_complete', expect.any(Object));
    expect(st(node).playbackState).toBe('stopped');
  });

  it('transitions to buffering and emits volumetric_buffer_request when bufferedFrames < buffer_size', () => {
    const node = makeNode();
    const { cfg } = attach(node, { buffer_size: 30, playback_rate: 1.0, end_time: 0, loop: true });
    const ctx = makeCtx();
    volumetricVideoHandler.onAttach!(node, cfg, ctx as any);
    setPlaying(node, 30, 3000, 5); // bufferedFrames=5 < buffer_size=30
    ctx.emit.mockClear();
    update(node, cfg, ctx, 16);
    expect(st(node).playbackState).toBe('buffering');
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_buffer_request', expect.any(Object));
  });
});

// ─── onEvent — volumetric_play ────────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_play', () => {
  it('sets playbackState=playing and emits on_volume_play when loaded', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isLoaded = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_play' });
    expect(st(node).playbackState).toBe('playing');
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_play', expect.any(Object));
  });

  it('emits spatial audio sync when spatial_audio=true and audio_source set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { spatial_audio: true, audio_source: 'audio.wav' });
    st(node).isLoaded = true;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_play' });
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_sync_audio', expect.objectContaining({ audioSource: 'audio.wav' }));
  });

  it('triggers load (returns early) when not loaded', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: 'capture.4dgs', format: '4dgs' });
    st(node).isLoaded = false;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_play' });
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_load', expect.any(Object));
    // playbackState NOT set to playing (returned early)
    expect(st(node).playbackState).toBe('stopped');
  });
});

// ─── onEvent — volumetric_pause ───────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_pause', () => {
  it('sets playbackState=paused, emits audio pause + on_volume_pause', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { spatial_audio: true });
    st(node).playbackState = 'playing';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_pause' });
    expect(st(node).playbackState).toBe('paused');
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_pause_audio', expect.any(Object));
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_pause', expect.any(Object));
  });
});

// ─── onEvent — volumetric_stop ────────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_stop', () => {
  it('resets playback to start_time and emits on_volume_stop', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { start_time: 2.0, spatial_audio: false });
    st(node).fps = 30;
    st(node).currentTime = 5.0;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_stop' });
    expect(st(node).playbackState).toBe('stopped');
    expect(st(node).currentTime).toBeCloseTo(2.0);
    expect(st(node).currentFrame).toBeCloseTo(60); // 2.0 * 30
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_stop', expect.any(Object));
  });
});

// ─── onEvent — volumetric_seek ────────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_seek', () => {
  it('clamps to [start_time, duration] and resets bufferedFrames', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { start_time: 1.0, spatial_audio: false });
    st(node).fps = 30;
    st(node).duration = 10.0;
    st(node).bufferedFrames = 50;
    fire(node, cfg, ctx, { type: 'volumetric_seek', time: 5.0 });
    expect(st(node).currentTime).toBeCloseTo(5.0);
    expect(st(node).currentFrame).toBeCloseTo(150); // 5 * 30
    expect(st(node).bufferedFrames).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_seek', expect.any(Object));
  });

  it('clamps below start_time to start_time', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { start_time: 2.0, spatial_audio: false });
    st(node).fps = 30;
    st(node).duration = 10.0;
    fire(node, cfg, ctx, { type: 'volumetric_seek', time: 0.5 }); // below start_time
    expect(st(node).currentTime).toBeCloseTo(2.0);
  });
});

// ─── onEvent — volumetric_loaded ─────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_loaded', () => {
  it('sets isLoaded, totalFrames, fps, duration, adjusts startTime, emits on_volume_loaded', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { start_time: 1.0 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_loaded', totalFrames: 300, fps: 30 });
    expect(st(node).isLoaded).toBe(true);
    expect(st(node).totalFrames).toBe(300);
    expect(st(node).fps).toBe(30);
    expect(st(node).duration).toBeCloseTo(10.0); // 300/30
    expect(st(node).currentTime).toBeCloseTo(1.0); // start_time
    expect(st(node).currentFrame).toBeCloseTo(30); // 1.0 * 30
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_loaded', expect.objectContaining({ duration: 10, totalFrames: 300, fps: 30 }));
  });

  it('defaults fps to 30 when not provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'volumetric_loaded', totalFrames: 120 });
    expect(st(node).fps).toBe(30);
  });
});

// ─── onEvent — volumetric_buffered ────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_buffered', () => {
  it('updates bufferedFrames', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'volumetric_buffered', count: 20 });
    expect(st(node).bufferedFrames).toBe(20);
  });

  it('transitions from buffering to playing when bufferedFrames >= buffer_size/2', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { buffer_size: 30 });
    st(node).playbackState = 'buffering';
    fire(node, cfg, ctx, { type: 'volumetric_buffered', count: 15 }); // 15 >= 30/2
    expect(st(node).playbackState).toBe('playing');
  });

  it('stays buffering when below buffer_size/2', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { buffer_size: 30 });
    st(node).playbackState = 'buffering';
    fire(node, cfg, ctx, { type: 'volumetric_buffered', count: 10 }); // 10 < 15
    expect(st(node).playbackState).toBe('buffering');
  });
});

// ─── onEvent — volumetric_error ───────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_error', () => {
  it('sets playbackState=error and emits on_volume_error', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_error', error: 'DECODE_FAIL' });
    expect(st(node).playbackState).toBe('error');
    expect(ctx.emit).toHaveBeenCalledWith('on_volume_error', expect.objectContaining({ error: 'DECODE_FAIL' }));
  });
});

// ─── onEvent — volumetric_query ───────────────────────────────────────────────

describe('VolumetricVideoTrait — onEvent: volumetric_query', () => {
  it('emits volumetric_info with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { format: '4dgs' });
    setPlaying(node, 30, 900, 50);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'volumetric_query', queryId: 'vq1' });
    expect(ctx.emit).toHaveBeenCalledWith('volumetric_info', expect.objectContaining({
      queryId: 'vq1', playbackState: 'playing', totalFrames: 900, fps: 30, isLoaded: true, format: '4dgs',
    }));
  });
});
