import { describe, it, expect, beforeEach } from 'vitest';
import { magnifiableHandler } from '../MagnifiableTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('MagnifiableTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    min_scale: 1,
    max_scale: 5,
    trigger: 'pinch' as const,
    smooth_zoom: true,
    zoom_speed: 2,
    lens_mode: false,
    lens_size: 0.3,
    lens_border: true,
    preserve_aspect: true,
  };

  beforeEach(() => {
    node = createMockNode('magnify');
    (node as any).scale = { x: 1, y: 1, z: 1 };
    ctx = createMockContext();
    attachTrait(magnifiableHandler, node, cfg, ctx);
  });

  it('initializes at 1x magnification', () => {
    const s = (node as any).__magnifiableState;
    expect(s.currentMagnification).toBe(1);
    expect(s.isZooming).toBe(false);
  });

  it('magnify_start sets zooming', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_start' });
    expect((node as any).__magnifiableState.isZooming).toBe(true);
    expect(getEventCount(ctx, 'on_magnify_start')).toBe(1);
  });

  it('magnify_update changes target (smooth zoom)', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_update', scale: 2 });
    expect((node as any).__magnifiableState.targetMagnification).toBe(2);
    expect((node as any).__magnifiableState.currentMagnification).toBe(1); // not yet interpolated
  });

  it('magnify_set clamps to max', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_set', magnification: 10 });
    expect((node as any).__magnifiableState.targetMagnification).toBe(5);
  });

  it('magnify_reset returns to 1x', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_set', magnification: 3 });
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_reset' });
    expect((node as any).__magnifiableState.targetMagnification).toBe(1);
  });

  it('smooth zoom interpolates on update', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_set', magnification: 3 });
    updateTrait(magnifiableHandler, node, cfg, ctx, 0.05);
    const s = (node as any).__magnifiableState;
    expect(s.currentMagnification).toBeGreaterThan(1);
    expect(s.currentMagnification).toBeLessThan(3);
  });

  it('applies scale to node on update', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_set', magnification: 2 });
    for (let i = 0; i < 20; i++) updateTrait(magnifiableHandler, node, cfg, ctx, 0.1);
    expect((node as any).scale.x).toBeCloseTo(2, 0);
  });

  it('magnify_end emits event', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_end' });
    expect(getEventCount(ctx, 'on_magnify_end')).toBe(1);
  });

  it('query returns info', () => {
    sendEvent(magnifiableHandler, node, cfg, ctx, { type: 'magnify_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'magnify_info') as any;
    expect(r.currentMagnification).toBe(1);
  });

  it('cleans up and restores scale on detach', () => {
    (node as any).scale = { x: 2, y: 2, z: 2 };
    magnifiableHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__magnifiableState).toBeUndefined();
    // Scale restored to original (1,1,1)
    expect((node as any).scale.x).toBe(1);
  });
});
