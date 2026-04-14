import { describe, it, expect, beforeEach } from 'vitest';
import { audioOcclusionHandler } from '../AudioOcclusionTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('AudioOcclusionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'raycast' as const,
    frequency_dependent: true,
    low_pass_filter: true,
    attenuation_factor: 0.5,
    transmission_factor: 0.2,
    update_rate: 15,
    max_occlusion_db: -24,
    low_pass_min_freq: 500,
    low_pass_max_freq: 22000,
  };

  beforeEach(() => {
    node = createMockNode('audio');
    ctx = createMockContext();
    attachTrait(audioOcclusionHandler, node, cfg, ctx);
  });

  it('initializes unoccluded', () => {
    const s = (node as any).__audioOcclusionState;
    expect(s.isOccluded).toBe(false);
    expect(s.occlusionAmount).toBe(0);
    expect(s.lowPassFrequency).toBe(22000);
  });

  it('registers on attach', () => {
    expect(getEventCount(ctx, 'audio_occlusion_register')).toBe(1);
  });

  it('raycast result with occluders sets occluded', () => {
    sendEvent(audioOcclusionHandler, node, cfg, ctx, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'wall', material: 'concrete', distance: 5, transmission: 0.1 }],
    });
    const s = (node as any).__audioOcclusionState;
    expect(s.isOccluded).toBe(true);
    expect(s.occlusionAmount).toBeGreaterThan(0);
    expect(getEventCount(ctx, 'audio_occlusion_start')).toBe(1);
  });

  it('empty occluders clears occlusion', () => {
    sendEvent(audioOcclusionHandler, node, cfg, ctx, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'wall', material: 'x', distance: 2, transmission: 0.1 }],
    });
    ctx.clearEvents();
    sendEvent(audioOcclusionHandler, node, cfg, ctx, {
      type: 'audio_occlusion_raycast_result',
      occluders: [],
    });
    expect((node as any).__audioOcclusionState.isOccluded).toBe(false);
    expect(getEventCount(ctx, 'audio_occlusion_end')).toBe(1);
  });

  it('lowers low-pass target when occluded', () => {
    sendEvent(audioOcclusionHandler, node, cfg, ctx, {
      type: 'audio_occlusion_raycast_result',
      occluders: [{ id: 'wall', material: 'x', distance: 2, transmission: 0.1 }],
    });
    expect((node as any).__audioOcclusionState.targetLowPass).toBeLessThan(22000);
  });

  it('smooths low-pass filter on update', () => {
    const s = (node as any).__audioOcclusionState;
    s.targetLowPass = 5000;
    updateTrait(audioOcclusionHandler, node, cfg, ctx, 0.1);
    expect(s.lowPassFrequency).toBeLessThan(22000);
  });

  it('source_position_update updates source', () => {
    sendEvent(audioOcclusionHandler, node, cfg, ctx, {
      type: 'source_position_update',
      position: [10, 0, 0],
    });
    expect((node as any).__audioOcclusionState.sourcePosition).toEqual([10, 0, 0 ]);
  });

  it('cleans up on detach', () => {
    audioOcclusionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__audioOcclusionState).toBeUndefined();
    expect(getEventCount(ctx, 'audio_occlusion_unregister')).toBe(1);
  });
});
