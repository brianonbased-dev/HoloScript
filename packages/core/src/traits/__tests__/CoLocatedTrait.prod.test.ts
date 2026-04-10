/**
 * CoLocatedTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { coLocatedHandler } from '../CoLocatedTrait';

function makeNode() {
  return { id: 'coloc_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...coLocatedHandler.defaultConfig!, ...cfg };
  coLocatedHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('coLocatedHandler.defaultConfig', () => {
  const d = coLocatedHandler.defaultConfig!;
  it('shared_anchor_id=""', () => expect(d.shared_anchor_id).toBe(''));
  it('alignment_method=cloud_anchor', () => expect(d.alignment_method).toBe('cloud_anchor'));
  it('alignment_timeout=30000', () => expect(d.alignment_timeout).toBe(30000));
  it('visual_indicator=true', () => expect(d.visual_indicator).toBe(true));
  it('max_participants=10', () => expect(d.max_participants).toBe(10));
  it('auto_align=true', () => expect(d.auto_align).toBe(true));
  it('realignment_threshold=0.5', () => expect(d.realignment_threshold).toBe(0.5));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('coLocatedHandler.onAttach', () => {
  it('creates __coLocatedState', () => expect(attach().node.__coLocatedState).toBeDefined());
  it('state=unaligned by default (auto_align=false)', () => {
    const { node } = attach({ auto_align: false });
    expect(node.__coLocatedState.state).toBe('unaligned');
  });
  it('state=aligning when auto_align=true', () => {
    const { node } = attach({ auto_align: true });
    expect(node.__coLocatedState.state).toBe('aligning');
  });
  it('isAligned=false', () => expect(attach().node.__coLocatedState.isAligned).toBe(false));
  it('participants is empty Map', () =>
    expect(attach().node.__coLocatedState.participants.size).toBe(0));
  it('sharedAnchorId=null when shared_anchor_id=empty', () => {
    expect(attach({ shared_anchor_id: '' }).node.__coLocatedState.sharedAnchorId).toBeNull();
  });
  it('sharedAnchorId set from config.shared_anchor_id', () => {
    const { node } = attach({ shared_anchor_id: 'anchor-42' });
    expect(node.__coLocatedState.sharedAnchorId).toBe('anchor-42');
  });
  it('alignmentQuality=0', () => expect(attach().node.__coLocatedState.alignmentQuality).toBe(0));
  it('emits co_located_show_indicator when visual_indicator=true', () => {
    const { ctx } = attach({ visual_indicator: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'co_located_show_indicator',
      expect.objectContaining({ state: 'searching' })
    );
  });
  it('no indicator emit when visual_indicator=false', () => {
    const { ctx } = attach({ visual_indicator: false, auto_align: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('co_located_show_indicator', expect.anything());
  });
  it('emits co_located_start_alignment when auto_align=true', () => {
    const { ctx } = attach({ auto_align: true, alignment_method: 'qr_code' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'co_located_start_alignment',
      expect.objectContaining({ method: 'qr_code' })
    );
  });
  it('no alignment emit when auto_align=false', () => {
    const { ctx } = attach({ auto_align: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('co_located_start_alignment', expect.anything());
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('coLocatedHandler.onDetach', () => {
  it('removes __coLocatedState', () => {
    const { node, config, ctx } = attach();
    coLocatedHandler.onDetach!(node, config, ctx);
    expect(node.__coLocatedState).toBeUndefined();
  });
  it('emits co_located_leave when isAligned=true', () => {
    const { node, config, ctx } = attach();
    node.__coLocatedState.isAligned = true;
    node.__coLocatedState.sharedAnchorId = 'anc1';
    ctx.emit.mockClear();
    coLocatedHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith(
      'co_located_leave',
      expect.objectContaining({ anchorId: 'anc1' })
    );
  });
  it('no co_located_leave when isAligned=false', () => {
    const { node, config, ctx } = attach({ visual_indicator: false, auto_align: false });
    ctx.emit.mockClear();
    coLocatedHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).not.toHaveBeenCalledWith('co_located_leave', expect.anything());
  });
  it('emits co_located_hide_indicator when visual_indicator=true', () => {
    const { node, config, ctx } = attach({ visual_indicator: true });
    ctx.emit.mockClear();
    coLocatedHandler.onDetach!(node, config, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('co_located_hide_indicator', expect.anything());
  });
});

// ─── onEvent — co_located_aligned ────────────────────────────────────────────

describe('coLocatedHandler.onEvent — co_located_aligned', () => {
  function align(node: any, ctx: any, config: any, overrides: any = {}) {
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_aligned',
      anchorId: 'anc-1',
      transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
      quality: 0.9,
      ...overrides,
    });
  }
  it('sets state=aligned', () => {
    const { node, ctx, config } = attach();
    align(node, ctx, config);
    expect(node.__coLocatedState.state).toBe('aligned');
  });
  it('sets isAligned=true', () => {
    const { node, ctx, config } = attach();
    align(node, ctx, config);
    expect(node.__coLocatedState.isAligned).toBe(true);
  });
  it('stores sharedAnchorId', () => {
    const { node, ctx, config } = attach();
    align(node, ctx, config);
    expect(node.__coLocatedState.sharedAnchorId).toBe('anc-1');
  });
  it('stores alignmentQuality', () => {
    const { node, ctx, config } = attach();
    align(node, ctx, config);
    expect(node.__coLocatedState.alignmentQuality).toBeCloseTo(0.9);
  });
  it('defaults quality to 1.0 when not provided', () => {
    const { node, ctx, config } = attach();
    align(node, ctx, config, { quality: undefined });
    expect(node.__coLocatedState.alignmentQuality).toBe(1.0);
  });
  it('emits on_co_presence_aligned', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    align(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_co_presence_aligned',
      expect.objectContaining({ anchorId: 'anc-1' })
    );
  });
  it('emits co_located_indicator_aligned when visual_indicator=true', () => {
    const { node, ctx, config } = attach({ visual_indicator: true });
    ctx.emit.mockClear();
    align(node, ctx, config);
    expect(ctx.emit).toHaveBeenCalledWith('co_located_indicator_aligned', expect.anything());
  });
});

// ─── onEvent — co_located_alignment_failed ───────────────────────────────────

describe('coLocatedHandler.onEvent — co_located_alignment_failed', () => {
  it('sets state=lost', () => {
    const { node, ctx, config } = attach();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_alignment_failed',
      reason: 'timeout',
    });
    expect(node.__coLocatedState.state).toBe('lost');
  });
  it('emits on_co_located_failed with reason', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_alignment_failed',
      reason: 'no_marker',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_co_located_failed',
      expect.objectContaining({ reason: 'no_marker' })
    );
  });
});

// ─── onEvent — participant events ─────────────────────────────────────────────

describe('coLocatedHandler.onEvent — participant events', () => {
  it('adds participant on co_located_participant_joined', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'user1',
    });
    expect(node.__coLocatedState.participants.size).toBe(1);
    expect(node.__coLocatedState.participants.get('user1')).toBeDefined();
  });
  it('emits on_co_presence_joined', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_co_presence_joined',
      expect.objectContaining({ userId: 'u1', participantCount: 1 })
    );
  });
  it('rejects join when at max_participants', () => {
    const { node, ctx, config } = attach({ max_participants: 1 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'a',
    });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'b',
    });
    expect(node.__coLocatedState.participants.size).toBe(1);
  });
  it('marks participant aligned on co_located_participant_aligned', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_aligned',
      userId: 'u1',
      position: { x: 1, y: 0, z: 0 },
    });
    expect(node.__coLocatedState.participants.get('u1')!.isAligned).toBe(true);
    expect(node.__coLocatedState.participants.get('u1')!.position.x).toBe(1);
  });
  it('participant_aligned ignored for unknown user', () => {
    const { node, ctx, config } = attach();
    expect(() =>
      coLocatedHandler.onEvent!(node, config, ctx, {
        type: 'co_located_participant_aligned',
        userId: 'ghost',
        position: { x: 0, y: 0, z: 0 },
      })
    ).not.toThrow();
  });
  it('emits on_participant_aligned', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u2',
    });
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_aligned',
      userId: 'u2',
      position: { x: 0, y: 1, z: 0 },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_participant_aligned',
      expect.objectContaining({ userId: 'u2' })
    );
  });
  it('removes participant on co_located_participant_left', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_left',
      userId: 'u1',
    });
    expect(node.__coLocatedState.participants.size).toBe(0);
  });
  it('emits on_co_presence_left on leave', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_left',
      userId: 'u1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_co_presence_left',
      expect.objectContaining({ userId: 'u1', participantCount: 0 })
    );
  });
  it('updates participant position on co_located_participant_moved', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_moved',
      userId: 'u1',
      position: { x: 5, y: 0, z: 0 },
    });
    expect(node.__coLocatedState.participants.get('u1')!.position.x).toBe(5);
  });
});

// ─── onEvent — quality + anchor events ───────────────────────────────────────

describe('coLocatedHandler.onEvent — quality & anchor', () => {
  it('updates alignmentQuality on co_located_quality_update', () => {
    const { node, ctx, config } = attach();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_quality_update',
      quality: 0.7,
    });
    expect(node.__coLocatedState.alignmentQuality).toBeCloseTo(0.7);
  });
  it('state→lost + emit on_co_located_lost when quality<0.3 in aligned state', () => {
    const { node, ctx, config } = attach();
    node.__coLocatedState.state = 'aligned';
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_quality_update',
      quality: 0.1,
    });
    expect(node.__coLocatedState.state).toBe('lost');
    expect(ctx.emit).toHaveBeenCalledWith('on_co_located_lost', expect.anything());
  });
  it('emits co_located_create_anchor_request on co_located_create_anchor', () => {
    const { node, ctx, config } = attach({ alignment_method: 'image_marker' });
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, { type: 'co_located_create_anchor' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'co_located_create_anchor_request',
      expect.objectContaining({ method: 'image_marker' })
    );
  });
  it('sets isAligned and state=aligned on co_located_anchor_created', () => {
    const { node, ctx, config } = attach();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_anchor_created',
      anchorId: 'newAnc',
    });
    expect(node.__coLocatedState.isAligned).toBe(true);
    expect(node.__coLocatedState.state).toBe('aligned');
    expect(node.__coLocatedState.sharedAnchorId).toBe('newAnc');
  });
  it('emits on_anchor_created', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_anchor_created',
      anchorId: 'a2',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_anchor_created',
      expect.objectContaining({ anchorId: 'a2' })
    );
  });
  it('co_located_query emits co_located_info with state summary', () => {
    const { node, ctx, config } = attach({ max_participants: 5 });
    coLocatedHandler.onEvent!(node, config, ctx, {
      type: 'co_located_participant_joined',
      userId: 'u1',
    });
    ctx.emit.mockClear();
    coLocatedHandler.onEvent!(node, config, ctx, { type: 'co_located_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'co_located_info',
      expect.objectContaining({
        queryId: 'q1',
        participantCount: 1,
        isAligned: false,
      })
    );
  });
});

// ─── onUpdate — realignment + indicator ──────────────────────────────────────

describe('coLocatedHandler.onUpdate', () => {
  it('no-ops when not aligned', () => {
    const { node, ctx, config } = attach({ visual_indicator: false, auto_align: false });
    ctx.emit.mockClear();
    coLocatedHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('triggers realignment when quality < threshold and state=aligned', () => {
    const { node, ctx, config } = attach({ realignment_threshold: 0.5, visual_indicator: false });
    node.__coLocatedState.isAligned = true;
    node.__coLocatedState.state = 'aligned';
    node.__coLocatedState.alignmentQuality = 0.2; // below threshold
    ctx.emit.mockClear();
    coLocatedHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith('co_located_realign', expect.anything());
    expect(node.__coLocatedState.state).toBe('aligning');
  });
  it('updates visual indicator when visual_indicator=true and aligned', () => {
    const { node, ctx, config } = attach({ visual_indicator: true, realignment_threshold: 0 });
    node.__coLocatedState.isAligned = true;
    node.__coLocatedState.state = 'aligned';
    node.__coLocatedState.alignmentQuality = 0.9;
    ctx.emit.mockClear();
    coLocatedHandler.onUpdate!(node, config, ctx, 1);
    expect(ctx.emit).toHaveBeenCalledWith(
      'co_located_update_indicator',
      expect.objectContaining({ quality: 0.9 })
    );
  });
});
