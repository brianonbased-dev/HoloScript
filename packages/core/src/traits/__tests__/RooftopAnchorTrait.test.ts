import { describe, it, expect, beforeEach } from 'vitest';
import { rooftopAnchorHandler } from '../RooftopAnchorTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('RooftopAnchorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    latitude: 40.7128,
    longitude: -74.006,
    elevation_offset: 2,
    building_id: '',
    auto_resolve: true,
    fallback_height: 10,
    align_to_edge: false,
  };

  beforeEach(() => {
    node = createMockNode('ra');
    ctx = createMockContext();
    attachTrait(rooftopAnchorHandler, node, cfg, ctx);
  });

  it('auto resolve emits request on attach', () => {
    expect(getEventCount(ctx, 'rooftop_anchor_request')).toBe(1);
    expect((node as any).__rooftopAnchorState.state).toBe('resolving');
  });

  it('no auto resolve stays unresolved', () => {
    const n = createMockNode('ra2');
    const c = createMockContext();
    attachTrait(rooftopAnchorHandler, n, { ...cfg, auto_resolve: false }, c);
    expect(getEventCount(c, 'rooftop_anchor_request')).toBe(0);
    expect((n as any).__rooftopAnchorState.state).toBe('unresolved');
  });

  it('resolved sets building info', () => {
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'anchor-1',
      buildingHeight: 50,
      floors: 15,
      confidence: 0.95,
      position: { x: 10, y: 50, z: 20 },
    });
    const s = (node as any).__rooftopAnchorState;
    expect(s.state).toBe('resolved');
    expect(s.buildingHeight).toBe(50);
    expect(s.estimatedFloors).toBe(15);
    expect(getEventCount(ctx, 'on_rooftop_resolved')).toBe(1);
  });

  it('not found uses fallback height', () => {
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, { type: 'rooftop_anchor_not_found' });
    const s = (node as any).__rooftopAnchorState;
    expect(s.buildingHeight).toBe(10);
    expect(s.confidence).toBe(0.5);
    expect(getEventCount(ctx, 'on_rooftop_fallback')).toBe(1);
  });

  it('pose update sets tracking state', () => {
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, {
      type: 'rooftop_pose_update',
      position: { x: 5, y: 30, z: 10 },
    });
    expect((node as any).__rooftopAnchorState.state).toBe('tracking');
  });

  it('unavailable sets state', () => {
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, {
      type: 'rooftop_anchor_unavailable',
      reason: 'no data',
    });
    expect((node as any).__rooftopAnchorState.state).toBe('unavailable');
    expect(getEventCount(ctx, 'on_rooftop_unavailable')).toBe(1);
  });

  it('update applies position when resolved', () => {
    node.position = { x: 0, y: 0, z: 0 };
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'a',
      buildingHeight: 20,
      position: { x: 5, y: 20, z: 10 },
    });
    updateTrait(rooftopAnchorHandler, node, cfg, ctx, 0.016);
    expect(node.position.y).toBe(22); // 20 + 2 offset
  });

  it('query emits info', () => {
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, {
      type: 'rooftop_anchor_query',
      queryId: 'q1',
    });
    expect(getEventCount(ctx, 'rooftop_anchor_info')).toBe(1);
  });

  it('detach releases anchor handle', () => {
    sendEvent(rooftopAnchorHandler, node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'anchor-1',
      buildingHeight: 20,
      position: { x: 0, y: 0, z: 0 },
    });
    rooftopAnchorHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'rooftop_anchor_release')).toBe(1);
    expect((node as any).__rooftopAnchorState).toBeUndefined();
  });
});
