/**
 * AnchorTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { anchorHandler } from '../AnchorTrait';

function makeNode() {
  return { id: 'anchor_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...anchorHandler.defaultConfig!, ...cfg };
  anchorHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

function createAnchor(node: any, ctx: any, config: any, anchorId = 'anc-abc') {
  anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_created', anchorId });
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('anchorHandler.defaultConfig', () => {
  const d = anchorHandler.defaultConfig!;
  it('anchor_type=spatial', () => expect(d.anchor_type).toBe('spatial'));
  it('tracking_quality=high', () => expect(d.tracking_quality).toBe('high'));
  it('offset=[0,0,0]', () => expect(d.offset).toEqual([0, 0, 0]));
  it('alignment=gravity', () => expect(d.alignment).toBe('gravity'));
  it('fallback_behavior=freeze', () => expect(d.fallback_behavior).toBe('freeze'));
  it('timeout_ms=5000', () => expect(d.timeout_ms).toBe(5000));
  it('persist=false', () => expect(d.persist).toBe(false));
  it('recovery_attempts=3', () => expect(d.recovery_attempts).toBe(3));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('anchorHandler.onAttach', () => {
  it('creates __anchorState', () => expect(attach().node.__anchorState).toBeDefined());
  it('isAnchored=false', () => expect(attach().node.__anchorState.isAnchored).toBe(false));
  it('anchorId=null', () => expect(attach().node.__anchorState.anchorId).toBeNull());
  it('trackingState=initializing', () =>
    expect(attach().node.__anchorState.trackingState).toBe('initializing'));
  it('pose=null', () => expect(attach().node.__anchorState.pose).toBeNull());
  it('lastValidPose=null', () => expect(attach().node.__anchorState.lastValidPose).toBeNull());
  it('lostTime=0', () => expect(attach().node.__anchorState.lostTime).toBe(0));
  it('updateCount=0', () => expect(attach().node.__anchorState.updateCount).toBe(0));
  it('emits anchor_request with type and quality', () => {
    const { ctx } = attach({ anchor_type: 'image', tracking_quality: 'medium', persist: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'anchor_request',
      expect.objectContaining({
        type: 'image',
        quality: 'medium',
        persist: true,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('anchorHandler.onDetach', () => {
  it('removes __anchorState', () => {
    const { node, config, ctx } = attach();
    anchorHandler.onDetach!(node, config, ctx);
    expect(node.__anchorState).toBeUndefined();
  });
  it('emits anchor_release when anchorId is set', () => {
    const { node, config, ctx } = attach({ persist: true });
    node.__anchorState.anchorId = 'anc-x';
    ctx.emit.mockClear();
    anchorHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'anchor_release',
      expect.objectContaining({ anchorId: 'anc-x', persist: true })
    );
  });
  it('no anchor_release when anchorId is null', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    anchorHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('anchor_release', expect.anything());
  });
});

// ─── onEvent — anchor_created ─────────────────────────────────────────────────

describe('anchorHandler.onEvent — anchor_created', () => {
  it('sets anchorId', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    expect(node.__anchorState.anchorId).toBe('anc-1');
  });
  it('sets isAnchored=true', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config);
    expect(node.__anchorState.isAnchored).toBe(true);
  });
  it('sets trackingState=tracking', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config);
    expect(node.__anchorState.trackingState).toBe('tracking');
  });
  it('stores persistenceId when provided', () => {
    const { node, ctx, config } = attach();
    anchorHandler.onEvent!(node, config, ctx, {
      type: 'anchor_created',
      anchorId: 'a1',
      persistenceId: 'persist-99',
    });
    expect(node.__anchorState.persistenceId).toBe('persist-99');
  });
  it('emits anchor_ready', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    createAnchor(node, ctx, config, 'anc-2');
    expect(ctx.emit).toHaveBeenCalledWith(
      'anchor_ready',
      expect.objectContaining({ anchorId: 'anc-2' })
    );
  });
});

// ─── onEvent — anchor_pose_update ─────────────────────────────────────────────

describe('anchorHandler.onEvent — anchor_pose_update', () => {
  const pose = {
    position: [1, 2, 3],
    rotation: [0, 0, 0, 1 ],
    confidence: 0.95,
  };
  it('updates pose', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    anchorHandler.onEvent!(node, config, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc-1',
      pose,
    });
    expect(node.__anchorState.pose).toBe(pose);
  });
  it('updates lastValidPose', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    anchorHandler.onEvent!(node, config, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc-1',
      pose,
    });
    expect(node.__anchorState.lastValidPose).toBe(pose);
  });
  it('increments updateCount', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    anchorHandler.onEvent!(node, config, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc-1',
      pose,
    });
    expect(node.__anchorState.updateCount).toBe(1);
  });
  it('ignored when anchorId does not match', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    anchorHandler.onEvent!(node, config, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'wrong',
      pose,
    });
    expect(node.__anchorState.pose).toBeNull();
  });
  it('recovers tracking and emits anchor_recovered when was lost', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    node.__anchorState.trackingState = 'lost';
    ctx.emit.mockClear();
    anchorHandler.onEvent!(node, config, ctx, {
      type: 'anchor_pose_update',
      anchorId: 'anc-1',
      pose,
    });
    expect(node.__anchorState.trackingState).toBe('tracking');
    expect(node.__anchorState.lostTime).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('anchor_recovered', expect.anything());
    expect(ctx.emit).toHaveBeenCalledWith(
      'set_visible',
      expect.objectContaining({ visible: true })
    );
  });
});

// ─── onEvent — anchor_tracking_lost ──────────────────────────────────────────

describe('anchorHandler.onEvent — anchor_tracking_lost', () => {
  it('sets trackingState=lost', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_tracking_lost', anchorId: 'anc-1' });
    expect(node.__anchorState.trackingState).toBe('lost');
  });
  it('resets lostTime to 0', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    node.__anchorState.lostTime = 999;
    anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_tracking_lost', anchorId: 'anc-1' });
    expect(node.__anchorState.lostTime).toBe(0);
  });
  it('emits anchor_lost when previously tracking', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    ctx.emit.mockClear();
    anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_tracking_lost', anchorId: 'anc-1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'anchor_lost',
      expect.objectContaining({ anchorId: 'anc-1' })
    );
  });
  it('ignored when anchorId does not match', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_tracking_lost', anchorId: 'other' });
    expect(node.__anchorState.trackingState).toBe('tracking');
  });
  it('no anchor_lost when was not tracking', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config, 'anc-1');
    node.__anchorState.trackingState = 'paused';
    ctx.emit.mockClear();
    anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_tracking_lost', anchorId: 'anc-1' });
    expect(ctx.emit).not.toHaveBeenCalledWith('anchor_lost', expect.anything());
  });
});

// ─── onEvent — anchor_restore ─────────────────────────────────────────────────

describe('anchorHandler.onEvent — anchor_restore', () => {
  it('emits anchor_restore_request with persistenceId', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    anchorHandler.onEvent!(node, config, ctx, { type: 'anchor_restore', persistenceId: 'p-123' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'anchor_restore_request',
      expect.objectContaining({ persistenceId: 'p-123' })
    );
  });
});

// ─── onUpdate — fallback behaviors ────────────────────────────────────────────

describe('anchorHandler.onUpdate — fallback: hide', () => {
  it('emits set_visible(false) when lost with fallback=hide', () => {
    const { node, ctx, config } = attach({ fallback_behavior: 'hide' });
    createAnchor(node, ctx, config);
    node.__anchorState.trackingState = 'lost';
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'set_visible',
      expect.objectContaining({ visible: false })
    );
  });
});

describe('anchorHandler.onUpdate — fallback: reset', () => {
  it('emits anchor_timeout when lostTime > timeout_ms', () => {
    const { node, ctx, config } = attach({ fallback_behavior: 'reset', timeout_ms: 1000 });
    createAnchor(node, ctx, config);
    node.__anchorState.trackingState = 'lost';
    node.__anchorState.lostTime = 900;
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.2); // +200ms → 1100ms > 1000ms
    expect(ctx.emit).toHaveBeenCalledWith('anchor_timeout', expect.anything());
    expect(node.__anchorState.trackingState).toBe('stopped');
    expect(node.__anchorState.isAnchored).toBe(false);
    expect(node.__anchorState.anchorId).toBeNull();
  });
  it('does not timeout before threshold', () => {
    const { node, ctx, config } = attach({ fallback_behavior: 'reset', timeout_ms: 5000 });
    createAnchor(node, ctx, config);
    node.__anchorState.trackingState = 'lost';
    node.__anchorState.lostTime = 100;
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.1); // +100ms, total 200ms < 5000ms
    expect(ctx.emit).not.toHaveBeenCalledWith('anchor_timeout', expect.anything());
  });
});

describe('anchorHandler.onUpdate — fallback: interpolate', () => {
  it('emits set_position with lastValidPose position when lost', () => {
    const { node, ctx, config } = attach({ fallback_behavior: 'interpolate' });
    createAnchor(node, ctx, config);
    node.__anchorState.trackingState = 'lost';
    node.__anchorState.lastValidPose = {
      position: [5, 1, 2],
      rotation: [0, 0, 0, 1 ],
      confidence: 1,
    };
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'set_position',
      expect.objectContaining({ position: [5, 1, 2] })
    );
  });
});

describe('anchorHandler.onUpdate — offset application', () => {
  it('emits set_position with offset applied when tracking', () => {
    const { node, ctx, config } = attach({ offset: [1, 0.5, 0] });
    createAnchor(node, ctx, config);
    node.__anchorState.pose = {
      position: [2, 1, 0],
      rotation: [0, 0, 0, 1 ],
      confidence: 1,
    };
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.1);
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'set_position')!;
    expect(call[1].position[0]).toBeCloseTo(3); // 2 + 1
    expect(call[1].position[1]).toBeCloseTo(1.5); // 1 + 0.5
    expect(call[1].position[2]).toBeCloseTo(0); // 0 + 0
  });
  it('emits set_rotation when tracking', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config);
    const rot = [0, 0.7, 0, 0.7 ];
    node.__anchorState.pose = { position: [0, 0, 0], rotation: rot, confidence: 1 };
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'set_rotation',
      expect.objectContaining({ rotation: rot })
    );
  });
  it('no position/rotation emit when pose is null', () => {
    const { node, ctx, config } = attach();
    createAnchor(node, ctx, config);
    node.__anchorState.pose = null;
    ctx.emit.mockClear();
    anchorHandler.onUpdate!(node, config, ctx, 0.1);
    expect(ctx.emit).not.toHaveBeenCalledWith('set_position', expect.anything());
  });
  it('accumulates lostTime in ms from delta seconds', () => {
    const { node, ctx, config } = attach({ fallback_behavior: 'freeze' });
    createAnchor(node, ctx, config);
    node.__anchorState.trackingState = 'lost';
    anchorHandler.onUpdate!(node, config, ctx, 0.5); // 500ms
    expect(node.__anchorState.lostTime).toBeCloseTo(500);
  });
});
