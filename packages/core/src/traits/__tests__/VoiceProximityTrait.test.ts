import { describe, it, expect, beforeEach } from 'vitest';
import { voiceProximityHandler } from '../VoiceProximityTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('VoiceProximityTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    min_distance: 1,
    max_distance: 20,
    falloff: 'linear' as const,
    directional: false,
    cone_inner_angle: 360,
    cone_outer_angle: 360,
    cone_outer_gain: 0,
    zones: [] as any[],
    enable_hrtf: true,
    voice_activity_detection: true,
  };

  beforeEach(() => {
    node = createMockNode('vp');
    ctx = createMockContext();
    attachTrait(voiceProximityHandler, node, cfg, ctx);
  });

  it('registers on attach', () => {
    expect(getEventCount(ctx, 'voice_proximity_register')).toBe(1);
  });

  it('distance update calculates attenuation', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, {
      type: 'voice_distance_update',
      distance: 10,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: 10, y: 0, z: 0 },
    });
    const s = (node as any).__voiceProximityState;
    // Linear at distance=10, min=1, max=20: 1 - (10-1)/(20-1) ≈ 0.526
    expect(s.targetAttenuation).toBeGreaterThan(0);
    expect(s.targetAttenuation).toBeLessThan(1);
  });

  it('full attenuation at min distance', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, {
      type: 'voice_distance_update',
      distance: 0.5,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: 0.5, y: 0, z: 0 },
    });
    expect((node as any).__voiceProximityState.targetAttenuation).toBe(1);
  });

  it('zero attenuation at max distance', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, {
      type: 'voice_distance_update',
      distance: 25,
      listenerPosition: { x: 0, y: 0, z: 0 },
      speakerPosition: { x: 25, y: 0, z: 0 },
    });
    expect((node as any).__voiceProximityState.targetAttenuation).toBe(0);
  });

  it('voice_activity toggles active state', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, { type: 'voice_activity', active: true });
    expect((node as any).__voiceProximityState.voiceActive).toBe(true);
  });

  it('mute sets gain to 0', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, { type: 'voice_mute', muted: true });
    expect((node as any).__voiceProximityState.isMuted).toBe(true);
    expect(getEventCount(ctx, 'voice_set_gain')).toBe(1);
  });

  it('update emits gain when voice active', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, { type: 'voice_activity', active: true });
    updateTrait(voiceProximityHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'voice_set_gain')).toBe(1);
  });

  it('zone enter/exit tracked', () => {
    sendEvent(voiceProximityHandler, node, cfg, ctx, { type: 'voice_zone_enter', zoneId: 'lobby' });
    expect((node as any).__voiceProximityState.activeZone).toBe('lobby');
    sendEvent(voiceProximityHandler, node, cfg, ctx, { type: 'voice_zone_exit' });
    expect((node as any).__voiceProximityState.activeZone).toBeNull();
  });

  it('detach unregisters', () => {
    voiceProximityHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'voice_proximity_unregister')).toBe(1);
    expect((node as any).__voiceProximityState).toBeUndefined();
  });
});
