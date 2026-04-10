import { describe, it, expect, beforeEach } from 'vitest';
import { geospatialEnvHandler } from '../GeospatialEnvTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('GeospatialEnvTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    latitude: 40.7128,
    longitude: -74.006,
    altitude: 0,
    altitude_type: 'terrain' as const,
    heading: 0,
    heading_alignment: true,
    accuracy_threshold: 5,
    auto_initialize: true,
    use_vps: true,
    compass_smoothing: 0.8,
  };

  beforeEach(() => {
    node = createMockNode('geoenv');
    ctx = createMockContext();
    attachTrait(geospatialEnvHandler, node, cfg, ctx);
  });

  it('initializes and starts', () => {
    expect((node as any).__geospatialEnvState.state).toBe('initializing');
    expect(getEventCount(ctx, 'geospatial_env_initialize')).toBe(1);
  });

  it('initialized event shifts to localizing', () => {
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_initialized',
      vpsAvailable: true,
    });
    expect((node as any).__geospatialEnvState.state).toBe('localizing');
    expect((node as any).__geospatialEnvState.vpsAvailable).toBe(true);
  });

  it('pose_update localizes and then tracks', () => {
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_initialized',
      vpsAvailable: false,
    });
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 3,
      verticalAccuracy: 2,
      headingAccuracy: 5,
      heading: 90,
    });
    expect((node as any).__geospatialEnvState.state).toBe('localized');
    expect(getEventCount(ctx, 'on_geospatial_localized')).toBe(1);
    // Update promotes to tracking since accuracy < threshold
    updateTrait(geospatialEnvHandler, node, cfg, ctx, 0.016);
    expect((node as any).__geospatialEnvState.state).toBe('tracking');
  });

  it('applies compass smoothing', () => {
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_initialized',
      vpsAvailable: false,
    });
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 3,
      verticalAccuracy: 2,
      headingAccuracy: 5,
      heading: 100,
    });
    // heading = 0 * 0.8 + 100 * 0.2 = 20
    expect((node as any).__geospatialEnvState.heading).toBeCloseTo(20, 1);
  });

  it('set_origin updates origin', () => {
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_set_origin',
      latitude: 51.5,
      longitude: -0.12,
      altitude: 100,
    });
    const s = (node as any).__geospatialEnvState;
    expect(s.originLat).toBe(51.5);
    expect(getEventCount(ctx, 'geospatial_origin_update')).toBe(1);
  });

  it('unavailable event sets state', () => {
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_unavailable',
      reason: 'no GPS',
    });
    expect((node as any).__geospatialEnvState.state).toBe('unavailable');
  });

  it('query returns state info', () => {
    sendEvent(geospatialEnvHandler, node, cfg, ctx, {
      type: 'geospatial_query_state',
      queryId: 'q1',
    });
    const r = getLastEvent(ctx, 'geospatial_state_response') as any;
    expect(r.state).toBe('initializing');
    expect(r.queryId).toBe('q1');
  });

  it('cleans up on detach', () => {
    geospatialEnvHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__geospatialEnvState).toBeUndefined();
    expect(getEventCount(ctx, 'geospatial_env_shutdown')).toBe(1);
  });
});
