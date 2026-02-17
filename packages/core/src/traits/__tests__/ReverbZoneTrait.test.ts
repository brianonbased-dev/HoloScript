import { describe, it, expect, beforeEach } from 'vitest';
import { reverbZoneHandler } from '../ReverbZoneTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount } from './traitTestHelpers';

describe('ReverbZoneTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    preset: 'room' as const,
    size: 10,
    decay_time: 1.5,
    damping: 0.5,
    diffusion: 0.7,
    pre_delay: 20,
    wet_level: 0.3,
    dry_level: 1.0,
    shape: 'box' as const,
    priority: 0,
    blend_distance: 2,
    impulse_response_url: '',
  };

  beforeEach(() => {
    node = createMockNode('reverb');
    ctx = createMockContext();
    attachTrait(reverbZoneHandler, node, cfg, ctx);
  });

  it('initializes and registers', () => {
    expect((node as any).__reverbZoneState.isActive).toBe(true);
    expect(getEventCount(ctx, 'reverb_zone_register')).toBe(1);
  });

  it('listener enter sets target wet level', () => {
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_enter_zone', listenerId: 'L1' });
    expect((node as any).__reverbZoneState.targetWetLevel).toBe(1);
    expect((node as any).__reverbZoneState.listenersInZone.size).toBe(1);
    expect(getEventCount(ctx, 'reverb_zone_enter')).toBe(1);
  });

  it('listener exit clears target when last listener leaves', () => {
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_enter_zone', listenerId: 'L1' });
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_exit_zone', listenerId: 'L1' });
    expect((node as any).__reverbZoneState.targetWetLevel).toBe(0);
    expect(getEventCount(ctx, 'reverb_zone_exit')).toBe(1);
  });

  it('multiple listeners - exit does not clear until all leave', () => {
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_enter_zone', listenerId: 'L1' });
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_enter_zone', listenerId: 'L2' });
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_exit_zone', listenerId: 'L1' });
    expect((node as any).__reverbZoneState.targetWetLevel).toBe(1);
    expect(getEventCount(ctx, 'reverb_zone_exit')).toBe(0);
  });

  it('distance blends wet level', () => {
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_distance_update', distance: 1 });
    expect((node as any).__reverbZoneState.targetWetLevel).toBeCloseTo(0.5, 2);
  });

  it('smoothly blends current toward target on update', () => {
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'listener_enter_zone', listenerId: 'L1' });
    updateTrait(reverbZoneHandler, node, cfg, ctx, 0.1);
    const s = (node as any).__reverbZoneState;
    expect(s.currentWetLevel).toBeGreaterThan(0);
    expect(s.currentWetLevel).toBeLessThanOrEqual(1);
    expect(getEventCount(ctx, 'reverb_update_mix')).toBe(1);
  });

  it('convolver_loaded marks ready', () => {
    sendEvent(reverbZoneHandler, node, cfg, ctx, { type: 'convolver_loaded' });
    expect((node as any).__reverbZoneState.convolverLoaded).toBe(true);
    expect(getEventCount(ctx, 'reverb_zone_ready')).toBe(1);
  });

  it('cleans up on detach', () => {
    reverbZoneHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__reverbZoneState).toBeUndefined();
    expect(getEventCount(ctx, 'reverb_zone_unregister')).toBe(1);
  });
});
