import { describe, it, expect, beforeEach } from 'vitest';
import { terrainAnchorHandler } from '../TerrainAnchorTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount } from './traitTestHelpers';

describe('TerrainAnchorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    latitude: 40.7128,
    longitude: -74.006,
    elevation_offset: 2,
    terrain_following: true,
    surface_normal_alignment: true,
    auto_resolve: true,
    smoothing: 0.9,
  };

  beforeEach(() => {
    node = createMockNode('ta');
    ctx = createMockContext();
    attachTrait(terrainAnchorHandler, node, cfg, ctx);
  });

  it('auto resolves on attach', () => {
    expect(getEventCount(ctx, 'terrain_anchor_request')).toBe(1);
    expect((node as any).__terrainAnchorState.state).toBe('resolving');
  });

  it('no auto resolve when disabled', () => {
    const n = createMockNode('ta2');
    const c = createMockContext();
    attachTrait(terrainAnchorHandler, n, { ...cfg, auto_resolve: false }, c);
    expect(getEventCount(c, 'terrain_anchor_request')).toBe(0);
  });

  it('resolved sets state and emits', () => {
    sendEvent(terrainAnchorHandler, node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'h1',
      terrainHeight: 50,
      confidence: 0.95,
      position: { x: 1, y: 50, z: 2 },
      surfaceNormal: { x: 0, y: 1, z: 0 },
    });
    const s = (node as any).__terrainAnchorState;
    expect(s.state).toBe('resolved');
    expect(s.terrainHeight).toBe(50);
    expect(getEventCount(ctx, 'on_terrain_resolved')).toBe(1);
  });

  it('pose update transitions to tracking', () => {
    sendEvent(terrainAnchorHandler, node, cfg, ctx, {
      type: 'terrain_pose_update',
      position: { x: 1, y: 51, z: 2 },
      terrainHeight: 51,
    });
    expect((node as any).__terrainAnchorState.state).toBe('tracking');
  });

  it('unavailable sets state and emits', () => {
    sendEvent(terrainAnchorHandler, node, cfg, ctx, {
      type: 'terrain_anchor_unavailable',
      reason: 'no_terrain_data',
    });
    expect((node as any).__terrainAnchorState.state).toBe('unavailable');
    expect(getEventCount(ctx, 'on_terrain_unavailable')).toBe(1);
  });

  it('manual resolve restarts resolution', () => {
    sendEvent(terrainAnchorHandler, node, cfg, ctx, { type: 'terrain_anchor_resolve' });
    expect(getEventCount(ctx, 'terrain_anchor_request')).toBe(2);
  });

  it('query emits info', () => {
    sendEvent(terrainAnchorHandler, node, cfg, ctx, { type: 'terrain_anchor_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'terrain_anchor_info')).toBe(1);
  });

  it('detach releases handle', () => {
    sendEvent(terrainAnchorHandler, node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'h1',
      terrainHeight: 50,
      confidence: 1.0,
      position: { x: 0, y: 0, z: 0 },
    });
    terrainAnchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'terrain_anchor_release')).toBe(1);
    expect((node as any).__terrainAnchorState).toBeUndefined();
  });
});
