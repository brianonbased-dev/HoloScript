/**
 * GeospatialEnvTrait Production Tests
 *
 * GPS/lat-lon world-scale environment for outdoor AR.
 * Covers: defaultConfig, onAttach (auto_initialize on/off), onDetach,
 * onUpdate (state transitions: localizing→tracking, localizing→limited),
 * and all onEvent types: geospatial_initialized, pose_update (compass smoothing,
 * localized transition), vps_result, set_origin, query_state, unavailable.
 */

import { describe, it, expect, vi } from 'vitest';
import { geospatialEnvHandler } from '../GeospatialEnvTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'geo_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...geospatialEnvHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  geospatialEnvHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__geospatialEnvState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  geospatialEnvHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('GeospatialEnvTrait — defaultConfig', () => {
  it('has 10 fields with correct defaults', () => {
    const d = geospatialEnvHandler.defaultConfig!;
    expect(d.latitude).toBe(0);
    expect(d.longitude).toBe(0);
    expect(d.altitude).toBe(0);
    expect(d.altitude_type).toBe('terrain');
    expect(d.heading).toBe(0);
    expect(d.heading_alignment).toBe(true);
    expect(d.accuracy_threshold).toBe(5);
    expect(d.auto_initialize).toBe(true);
    expect(d.use_vps).toBe(true);
    expect(d.compass_smoothing).toBe(0.8);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('GeospatialEnvTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node, { latitude: 37.7749, longitude: -122.4194, heading: 45 });
    const s = st(node);
    expect(s.state).toBe('initializing'); // auto_initialize=true
    expect(s.accuracy).toBe(Infinity);
    expect(s.verticalAccuracy).toBe(Infinity);
    expect(s.heading).toBe(45);
    expect(s.headingAccuracy).toBe(Infinity);
    expect(s.originLat).toBeCloseTo(37.7749);
    expect(s.originLon).toBeCloseTo(-122.4194);
    expect(s.originAlt).toBe(0);
    expect(s.lastUpdateTime).toBe(0);
    expect(s.vpsAvailable).toBe(false);
  });

  it('auto_initialize=true: emits geospatial_env_initialize with origin + useVPS', () => {
    const node = makeNode();
    const { ctx, cfg } = attach(node, { latitude: 48.8566, longitude: 2.3522, use_vps: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'geospatial_env_initialize',
      expect.objectContaining({
        origin: expect.objectContaining({ latitude: 48.8566, longitude: 2.3522 }),
        useVPS: true,
      })
    );
  });

  it('auto_initialize=false: state stays idle, no emit', () => {
    const node = makeNode();
    const { ctx } = attach(node, { auto_initialize: false });
    expect(st(node).state).toBe('idle');
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('GeospatialEnvTrait — onDetach', () => {
  it('always emits geospatial_env_shutdown', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    geospatialEnvHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('geospatial_env_shutdown', expect.any(Object));
  });

  it('removes __geospatialEnvState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    geospatialEnvHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__geospatialEnvState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('GeospatialEnvTrait — onUpdate', () => {
  it('increments lastUpdateTime by delta', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.5);
    expect(st(node).lastUpdateTime).toBeCloseTo(0.5);
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.25);
    expect(st(node).lastUpdateTime).toBeCloseTo(0.75);
  });

  it('transitions localizing→tracking when accuracy <= threshold', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { accuracy_threshold: 5 });
    st(node).state = 'localizing';
    st(node).accuracy = 3; // <= 5
    ctx.emit.mockClear();
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(st(node).state).toBe('tracking');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_geospatial_tracking',
      expect.objectContaining({ accuracy: 3 })
    );
  });

  it('transitions localized→tracking when accuracy <= threshold', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { accuracy_threshold: 5 });
    st(node).state = 'localized';
    st(node).accuracy = 4;
    ctx.emit.mockClear();
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(st(node).state).toBe('tracking');
  });

  it('transitions to limited when accuracy > threshold * 3', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { accuracy_threshold: 5 });
    st(node).state = 'localizing';
    st(node).accuracy = 20; // > 15
    ctx.emit.mockClear();
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(st(node).state).toBe('limited');
    expect(ctx.emit).not.toHaveBeenCalledWith('on_geospatial_tracking', expect.any(Object));
  });

  it('no state change when accuracy is between threshold and threshold*3', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { accuracy_threshold: 5 });
    st(node).state = 'localizing';
    st(node).accuracy = 10; // between 5 and 15
    ctx.emit.mockClear();
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(st(node).state).toBe('localizing'); // unchanged
  });

  it('no transition when state is not localizing/localized', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { accuracy_threshold: 5 });
    st(node).state = 'tracking';
    st(node).accuracy = 2;
    ctx.emit.mockClear();
    geospatialEnvHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(st(node).state).toBe('tracking'); // stays tracking
    expect(ctx.emit).not.toHaveBeenCalledWith('on_geospatial_tracking', expect.any(Object));
  });
});

// ─── onEvent — geospatial_initialized ────────────────────────────────────────

describe('GeospatialEnvTrait — onEvent: geospatial_initialized', () => {
  it('sets state=localizing, vpsAvailable + emits on_geospatial_initialized', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'geospatial_initialized', vpsAvailable: true });
    expect(st(node).state).toBe('localizing');
    expect(st(node).vpsAvailable).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_geospatial_initialized',
      expect.objectContaining({ vpsAvailable: true })
    );
  });

  it('vpsAvailable=false stored correctly', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'geospatial_initialized', vpsAvailable: false });
    expect(st(node).vpsAvailable).toBe(false);
  });
});

// ─── onEvent — geospatial_pose_update ────────────────────────────────────────

describe('GeospatialEnvTrait — onEvent: geospatial_pose_update', () => {
  it('stores accuracy fields', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 3.5,
      verticalAccuracy: 2.1,
      headingAccuracy: 5.0,
      heading: 90,
    });
    expect(st(node).accuracy).toBeCloseTo(3.5);
    expect(st(node).verticalAccuracy).toBeCloseTo(2.1);
    expect(st(node).headingAccuracy).toBeCloseTo(5.0);
  });

  it('compass smoothing: heading = old*0.8 + new*0.2 when heading_alignment=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      heading: 0,
      heading_alignment: true,
      compass_smoothing: 0.8,
    });
    fire(node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 5,
      verticalAccuracy: 1,
      headingAccuracy: 1,
      heading: 100,
    });
    // 0 * 0.8 + 100 * 0.2 = 20
    expect(st(node).heading).toBeCloseTo(20);
  });

  it('no compass smoothing when heading_alignment=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { heading: 0, heading_alignment: false });
    fire(node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 3,
      verticalAccuracy: 1,
      headingAccuracy: 1,
      heading: 180,
    });
    expect(st(node).heading).toBe(0); // unchanged
  });

  it('transitions localizing→localized on first pose_update and emits on_geospatial_localized', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { auto_initialize: false });
    st(node).state = 'localizing';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 4,
      verticalAccuracy: 2,
      headingAccuracy: 1,
      heading: 0,
    });
    expect(st(node).state).toBe('localized');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_geospatial_localized',
      expect.objectContaining({ accuracy: 4 })
    );
  });

  it('does NOT re-emit localized when state is already localized', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { auto_initialize: false });
    st(node).state = 'localized'; // already
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'geospatial_pose_update',
      accuracy: 3,
      verticalAccuracy: 1,
      headingAccuracy: 1,
      heading: 0,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('on_geospatial_localized', expect.any(Object));
  });
});

// ─── onEvent — geospatial_vps_result ─────────────────────────────────────────

describe('GeospatialEnvTrait — onEvent: geospatial_vps_result', () => {
  it('sets vpsAvailable=true and improves accuracy if vps more accurate', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).accuracy = 10;
    fire(node, cfg, ctx, { type: 'geospatial_vps_result', available: true, accuracy: 2 });
    expect(st(node).vpsAvailable).toBe(true);
    expect(st(node).accuracy).toBeCloseTo(2); // min(10, 2) = 2
  });

  it('does NOT improve accuracy when vps is worse', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).accuracy = 3;
    fire(node, cfg, ctx, { type: 'geospatial_vps_result', available: true, accuracy: 10 });
    expect(st(node).accuracy).toBeCloseTo(3); // min(3, 10) = 3
  });

  it('vpsAvailable=false does not change accuracy', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).accuracy = 5;
    fire(node, cfg, ctx, { type: 'geospatial_vps_result', available: false, accuracy: 0.1 });
    expect(st(node).accuracy).toBe(5); // unchanged
    expect(st(node).vpsAvailable).toBe(false);
  });
});

// ─── onEvent — geospatial_set_origin ─────────────────────────────────────────

describe('GeospatialEnvTrait — onEvent: geospatial_set_origin', () => {
  it('updates origin fields and emits geospatial_origin_update', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'geospatial_set_origin',
      latitude: 51.5074,
      longitude: -0.1278,
      altitude: 12,
    });
    const s = st(node);
    expect(s.originLat).toBeCloseTo(51.5074);
    expect(s.originLon).toBeCloseTo(-0.1278);
    expect(s.originAlt).toBe(12);
    expect(ctx.emit).toHaveBeenCalledWith(
      'geospatial_origin_update',
      expect.objectContaining({
        latitude: 51.5074,
        longitude: -0.1278,
        altitude: 12,
      })
    );
  });
});

// ─── onEvent — geospatial_query_state ────────────────────────────────────────

describe('GeospatialEnvTrait — onEvent: geospatial_query_state', () => {
  it('emits geospatial_state_response with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { accuracy_threshold: 5 });
    st(node).accuracy = 2;
    st(node).heading = 180;
    st(node).vpsAvailable = true;

    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'geospatial_query_state', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'geospatial_state_response',
      expect.objectContaining({
        queryId: 'q1',
        state: 'initializing',
        accuracy: 2,
        heading: 180,
        vpsAvailable: true,
      })
    );
  });
});

// ─── onEvent — geospatial_unavailable ────────────────────────────────────────

describe('GeospatialEnvTrait — onEvent: geospatial_unavailable', () => {
  it('sets state=unavailable and emits on_geospatial_unavailable with reason', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'geospatial_unavailable', reason: 'gps_disabled' });
    expect(st(node).state).toBe('unavailable');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_geospatial_unavailable',
      expect.objectContaining({ reason: 'gps_disabled' })
    );
  });
});
