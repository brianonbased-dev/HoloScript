import { describe, it, expect, beforeEach } from 'vitest';
import { spatialAudioCueHandler } from '../SpatialAudioCueTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('SpatialAudioCueTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    cue_type: 'navigation' as const,
    earcon: 'beep.mp3',
    spatial: true,
    repeat_interval: 0,
    volume: 1.0,
    priority: 'medium' as const,
    max_distance: 10,
    tts_message: '',
    interrupt_lower_priority: true,
  };

  beforeEach(() => {
    node = createMockNode('sac');
    ctx = createMockContext();
    attachTrait(spatialAudioCueHandler, node, cfg, ctx);
  });

  it('registers and preloads earcon on attach', () => {
    expect(getEventCount(ctx, 'audio_cue_register')).toBe(1);
    expect(getEventCount(ctx, 'audio_preload')).toBe(1);
  });

  it('manual trigger plays cue', () => {
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_trigger' });
    expect((node as any).__spatialAudioCueState.isPlaying).toBe(true);
    expect(getEventCount(ctx, 'audio_cue_play')).toBe(1);
  });

  it('trigger with tts message speaks', () => {
    const ttsCfg = { ...cfg, tts_message: 'Turn left' };
    const n2 = createMockNode('tts');
    const c2 = createMockContext();
    attachTrait(spatialAudioCueHandler, n2, ttsCfg, c2);
    sendEvent(spatialAudioCueHandler, n2, ttsCfg, c2, { type: 'audio_cue_trigger' });
    expect(getEventCount(c2, 'tts_speak')).toBe(1);
  });

  it('repeat interval plays periodically', () => {
    const repeatCfg = { ...cfg, repeat_interval: 1 };
    const n2 = createMockNode('rep');
    const c2 = createMockContext();
    attachTrait(spatialAudioCueHandler, n2, repeatCfg, c2);
    updateTrait(spatialAudioCueHandler, n2, repeatCfg, c2, 1.5);
    expect(getEventCount(c2, 'audio_cue_play')).toBe(1);
  });

  it('stop event cancels playback', () => {
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_trigger' });
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_stop' });
    expect((node as any).__spatialAudioCueState.isPlaying).toBe(false);
    expect(getEventCount(ctx, 'audio_stop')).toBe(1);
  });

  it('complete event marks not playing', () => {
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_trigger' });
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_complete' });
    expect((node as any).__spatialAudioCueState.isPlaying).toBe(false);
  });

  it('activate/deactivate controls active state', () => {
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_deactivate' });
    expect((node as any).__spatialAudioCueState.isActive).toBe(false);
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, { type: 'audio_cue_activate' });
    expect((node as any).__spatialAudioCueState.isActive).toBe(true);
  });

  it('listener_distance_update triggers when in range', () => {
    sendEvent(spatialAudioCueHandler, node, cfg, ctx, {
      type: 'listener_distance_update',
      distance: 5,
    });
    expect(getEventCount(ctx, 'audio_cue_trigger')).toBe(1);
  });

  it('cleans up on detach', () => {
    spatialAudioCueHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__spatialAudioCueState).toBeUndefined();
    expect(getEventCount(ctx, 'audio_cue_unregister')).toBe(1);
  });
});
