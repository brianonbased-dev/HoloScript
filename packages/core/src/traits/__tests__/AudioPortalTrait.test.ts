import { describe, it, expect, beforeEach } from 'vitest';
import { audioPortalHandler } from '../AudioPortalTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('AudioPortalTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    opening_size: 1,
    connected_zones: ['room_a', 'room_b'] as [string, string],
    transmission_loss: 6,
    diffraction: true,
    frequency_filtering: true,
    low_pass_frequency: 8000,
    open_by_default: true,
    max_sources: 8,
  };

  beforeEach(() => {
    node = createMockNode('portal');
    ctx = createMockContext();
    attachTrait(audioPortalHandler, node, cfg, ctx);
  });

  it('initializes open by default', () => {
    const s = (node as any).__audioPortalState;
    expect(s.isOpen).toBe(true);
    expect(s.openAmount).toBe(1);
    expect(s.sourceZone).toBe('room_a');
    expect(s.targetZone).toBe('room_b');
  });

  it('registers on attach', () => {
    expect(getEventCount(ctx, 'audio_portal_register')).toBe(1);
  });

  it('close event sets portal closed', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_portal_close' });
    expect((node as any).__audioPortalState.isOpen).toBe(false);
    expect(getEventCount(ctx, 'audio_portal_state_change')).toBe(1);
  });

  it('open event restores open state', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_portal_close' });
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_portal_open' });
    expect((node as any).__audioPortalState.isOpen).toBe(true);
  });

  it('set_openness controls partial opening', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_portal_set_openness', amount: 0.5 });
    expect((node as any).__audioPortalState.openAmount).toBe(0.5);
  });

  it('routes audio source through portal', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_source_route', sourceId: 's1', fromZone: 'room_a', toZone: 'room_b' });
    expect((node as any).__audioPortalState.activeConnections.has('s1')).toBe(true);
    expect(getEventCount(ctx, 'audio_portal_route_source')).toBe(1);
  });

  it('ignores route for non-connected zones', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_source_route', sourceId: 's2', fromZone: 'room_c', toZone: 'room_d' });
    expect((node as any).__audioPortalState.activeConnections.size).toBe(0);
  });

  it('unroutes audio source', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_source_route', sourceId: 's1', fromZone: 'room_a', toZone: 'room_b' });
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_source_unroute', sourceId: 's1' });
    expect((node as any).__audioPortalState.activeConnections.has('s1')).toBe(false);
  });

  it('portal_query returns info', () => {
    sendEvent(audioPortalHandler, node, cfg, ctx, { type: 'audio_portal_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'audio_portal_info') as any;
    expect(r.isOpen).toBe(true);
    expect(r.zones).toEqual(['room_a', 'room_b']);
  });

  it('cleans up on detach', () => {
    audioPortalHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__audioPortalState).toBeUndefined();
    expect(getEventCount(ctx, 'audio_portal_unregister')).toBe(1);
  });
});
