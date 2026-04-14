/**
 * GeospatialAnchorTrait — Production Test Suite
 *
 * geospatialAnchorHandler stores state on node.__geospatialAnchorState.
 * haversineDistance is an internal helper tested indirectly via geospatial_query_distance.
 *
 * Key behaviours:
 * 1. defaultConfig — all 10 fields
 * 2. onAttach — state init (state='unresolved', accuracy=Infinity, retryCount=0, etc.);
 *              auto_resolve=true → state='resolving', emits geospatial_anchor_request;
 *              auto_resolve=false → remains 'unresolved';
 *              visual_indicator=true → emits geospatial_indicator_show
 * 3. onDetach — emits geospatial_anchor_release when anchorHandle set;
 *              emits geospatial_indicator_hide when visual_indicator=true;
 *              removes state
 * 4. onUpdate — accumulates lastUpdateTime by delta;
 *              emits geospatial_indicator_update when visual_indicator=true;
 *              applies localPosition to node.position when tracking/resolved
 * 5. onEvent — geospatial_anchor_resolved: state='resolved', sets resolvedPosition+accuracy;
 *              geospatial_pose_update: state=tracking/limited based on accuracy_threshold;
 *              geospatial_tracking_lost: retries (retryCount++, state='resolving') or loses;
 *              geospatial_anchor_resolve: manual re-trigger resets retryCount;
 *              geospatial_query_distance: computes haversine and emits result
 */
import { describe, it, expect, vi } from 'vitest';
import { geospatialAnchorHandler } from '../GeospatialAnchorTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'geo_node', properties: {}, position: [0, 0, 0] };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof geospatialAnchorHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...geospatialAnchorHandler.defaultConfig!, ...cfg };
  geospatialAnchorHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('geospatialAnchorHandler.defaultConfig', () => {
  const d = geospatialAnchorHandler.defaultConfig!;
  it('latitude=0', () => expect(d.latitude).toBe(0));
  it('longitude=0', () => expect(d.longitude).toBe(0));
  it('altitude=0', () => expect(d.altitude).toBe(0));
  it('altitude_type=terrain', () => expect(d.altitude_type).toBe('terrain'));
  it('heading=0', () => expect(d.heading).toBe(0));
  it('accuracy_threshold=10', () => expect(d.accuracy_threshold).toBe(10));
  it('visual_indicator=false', () => expect(d.visual_indicator).toBe(false));
  it('auto_resolve=true', () => expect(d.auto_resolve).toBe(true));
  it('retry_on_lost=true', () => expect(d.retry_on_lost).toBe(true));
  it('max_retries=3', () => expect(d.max_retries).toBe(3));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('geospatialAnchorHandler.onAttach', () => {
  it('initialises __geospatialAnchorState', () => {
    const { node } = attach({ auto_resolve: false });
    expect((node as any).__geospatialAnchorState).toBeDefined();
  });

  it('state starts as unresolved when auto_resolve=false', () => {
    const { node } = attach({ auto_resolve: false });
    expect((node as any).__geospatialAnchorState.state).toBe('unresolved');
  });

  it('accuracy=Infinity initially', () => {
    const { node } = attach({ auto_resolve: false });
    expect((node as any).__geospatialAnchorState.accuracy).toBe(Infinity);
  });

  it('retryCount=0 initially', () => {
    const { node } = attach({ auto_resolve: false });
    expect((node as any).__geospatialAnchorState.retryCount).toBe(0);
  });

  it('resolvedPosition=null initially', () => {
    const { node } = attach({ auto_resolve: false });
    expect((node as any).__geospatialAnchorState.resolvedPosition).toBeNull();
  });

  it('auto_resolve=true → state=resolving and emits geospatial_anchor_request', () => {
    const { node, ctx } = attach({ auto_resolve: true, latitude: 37.7, longitude: -122.4 });
    expect((node as any).__geospatialAnchorState.state).toBe('resolving');
    expect(ctx.emit).toHaveBeenCalledWith(
      'geospatial_anchor_request',
      expect.objectContaining({ latitude: 37.7, longitude: -122.4 })
    );
  });

  it('auto_resolve=false → does NOT emit geospatial_anchor_request', () => {
    const { ctx } = attach({ auto_resolve: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('geospatial_anchor_request', expect.anything());
  });

  it('visual_indicator=true → emits geospatial_indicator_show', () => {
    const { ctx } = attach({ visual_indicator: true, auto_resolve: false });
    expect(ctx.emit).toHaveBeenCalledWith('geospatial_indicator_show', expect.any(Object));
  });

  it('visual_indicator=false → does NOT emit geospatial_indicator_show', () => {
    const { ctx } = attach({ visual_indicator: false, auto_resolve: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('geospatial_indicator_show', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('geospatialAnchorHandler.onDetach', () => {
  it('emits geospatial_anchor_release when anchorHandle is set', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    (node as any).__geospatialAnchorState.anchorHandle = { handle: 42 };
    ctx.emit.mockClear();
    geospatialAnchorHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'geospatial_anchor_release',
      expect.objectContaining({ handle: { handle: 42 } })
    );
  });

  it('does NOT emit geospatial_anchor_release when anchorHandle is null', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('geospatial_anchor_release', expect.anything());
  });

  it('emits geospatial_indicator_hide when visual_indicator=true', () => {
    const { node, ctx, config } = attach({ auto_resolve: false, visual_indicator: true });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('geospatial_indicator_hide', expect.any(Object));
  });

  it('removes __geospatialAnchorState', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    geospatialAnchorHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__geospatialAnchorState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('geospatialAnchorHandler.onUpdate', () => {
  it('accumulates lastUpdateTime by delta', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.5);
    expect((node as any).__geospatialAnchorState.lastUpdateTime).toBeCloseTo(0.5, 5);
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.5);
    expect((node as any).__geospatialAnchorState.lastUpdateTime).toBeCloseTo(1.0, 5);
  });

  it('emits geospatial_indicator_update when visual_indicator=true', () => {
    const { node, ctx, config } = attach({ auto_resolve: false, visual_indicator: true });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('geospatial_indicator_update', expect.any(Object));
  });

  it('does NOT emit geospatial_indicator_update when visual_indicator=false', () => {
    const { node, ctx, config } = attach({ auto_resolve: false, visual_indicator: false });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('geospatial_indicator_update', expect.anything());
  });

  it('applies localPosition to node.position when state=tracking', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    const state = (node as any).__geospatialAnchorState;
    state.state = 'tracking';
    state.localPosition = [1, 2, 3 ];
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(node.position).toEqual([1, 2, 3 ]);
  });

  it('applies localPosition to node.position when state=resolved', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    const state = (node as any).__geospatialAnchorState;
    state.state = 'resolved';
    state.localPosition = [5, 6, 7 ];
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(node.position).toEqual([5, 6, 7 ]);
  });

  it('does NOT apply localPosition when state=unresolved', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    const state = (node as any).__geospatialAnchorState;
    state.state = 'unresolved';
    state.localPosition = [9, 9, 9 ];
    node.position = [0, 0, 0 ];
    geospatialAnchorHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(node.position).toEqual([0, 0, 0 ]);
  });
});

// ─── onEvent — geospatial_anchor_resolved ────────────────────────────────────

describe('geospatialAnchorHandler.onEvent — geospatial_anchor_resolved', () => {
  it('sets state=resolved', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_anchor_resolved',
      handle: 'h1',
      latitude: 37.7,
      longitude: -122.4,
      altitude: 10,
      accuracy: 3,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('resolved');
  });

  it('populates resolvedPosition', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_anchor_resolved',
      handle: 'h1',
      latitude: 37.7,
      longitude: -122.4,
      altitude: 10,
      accuracy: 5,
    });
    expect((node as any).__geospatialAnchorState.resolvedPosition).toEqual({
      lat: 37.7,
      lon: -122.4,
      alt: 10,
    });
  });

  it('emits on_geospatial_anchor_resolved', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_anchor_resolved',
      handle: 'h1',
      latitude: 1,
      longitude: 2,
      altitude: 0,
      accuracy: 2,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_geospatial_anchor_resolved',
      expect.objectContaining({ accuracy: 2 })
    );
  });
});

// ─── onEvent — geospatial_pose_update ────────────────────────────────────────

describe('geospatialAnchorHandler.onEvent — geospatial_pose_update', () => {
  it('state=tracking when accuracy <= accuracy_threshold', () => {
    const { node, ctx, config } = attach({ auto_resolve: false, accuracy_threshold: 10 });
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_pose_update',
      localPosition: [0, 0, 0 ],
      accuracy: 5,
      headingAccuracy: 1,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('tracking');
  });

  it('state=limited when accuracy > accuracy_threshold', () => {
    const { node, ctx, config } = attach({ auto_resolve: false, accuracy_threshold: 10 });
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_pose_update',
      localPosition: [0, 0, 0 ],
      accuracy: 15,
      headingAccuracy: 3,
    });
    expect((node as any).__geospatialAnchorState.state).toBe('limited');
  });

  it('updates localPosition', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_pose_update',
      localPosition: [10, 2, -5 ],
      accuracy: 3,
      headingAccuracy: 0.5,
    });
    expect((node as any).__geospatialAnchorState.localPosition).toEqual([10, 2, -5 ]);
  });
});

// ─── onEvent — geospatial_tracking_lost ──────────────────────────────────────

describe('geospatialAnchorHandler.onEvent — geospatial_tracking_lost', () => {
  it('increments retryCount and re-emits geospatial_anchor_request when retries remain', () => {
    const { node, ctx, config } = attach({
      auto_resolve: false,
      retry_on_lost: true,
      max_retries: 3,
    });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_tracking_lost',
    });
    expect((node as any).__geospatialAnchorState.retryCount).toBe(1);
    expect((node as any).__geospatialAnchorState.state).toBe('resolving');
    expect(ctx.emit).toHaveBeenCalledWith('geospatial_anchor_request', expect.any(Object));
  });

  it('emits on_geospatial_anchor_lost when retryCount >= max_retries', () => {
    const { node, ctx, config } = attach({
      auto_resolve: false,
      retry_on_lost: true,
      max_retries: 2,
    });
    (node as any).__geospatialAnchorState.retryCount = 2;
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_tracking_lost',
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_geospatial_anchor_lost', expect.any(Object));
  });

  it('emits on_geospatial_anchor_lost immediately when retry_on_lost=false', () => {
    const { node, ctx, config } = attach({ auto_resolve: false, retry_on_lost: false });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_tracking_lost',
    });
    expect(ctx.emit).toHaveBeenCalledWith('on_geospatial_anchor_lost', expect.any(Object));
  });
});

// ─── onEvent — geospatial_anchor_resolve (manual) ────────────────────────────

describe('geospatialAnchorHandler.onEvent — geospatial_anchor_resolve (manual)', () => {
  it('resets retryCount=0 and emits geospatial_anchor_request', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    (node as any).__geospatialAnchorState.retryCount = 2;
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_anchor_resolve',
    });
    expect((node as any).__geospatialAnchorState.retryCount).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('geospatial_anchor_request', expect.any(Object));
  });

  it('sets state=resolving', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_anchor_resolve',
    });
    expect((node as any).__geospatialAnchorState.state).toBe('resolving');
  });
});

// ─── onEvent — geospatial_query_distance ─────────────────────────────────────

describe('geospatialAnchorHandler.onEvent — geospatial_query_distance', () => {
  it('emits geospatial_distance_result with haversine distance when resolved', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    (node as any).__geospatialAnchorState.resolvedPosition = { lat: 0, lon: 0, alt: 0 };
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_query_distance',
      queryId: 'q1',
      latitude: 0,
      longitude: 1,
    });
    const call = ctx.emit.mock.calls.find(([ev]: string[]) => ev === 'geospatial_distance_result');
    expect(call).toBeDefined();
    expect(call![1].queryId).toBe('q1');
    // 1° of longitude at equator ≈ 111,195m
    expect(call![1].distance).toBeGreaterThan(110000);
    expect(call![1].distance).toBeLessThan(113000);
  });

  it('does NOT emit geospatial_distance_result when resolvedPosition is null', () => {
    const { node, ctx, config } = attach({ auto_resolve: false });
    ctx.emit.mockClear();
    geospatialAnchorHandler.onEvent!(node as any, config, ctx as any, {
      type: 'geospatial_query_distance',
      queryId: 'q2',
      latitude: 0,
      longitude: 1,
    });
    expect(ctx.emit).not.toHaveBeenCalledWith('geospatial_distance_result', expect.anything());
  });
});
