import { describe, it, expect, beforeEach } from 'vitest';
import { geospatialAnchorHandler } from '../GeospatialAnchorTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, updateTrait, getEventCount, getLastEvent } from './traitTestHelpers';

describe('GeospatialAnchorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 10,
    altitude_type: 'terrain' as const,
    heading: 0,
    accuracy_threshold: 10,
    visual_indicator: false,
    auto_resolve: true,
    retry_on_lost: true,
    max_retries: 3,
  };

  beforeEach(() => {
    node = createMockNode('geo');
    (node as any).position = { x: 0, y: 0, z: 0 };
    ctx = createMockContext();
    attachTrait(geospatialAnchorHandler, node, cfg, ctx);
  });

  it('initializes in resolving state', () => {
    expect((node as any).__geospatialAnchorState.state).toBe('resolving');
    expect(getEventCount(ctx, 'geospatial_anchor_request')).toBe(1);
  });

  it('resolved sets position and emits', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_anchor_resolved',
      handle: 'h1',
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 10,
      accuracy: 5,
    });
    const s = (node as any).__geospatialAnchorState;
    expect(s.state).toBe('resolved');
    expect(s.resolvedPosition.lat).toBe(37.7749);
    expect(getEventCount(ctx, 'on_geospatial_anchor_resolved')).toBe(1);
  });

  it('pose_update transitions to tracking when accurate', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_pose_update',
      localPosition: { x: 1, y: 2, z: 3 },
      accuracy: 5,
      headingAccuracy: 2,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('tracking');
  });

  it('pose_update transitions to limited when inaccurate', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_pose_update',
      localPosition: { x: 1, y: 2, z: 3 },
      accuracy: 50,
      headingAccuracy: 10,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('limited');
  });

  it('tracking_lost retries', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, { type: 'geospatial_tracking_lost' });
    const s = (node as any).__geospatialAnchorState;
    expect(s.state).toBe('resolving');
    expect(s.retryCount).toBe(1);
  });

  it('tracking_lost stops after max retries', () => {
    for (let i = 0; i < 4; i++) {
      sendEvent(geospatialAnchorHandler, node, cfg, ctx, { type: 'geospatial_tracking_lost' });
    }
    expect(getEventCount(ctx, 'on_geospatial_anchor_lost')).toBe(1);
  });

  it('distance query uses haversine', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_anchor_resolved',
      handle: 'h1',
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 10,
      accuracy: 5,
    });
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_query_distance',
      latitude: 37.7849,
      longitude: -122.4094,
      queryId: 'q1',
    });
    const r = getLastEvent(ctx, 'geospatial_distance_result') as any;
    expect(r.distance).toBeGreaterThan(0);
    expect(r.distance).toBeLessThan(5000); // ~1.4km
  });

  it('cleans up on detach', () => {
    (node as any).__geospatialAnchorState.anchorHandle = 'h1';
    geospatialAnchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__geospatialAnchorState).toBeUndefined();
    expect(getEventCount(ctx, 'geospatial_anchor_release')).toBe(1);
  });
});
