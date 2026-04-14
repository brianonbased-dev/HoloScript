/**
 * TerrainAnchorTrait Production Tests
 *
 * Ground-relative positioning using terrain elevation data.
 * Tests: defaultConfig, state init, auto-resolve, resolved/pose_update/
 * unavailable/query/resolve events, surface normal alignment, smoothing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import terrainAnchorHandler from '../TerrainAnchorTrait';

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
    elevation_offset: 0,
    terrain_following: true,
    surface_normal_alignment: true,
    auto_resolve: true,
    smoothing: 0.9,
    ...overrides,
  };
}

function attach(overrides: Record<string, unknown> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const cfg = makeConfig(overrides);
  terrainAnchorHandler.onAttach!(node, cfg as any, ctx as any);
  return { node, ctx, cfg };
}

function st(node: any) {
  return (node as any).__terrainAnchorState;
}

function fire(node: any, cfg: any, ctx: any, event: Record<string, unknown>) {
  terrainAnchorHandler.onEvent!(node, cfg, ctx as any, event);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('TerrainAnchorTrait — Production', () => {
  beforeEach(() => vi.clearAllMocks());

  // ─── defaultConfig ──────────────────────────────────────────────────

  it('has name terrain_anchor', () => {
    expect(terrainAnchorHandler.name).toBe('terrain_anchor');
  });

  it('defaultConfig terrain_following is true', () => {
    expect(terrainAnchorHandler.defaultConfig.terrain_following).toBe(true);
  });

  it('defaultConfig surface_normal_alignment is true', () => {
    expect(terrainAnchorHandler.defaultConfig.surface_normal_alignment).toBe(true);
  });

  it('defaultConfig auto_resolve is true', () => {
    expect(terrainAnchorHandler.defaultConfig.auto_resolve).toBe(true);
  });

  it('defaultConfig smoothing is 0.9', () => {
    expect(terrainAnchorHandler.defaultConfig.smoothing).toBe(0.9);
  });

  // ─── onAttach ───────────────────────────────────────────────────────

  it('creates state with correct initial values', () => {
    const { node } = attach();
    const s = st(node);
    expect(s.isResolved).toBe(false);
    expect(s.terrainHeight).toBe(0);
    expect(s.confidence).toBe(0);
    expect(s.anchorHandle).toBeNull();
    expect(s.surfaceNormal).toEqual([0, 1, 0 ]);
    expect(s.localPosition).toEqual([0, 0, 0 ]);
    expect(s.localRotation).toEqual([0, 0, 0, 1 ]);
  });

  it('auto_resolve=true emits terrain_anchor_request', () => {
    const { ctx } = attach({ auto_resolve: true, latitude: 48.8, longitude: 2.35 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'terrain_anchor_request',
      expect.objectContaining({
        latitude: 48.8,
        longitude: 2.35,
      })
    );
  });

  it('auto_resolve=true transitions state to resolving', () => {
    const { node } = attach({ auto_resolve: true });
    expect(st(node).state).toBe('resolving');
  });

  it('auto_resolve=false keeps state as unresolved', () => {
    const { node } = attach({ auto_resolve: false });
    expect(st(node).state).toBe('unresolved');
  });

  it('auto_resolve=false does NOT emit terrain_anchor_request', () => {
    const { ctx } = attach({ auto_resolve: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('terrain_anchor_request', expect.anything());
  });

  // ─── onDetach ───────────────────────────────────────────────────────

  it('removes state on detach', () => {
    const { node, ctx, cfg } = attach();
    terrainAnchorHandler.onDetach!(node, cfg as any, ctx as any);
    expect(st(node)).toBeUndefined();
  });

  it('emits terrain_anchor_release when anchorHandle is set', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH1',
      terrainHeight: 100,
      confidence: 1.0,
      position: [0, 0, 0],
    });
    ctx.emit.mockClear();
    terrainAnchorHandler.onDetach!(node, cfg as any, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith(
      'terrain_anchor_release',
      expect.objectContaining({ handle: 'TH1' })
    );
  });

  it('detach without anchorHandle does not emit release', () => {
    const { node, ctx, cfg } = attach();
    // anchorHandle is null initially
    ctx.emit.mockClear();
    terrainAnchorHandler.onDetach!(node, cfg as any, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('terrain_anchor_release', expect.anything());
  });

  // ─── onEvent: terrain_anchor_resolved ───────────────────────────────

  it('resolved sets isResolved, terrainHeight, confidence, emits on_terrain_resolved', () => {
    const { node, ctx, cfg } = attach();
    ctx.emit.mockClear();
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH2',
      terrainHeight: 250,
      confidence: 0.95,
      position: [1, 250, 2],
    });
    const s = st(node);
    expect(s.state).toBe('resolved');
    expect(s.isResolved).toBe(true);
    expect(s.terrainHeight).toBe(250);
    expect(s.confidence).toBe(0.95);
    expect(s.anchorHandle).toBe('TH2');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_terrain_resolved',
      expect.objectContaining({
        terrainHeight: 250,
        confidence: 0.95,
      })
    );
  });

  it('resolved defaults confidence to 1.0 when not provided', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH3',
      terrainHeight: 100,
      position: [0, 100, 0],
    });
    expect(st(node).confidence).toBe(1.0);
  });

  it('resolved with surfaceNormal computes localRotation when normal is not up', () => {
    const { node, ctx, cfg } = attach({ surface_normal_alignment: true });
    const angled = [0.2, 0.9, 0.1 ];
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH4',
      terrainHeight: 50,
      position: [0, 50, 0],
      surfaceNormal: angled,
    });
    const s = st(node);
    expect(s.surfaceNormal).toEqual(angled);
    // Rotation quaternion should be computed and have w component
    expect(typeof s.localRotation.w).toBe('number');
  });

  it('resolved with perfect up-normal does not change rotation (angle≈0)', () => {
    const { node, ctx, cfg } = attach({ surface_normal_alignment: true });
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH5',
      terrainHeight: 10,
      position: [0, 10, 0],
      surfaceNormal: [0, 1, 0 ], // perfect up
    });
    // When normal is straight up, len < 0.001 → rotation unchanged (identity)
    const s = st(node);
    expect(s.localRotation.w).toBe(1); // identity quaternion unchanged
  });

  // ─── onEvent: terrain_pose_update ───────────────────────────────────

  it('terrain_pose_update transitions to tracking and updates position', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'terrain_pose_update',
      position: [5, 100, 3],
      terrainHeight: 100,
    });
    const s = st(node);
    expect(s.state).toBe('tracking');
    expect(s.localPosition).toEqual([5, 100, 3 ]);
    expect(s.terrainHeight).toBe(100);
  });

  it('terrain_pose_update also updates surfaceNormal when provided', () => {
    const { node, ctx, cfg } = attach();
    const norm = [0.1, 0.99, 0.05 ];
    fire(node, cfg, ctx, {
      type: 'terrain_pose_update',
      position: [0, 50, 0],
      terrainHeight: 50,
      surfaceNormal: norm,
    });
    expect(st(node).surfaceNormal).toEqual(norm);
  });

  // ─── onEvent: unavailable ────────────────────────────────────────────

  it('unavailable sets state=unavailable and emits on_terrain_unavailable', () => {
    const { node, ctx, cfg } = attach();
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'terrain_anchor_unavailable', reason: 'No elevation data' });
    expect(st(node).state).toBe('unavailable');
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_terrain_unavailable',
      expect.objectContaining({
        reason: 'No elevation data',
      })
    );
  });

  // ─── onEvent: manual resolve ─────────────────────────────────────────

  it('terrain_anchor_resolve re-emits terrain_anchor_request', () => {
    const { node, ctx, cfg } = attach({ auto_resolve: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'terrain_anchor_resolve' });
    expect(st(node).state).toBe('resolving');
    expect(ctx.emit).toHaveBeenCalledWith('terrain_anchor_request', expect.anything());
  });

  // ─── onEvent: query ──────────────────────────────────────────────────

  it('terrain_anchor_query emits terrain_anchor_info with full state', () => {
    const { node, ctx, cfg } = attach({ latitude: 35.68, longitude: 139.69 });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'terrain_anchor_query', queryId: 'Q99' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'terrain_anchor_info',
      expect.objectContaining({
        queryId: 'Q99',
        latitude: 35.68,
        longitude: 139.69,
      })
    );
  });

  // ─── onUpdate: smooth position application ───────────────────────────

  it('onUpdate applies smoothed position when resolved', () => {
    const { node, ctx, cfg } = attach({ smoothing: 0, elevation_offset: 5 });
    node.position = [0, 0, 0 ];
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH6',
      terrainHeight: 10,
      position: [3, 10, 4],
    });
    terrainAnchorHandler.onUpdate!(node, cfg as any, ctx as any, 0);
    expect(node.position[0]).toBe(3);
    expect(node.position[1]).toBe(15); // localPos.y(10) + elevation_offset(5)
    expect(node.position[2]).toBe(4);
  });

  it('onUpdate does not throw when node lacks position', () => {
    const { node, ctx, cfg } = attach();
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'H',
      terrainHeight: 0,
      confidence: 1,
      position: [0, 0, 0],
    });
    expect(() => terrainAnchorHandler.onUpdate!(node, cfg as any, ctx as any, 0)).not.toThrow();
  });

  it('onUpdate applies smoothed rotation when surface_normal_alignment=true and rotation exists', () => {
    const { node, ctx, cfg } = attach({ smoothing: 0, surface_normal_alignment: true });
    node.rotation = [0, 0, 0, 1 ];
    node.position = [0, 0, 0 ];
    const angled = [0.3, 0.9, 0.1 ];
    fire(node, cfg, ctx, {
      type: 'terrain_anchor_resolved',
      handle: 'TH7',
      terrainHeight: 5,
      position: [0, 5, 0],
      surfaceNormal: angled,
    });
    terrainAnchorHandler.onUpdate!(node, cfg as any, ctx as any, 0);
    // With smoothing=0, rotation[0] should match state.localRotation.x exactly
    const s = st(node);
    expect(node.rotation[0]).toBeCloseTo(s.localRotation.x, 5);
  });

  // ─── Unknown event ───────────────────────────────────────────────────

  it('unknown event type is silently ignored', () => {
    const { node, ctx, cfg } = attach();
    expect(() => fire(node, cfg, ctx, { type: 'phantom_event' })).not.toThrow();
  });
});
