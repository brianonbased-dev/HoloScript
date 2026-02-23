/**
 * SpatialPersonaTrait Production Tests
 *
 * V43 Tier 2 — Manages a user's persistent spatial persona in visionOS.
 * Covers: defaultConfig, onAttach (setState + persona:init emit),
 * onDetach (isActive guard), and all 6 onEvent types.
 *
 * Uses context.setState/getState pattern.
 */

import { describe, it, expect, vi } from 'vitest';
import { spatialPersonaHandler } from '../SpatialPersonaTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() { return { id: 'sp_test' } as any; }

function makeCtx() {
  let _state: Record<string, unknown> = {};
  return {
    emit: vi.fn(),
    setState: vi.fn((s: Record<string, unknown>) => { _state = { ..._state, ...s }; }),
    getState: () => _state,
  };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...spatialPersonaHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  spatialPersonaHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(ctx: ReturnType<typeof makeCtx>) {
  return ctx.getState().spatialPersona as any;
}

function fire(node: any, cfg: any, ctx: any, type: string, payload?: Record<string, unknown>) {
  spatialPersonaHandler.onEvent!(node, cfg, ctx as any, { type, payload } as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('SpatialPersonaTrait — defaultConfig', () => {
  it('has 7 fields with correct defaults', () => {
    const d = spatialPersonaHandler.defaultConfig!;
    expect(d.persona_style).toBe('realistic');
    expect(d.visibility).toBe('always');
    expect(d.spatial_audio).toBe(true);
    expect(d.gesture_mirroring).toBe(true);
    expect(d.expression_sync).toBe(true);
    expect(d.proximity_radius).toBeCloseTo(3.0);
    expect(d.render_quality).toBe('high');
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('SpatialPersonaTrait — onAttach', () => {
  it('initialises state with correct defaults via setState', () => {
    const node = makeNode();
    const { ctx } = attach(node);
    const s = st(ctx);
    expect(s.isActive).toBe(false);
    expect(s.personaId).toBeNull();
    expect(s.position).toBeNull();
    expect(s.orientation).toBeNull();
    expect(s.expressionState).toBe('neutral');
    expect(s.isSpeaking).toBe(false);
    expect(s.visibleTo).toBeInstanceOf(Set);
    expect(s.visibleTo.size).toBe(0);
  });

  it('emits persona:init with style and visibility', () => {
    const node = makeNode();
    const { ctx } = attach(node, { persona_style: 'stylized', visibility: 'when_speaking' });
    expect(ctx.emit).toHaveBeenCalledWith('persona:init', {
      style: 'stylized', visibility: 'when_speaking',
    });
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('SpatialPersonaTrait — onDetach', () => {
  it('emits persona:deactivated with personaId when isActive=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(ctx).isActive = true;
    st(ctx).personaId = 'persona_abc';
    ctx.emit.mockClear();
    spatialPersonaHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', { personaId: 'persona_abc' });
  });

  it('does NOT emit persona:deactivated when isActive=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    spatialPersonaHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('persona:deactivated', expect.any(Object));
  });
});

// ─── onEvent — persona:activate ───────────────────────────────────────────────

describe('SpatialPersonaTrait — onEvent: persona:activate', () => {
  it('sets isActive=true and stores explicit personaId', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, 'persona:activate', { personaId: 'p42' });
    expect(st(ctx).isActive).toBe(true);
    expect(st(ctx).personaId).toBe('p42');
    expect(ctx.emit).toHaveBeenCalledWith('persona:activated', { personaId: 'p42' });
  });

  it('generates personaId from node.id when not provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, 'persona:activate');
    expect(st(ctx).personaId).toBe(`persona_${node.id}`);
    expect(st(ctx).isActive).toBe(true);
  });
});

// ─── onEvent — persona:deactivate ─────────────────────────────────────────────

describe('SpatialPersonaTrait — onEvent: persona:deactivate', () => {
  it('sets isActive=false and emits persona:deactivated', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(ctx).isActive = true;
    st(ctx).personaId = 'pid1';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, 'persona:deactivate');
    expect(st(ctx).isActive).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith('persona:deactivated', { personaId: 'pid1' });
  });
});

// ─── onEvent — persona:position_update ───────────────────────────────────────

describe('SpatialPersonaTrait — onEvent: persona:position_update', () => {
  it('updates position and orientation, emits persona:moved', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(ctx).personaId = 'pid1';
    ctx.emit.mockClear();
    const pos = [1, 2, 3] as [number, number, number];
    const ori = [0, 0, 0, 1] as [number, number, number, number];
    fire(node, cfg, ctx, 'persona:position_update', { position: pos, orientation: ori });
    expect(st(ctx).position).toEqual([1, 2, 3]);
    expect(st(ctx).orientation).toEqual([0, 0, 0, 1]);
    expect(ctx.emit).toHaveBeenCalledWith('persona:moved', expect.objectContaining({ personaId: 'pid1', position: pos }));
  });

  it('updates only position when orientation not in payload', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    const initOri = [0, 1, 0, 0] as [number, number, number, number];
    st(ctx).orientation = initOri;
    fire(node, cfg, ctx, 'persona:position_update', { position: [5, 5, 5] });
    expect(st(ctx).position).toEqual([5, 5, 5]);
    expect(st(ctx).orientation).toEqual(initOri); // unchanged
  });
});

// ─── onEvent — persona:expression ────────────────────────────────────────────

describe('SpatialPersonaTrait — onEvent: persona:expression', () => {
  it('updates expressionState and sets isSpeaking=true when talking', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(ctx).personaId = 'pid1';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, 'persona:expression', { expression: 'talking' });
    expect(st(ctx).expressionState).toBe('talking');
    expect(st(ctx).isSpeaking).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith('persona:expression_changed', expect.objectContaining({ expression: 'talking' }));
  });

  it('sets isSpeaking=false for non-talking expressions', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(ctx).isSpeaking = true; // was talking
    fire(node, cfg, ctx, 'persona:expression', { expression: 'listening' });
    expect(st(ctx).expressionState).toBe('listening');
    expect(st(ctx).isSpeaking).toBe(false);
  });

  it('no-op when expression not in payload', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(ctx).expressionState = 'neutral';
    ctx.emit.mockClear();
    fire(node, cfg, ctx, 'persona:expression');
    expect(st(ctx).expressionState).toBe('neutral');
    expect(ctx.emit).not.toHaveBeenCalledWith('persona:expression_changed', expect.any(Object));
  });
});

// ─── onEvent — persona:participant_visible / persona:participant_hidden ────────

describe('SpatialPersonaTrait — onEvent: participant visibility', () => {
  it('persona:participant_visible adds to visibleTo set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, 'persona:participant_visible', { participantId: 'u1' });
    fire(node, cfg, ctx, 'persona:participant_visible', { participantId: 'u2' });
    expect(st(ctx).visibleTo.size).toBe(2);
    expect(st(ctx).visibleTo.has('u1')).toBe(true);
    expect(st(ctx).visibleTo.has('u2')).toBe(true);
  });

  it('persona:participant_hidden removes from visibleTo set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, 'persona:participant_visible', { participantId: 'u1' });
    fire(node, cfg, ctx, 'persona:participant_hidden', { participantId: 'u1' });
    expect(st(ctx).visibleTo.size).toBe(0);
  });

  it('no-op for participant_visible/hidden without participantId', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, 'persona:participant_visible');
    fire(node, cfg, ctx, 'persona:participant_hidden');
    expect(st(ctx).visibleTo.size).toBe(0);
  });
});
