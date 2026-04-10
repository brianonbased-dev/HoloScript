/**
 * RopeTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { ropeHandler } from '../RopeTrait';

function makeNode() {
  return { id: 'rope_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...ropeHandler.defaultConfig!, ...cfg };
  ropeHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('ropeHandler.defaultConfig', () => {
  const d = ropeHandler.defaultConfig!;
  it('length=5', () => expect(d.length).toBe(5));
  it('segments=20', () => expect(d.segments).toBe(20));
  it('stiffness=0.9', () => expect(d.stiffness).toBeCloseTo(0.9));
  it('damping=0.02', () => expect(d.damping).toBeCloseTo(0.02));
  it('radius=0.02', () => expect(d.radius).toBeCloseTo(0.02));
  it('breakable=false', () => expect(d.breakable).toBe(false));
  it('break_force=1000', () => expect(d.break_force).toBe(1000));
  it('gravity_scale=1.0', () => expect(d.gravity_scale).toBe(1.0));
  it('collision=true', () => expect(d.collision).toBe(true));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('ropeHandler.onAttach', () => {
  it('creates __ropeState', () => expect(attach().node.__ropeState).toBeDefined());
  it('initializes segments array with N+1 entries (0..N)', () => {
    const { node } = attach({ segments: 10 });
    expect(node.__ropeState.segments).toHaveLength(11);
  });
  it('seg[0].position.y=0', () => {
    const { node } = attach({ segments: 5, length: 5 });
    expect(node.__ropeState.segments[0].position.y).toBeCloseTo(0);
  });
  it('segment spacing = length/segments downward', () => {
    const { node } = attach({ segments: 4, length: 4 });
    // segmentLength = 4/4 = 1.0
    expect(node.__ropeState.segments[1].position.y).toBeCloseTo(-1.0);
    expect(node.__ropeState.segments[4].position.y).toBeCloseTo(-4.0);
  });
  it('currentLength = config.length', () => {
    const { node } = attach({ length: 8 });
    expect(node.__ropeState.currentLength).toBe(8);
  });
  it('isSnapped=false', () => expect(attach().node.__ropeState.isSnapped).toBe(false));
  it('isSimulating=true', () => expect(attach().node.__ropeState.isSimulating).toBe(true));
  it('tension=0', () => expect(attach().node.__ropeState.tension).toBe(0));
  it('emits rope_create', () => {
    const { ctx } = attach({ segments: 20 });
    expect(ctx.emit).toHaveBeenCalledWith('rope_create', expect.objectContaining({ segments: 20 }));
  });
  it('rope_create includes stiffness and gravity_scale', () => {
    const { ctx } = attach({ stiffness: 0.7, gravity_scale: 0.5 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_create',
      expect.objectContaining({
        stiffness: 0.7,
        gravityScale: 0.5,
      })
    );
  });
  it('emits rope_attach for attach_start when set', () => {
    const { ctx } = attach({ attach_start: 'hook_top' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_attach',
      expect.objectContaining({ endpoint: 'start', targetNodeId: 'hook_top' })
    );
  });
  it('emits rope_attach for attach_end when set', () => {
    const { ctx } = attach({ attach_end: 'anchor_bot' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_attach',
      expect.objectContaining({ endpoint: 'end', targetNodeId: 'anchor_bot' })
    );
  });
  it('no rope_attach when attach_start empty', () => {
    const { ctx } = attach({ attach_start: '' });
    const calls = ctx.emit.mock.calls.filter((c: any[]) => c[0] === 'rope_attach');
    expect(calls.some((c: any[]) => c[1].endpoint === 'start')).toBe(false);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('ropeHandler.onDetach', () => {
  it('removes __ropeState', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onDetach!(node, config, ctx);
    expect(node.__ropeState).toBeUndefined();
  });
  it('emits rope_destroy when isSimulating=true', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    ropeHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('rope_destroy', expect.anything());
  });
  it('no rope_destroy when isSimulating=false', () => {
    const { node, config, ctx } = attach();
    node.__ropeState.isSimulating = false;
    ctx.emit.mockClear();
    ropeHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('rope_destroy', expect.anything());
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('ropeHandler.onUpdate', () => {
  it('no-op when isSimulating=false', () => {
    const { node, config, ctx } = attach();
    node.__ropeState.isSimulating = false;
    ctx.emit.mockClear();
    ropeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('no-op when isSnapped=true', () => {
    const { node, config, ctx } = attach();
    node.__ropeState.isSnapped = true;
    ctx.emit.mockClear();
    ropeHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('emits rope_step each update when simulating', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_step',
      expect.objectContaining({ deltaTime: 0.016 })
    );
  });
  it('breakable rope snaps when tension > break_force', () => {
    const { node, config, ctx } = attach({ breakable: true, break_force: 500, segments: 10 });
    node.__ropeState.tension = 600; // above threshold
    ctx.emit.mockClear();
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__ropeState.isSnapped).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('rope_break', expect.anything());
    expect(ctx.emit).toHaveBeenCalledWith('on_rope_snap', expect.anything());
  });
  it('breakable rope does NOT snap when tension equals break_force exactly', () => {
    const { node, config, ctx } = attach({ breakable: true, break_force: 500 });
    node.__ropeState.tension = 500; // not strictly greater
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__ropeState.isSnapped).toBe(false);
  });
  it('non-breakable rope does NOT snap even at high tension', () => {
    const { node, config, ctx } = attach({ breakable: false, break_force: 100 });
    node.__ropeState.tension = 99999;
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__ropeState.isSnapped).toBe(false);
  });
  it('snapPoint set to floor(segments/2) on break', () => {
    const { node, config, ctx } = attach({ breakable: true, break_force: 100, segments: 10 });
    node.__ropeState.tension = 200;
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    expect(node.__ropeState.snapPoint).toBe(5);
  });
});

// ─── onEvent — rope_segment_update ───────────────────────────────────────────

describe('ropeHandler.onEvent — rope_segment_update', () => {
  it('updates segment positions', () => {
    const { node, config, ctx } = attach({ segments: 3 });
    const positions = [
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 0, z: 0 },
      { x: 3, y: 0, z: 0 },
    ];
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_segment_update', positions, tension: 0 });
    expect(node.__ropeState.segments[0].position.x).toBe(1);
    expect(node.__ropeState.segments[2].position.x).toBe(3);
  });
  it('updates tension from event', () => {
    const { node, config, ctx } = attach({ segments: 2 });
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_segment_update',
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: -2, z: 0 },
      ],
      tension: 250,
    });
    expect(node.__ropeState.tension).toBe(250);
  });
  it('recalculates currentLength from new segment positions', () => {
    const { node, config, ctx } = attach({ segments: 2 });
    // 3 segments (N+1), placed 1m apart vertically
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_segment_update',
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
        { x: 0, y: -2, z: 0 },
      ],
      tension: 0,
    });
    expect(node.__ropeState.currentLength).toBeCloseTo(2.0);
  });
  it('emits rope_mesh_update', () => {
    const { node, config, ctx } = attach({ segments: 1 });
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_segment_update',
      positions: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: -1, z: 0 },
      ],
      tension: 0,
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_mesh_update',
      expect.objectContaining({ segments: expect.any(Array) })
    );
  });
});

// ─── onEvent — rope_attach / rope_detach ─────────────────────────────────────

describe('ropeHandler.onEvent — rope_attach and rope_detach', () => {
  it('rope_attach emits rope_create_attachment', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_attach',
      endpoint: 'start',
      targetNodeId: 'pole',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_create_attachment',
      expect.objectContaining({ endpoint: 'start', targetNodeId: 'pole' })
    );
  });
  it('rope_attach uses event offset or defaults', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_attach',
      endpoint: 'end',
      targetNodeId: 'x',
      offset: { x: 1, y: 0, z: 0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_create_attachment',
      expect.objectContaining({ offset: { x: 1, y: 0, z: 0 } })
    );
  });
  it('rope_detach start sets startAttachment=null', () => {
    const { node, config, ctx } = attach();
    node.__ropeState.startAttachment = 'pole';
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_detach', endpoint: 'start' });
    expect(node.__ropeState.startAttachment).toBeNull();
  });
  it('rope_detach emits rope_remove_attachment', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_detach', endpoint: 'end' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_remove_attachment',
      expect.objectContaining({ endpoint: 'end' })
    );
  });
});

// ─── onEvent — rope_apply_force ──────────────────────────────────────────────

describe('ropeHandler.onEvent — rope_apply_force', () => {
  it('emits rope_external_force at specified segment', () => {
    const { node, config, ctx } = attach({ segments: 10 });
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_apply_force',
      segmentIndex: 4,
      force: { x: 0, y: 50, z: 0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_external_force',
      expect.objectContaining({
        segmentIndex: 4,
        force: { x: 0, y: 50, z: 0 },
      })
    );
  });
  it('defaults segmentIndex to floor(segments/2) if not provided', () => {
    const { node, config, ctx } = attach({ segments: 10 });
    ropeHandler.onEvent!(node, config, ctx, {
      type: 'rope_apply_force',
      force: { x: 1, y: 0, z: 0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_external_force',
      expect.objectContaining({ segmentIndex: 5 })
    );
  });
});

// ─── onEvent — rope_set_length ───────────────────────────────────────────────

describe('ropeHandler.onEvent — rope_set_length', () => {
  it('emits rope_change_length with new length', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_set_length', length: 10 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_change_length',
      expect.objectContaining({ length: 10 })
    );
  });
});

// ─── onEvent — rope_repair ────────────────────────────────────────────────────

describe('ropeHandler.onEvent — rope_repair', () => {
  it('clears isSnapped and snapPoint', () => {
    const { node, config, ctx } = attach({ breakable: true, break_force: 100, segments: 10 });
    node.__ropeState.tension = 200;
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_repair' });
    expect(node.__ropeState.isSnapped).toBe(false);
    expect(node.__ropeState.snapPoint).toBeNull();
  });
  it('emits rope_reconnect', () => {
    const { node, config, ctx } = attach({ breakable: true, break_force: 100, segments: 10 });
    node.__ropeState.tension = 200;
    ropeHandler.onUpdate!(node, config, ctx, 0.016);
    ctx.emit.mockClear();
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_repair' });
    expect(ctx.emit).toHaveBeenCalledWith('rope_reconnect', expect.anything());
  });
  it('no-op repair when not snapped', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_repair' });
    expect(ctx.emit).not.toHaveBeenCalledWith('rope_reconnect', expect.anything());
  });
});

// ─── onEvent — rope_pause / rope_resume ──────────────────────────────────────

describe('ropeHandler.onEvent — rope_pause and rope_resume', () => {
  it('rope_pause sets isSimulating=false', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_pause' });
    expect(node.__ropeState.isSimulating).toBe(false);
  });
  it('rope_resume sets isSimulating=true', () => {
    const { node, config, ctx } = attach();
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_pause' });
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_resume' });
    expect(node.__ropeState.isSimulating).toBe(true);
  });
});

// ─── onEvent — rope_query ─────────────────────────────────────────────────────

describe('ropeHandler.onEvent — rope_query', () => {
  it('emits rope_info with full state snapshot', () => {
    const { node, config, ctx } = attach({ segments: 5, length: 5 });
    ropeHandler.onEvent!(node, config, ctx, { type: 'rope_query', queryId: 'qr1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'rope_info',
      expect.objectContaining({
        queryId: 'qr1',
        isSimulating: true,
        isSnapped: false,
        segmentCount: 6, // N+1
        hasStartAttachment: false,
        hasEndAttachment: false,
      })
    );
  });
});
