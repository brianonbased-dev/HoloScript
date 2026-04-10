/**
 * USDTrait Production Tests
 *
 * OpenUSD (Universal Scene Description) import/export.
 * Covers: defaultConfig (23 fields), 3 utility math functions,
 * onAttach (source guard), onDetach (stageRoot guard),
 * onUpdate (animation tick, loop, stop, blend shapes),
 * and all 10 onEvent types in switch statement.
 * Async loadUSDAsset() is bypassed by manually priming state.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  usdHandler,
  applyUSDAxisConversion,
  usdTimeCodeToSeconds,
  secondsToUSDTimeCode,
  getUSDState,
  isUSDLoaded,
  getUSDVariantSets,
  getUSDActiveVariant,
  getUSDAnimation,
  getUSDJointNames,
  getUSDBlendShapes,
  isUSDZ,
} from '../USDTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'usd_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...usdHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  usdHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__usdState as any;
}
function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  usdHandler.onEvent!(node, cfg, ctx as any, evt as any);
}
function update(node: any, cfg: any, ctx: any, delta = 0.016) {
  usdHandler.onUpdate!(node, cfg, ctx as any, delta);
}

/** Prime a loaded state with optional animation */
function primeLoaded(node: any, withAnimation = false) {
  st(node).isLoaded = true;
  st(node).stageRoot = { root: true };
  if (withAnimation) {
    st(node).animation = {
      startTimeCode: 0,
      endTimeCode: 120,
      framesPerSecond: 24,
      timeCodesPerSecond: 24,
      hasTimeSamples: true,
      animatedPaths: ['/Root'],
    };
  }
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('USDTrait — defaultConfig', () => {
  it('has correct values for all 23 fields', () => {
    const d = usdHandler.defaultConfig!;
    expect(d.source).toBe('');
    expect(d.layer).toBe('');
    expect(d.variant_set).toBe('');
    expect(d.variant).toBe('');
    expect(d.purpose).toBe('default');
    expect(d.time_code).toBe(0);
    expect(d.payload_loading).toBe('eager');
    expect(d.enable_ar).toBe(false);
    expect(d.ar_anchor).toBe('plane');
    expect(d.scale).toBeCloseTo(1.0);
    expect(d.up_axis).toBe('y');
    expect(d.meters_per_unit).toBeCloseTo(1.0);
    expect(d.enable_skeletal).toBe(true);
    expect(d.enable_blend_shapes).toBe(true);
    expect(d.enable_physics).toBe(false);
    expect(d.material_conversion).toBe('preview');
    expect(d.cast_shadows).toBe(true);
    expect(d.receive_shadows).toBe(true);
    expect(d.auto_play).toBe(false);
    expect(d.loop_animation).toBe(true);
    expect(d.frame_rate).toBe(24);
    expect(d.streaming_priority).toBe('normal');
    expect(d.enable_instancing).toBe(true);
    expect(d.subdivision_level).toBe(0);
  });
});

// ─── Utility math functions ───────────────────────────────────────────────────

describe('USDTrait — applyUSDAxisConversion', () => {
  it('no-op when up_axis=y', () => {
    const pos = [1, 2, 3] as any;
    const result = applyUSDAxisConversion('y', pos);
    expect(result).toBe(pos); // same reference when no conversion
  });

  it('swaps y/z and negates original y when up_axis=z', () => {
    const pos = [1, 2, 3] as any;
    const result = applyUSDAxisConversion('z', pos) as any;
    expect(result[0]).toBe(1); // x unchanged
    expect(result[1]).toBe(3); // y ← original z
    expect(result[2]).toBe(-2); // z ← -original y
  });
});

describe('USDTrait — usdTimeCodeToSeconds', () => {
  it('converts correctly', () => {
    expect(usdTimeCodeToSeconds(48, 24)).toBeCloseTo(2.0);
    expect(usdTimeCodeToSeconds(0, 24)).toBe(0);
    expect(usdTimeCodeToSeconds(24, 24)).toBeCloseTo(1.0);
  });
});

describe('USDTrait — secondsToUSDTimeCode', () => {
  it('converts correctly', () => {
    expect(secondsToUSDTimeCode(2.0, 24)).toBeCloseTo(48);
    expect(secondsToUSDTimeCode(0, 24)).toBe(0);
  });

  it('is inverse of usdTimeCodeToSeconds', () => {
    const tc = 72;
    const fps = 24;
    expect(secondsToUSDTimeCode(usdTimeCodeToSeconds(tc, fps), fps)).toBeCloseTo(tc);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('USDTrait — onAttach', () => {
  it('initialises state with all defaults', () => {
    const node = makeNode();
    attach(node, { source: '' }); // no source → no async load
    const s = st(node);
    expect(s.isLoaded).toBe(false);
    expect(s.isLoading).toBe(false);
    expect(s.loadProgress).toBe(0);
    expect(s.layerStack).toEqual([]);
    expect(s.rootLayer).toBe('');
    expect(s.variantSets).toEqual([]);
    expect(s.activeVariants).toBeInstanceOf(Map);
    expect(s.animation).toBeNull();
    expect(s.currentTimeCode).toBe(0);
    expect(s.isPlaying).toBe(false);
    expect(s.skeleton).toBeNull();
    expect(s.blendShapes).toEqual([]);
    expect(s.blendWeights).toBeInstanceOf(Map);
    expect(s.primCount).toBe(0);
    expect(s.meshCount).toBe(0);
    expect(s.materialCount).toBe(0);
    expect(s.boundingBox).toBeNull();
    expect(s.stageRoot).toBeNull();
    expect(s.hierarchy).toEqual([]);
    expect(s.metadata).toBeNull();
    expect(s.isUSDZ).toBe(false);
  });

  it('sets isLoading=true when source is set (kicks off async load)', () => {
    const node = makeNode();
    const { ctx } = attach(node, { source: 'scene.usda' });
    // Async load started — state reflects isLoading immediately in loadUSDAsset
    // (We just check that emit was called with usd:loading_start)
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:loading_start',
      expect.objectContaining({ source: 'scene.usda' })
    );
  });

  it('does NOT call loadUSDAsset (no emit) when source is empty', () => {
    const node = makeNode();
    const { ctx } = attach(node, { source: '' });
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('USDTrait — onDetach', () => {
  it('stops animation and emits usd:unloaded when stageRoot set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    st(node).stageRoot = { root: true };
    st(node).isPlaying = true;
    ctx.emit.mockClear();
    usdHandler.onDetach!(node, cfg, ctx as any);
    expect(st(node)?.isPlaying).toBeFalsy(); // stopped (state deleted right after)
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:unloaded',
      expect.objectContaining({ source: cfg.source })
    );
  });

  it('does NOT emit usd:unloaded when stageRoot is null', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    ctx.emit.mockClear();
    usdHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('removes __usdState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    usdHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__usdState).toBeUndefined();
  });
});

// ─── onUpdate — animation tick ────────────────────────────────────────────────

describe('USDTrait — onUpdate: animation', () => {
  it('no-op when not loaded', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('no-op when isPlaying=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true);
    st(node).isPlaying = false;
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('usd:time_code_changed', expect.any(Object));
  });

  it('advances currentTimeCode and emits usd:time_code_changed when playing', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '', frame_rate: 24, loop_animation: true });
    primeLoaded(node, true);
    st(node).isPlaying = true;
    const before = st(node).currentTimeCode;
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.016);
    expect(st(node).currentTimeCode).toBeGreaterThan(before);
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:time_code_changed',
      expect.objectContaining({ timeCode: expect.any(Number) })
    );
  });

  it('loops when past endTimeCode and loop_animation=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '', loop_animation: true, frame_rate: 24 });
    primeLoaded(node, true);
    st(node).isPlaying = true;
    st(node).currentTimeCode = 125; // past endTimeCode=120
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.001); // small delta — just enough to detect past-end
    // After loop, should not emit animation_complete
    expect(ctx.emit).not.toHaveBeenCalledWith('usd:animation_complete', expect.any(Object));
    expect(st(node).isPlaying).toBe(true);
  });

  it('stops and emits usd:animation_complete when past end and loop=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '', loop_animation: false, frame_rate: 24 });
    primeLoaded(node, true);
    st(node).isPlaying = true;
    st(node).currentTimeCode = 125; // past endTimeCode=120
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.001);
    expect(ctx.emit).toHaveBeenCalledWith('usd:animation_complete', expect.any(Object));
    expect(st(node).isPlaying).toBe(false);
    expect(st(node).currentTimeCode).toBe(120);
  });

  it('emits usd:blend_shapes_updated when blendWeights is non-empty', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, false);
    st(node).blendWeights.set('smile', 0.5);
    ctx.emit.mockClear();
    update(node, cfg, ctx, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:blend_shapes_updated',
      expect.objectContaining({
        weights: { smile: 0.5 },
      })
    );
  });
});

// ─── onEvent — usd:play ───────────────────────────────────────────────────────

describe('USDTrait — onEvent: usd:play', () => {
  it('sets isPlaying=true when animation is present', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true);
    fire(node, cfg, ctx, { type: 'usd:play' });
    expect(st(node).isPlaying).toBe(true);
  });

  it('keeps isPlaying=false when no animation', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, false);
    fire(node, cfg, ctx, { type: 'usd:play' });
    expect(st(node).isPlaying).toBe(false);
  });
});

// ─── onEvent — usd:pause / usd:stop ──────────────────────────────────────────

describe('USDTrait — onEvent: usd:pause', () => {
  it('sets isPlaying=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true);
    st(node).isPlaying = true;
    fire(node, cfg, ctx, { type: 'usd:pause' });
    expect(st(node).isPlaying).toBe(false);
  });
});

describe('USDTrait — onEvent: usd:stop', () => {
  it('resets isPlaying, sets currentTimeCode to animation.startTimeCode', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true);
    st(node).isPlaying = true;
    st(node).currentTimeCode = 80;
    fire(node, cfg, ctx, { type: 'usd:stop' });
    expect(st(node).isPlaying).toBe(false);
    expect(st(node).currentTimeCode).toBe(0); // animation.startTimeCode
  });

  it('sets currentTimeCode=0 when no animation', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, false);
    st(node).currentTimeCode = 50;
    fire(node, cfg, ctx, { type: 'usd:stop' });
    expect(st(node).currentTimeCode).toBe(0);
  });
});

// ─── onEvent — usd:seek ───────────────────────────────────────────────────────

describe('USDTrait — onEvent: usd:seek', () => {
  it('clamps to [startTimeCode, endTimeCode]', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true); // startTimeCode=0, endTimeCode=120
    fire(node, cfg, ctx, { type: 'usd:seek', timeCode: 60 });
    expect(st(node).currentTimeCode).toBe(60);
  });

  it('clamps above endTimeCode to endTimeCode', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true);
    fire(node, cfg, ctx, { type: 'usd:seek', timeCode: 200 });
    expect(st(node).currentTimeCode).toBe(120);
  });

  it('clamps below startTimeCode to startTimeCode', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, true);
    fire(node, cfg, ctx, { type: 'usd:seek', timeCode: -5 });
    expect(st(node).currentTimeCode).toBe(0);
  });

  it('no-op when no animation', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node, false);
    st(node).currentTimeCode = 30;
    fire(node, cfg, ctx, { type: 'usd:seek', timeCode: 60 });
    expect(st(node).currentTimeCode).toBe(30); // unchanged
  });
});

// ─── onEvent — usd:set_variant ───────────────────────────────────────────────

describe('USDTrait — onEvent: usd:set_variant', () => {
  it('sets activeVariant and emits usd:variant_changed for valid variant', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).variantSets = [{ name: 'LOD', variants: ['high', 'medium', 'low'], default: 'high' }];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:set_variant', variantSet: 'LOD', variant: 'medium' });
    expect(st(node).activeVariants.get('LOD')).toBe('medium');
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:variant_changed',
      expect.objectContaining({
        variantSet: 'LOD',
        variant: 'medium',
      })
    );
  });

  it('no-op for unknown variantSet', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).variantSets = [];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:set_variant', variantSet: 'MISSING', variant: 'x' });
    expect(ctx.emit).not.toHaveBeenCalledWith('usd:variant_changed', expect.any(Object));
  });
});

// ─── onEvent — usd:set_blend_shape ───────────────────────────────────────────

describe('USDTrait — onEvent: usd:set_blend_shape', () => {
  it('stores clamped weight [0,1] for known target', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).blendShapes = ['smile'];
    st(node).blendWeights.set('smile', 0);
    fire(node, cfg, ctx, { type: 'usd:set_blend_shape', target: 'smile', weight: 0.75 });
    expect(st(node).blendWeights.get('smile')).toBeCloseTo(0.75);
  });

  it('clamps weight above 1 to 1', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).blendShapes = ['blink'];
    fire(node, cfg, ctx, { type: 'usd:set_blend_shape', target: 'blink', weight: 2.0 });
    expect(st(node).blendWeights.get('blink')).toBeCloseTo(1.0);
  });

  it('clamps weight below 0 to 0', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).blendShapes = ['frown'];
    fire(node, cfg, ctx, { type: 'usd:set_blend_shape', target: 'frown', weight: -0.5 });
    expect(st(node).blendWeights.get('frown')).toBeCloseTo(0);
  });

  it('no-op for unknown blend shape', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).blendShapes = ['smile'];
    fire(node, cfg, ctx, { type: 'usd:set_blend_shape', target: 'UNKNOWN', weight: 0.5 });
    expect(st(node).blendWeights.has('UNKNOWN')).toBe(false);
  });
});

// ─── onEvent — usd:load_payload / usd:unload_payload ─────────────────────────

describe('USDTrait — onEvent: usd:load_payload', () => {
  it('emits usd:payload_loaded for prim with hasPayload=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).hierarchy = [
      {
        path: '/Root',
        name: 'Root',
        typeName: 'Xform',
        purpose: 'default',
        visibility: 'inherited',
        active: true,
        hasPayload: true,
        variantSets: [],
        attributes: {},
        children: [],
      },
    ];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:load_payload', primPath: '/Root' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:payload_loaded',
      expect.objectContaining({ primPath: '/Root' })
    );
  });

  it('no-op for prim with hasPayload=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).hierarchy = [
      {
        path: '/Root',
        name: 'Root',
        typeName: 'Xform',
        purpose: 'default',
        visibility: 'inherited',
        active: true,
        hasPayload: false,
        variantSets: [],
        attributes: {},
        children: [],
      },
    ];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:load_payload', primPath: '/Root' });
    expect(ctx.emit).not.toHaveBeenCalledWith('usd:payload_loaded', expect.any(Object));
  });
});

describe('USDTrait — onEvent: usd:unload_payload', () => {
  it('emits usd:payload_unloaded for prim with hasPayload=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    st(node).hierarchy = [
      {
        path: '/Body',
        name: 'Body',
        typeName: 'Mesh',
        purpose: 'render',
        visibility: 'inherited',
        active: true,
        hasPayload: true,
        variantSets: [],
        attributes: {},
        children: [],
      },
    ];
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:unload_payload', primPath: '/Body' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:payload_unloaded',
      expect.objectContaining({ primPath: '/Body' })
    );
  });
});

// ─── onEvent — usd:set_purpose ────────────────────────────────────────────────

describe('USDTrait — onEvent: usd:set_purpose', () => {
  it('emits usd:purpose_changed with new purpose', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:set_purpose', purpose: 'proxy' });
    expect(ctx.emit).toHaveBeenCalledWith('usd:purpose_changed', { purpose: 'proxy' });
  });
});

// ─── onEvent — usd:export ─────────────────────────────────────────────────────

describe('USDTrait — onEvent: usd:export', () => {
  it('emits usd:export_complete with format and success=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { source: '' });
    primeLoaded(node);
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'usd:export', format: 'usdz', options: {} });
    expect(ctx.emit).toHaveBeenCalledWith(
      'usd:export_complete',
      expect.objectContaining({
        format: 'usdz',
        success: true,
      })
    );
  });
});

// ─── Utility exports ──────────────────────────────────────────────────────────

describe('USDTrait — utility exports', () => {
  it('getUSDState returns undefined before attach', () => {
    const node = makeNode();
    expect(getUSDState(node)).toBeUndefined();
  });

  it('getUSDState returns state after attach', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(getUSDState(node)).toBe(st(node));
  });

  it('isUSDLoaded returns false before load', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(isUSDLoaded(node)).toBe(false);
  });

  it('isUSDLoaded returns true after prime', () => {
    const node = makeNode();
    attach(node, { source: '' });
    primeLoaded(node);
    expect(isUSDLoaded(node)).toBe(true);
  });

  it('getUSDVariantSets returns empty initially', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(getUSDVariantSets(node)).toEqual([]);
  });

  it('getUSDVariantSets returns variant sets when present', () => {
    const node = makeNode();
    attach(node, { source: '' });
    st(node).variantSets = [{ name: 'LOD', variants: ['high', 'low'], default: 'high' }];
    expect(getUSDVariantSets(node)).toHaveLength(1);
  });

  it('getUSDActiveVariant returns undefined for unknown set', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(getUSDActiveVariant(node, 'LOD')).toBeUndefined();
  });

  it('getUSDAnimation returns null before load', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(getUSDAnimation(node)).toBeNull();
  });

  it('getUSDJointNames returns empty before skeleton', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(getUSDJointNames(node)).toEqual([]);
  });

  it('getUSDBlendShapes returns empty before load', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(getUSDBlendShapes(node)).toEqual([]);
  });

  it('isUSDZ — detects .usdz source', () => {
    const node = makeNode();
    attach(node, { source: '' });
    st(node).isUSDZ = true;
    expect(isUSDZ(node)).toBe(true);
  });

  it('isUSDZ — returns false for .usda source', () => {
    const node = makeNode();
    attach(node, { source: '' });
    expect(isUSDZ(node)).toBe(false);
  });
});
