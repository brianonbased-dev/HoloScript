/**
 * MagnifiableTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { magnifiableHandler } from '../MagnifiableTrait';

function makeNode(scale?: { x: number; y: number; z: number }) {
  return { id: 'mag_node', scale: scale ?? { x: 1, y: 1, z: 1 } };
}
function makeContext() { return { emit: vi.fn() }; }
function attachNode(config: any = {}, nodeScale?: { x: number; y: number; z: number }) {
  const node = makeNode(nodeScale);
  const ctx = makeContext();
  const cfg = { ...magnifiableHandler.defaultConfig!, ...config };
  magnifiableHandler.onAttach!(node, cfg, ctx);
  return { node, ctx, cfg };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('magnifiableHandler.defaultConfig', () => {
  it('min_scale = 1', () => expect(magnifiableHandler.defaultConfig!.min_scale).toBe(1));
  it('max_scale = 5', () => expect(magnifiableHandler.defaultConfig!.max_scale).toBe(5));
  it('trigger = pinch', () => expect(magnifiableHandler.defaultConfig!.trigger).toBe('pinch'));
  it('smooth_zoom = true', () => expect(magnifiableHandler.defaultConfig!.smooth_zoom).toBe(true));
  it('zoom_speed = 2', () => expect(magnifiableHandler.defaultConfig!.zoom_speed).toBe(2));
  it('lens_mode = false', () => expect(magnifiableHandler.defaultConfig!.lens_mode).toBe(false));
  it('lens_size = 0.3', () => expect(magnifiableHandler.defaultConfig!.lens_size).toBe(0.3));
  it('lens_border = true', () => expect(magnifiableHandler.defaultConfig!.lens_border).toBe(true));
  it('preserve_aspect = true', () => expect(magnifiableHandler.defaultConfig!.preserve_aspect).toBe(true));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('magnifiableHandler.onAttach', () => {
  it('creates __magnifiableState', () => expect((attachNode().node as any).__magnifiableState).toBeDefined());
  it('currentMagnification = 1', () => expect((attachNode().node as any).__magnifiableState.currentMagnification).toBe(1));
  it('targetMagnification = 1', () => expect((attachNode().node as any).__magnifiableState.targetMagnification).toBe(1));
  it('isZooming = false', () => expect((attachNode().node as any).__magnifiableState.isZooming).toBe(false));
  it('lensPosition = null', () => expect((attachNode().node as any).__magnifiableState.lensPosition).toBeNull());
  it('captures originalScale from node.scale', () => {
    const { node } = attachNode({}, { x: 2, y: 3, z: 4 });
    expect((node as any).__magnifiableState.originalScale).toEqual({ x: 2, y: 3, z: 4 });
  });
  it('emits magnifiable_register with trigger and lensMode', () => {
    const { ctx } = attachNode({ trigger: 'gaze', lens_mode: true });
    expect(ctx.emit).toHaveBeenCalledWith('magnifiable_register', expect.objectContaining({ trigger: 'gaze', lensMode: true }));
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('magnifiableHandler.onDetach', () => {
  it('removes __magnifiableState', () => {
    const { node, cfg, ctx } = attachNode();
    magnifiableHandler.onDetach!(node, cfg, ctx);
    expect((node as any).__magnifiableState).toBeUndefined();
  });
  it('restores originalScale on node.scale', () => {
    const { node, cfg, ctx } = attachNode({}, { x: 3, y: 2, z: 1 });
    // Simulate magnification applied by dirtying scale
    (node as any).scale.x = 9; (node as any).scale.y = 6; (node as any).scale.z = 3;
    magnifiableHandler.onDetach!(node, cfg, ctx);
    expect((node as any).scale.x).toBe(3);
    expect((node as any).scale.y).toBe(2);
    expect((node as any).scale.z).toBe(1);
  });
  it('emits magnifiable_unregister', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    magnifiableHandler.onDetach!(node, cfg, ctx);
    expect(ctx.emit).toHaveBeenCalledWith('magnifiable_unregister', expect.any(Object));
  });
});

// ─── onUpdate — smooth zoom ───────────────────────────────────────────────────

describe('magnifiableHandler.onUpdate — smooth zoom', () => {
  it('interpolates currentMagnification toward target when diff ≥ 0.01', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, zoom_speed: 2 });
    (node as any).__magnifiableState.currentMagnification = 1;
    (node as any).__magnifiableState.targetMagnification = 3;
    magnifiableHandler.onUpdate!(node, cfg, ctx, 0.1);
    const cur = (node as any).__magnifiableState.currentMagnification;
    expect(cur).toBeGreaterThan(1);
    expect(cur).toBeLessThan(3);
  });
  it('snaps to target when diff < 0.01', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, zoom_speed: 2 });
    (node as any).__magnifiableState.currentMagnification = 2.995;
    (node as any).__magnifiableState.targetMagnification = 3;
    magnifiableHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect((node as any).__magnifiableState.currentMagnification).toBe(3);
  });
  it('does NOT interpolate when smooth_zoom=false', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: false });
    (node as any).__magnifiableState.currentMagnification = 1;
    (node as any).__magnifiableState.targetMagnification = 3;
    magnifiableHandler.onUpdate!(node, cfg, ctx, 0.1);
    expect((node as any).__magnifiableState.currentMagnification).toBe(1);
  });
  it('does NOT interpolate when current already equals target', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true });
    (node as any).__magnifiableState.currentMagnification = 2;
    (node as any).__magnifiableState.targetMagnification = 2;
    ctx.emit.mockClear();
    magnifiableHandler.onUpdate!(node, cfg, ctx, 0.1);
    expect(ctx.emit).not.toHaveBeenCalledWith('magnifiable_lens_update', expect.any(Object));
  });
  it('emits magnifiable_lens_update when lens_mode=true and lensPosition set', () => {
    const { node, cfg, ctx } = attachNode({ lens_mode: true, lens_size: 0.4, lens_border: true });
    (node as any).__magnifiableState.lensPosition = { x: 0.5, y: 0.5 };
    ctx.emit.mockClear();
    magnifiableHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('magnifiable_lens_update', expect.objectContaining({ size: 0.4, showBorder: true }));
  });
  it('does NOT emit magnifiable_lens_update when lensPosition is null', () => {
    const { node, cfg, ctx } = attachNode({ lens_mode: true });
    ctx.emit.mockClear();
    magnifiableHandler.onUpdate!(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('magnifiable_lens_update', expect.any(Object));
  });
});

// ─── onEvent — magnify_start / pinch_start ────────────────────────────────────

describe('magnifiableHandler.onEvent — magnify_start / pinch_start', () => {
  it('magnify_start sets isZooming=true', () => {
    const { node, cfg, ctx } = attachNode();
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_start' });
    expect((node as any).__magnifiableState.isZooming).toBe(true);
  });
  it('magnify_start captures zoomCenter from event.center', () => {
    const { node, cfg, ctx } = attachNode();
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_start', center: { x: 1, y: 2, z: 3 } });
    expect((node as any).__magnifiableState.zoomCenter).toEqual({ x: 1, y: 2, z: 3 });
  });
  it('magnify_start emits on_magnify_start', () => {
    const { node, cfg, ctx } = attachNode();
    ctx.emit.mockClear();
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_start' });
    expect(ctx.emit).toHaveBeenCalledWith('on_magnify_start', expect.any(Object));
  });
  it('pinch_start is an alias and also sets isZooming=true', () => {
    const { node, cfg, ctx } = attachNode();
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'pinch_start' });
    expect((node as any).__magnifiableState.isZooming).toBe(true);
  });
});

// ─── onEvent — magnify_update / pinch_update ─────────────────────────────────

describe('magnifiableHandler.onEvent — magnify_update', () => {
  it('smooth mode: sets targetMagnification = currentMag * scale (clamped)', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, min_scale: 1, max_scale: 5 });
    (node as any).__magnifiableState.currentMagnification = 2;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_update', scale: 1.5 });
    expect((node as any).__magnifiableState.targetMagnification).toBeCloseTo(3, 5);
  });
  it('smooth mode does NOT change currentMagnification immediately', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true });
    (node as any).__magnifiableState.currentMagnification = 2;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_update', scale: 2 });
    expect((node as any).__magnifiableState.currentMagnification).toBe(2);
  });
  it('instant mode: sets currentMagnification immediately', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: false, min_scale: 1, max_scale: 5 });
    (node as any).__magnifiableState.currentMagnification = 2;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_update', scale: 2 });
    expect((node as any).__magnifiableState.currentMagnification).toBeCloseTo(4, 5);
  });
  it('clamps to max_scale', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, max_scale: 5 });
    (node as any).__magnifiableState.currentMagnification = 4;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_update', scale: 3 }); // 4*3=12>5
    expect((node as any).__magnifiableState.targetMagnification).toBe(5);
  });
  it('clamps to min_scale', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, min_scale: 1 });
    (node as any).__magnifiableState.currentMagnification = 1.2;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_update', scale: 0.1 }); // 1.2*0.1=0.12<1
    expect((node as any).__magnifiableState.targetMagnification).toBe(1);
  });
  it('sets lensPosition when lens_mode=true and event.position provided', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, lens_mode: true });
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_update', scale: 1, position: { x: 0.3, y: 0.4 } });
    expect((node as any).__magnifiableState.lensPosition).toEqual({ x: 0.3, y: 0.4 });
  });
  it('pinch_update is an alias (sets targetMagnification in smooth mode)', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, max_scale: 5 });
    (node as any).__magnifiableState.currentMagnification = 1;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'pinch_update', scale: 2 });
    expect((node as any).__magnifiableState.targetMagnification).toBe(2);
  });
});

// ─── onEvent — magnify_end ────────────────────────────────────────────────────

describe('magnifiableHandler.onEvent — magnify_end / pinch_end', () => {
  it('magnify_end sets isZooming=false', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__magnifiableState.isZooming = true;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_end' });
    expect((node as any).__magnifiableState.isZooming).toBe(false);
  });
  it('magnify_end emits on_magnify_end with current magnification', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__magnifiableState.currentMagnification = 2.5;
    ctx.emit.mockClear();
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_end' });
    expect(ctx.emit).toHaveBeenCalledWith('on_magnify_end', expect.objectContaining({ magnification: 2.5 }));
  });
  it('pinch_end is a valid alias', () => {
    const { node, cfg, ctx } = attachNode();
    (node as any).__magnifiableState.isZooming = true;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'pinch_end' });
    expect((node as any).__magnifiableState.isZooming).toBe(false);
  });
});

// ─── onEvent — magnify_set / magnify_reset / magnify_query ───────────────────

describe('magnifiableHandler.onEvent — magnify_set / reset / query', () => {
  it('magnify_set (smooth): updates targetMagnification only', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, min_scale: 1, max_scale: 5 });
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_set', magnification: 3 });
    expect((node as any).__magnifiableState.targetMagnification).toBe(3);
    expect((node as any).__magnifiableState.currentMagnification).toBe(1); // unchanged
  });
  it('magnify_set clamps within [min_scale, max_scale]', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true, min_scale: 1, max_scale: 5 });
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_set', magnification: 99 });
    expect((node as any).__magnifiableState.targetMagnification).toBe(5);
  });
  it('magnify_set (instant): sets both current and target immediately', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: false, min_scale: 1, max_scale: 5 });
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_set', magnification: 4 });
    expect((node as any).__magnifiableState.currentMagnification).toBe(4);
    expect((node as any).__magnifiableState.targetMagnification).toBe(4);
  });
  it('magnify_reset (smooth): sets targetMagnification=1', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: true });
    (node as any).__magnifiableState.targetMagnification = 4;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_reset' });
    expect((node as any).__magnifiableState.targetMagnification).toBe(1);
  });
  it('magnify_reset (instant): sets both current and target to 1', () => {
    const { node, cfg, ctx } = attachNode({ smooth_zoom: false });
    (node as any).__magnifiableState.currentMagnification = 3;
    (node as any).__magnifiableState.targetMagnification = 3;
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_reset' });
    expect((node as any).__magnifiableState.currentMagnification).toBe(1);
    expect((node as any).__magnifiableState.targetMagnification).toBe(1);
  });
  it('magnify_query emits magnify_info snapshot', () => {
    const { node, cfg, ctx } = attachNode({ lens_mode: true });
    (node as any).__magnifiableState.currentMagnification = 2;
    (node as any).__magnifiableState.isZooming = true;
    ctx.emit.mockClear();
    magnifiableHandler.onEvent!(node, cfg, ctx, { type: 'magnify_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith('magnify_info', expect.objectContaining({
      queryId: 'q1',
      currentMagnification: 2,
      isZooming: true,
      lensMode: true,
    }));
  });
});
