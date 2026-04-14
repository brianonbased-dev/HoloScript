import { describe, it, expect, beforeEach } from 'vitest';
import { hrtfHandler } from '../HRTFTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('HRTFTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    profile: 'generic',
    database: 'cipic' as const,
    custom_sofa_url: '',
    interpolation: 'bilinear' as const,
    crossfade_time: 50,
    head_radius: 0.0875,
    enable_near_field: true,
    itd_model: 'spherical' as const,
  };

  beforeEach(() => {
    node = createMockNode('hrtf');
    ctx = createMockContext();
    attachTrait(hrtfHandler, node, cfg, ctx);
  });

  it('emits hrtf_load_database and hrtf_configure on attach', () => {
    expect(getEventCount(ctx, 'hrtf_load_database')).toBe(1);
    expect(getEventCount(ctx, 'hrtf_configure')).toBe(1);
    expect((node as any).__hrtfState.isActive).toBe(true);
  });

  it('custom sofa url triggers hrtf_load_custom', () => {
    const n = createMockNode('hrtf2');
    const c = createMockContext();
    attachTrait(hrtfHandler, n, { ...cfg, custom_sofa_url: 'https://example.com/custom.sofa' }, c);
    expect(getEventCount(c, 'hrtf_load_custom')).toBe(1);
    expect(getEventCount(c, 'hrtf_load_database')).toBe(0);
  });

  it('hrtf_database_loaded sets ready', () => {
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_database_loaded', subjectId: 42 });
    expect((node as any).__hrtfState.databaseLoaded).toBe(true);
    expect((node as any).__hrtfState.subjectId).toBe(42);
    expect(getEventCount(ctx, 'hrtf_ready')).toBe(1);
  });

  it('listener_update updates position', () => {
    const pos = [1, 2, 3 ];
    const ori = { forward: [0, 0, -1 ], up: [0, 1, 0 ] };
    sendEvent(hrtfHandler, node, cfg, ctx, {
      type: 'listener_update',
      position: pos,
      orientation: ori,
    });
    expect((node as any).__hrtfState.listenerPosition).toEqual(pos);
    expect(getEventCount(ctx, 'hrtf_listener_update')).toBe(1);
  });

  it('hrtf_set_head_radius updates and reconfigures', () => {
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_set_head_radius', radius: 0.1 });
    expect((node as any).__hrtfState.headRadius).toBe(0.1);
    // hrtf_configure emitted once on attach + once on head radius change
    expect(getEventCount(ctx, 'hrtf_configure')).toBe(2);
  });

  it('hrtf_enable and hrtf_disable toggle active', () => {
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_disable' });
    expect((node as any).__hrtfState.isActive).toBe(false);
    sendEvent(hrtfHandler, node, cfg, ctx, { type: 'hrtf_enable' });
    expect((node as any).__hrtfState.isActive).toBe(true);
  });

  it('profile change on update emits hrtf_change_profile', () => {
    const newCfg = { ...cfg, profile: 'personalized' };
    updateTrait(hrtfHandler, node, newCfg, ctx, 0.016);
    expect(getEventCount(ctx, 'hrtf_change_profile')).toBe(1);
    expect((node as any).__hrtfState.currentProfile).toBe('personalized');
  });

  it('detach emits hrtf_disable and cleans up', () => {
    hrtfHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__hrtfState).toBeUndefined();
    expect(getEventCount(ctx, 'hrtf_disable')).toBe(1);
  });
});
