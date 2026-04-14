/**
 * RooftopAnchorTrait Production Tests
 *
 * Building rooftop-relative positioning using 3D Tiles for urban AR.
 * Tests: defaultConfig, state init, auto-resolve, events (resolved, not_found,
 * pose_update, unavailable, query, resolve), fallback height, detach.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import rooftopAnchorHandler from '../RooftopAnchorTrait';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeNode(): any {
  return {};
}
function makeCtx() {
  const emit = vi.fn();
  return { emit };
}

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    latitude: 37.7749,
    longitude: -122.4194,
    elevation_offset: 2,
    building_id: '',
    auto_resolve: true,
    fallback_height: 10,
    align_to_edge: false,
    ...overrides,
  };
}

function attach(overrides: Record<string, unknown> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const cfg = makeConfig(overrides);
  rooftopAnchorHandler.onAttach!(node, cfg as any, ctx as any);
  return { node, ctx, cfg };
}

function st(node: any) {
  return (node as any).__rooftopAnchorState;
}

function fire(node: any, cfg: any, ctx: any, event: Record<string, unknown>) {
  rooftopAnchorHandler.onEvent!(node, cfg, ctx as any, event);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('RooftopAnchorTrait — Production', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── defaultConfig ──────────────────────────────────────────────────

  it('has name rooftop_anchor', () => {
    expect(rooftopAnchorHandler.name).toBe('rooftop_anchor');
  });

  it('defaultConfig has latitude and longitude of 0', () => {
    expect(rooftopAnchorHandler.defaultConfig.latitude).toBe(0);
    expect(rooftopAnchorHandler.defaultConfig.longitude).toBe(0);
  });

  it('defaultConfig auto_resolve is true', () => {
    expect(rooftopAnchorHandler.defaultConfig.auto_resolve).toBe(true);
  });

  it('defaultConfig fallback_height is 10', () => {
    expect(rooftopAnchorHandler.defaultConfig.fallback_height).toBe(10);
  });

  // ─── onAttach ───────────────────────────────────────────────────────

  it('creates state with unresolved initial condition', () => {
    const { node } = attach();
    const s = st(node);
    expect(s.state).toBe('resolving'); // auto_resolve=true moves to resolving
    expect(s.isResolved).toBe(false);
    expect(s.buildingHeight).toBe(0);
    expect(s.confidence).toBe(0);
    expect(s.anchorHandle).toBeNull();
  });

  it('emits rooftop_anchor_request when auto_resolve is true', () => {
    const { ctx } = attach({ auto_resolve: true, latitude: 40.7, longitude: -74.0 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rooftop_anchor_request',
      expect.objectContaining({
        latitude: 40.7,
        longitude: -74.0,
      })
    );
  });

  it('does NOT emit rooftop_anchor_request when auto_resolve is false', () => {
    const { ctx } = attach({ auto_resolve: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('rooftop_anchor_request', expect.anything());
  });

  it('initial state is unresolved when auto_resolve=false', () => {
    const { node } = attach({ auto_resolve: false });
    expect(st(node).state).toBe('unresolved');
  });

  // ─── onDetach ───────────────────────────────────────────────────────

  it('removes state on detach', () => {
    const { node, ctx, cfg } = attach();
    rooftopAnchorHandler.onDetach!(node, cfg as any, ctx as any);
    expect(st(node)).toBeUndefined();
  });

  it('emits rooftop_anchor_release when anchorHandle is set', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'H1',
      buildingHeight: 30,
      confidence: 0.9,
      position: [0, 30, 0],
    });
    ctx.emit.mockClear();
    rooftopAnchorHandler.onDetach!(node, cfg as any, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'rooftop_anchor_release',
      expect.objectContaining({ handle: 'H1' })
    );
  });

  // ─── onEvent: rooftop_anchor_resolved ───────────────────────────────

  it('resolved event sets state=resolved, isResolved=true, and emits on_rooftop_resolved', () => {
    const { node, ctx, cfg } = attach();
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'H2',
      buildingHeight: 45,
      floors: 15,
      confidence: 0.95,
      position: [10, 45, 5],
    });
    const s = st(node);
    expect(s.state).toBe('resolved');
    expect(s.isResolved).toBe(true);
    expect(s.buildingHeight).toBe(45);
    expect(s.estimatedFloors).toBe(15);
    expect(s.confidence).toBe(0.95);
    expect(s.anchorHandle).toBe('H2');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_rooftop_resolved',
      expect.objectContaining({
        buildingHeight: 45,
        floors: 15,
        confidence: 0.95,
      })
    );
  });

  it('resolved event estimates floors from height when not provided', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'H3',
      buildingHeight: 30, // 30/3 = 10 floors
      confidence: 1.0,
      position: [0, 30, 0],
    });
    expect(st(node).estimatedFloors).toBe(10);
  });

  it('resolved event defaults confidence to 1.0 when not provided', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'H4',
      buildingHeight: 20,
      position: [0, 20, 0],
    });
    expect(st(node).confidence).toBe(1.0);
  });

  // ─── onEvent: rooftop_anchor_not_found ──────────────────────────────

  it('not_found uses fallback_height and emits on_rooftop_fallback', () => {
    const { node, ctx, cfg } = attach({ fallback_height: 15 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'rooftop_anchor_not_found' });
    const s = st(node);
    expect(s.buildingHeight).toBe(15);
    expect(s.state).toBe('resolved');
    expect(s.isResolved).toBe(true);
    expect(s.confidence).toBe(0.5);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_rooftop_fallback',
      expect.objectContaining({
        fallbackHeight: 15,
      })
    );
  });

  it('not_found emits rooftop_anchor_fallback with height + elevation_offset', () => {
    const { node, ctx, cfg } = attach({ fallback_height: 10, elevation_offset: 3 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'rooftop_anchor_not_found' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rooftop_anchor_fallback',
      expect.objectContaining({
        height: 13, // 10 + 3
      })
    );
  });

  // ─── onEvent: rooftop_pose_update ───────────────────────────────────

  it('pose_update transitions to tracking state', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, { type: 'rooftop_pose_update', position: [1, 20, 2] });
    expect(st(node).state).toBe('tracking');
    expect(st(node).rooftopPosition).toEqual([1, 20, 2 ]);
  });

  // ─── onEvent: unavailable ────────────────────────────────────────────

  it('rooftop_anchor_unavailable sets state=unavailable and emits on_rooftop_unavailable', () => {
    const { node, ctx, cfg } = attach();
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'rooftop_anchor_unavailable', reason: 'GPS blocked' });
    expect(st(node).state).toBe('unavailable');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_rooftop_unavailable',
      expect.objectContaining({
        reason: 'GPS blocked',
      })
    );
  });

  // ─── onEvent: query ──────────────────────────────────────────────────

  it('rooftop_anchor_query emits rooftop_anchor_info with state snapshot', () => {
    const { node, ctx, cfg } = attach({ latitude: 48.8, longitude: 2.35 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'rooftop_anchor_query', queryId: 'Q42' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rooftop_anchor_info',
      expect.objectContaining({
        queryId: 'Q42',
        latitude: 48.8,
        longitude: 2.35,
      })
    );
  });

  // ─── onEvent: manual resolve ─────────────────────────────────────────

  it('rooftop_anchor_resolve re-emits rooftop_anchor_request', () => {
    const { node, ctx, cfg } = attach({ auto_resolve: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'rooftop_anchor_resolve' });
    expect(st(node).state).toBe('resolving');
    expect(ctx.emit).toHaveBeenCalledWith('rooftop_anchor_request', expect.anything());
  });

  // ─── onUpdate: position application ─────────────────────────────────

  it('onUpdate sets node.position when resolved and node has position', () => {
    const { node, ctx, cfg } = attach({ elevation_offset: 5 });
    node.position = [0, 0, 0 ];
    fire(node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'H9',
      buildingHeight: 20,
      position: [3, 20, 1],
    });
    rooftopAnchorHandler.onUpdate!(node, cfg as any, ctx as any, 0);
    expect(node.position[0]).toBe(3);
    expect(node.position[1]).toBe(25); // rooftopPos.y(20) + elevation_offset(5)
  });

  it('onUpdate is no-op when node has no position property', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'rooftop_anchor_resolved',
      handle: 'H10',
      buildingHeight: 10,
      position: [0, 10, 0],
    });
    expect(() => rooftopAnchorHandler.onUpdate!(node, cfg as any, ctx as any, 0)).not.toThrow();
  });

  // ─── Unknown event ───────────────────────────────────────────────────

  it('unknown event type is silently ignored', () => {
    const { node, ctx, cfg } = attach();
    expect(() => fire(node, cfg, ctx, { type: 'mystery_event' })).not.toThrow();
  });
});
