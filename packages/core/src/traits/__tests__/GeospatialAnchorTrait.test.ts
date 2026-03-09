import { describe, it, expect, beforeEach } from 'vitest';
import { geospatialAnchorHandler } from '../GeospatialAnchorTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

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
    ctx = createMockContext();
    attachTrait(geospatialAnchorHandler, node, cfg, ctx);
  });

  it('auto_resolve emits request on attach', () => {
    expect(getEventCount(ctx, 'geospatial_anchor_request')).toBe(1);
    expect((node as any).__geospatialAnchorState.state).toBe('resolving');
  });

  it('no auto_resolve stays unresolved', () => {
    const n = createMockNode('geo2');
    const c = createMockContext();
    attachTrait(geospatialAnchorHandler, n, { ...cfg, auto_resolve: false }, c);
    expect(getEventCount(c, 'geospatial_anchor_request')).toBe(0);
    expect((n as any).__geospatialAnchorState.state).toBe('unresolved');
  });

  it('resolved sets position and accuracy', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_anchor_resolved',
      handle: 'anch-1',
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 10,
      accuracy: 5,
    });
    const s = (node as any).__geospatialAnchorState;
    expect(s.state).toBe('resolved');
    expect(s.accuracy).toBe(5);
    expect(getEventCount(ctx, 'on_geospatial_anchor_resolved')).toBe(1);
  });

  it('pose update tracking vs limited based on accuracy', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_pose_update',
      localPosition: { x: 1, y: 2, z: 3 },
      accuracy: 5,
      headingAccuracy: 2,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('tracking');

    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_pose_update',
      localPosition: { x: 1, y: 2, z: 3 },
      accuracy: 15,
      headingAccuracy: 5,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('limited');
  });

  it('tracking_lost retries when enabled', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, { type: 'geospatial_tracking_lost' });
    expect((node as any).__geospatialAnchorState.state).toBe('resolving');
    expect((node as any).__geospatialAnchorState.retryCount).toBe(1);
    expect(getEventCount(ctx, 'geospatial_anchor_request')).toBe(2);
  });

  it('max retries exhausted emits lost', () => {
    for (let i = 0; i < 4; i++) {
      sendEvent(geospatialAnchorHandler, node, cfg, ctx, { type: 'geospatial_tracking_lost' });
    }
    expect(getEventCount(ctx, 'on_geospatial_anchor_lost')).toBe(1);
  });

  it('manual resolve resets retry count', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, { type: 'geospatial_anchor_resolve' });
    expect((node as any).__geospatialAnchorState.retryCount).toBe(0);
  });

  it('distance query uses haversine', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_anchor_resolved',
      handle: 'a',
      latitude: 37.7749,
      longitude: -122.4194,
      altitude: 10,
      accuracy: 1,
    });
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_query_distance',
      latitude: 37.775,
      longitude: -122.4194,
      queryId: 'q1',
    });
    expect(getEventCount(ctx, 'geospatial_distance_result')).toBe(1);
  });

  it('detach releases handle', () => {
    sendEvent(geospatialAnchorHandler, node, cfg, ctx, {
      type: 'geospatial_anchor_resolved',
      handle: 'h1',
      latitude: 0,
      longitude: 0,
      altitude: 0,
      accuracy: 1,
    });
    geospatialAnchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'geospatial_anchor_release')).toBe(1);
    expect((node as any).__geospatialAnchorState).toBeUndefined();
  });
});
