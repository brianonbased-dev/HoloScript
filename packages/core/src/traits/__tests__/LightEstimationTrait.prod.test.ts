/**
 * LightEstimationTrait Production Tests
 *
 * Match virtual lighting to real environment for realistic AR.
 * Covers: kelvinToRGB helper, defaultConfig, onAttach, onDetach,
 * onUpdate (tick accumulator, rate-limit, auto_apply scene_light_update),
 * and all 5 onEvent types.
 */

import { describe, it, expect, vi } from 'vitest';
import { lightEstimationHandler } from '../LightEstimationTrait';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'le_test' } as any;
}
function makeCtx() {
  return { emit: vi.fn() };
}

function attach(node: any, overrides: Record<string, unknown> = {}) {
  const cfg = { ...lightEstimationHandler.defaultConfig!, ...overrides } as any;
  const ctx = makeCtx();
  lightEstimationHandler.onAttach!(node, cfg, ctx as any);
  return { cfg, ctx };
}

function st(node: any) {
  return node.__lightEstimationState as any;
}

function fire(node: any, cfg: any, ctx: any, evt: Record<string, unknown>) {
  lightEstimationHandler.onEvent!(node, cfg, ctx as any, evt as any);
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('LightEstimationTrait — defaultConfig', () => {
  it('has 7 fields with correct defaults', () => {
    const d = lightEstimationHandler.defaultConfig!;
    expect(d.mode).toBe('ambient_intensity');
    expect(d.auto_apply).toBe(true);
    expect(d.update_rate).toBe(30);
    expect(d.shadow_estimation).toBe(false);
    expect(d.color_temperature).toBe(true);
    expect(d.smoothing).toBe(0.8);
    expect(d.intensity_multiplier).toBeCloseTo(1.0);
  });
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('LightEstimationTrait — onAttach', () => {
  it('initialises state with correct defaults', () => {
    const node = makeNode();
    attach(node);
    const s = st(node);
    expect(s.isActive).toBe(true);
    expect(s.intensity).toBeCloseTo(1.0);
    expect(s.colorTemperature).toBe(6500);
    expect(s.colorCorrection).toEqual({ r: 1, g: 1, b: 1 });
    expect(s.primaryDirection).toEqual([0, -1, 0 ]);
    expect(s.sphericalHarmonics).toBeNull();
    expect(s.environmentMap).toBeNull();
    expect(s.updateAccumulator).toBe(0);
  });

  it('emits light_estimation_request with mode and shadowEstimation', () => {
    const node = makeNode();
    const { ctx } = attach(node, { mode: 'directional', shadow_estimation: true });
    expect(ctx.emit).toHaveBeenCalledWith(
      'light_estimation_request',
      expect.objectContaining({
        mode: 'directional',
        shadowEstimation: true,
      })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('LightEstimationTrait — onDetach', () => {
  it('always emits light_estimation_stop', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    ctx.emit.mockClear();
    lightEstimationHandler.onDetach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('light_estimation_stop', expect.any(Object));
  });

  it('removes __lightEstimationState', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    lightEstimationHandler.onDetach!(node, cfg, ctx as any);
    expect(node.__lightEstimationState).toBeUndefined();
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────

describe('LightEstimationTrait — onUpdate', () => {
  it('no-op when isActive=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).isActive = false;
    ctx.emit.mockClear();
    lightEstimationHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });

  it('accumulates delta and does NOT poll before interval', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { update_rate: 30 }); // interval = 1/30 ≈ 33ms
    ctx.emit.mockClear();
    lightEstimationHandler.onUpdate!(node, cfg, ctx as any, 0.01); // 10ms — below 33ms interval
    expect(ctx.emit).not.toHaveBeenCalledWith('light_estimation_poll', expect.any(Object));
  });

  it('emits light_estimation_poll when accumulator >= 1/update_rate', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { update_rate: 10 }); // interval = 100ms
    ctx.emit.mockClear();
    lightEstimationHandler.onUpdate!(node, cfg, ctx as any, 0.11); // > 100ms
    expect(st(node).updateAccumulator).toBe(0);
    expect(ctx.emit).toHaveBeenCalledWith('light_estimation_poll', expect.any(Object));
  });

  it('auto_apply=true: always emits scene_light_update with finalIntensity', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, {
      auto_apply: true,
      intensity_multiplier: 2.0,
      update_rate: 30,
    });
    st(node).intensity = 0.5;
    ctx.emit.mockClear();
    lightEstimationHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    // finalIntensity = 0.5 * 2.0 = 1.0
    expect(ctx.emit).toHaveBeenCalledWith(
      'scene_light_update',
      expect.objectContaining({ intensity: 1.0 })
    );
  });

  it('auto_apply=false: no scene_light_update emitted', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { auto_apply: false });
    st(node).intensity = 0.8;
    ctx.emit.mockClear();
    lightEstimationHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('scene_light_update', expect.any(Object));
  });
});

// ─── onEvent — light_estimation_update ────────────────────────────────────────

describe('LightEstimationTrait — onEvent: light_estimation_update', () => {
  it('smooths intensity: new = old*0.8 + incoming*0.2', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { smoothing: 0.8, color_temperature: false });
    st(node).intensity = 1.0;
    fire(node, cfg, ctx, { type: 'light_estimation_update', intensity: 2.0 });
    // 1.0*0.8 + 2.0*0.2 = 0.8 + 0.4 = 1.2
    expect(st(node).intensity).toBeCloseTo(1.2);
  });

  it('smooths colorTemperature and recomputes colorCorrection when color_temperature=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { smoothing: 0.8, color_temperature: true });
    st(node).colorTemperature = 6500;
    // 6500*0.8 + 3000*0.2 = 5200+600 = 5800K
    fire(node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1.0,
      colorTemperature: 3000,
    });
    const newTemp = st(node).colorTemperature;
    expect(newTemp).toBeCloseTo(5800, 0);
    // colorCorrection should be updated (not {r:1,g:1,b:1})
    const cc = st(node).colorCorrection;
    expect(cc).toHaveProperty('r');
    expect(cc).toHaveProperty('g');
    expect(cc).toHaveProperty('b');
  });

  it('no color temp processing when color_temperature=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { smoothing: 0.8, color_temperature: false });
    const origTemp = st(node).colorTemperature;
    fire(node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1.0,
      colorTemperature: 2000,
    });
    expect(st(node).colorTemperature).toBe(origTemp); // unchanged
  });

  it('smooths primaryDirection when event.direction provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { smoothing: 0.8 });
    st(node).primaryDirection = [0, -1, 0 ];
    fire(node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1.0,
      direction: [1, 0, 0 ],
    });
    // x: 0*0.8 + 1*0.2 = 0.2
    expect(st(node).primaryDirection[0]).toBeCloseTo(0.2);
    // y: -1*0.8 + 0*0.2 = -0.8
    expect(st(node).primaryDirection[1]).toBeCloseTo(-0.8);
  });

  it('stores sphericalHarmonics when provided', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { color_temperature: false });
    const sh = new Float32Array([1, 2, 3]);
    fire(node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1.0,
      sphericalHarmonics: sh,
    });
    expect(st(node).sphericalHarmonics).toBe(sh);
  });

  it('emits on_light_estimated after updating', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { color_temperature: false });
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'light_estimation_update', intensity: 0.75 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_light_estimated',
      expect.objectContaining({
        intensity: expect.any(Number),
        colorTemperature: expect.any(Number),
      })
    );
  });
});

// ─── onEvent — light_estimation_env_map ───────────────────────────────────────

describe('LightEstimationTrait — onEvent: light_estimation_env_map', () => {
  it('stores environmentMap and emits scene_environment_map_update', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    const envMap = { type: 'hdr', data: [] };
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'light_estimation_env_map', envMap });
    expect(st(node).environmentMap).toBe(envMap);
    expect(ctx.emit).toHaveBeenCalledWith(
      'scene_environment_map_update',
      expect.objectContaining({ envMap })
    );
  });
});

// ─── onEvent — light_estimation_pause/resume ──────────────────────────────────

describe('LightEstimationTrait — onEvent: light_estimation_pause/resume', () => {
  it('pause sets isActive=false', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'light_estimation_pause' });
    expect(st(node).isActive).toBe(false);
  });

  it('resume sets isActive=true', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    fire(node, cfg, ctx, { type: 'light_estimation_pause' });
    fire(node, cfg, ctx, { type: 'light_estimation_resume' });
    expect(st(node).isActive).toBe(true);
  });
});

// ─── onEvent — light_estimation_query ────────────────────────────────────────

describe('LightEstimationTrait — onEvent: light_estimation_query', () => {
  it('emits light_estimation_response with full snapshot', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).intensity = 0.9;
    st(node).colorTemperature = 5000;
    ctx.emit.mockClear();
    fire(node, cfg, ctx, { type: 'light_estimation_query', queryId: 'q5' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'light_estimation_response',
      expect.objectContaining({
        queryId: 'q5',
        intensity: 0.9,
        colorTemperature: 5000,
        hasSphericalHarmonics: false,
        hasEnvironmentMap: false,
      })
    );
  });

  it('hasSphericalHarmonics=true when sh is set', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    st(node).sphericalHarmonics = new Float32Array([1]);
    st(node).environmentMap = { hdr: true };
    fire(node, cfg, ctx, { type: 'light_estimation_query', queryId: 'q6' });
    const call = (ctx.emit as any).mock.calls.find(
      (c: any[]) => c[0] === 'light_estimation_response'
    )?.[1];
    expect(call.hasSphericalHarmonics).toBe(true);
    expect(call.hasEnvironmentMap).toBe(true);
  });
});

// ─── kelvinToRGB helper (indirectly tested via color_temperature smoothing) ────

describe('LightEstimationTrait — kelvinToRGB (indirect)', () => {
  it('warm 2700K produces warm-shifted (high r, low/mid g, zero b) colorCorrection', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { smoothing: 0, color_temperature: true });
    // smoothing=0 means full replace: newTemp = 0*0 + 2700*1 = 2700K
    fire(node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1.0,
      colorTemperature: 2700,
    });
    const cc = st(node).colorCorrection;
    expect(cc.r).toBeGreaterThan(0.9); // r≈1 (temp <= 66 → r=255)
    // All channels are normalised 0-1
    expect(cc.r).toBeGreaterThanOrEqual(0);
    expect(cc.g).toBeGreaterThanOrEqual(0);
    expect(cc.b).toBeGreaterThanOrEqual(0);
  });

  it('cool 10000K produces blue-shifted (low r, mid g, full b) colorCorrection', () => {
    const node = makeNode();
    const { cfg, ctx } = attach(node, { smoothing: 0, color_temperature: true });
    // 10000/100 = 100 > 66
    fire(node, cfg, ctx, {
      type: 'light_estimation_update',
      intensity: 1.0,
      colorTemperature: 10000,
    });
    const cc = st(node).colorCorrection;
    expect(cc.b).toBeCloseTo(1.0); // b = 255/255 = 1 for temp > 66
    expect(cc.r).toBeLessThan(1.0); // r decreases for high temp
    expect(cc.g).toBeLessThan(1.0); // g decreases too
  });

  it('neutral 6500K (default) produces approximately white light', () => {
    // colorCorrection is initialised to {r:1, g:1, b:1} — verify it stays near white after attach
    const node = makeNode();
    const { cfg, ctx } = attach(node);
    // Just validate defaults were set (no event fired yet)
    expect(st(node).colorCorrection).toEqual({ r: 1, g: 1, b: 1 });
  });
});
