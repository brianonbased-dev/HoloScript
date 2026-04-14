/**
 * PlaneDetectionTrait Production Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { planeDetectionHandler } from '../PlaneDetectionTrait';

function makeNode() {
  return { id: 'pd_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...planeDetectionHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  planeDetectionHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__planeDetectionState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  planeDetectionHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

function makePlane(
  id: string,
  opts: {
    area?: number;
    normalX?: number;
    normalY?: number;
    normalZ?: number;
    centerY?: number;
  } = {}
) {
  return {
    id,
    classification: 'floor',
    center: [0, opts.centerY ?? 0, 0 ],
    extent: { width: 1, height: 1 },
    normal: [opts.normalX ?? 0, opts.normalY ?? 1, opts.normalZ ?? 0 ],
    vertices: [],
    area: opts.area ?? 1.0,
    lastUpdated: Date.now(),
    confidence: 0.9,
  };
}

describe('PlaneDetectionTrait — defaultConfig', () => {
  it('has correct 9 defaults', () => {
    const d = planeDetectionHandler.defaultConfig!;
    expect(d.mode).toBe('all');
    expect(d.min_area).toBe(0.25);
    expect(d.max_planes).toBe(10);
    expect(d.update_interval).toBe(100);
    expect(d.visual_mesh).toBe(false);
    expect(d.classification).toBe(true);
    expect(d.semantic_labels).toBe(false);
    expect(d.merge_coplanar).toBe(true);
    expect(d.plane_timeout).toBe(2000);
  });
});

describe('PlaneDetectionTrait — onAttach', () => {
  it('initialises state: empty planes, isDetecting=true', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.planes.size).toBe(0);
    expect(s.isDetecting).toBe(true);
    expect(s.selectedPlane).toBeNull();
    expect(s.hitTestResults).toHaveLength(0);
  });

  it('emits plane_detection_start with mode+classification', () => {
    const node = makeNode();
    const { ctx, cfg } = attach(node, { mode: 'horizontal', classification: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_detection_start',
      expect.objectContaining({
        mode: 'horizontal',
        classification: true,
      })
    );
  });
});

describe('PlaneDetectionTrait — onDetach', () => {
  it('emits stop when isDetecting=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    planeDetectionHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('plane_detection_stop', expect.any(Object));
  });

  it('does NOT emit stop when paused', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isDetecting = false;
    ctx.emit.mockClear();
    planeDetectionHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('removes state', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    planeDetectionHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__planeDetectionState).toBeUndefined();
  });
});

describe('PlaneDetectionTrait — onUpdate', () => {
  it('no-op when paused', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isDetecting = false;
    ctx.emit.mockClear();
    planeDetectionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('rate-limited: no emit when called too soon', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { update_interval: 1000 });
    st(node).lastUpdateTime = Date.now() - 50;
    ctx.emit.mockClear();
    planeDetectionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('removes stale planes + emits plane_lost', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { update_interval: 0, plane_timeout: 1000 });
    st(node).planes.set('old', { ...makePlane('old'), lastUpdated: Date.now() - 2000 });
    st(node).lastUpdateTime = 0;
    ctx.emit.mockClear();
    planeDetectionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(st(node).planes.has('old')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_lost',
      expect.objectContaining({ planeId: 'old' })
    );
  });

  it('emits plane_mesh_remove for stale + plane_mesh_update for fresh when visual_mesh=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      update_interval: 0,
      plane_timeout: 1000,
      visual_mesh: true,
    });
    st(node).planes.set('stale', { ...makePlane('stale'), lastUpdated: Date.now() - 2000 });
    st(node).planes.set('fresh', { ...makePlane('fresh'), lastUpdated: Date.now() });
    st(node).lastUpdateTime = 0;
    ctx.emit.mockClear();
    planeDetectionHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_mesh_remove',
      expect.objectContaining({ planeId: 'stale' })
    );
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_mesh_update',
      expect.objectContaining({ planeId: 'fresh' })
    );
  });
});

describe('PlaneDetectionTrait — onEvent: plane_detected', () => {
  it('adds new plane and emits plane_found', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { mode: 'all', min_area: 0.1 });
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('f1', { area: 2.0 }) });
    expect(st(node).planes.has('f1')).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_found',
      expect.objectContaining({ planeId: 'f1' })
    );
  });

  it('updates existing plane and emits plane_updated', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_area: 0.0 });
    st(node).planes.set('f1', makePlane('f1'));
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'plane_detected', plane: { ...makePlane('f1'), area: 3.0 } });
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_updated',
      expect.objectContaining({ planeId: 'f1' })
    );
    expect(ctx.emit).not.toHaveBeenCalledWith('plane_found', expect.any(Object));
  });

  it('filters non-horizontal in mode=horizontal (normalY < 0.8)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { mode: 'horizontal', min_area: 0.0 });
    fire(node, cfg, ctx, {
      type: 'plane_detected',
      plane: makePlane('wall', { normalX: 1, normalY: 0.1, normalZ: 0 }),
    });
    expect(st(node).planes.has('wall')).toBe(false);
  });

  it('passes horizontal planes in mode=horizontal (normalY >= 0.8)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { mode: 'horizontal', min_area: 0.0 });
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('floor', { normalY: 0.9 }) });
    expect(st(node).planes.has('floor')).toBe(true);
  });

  it('filters horizontal in mode=vertical (normalY > 0.2)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { mode: 'vertical', min_area: 0.0 });
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('floor', { normalY: 0.95 }) });
    expect(st(node).planes.has('floor')).toBe(false);
  });

  it('passes vertical planes in mode=vertical (normalY <= 0.2)', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { mode: 'vertical', min_area: 0.0 });
    fire(node, cfg, ctx, {
      type: 'plane_detected',
      plane: makePlane('wall', { normalX: 1, normalY: 0.1 }),
    });
    expect(st(node).planes.has('wall')).toBe(true);
  });

  it('filters plane below min_area', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_area: 1.0 });
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('tiny', { area: 0.1 }) });
    expect(st(node).planes.has('tiny')).toBe(false);
  });

  it('max_planes: evicts smallest plane when new plane is larger', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_planes: 2, min_area: 0.0 });
    st(node).planes.set('small', makePlane('small', { area: 0.5 }));
    st(node).planes.set('medium', makePlane('medium', { area: 1.0 }));
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('big', { area: 2.0 }) });
    expect(st(node).planes.has('big')).toBe(true);
    expect(st(node).planes.has('small')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_lost',
      expect.objectContaining({ planeId: 'small' })
    );
  });

  it('max_planes: does NOT add plane smaller than existing', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { max_planes: 1, min_area: 0.0 });
    st(node).planes.set('big', makePlane('big', { area: 5.0 }));
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('tiny', { area: 0.01 }) });
    expect(st(node).planes.has('tiny')).toBe(false);
    expect(st(node).planes.has('big')).toBe(true);
  });

  it('emits plane_mesh_create for new plane when visual_mesh=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { visual_mesh: true, min_area: 0.0 });
    fire(node, cfg, ctx, { type: 'plane_detected', plane: makePlane('vis1') });
    expect(ctx.emit).toHaveBeenCalledWith(
      'plane_mesh_create',
      expect.objectContaining({ planeId: 'vis1' })
    );
  });
});

describe('PlaneDetectionTrait — onEvent: plane_hit_test', () => {
  it('detects hit against y=0 floor, ray pointing down', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_area: 0.0 });
    st(node).planes.set('floor', { ...makePlane('floor'), center: [0, 0, 0 ] });
    fire(node, cfg, ctx, {
      type: 'plane_hit_test',
      queryId: 'ht1',
      ray: { origin: [0, 5, 0 ], direction: [0, -1, 0 ] },
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'plane_hit_test_result'
    )?.[1];
    expect(call).toBeDefined();
    expect(call.queryId).toBe('ht1');
    expect(call.results[0].planeId).toBe('floor');
    expect(call.results[0].point[1]).toBeCloseTo(0, 1);
  });

  it('parallel ray yields no hit', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_area: 0.0 });
    st(node).planes.set('floor', { ...makePlane('floor'), center: [0, 0, 0 ] });
    fire(node, cfg, ctx, {
      type: 'plane_hit_test',
      queryId: 'ht2',
      ray: { origin: [0, 1, 0 ], direction: [1, 0, 0 ] },
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'plane_hit_test_result'
    )?.[1];
    expect(call.results).toHaveLength(0);
  });

  it('results sorted by distance ascending', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { min_area: 0.0 });
    st(node).planes.set('near', { ...makePlane('near'), center: [0, 5, 0 ] });
    st(node).planes.set('far', { ...makePlane('far'), center: [0, 2, 0 ] });
    fire(node, cfg, ctx, {
      type: 'plane_hit_test',
      queryId: 'ht3',
      ray: { origin: [0, 10, 0 ], direction: [0, -1, 0 ] },
    });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'plane_hit_test_result'
    )?.[1];
    expect(call.results[0].planeId).toBe('near');
    expect(call.results[1].planeId).toBe('far');
  });
});

describe('PlaneDetectionTrait — onEvent: select / pause / resume', () => {
  it('plane_select sets selectedPlane', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'plane_select', planeId: 'floor42' });
    expect(st(node).selectedPlane).toBe('floor42');
  });

  it('plane_detection_pause stops detection', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'plane_detection_pause' });
    expect(st(node).isDetecting).toBe(false);
  });

  it('plane_detection_resume restores detection', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isDetecting = false;
    fire(node, cfg, ctx, { type: 'plane_detection_resume' });
    expect(st(node).isDetecting).toBe(true);
  });
});
