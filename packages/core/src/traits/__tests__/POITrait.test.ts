import { describe, it, expect, beforeEach } from 'vitest';
import { poiHandler } from '../POITrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('POITrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    name: 'Landmark',
    description: 'A landmark POI',
    category: 'landmark',
    icon: '📍',
    trigger_radius: 10,
    visible_radius: 100,
    navigation_target: true,
    show_distance: true,
    show_label: true,
    trigger_once: false,
    cooldown: 1000,
    metadata: {} as Record<string, unknown>,
  };

  beforeEach(() => {
    node = createMockNode('poi');
    (node as any).position = { x: 0, y: 0, z: 0 };
    ctx = createMockContext();
    attachTrait(poiHandler, node, cfg, ctx);
  });

  it('registers as navigation target on attach', () => {
    expect(getEventCount(ctx, 'poi_register')).toBe(1);
    expect(getEventCount(ctx, 'poi_create_label')).toBe(1);
  });

  it('calculates distance and emits proximity on enter trigger', () => {
    (ctx as any).player = { position: { x: 5, y: 0, z: 0 } };
    updateTrait(poiHandler, node, cfg, ctx, 0.016);
    expect((node as any).__poiState.distanceToUser).toBeCloseTo(5, 0);
    expect(getEventCount(ctx, 'on_poi_proximity')).toBe(1);
  });

  it('emits exit event when leaving trigger radius', () => {
    (ctx as any).player = { position: { x: 5, y: 0, z: 0 } };
    updateTrait(poiHandler, node, cfg, ctx, 0.016);
    (ctx as any).player = { position: { x: 50, y: 0, z: 0 } };
    updateTrait(poiHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'on_poi_exit')).toBe(1);
  });

  it('visibility changes with distance', () => {
    (ctx as any).player = { position: { x: 50, y: 0, z: 0 } };
    updateTrait(poiHandler, node, cfg, ctx, 0.016);
    expect((node as any).__poiState.isVisible).toBe(true);
    (ctx as any).player = { position: { x: 200, y: 0, z: 0 } };
    updateTrait(poiHandler, node, cfg, ctx, 0.016);
    expect((node as any).__poiState.isVisible).toBe(false);
    expect(getEventCount(ctx, 'poi_visibility_change')).toBe(2);
  });

  it('navigate_to emits destination', () => {
    sendEvent(poiHandler, node, cfg, ctx, { type: 'poi_navigate_to' });
    expect(getEventCount(ctx, 'navigation_set_destination')).toBe(1);
  });

  it('poi_reset clears trigger state', () => {
    (ctx as any).player = { position: { x: 5, y: 0, z: 0 } };
    updateTrait(poiHandler, node, cfg, ctx, 0.016);
    expect((node as any).__poiState.wasTriggered).toBe(true);
    sendEvent(poiHandler, node, cfg, ctx, { type: 'poi_reset' });
    expect((node as any).__poiState.wasTriggered).toBe(false);
  });

  it('poi_highlight emits highlight event', () => {
    sendEvent(poiHandler, node, cfg, ctx, { type: 'poi_highlight', duration: 3000 });
    expect(getEventCount(ctx, 'poi_show_highlight')).toBe(1);
  });

  it('query returns state', () => {
    sendEvent(poiHandler, node, cfg, ctx, { type: 'poi_query', queryId: 'q1' });
    const r = getLastEvent(ctx, 'poi_info') as any;
    expect(r.name).toBe('Landmark');
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    poiHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__poiState).toBeUndefined();
    expect(getEventCount(ctx, 'poi_unregister')).toBe(1);
  });
});
