import { describe, it, expect, beforeEach } from 'vitest';
import { planeDetectionHandler } from '../PlaneDetectionTrait';
import { createMockContext, createMockNode, attachTrait, sendEvent, getEventCount, getLastEvent } from './traitTestHelpers';

describe('PlaneDetectionTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'all' as const,
    min_area: 0.25,
    max_planes: 10,
    update_interval: 100,
    visual_mesh: false,
    classification: true,
    semantic_labels: false,
    merge_coplanar: true,
    plane_timeout: 2000,
  };

  const makePlane = (id: string, area = 1, normalY = 1) => ({
    id,
    classification: 'floor' as const,
    center: { x: 0, y: 0, z: 0 },
    extent: { width: 1, height: 1 },
    normal: { x: 0, y: normalY, z: 0 },
    vertices: [{ x: 0, y: 0, z: 0 }],
    area,
    lastUpdated: Date.now(),
    confidence: 0.9,
  });

  beforeEach(() => {
    node = createMockNode('plane');
    ctx = createMockContext();
    attachTrait(planeDetectionHandler, node, cfg, ctx);
  });

  it('starts detection on attach', () => {
    expect((node as any).__planeDetectionState.isDetecting).toBe(true);
    expect(getEventCount(ctx, 'plane_detection_start')).toBe(1);
  });

  it('plane_detected adds plane and emits found', () => {
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detected', plane: makePlane('p1') });
    expect((node as any).__planeDetectionState.planes.size).toBe(1);
    expect(getEventCount(ctx, 'plane_found')).toBe(1);
  });

  it('updating existing plane emits updated not found', () => {
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detected', plane: makePlane('p1') });
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detected', plane: makePlane('p1', 2) });
    expect(getEventCount(ctx, 'plane_found')).toBe(1);
    expect(getEventCount(ctx, 'plane_updated')).toBe(1);
  });

  it('filters by min_area', () => {
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detected', plane: makePlane('small', 0.1) });
    expect((node as any).__planeDetectionState.planes.size).toBe(0);
  });

  it('horizontal mode filters non-horizontal', () => {
    const hCfg = { ...cfg, mode: 'horizontal' as const };
    const n2 = createMockNode('hp');
    const c2 = createMockContext();
    attachTrait(planeDetectionHandler, n2, hCfg, c2);
    sendEvent(planeDetectionHandler, n2, hCfg, c2, { type: 'plane_detected', plane: makePlane('wall', 1, 0) });
    expect((n2 as any).__planeDetectionState.planes.size).toBe(0);
  });

  it('hit_test returns ray intersection results', () => {
    const p = makePlane('floor');
    p.center = { x: 0, y: 0, z: 0 };
    p.normal = { x: 0, y: 1, z: 0 };
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detected', plane: p });
    sendEvent(planeDetectionHandler, node, cfg, ctx, {
      type: 'plane_hit_test',
      ray: { origin: { x: 0, y: 5, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
      queryId: 'ht1',
    });
    const r = getLastEvent(ctx, 'plane_hit_test_result') as any;
    expect(r.results.length).toBe(1);
    expect(r.results[0].point.y).toBeCloseTo(0, 0);
  });

  it('plane_select sets selected plane', () => {
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_select', planeId: 'p1' });
    expect((node as any).__planeDetectionState.selectedPlane).toBe('p1');
  });

  it('pause/resume scanning', () => {
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detection_pause' });
    expect((node as any).__planeDetectionState.isDetecting).toBe(false);
    sendEvent(planeDetectionHandler, node, cfg, ctx, { type: 'plane_detection_resume' });
    expect((node as any).__planeDetectionState.isDetecting).toBe(true);
  });

  it('cleans up on detach', () => {
    planeDetectionHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__planeDetectionState).toBeUndefined();
    expect(getEventCount(ctx, 'plane_detection_stop')).toBe(1);
  });
});
