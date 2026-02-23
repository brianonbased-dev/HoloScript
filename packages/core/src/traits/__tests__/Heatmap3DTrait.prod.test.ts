/**
 * Heatmap3DTrait — Production Test Suite
 *
 * heatmap3dHandler stores state on node.__heatmap3dState.
 *
 * Key behaviours:
 * 1. defaultConfig — all 12 fields
 * 2. onAttach — state init (isLoaded=false, animationProgress=1), heatmap_create,
 *               heatmap_load_data when data_source, heatmap_show_legend when legend=true
 * 3. onDetach — heatmap_destroy only when textureHandle present; removes state
 * 4. onUpdate — animated+animationProgress<1+previousData: advances progress, renders interpolated or final;
 *               needsUpdate=true (non-animated path): heatmap_render + on_heatmap_update
 * 5. onEvent — heatmap_data_loaded: saves data, auto_range min/max, animated previousData copy;
 *              heatmap_set_data: same; heatmap_add_point: push+auto_range+needsUpdate;
 *              heatmap_set_range: overrides min/max, legend update; heatmap_set_colormap;
 *              heatmap_clear; heatmap_query info snapshot
 */
import { describe, it, expect, vi } from 'vitest';
import { heatmap3dHandler } from '../Heatmap3DTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'hm_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof heatmap3dHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...heatmap3dHandler.defaultConfig!, ...cfg };
  heatmap3dHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('heatmap3dHandler.defaultConfig', () => {
  const d = heatmap3dHandler.defaultConfig!;
  it('data_source=""', () => expect(d.data_source).toBe(''));
  it('color_map=viridis', () => expect(d.color_map).toBe('viridis'));
  it('opacity=0.7', () => expect(d.opacity).toBeCloseTo(0.7));
  it('resolution=32', () => expect(d.resolution).toBe(32));
  it('interpolation=linear', () => expect(d.interpolation).toBe('linear'));
  it('range={min:0,max:1}', () => expect(d.range).toEqual({ min: 0, max: 1 }));
  it('auto_range=true', () => expect(d.auto_range).toBe(true));
  it('animated=false', () => expect(d.animated).toBe(false));
  it('animation_duration=500', () => expect(d.animation_duration).toBe(500));
  it('legend=true', () => expect(d.legend).toBe(true));
  it('legend_position=bottom-right', () => expect(d.legend_position).toBe('bottom-right'));
  it('height_extrusion=0', () => expect(d.height_extrusion).toBe(0));
});

// ─── onAttach ────────────────────────────────────────────────────────────────

describe('heatmap3dHandler.onAttach', () => {
  it('initialises __heatmap3dState', () => {
    const { node } = attach();
    expect((node as any).__heatmap3dState).toBeDefined();
  });

  it('isLoaded=false, animationProgress=1, needsUpdate=false, dataPoints=[]', () => {
    const { node } = attach();
    const s = (node as any).__heatmap3dState;
    expect(s.isLoaded).toBe(false);
    expect(s.animationProgress).toBe(1);
    expect(s.needsUpdate).toBe(false);
    expect(s.dataPoints).toEqual([]);
  });

  it('minValue/maxValue seeded from config.range', () => {
    const { node } = attach({ range: { min: -5, max: 10 } });
    const s = (node as any).__heatmap3dState;
    expect(s.minValue).toBe(-5);
    expect(s.maxValue).toBe(10);
  });

  it('emits heatmap_create with colorMap, opacity, resolution, interpolation, heightExtrusion', () => {
    const { ctx } = attach({ color_map: 'plasma', opacity: 0.5, resolution: 64, interpolation: 'cubic', height_extrusion: 2 });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'heatmap_create');
    expect(call).toBeDefined();
    expect(call![1].colorMap).toBe('plasma');
    expect(call![1].opacity).toBe(0.5);
    expect(call![1].resolution).toBe(64);
    expect(call![1].interpolation).toBe('cubic');
    expect(call![1].heightExtrusion).toBe(2);
  });

  it('emits heatmap_load_data when data_source is set', () => {
    const { ctx } = attach({ data_source: 'https://example.com/data.json' });
    expect(ctx.emit).toHaveBeenCalledWith('heatmap_load_data', expect.objectContaining({ source: 'https://example.com/data.json' }));
  });

  it('does NOT emit heatmap_load_data when data_source is empty', () => {
    const { ctx } = attach({ data_source: '' });
    expect(ctx.emit).not.toHaveBeenCalledWith('heatmap_load_data', expect.anything());
  });

  it('emits heatmap_show_legend when legend=true', () => {
    const { ctx } = attach({ legend: true, legend_position: 'top-left', color_map: 'turbo', range: { min: 0, max: 100 } });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'heatmap_show_legend');
    expect(call).toBeDefined();
    expect(call![1].position).toBe('top-left');
    expect(call![1].colorMap).toBe('turbo');
  });

  it('does NOT emit heatmap_show_legend when legend=false', () => {
    const { ctx } = attach({ legend: false });
    expect(ctx.emit).not.toHaveBeenCalledWith('heatmap_show_legend', expect.anything());
  });
});

// ─── onDetach ────────────────────────────────────────────────────────────────

describe('heatmap3dHandler.onDetach', () => {
  it('emits heatmap_destroy when textureHandle is set', () => {
    const { node, ctx, config } = attach();
    (node as any).__heatmap3dState.textureHandle = 'some_handle';
    ctx.emit.mockClear();
    heatmap3dHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('heatmap_destroy', expect.any(Object));
  });

  it('does NOT emit heatmap_destroy when textureHandle is null', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    heatmap3dHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('heatmap_destroy', expect.anything());
  });

  it('removes __heatmap3dState', () => {
    const { node, ctx, config } = attach();
    heatmap3dHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__heatmap3dState).toBeUndefined();
  });
});

// ─── onUpdate — needsUpdate path ──────────────────────────────────────────────

describe('heatmap3dHandler.onUpdate — needsUpdate path', () => {
  it('emits heatmap_render + on_heatmap_update when needsUpdate=true', () => {
    const { node, ctx, config } = attach({ animated: false });
    const state = (node as any).__heatmap3dState;
    state.needsUpdate = true;
    state.dataPoints = [{ position: [0, 0, 0], value: 0.5 }];
    ctx.emit.mockClear();
    heatmap3dHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).toHaveBeenCalledWith('heatmap_render', expect.objectContaining({ data: state.dataPoints }));
    expect(ctx.emit).toHaveBeenCalledWith('on_heatmap_update', expect.objectContaining({ pointCount: 1 }));
  });

  it('resets needsUpdate=false after render', () => {
    const { node, ctx, config } = attach({ animated: false });
    (node as any).__heatmap3dState.needsUpdate = true;
    heatmap3dHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node as any).__heatmap3dState.needsUpdate).toBe(false);
  });

  it('no-op when needsUpdate=false and no animation in progress', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    heatmap3dHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
});

// ─── onUpdate — animation path ────────────────────────────────────────────────

describe('heatmap3dHandler.onUpdate — animation path', () => {
  it('advances animationProgress each delta (duration=1000ms → 0.016/1=0.016 per tick)', () => {
    const { node, ctx, config } = attach({ animated: true, animation_duration: 1000 });
    const state = (node as any).__heatmap3dState;
    state.previousData = [{ position: [0, 0, 0] as [number, number, number], value: 0 }];
    state.dataPoints = [{ position: [1, 0, 0] as [number, number, number], value: 1 }];
    state.animationProgress = 0;
    ctx.emit.mockClear();
    heatmap3dHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.animationProgress).toBeCloseTo(0.016, 4);
  });

  it('emits heatmap_render with interpolated data during animation', () => {
    const { node, ctx, config } = attach({ animated: true, animation_duration: 1000 });
    const state = (node as any).__heatmap3dState;
    state.previousData = [{ position: [0, 0, 0] as [number, number, number], value: 0 }];
    state.dataPoints = [{ position: [2, 0, 0] as [number, number, number], value: 1 }];
    state.animationProgress = 0.4;
    ctx.emit.mockClear();
    heatmap3dHandler.onUpdate!(node as any, config, ctx as any, 0.1); // +0.1 → 0.5
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'heatmap_render');
    expect(call).toBeDefined();
    // At t=0.5: position.x = 0 + (2-0)*0.5 = 1, value = 0 + (1-0)*0.5 = 0.5
    expect(call![1].data[0].position[0]).toBeCloseTo(1, 1);
    expect(call![1].data[0].value).toBeCloseTo(0.5, 1);
  });

  it('clears previousData and emits final render when animationProgress reaches 1', () => {
    const { node, ctx, config } = attach({ animated: true, animation_duration: 1000 });
    const state = (node as any).__heatmap3dState;
    state.previousData = [{ position: [0, 0, 0] as [number, number, number], value: 0 }];
    state.dataPoints = [{ position: [1, 0, 0] as [number, number, number], value: 1 }];
    state.animationProgress = 0.95;
    ctx.emit.mockClear();
    heatmap3dHandler.onUpdate!(node as any, config, ctx as any, 0.1); // would push past 1
    expect(state.animationProgress).toBe(1);
    expect(state.previousData).toBeNull();
    expect(ctx.emit).toHaveBeenCalledWith('heatmap_render', expect.any(Object));
  });
});

// ─── onEvent — heatmap_data_loaded ───────────────────────────────────────────

describe('heatmap3dHandler.onEvent — heatmap_data_loaded', () => {
  const pts = [
    { position: [0, 0, 0] as [number, number, number], value: 0.1 },
    { position: [1, 0, 0] as [number, number, number], value: 0.9 },
  ];

  it('stores dataPoints and sets isLoaded=true', () => {
    const { node, ctx, config } = attach({ auto_range: false });
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_data_loaded', data: pts });
    const s = (node as any).__heatmap3dState;
    expect(s.dataPoints).toEqual(pts);
    expect(s.isLoaded).toBe(true);
  });

  it('auto_range calculates min/max from data values', () => {
    const { node, ctx, config } = attach({ auto_range: true });
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_data_loaded', data: pts });
    const s = (node as any).__heatmap3dState;
    expect(s.minValue).toBeCloseTo(0.1, 4);
    expect(s.maxValue).toBeCloseTo(0.9, 4);
  });

  it('sets needsUpdate=true', () => {
    const { node, ctx, config } = attach({ auto_range: false });
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_data_loaded', data: pts });
    expect((node as any).__heatmap3dState.needsUpdate).toBe(true);
  });

  it('animated=true + existing data → saves previousData and resets animationProgress=0', () => {
    const { node, ctx, config } = attach({ animated: true });
    const state = (node as any).__heatmap3dState;
    state.dataPoints = [{ position: [0, 0, 0] as [number, number, number], value: 0.5 }];
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_data_loaded', data: pts });
    expect(state.previousData).toBeDefined();
    expect(state.animationProgress).toBe(0);
  });
});

// ─── onEvent — heatmap_add_point ─────────────────────────────────────────────

describe('heatmap3dHandler.onEvent — heatmap_add_point', () => {
  it('appends point to dataPoints', () => {
    const { node, ctx, config } = attach({ auto_range: false });
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, {
      type: 'heatmap_add_point',
      point: { position: [5, 5, 5], value: 0.75 },
    });
    expect((node as any).__heatmap3dState.dataPoints).toHaveLength(1);
    expect((node as any).__heatmap3dState.dataPoints[0].value).toBeCloseTo(0.75, 4);
  });

  it('auto_range updates min/max from new point', () => {
    const { node, ctx, config } = attach({ auto_range: true, range: { min: 0, max: 1 } });
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, {
      type: 'heatmap_add_point',
      point: { position: [0, 0, 0], value: 2.5 },
    });
    expect((node as any).__heatmap3dState.maxValue).toBe(2.5);
  });
});

// ─── onEvent — heatmap_set_range ─────────────────────────────────────────────

describe('heatmap3dHandler.onEvent — heatmap_set_range', () => {
  it('overrides min/max and sets needsUpdate=true', () => {
    const { node, ctx, config } = attach();
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_set_range', min: -10, max: 100 });
    const s = (node as any).__heatmap3dState;
    expect(s.minValue).toBe(-10);
    expect(s.maxValue).toBe(100);
    expect(s.needsUpdate).toBe(true);
  });

  it('emits heatmap_update_legend when legend=true', () => {
    const { node, ctx, config } = attach({ legend: true });
    ctx.emit.mockClear();
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_set_range', min: 0, max: 50 });
    expect(ctx.emit).toHaveBeenCalledWith('heatmap_update_legend', expect.objectContaining({
      range: { min: 0, max: 50 },
    }));
  });

  it('does NOT emit heatmap_update_legend when legend=false', () => {
    const { node, ctx, config } = attach({ legend: false });
    ctx.emit.mockClear();
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_set_range', min: 0, max: 50 });
    expect(ctx.emit).not.toHaveBeenCalledWith('heatmap_update_legend', expect.anything());
  });
});

// ─── onEvent — other ─────────────────────────────────────────────────────────

describe('heatmap3dHandler.onEvent — other events', () => {
  it('heatmap_set_colormap emits heatmap_change_colormap + sets needsUpdate', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_set_colormap', colorMap: 'jet' });
    expect(ctx.emit).toHaveBeenCalledWith('heatmap_change_colormap', expect.objectContaining({ colorMap: 'jet' }));
    expect((node as any).__heatmap3dState.needsUpdate).toBe(true);
  });

  it('heatmap_clear empties dataPoints and previousData, sets needsUpdate', () => {
    const { node, ctx, config } = attach();
    const state = (node as any).__heatmap3dState;
    state.dataPoints = [{ position: [0, 0, 0], value: 1 }];
    state.previousData = state.dataPoints;
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_clear' });
    expect(state.dataPoints).toEqual([]);
    expect(state.previousData).toBeNull();
    expect(state.needsUpdate).toBe(true);
  });

  it('heatmap_query emits heatmap_info snapshot', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    heatmap3dHandler.onEvent!(node as any, config, ctx as any, { type: 'heatmap_query', queryId: 'q1' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'heatmap_info');
    expect(call).toBeDefined();
    expect(call![1].queryId).toBe('q1');
    expect(call![1].isLoaded).toBe(false);
    expect(call![1].pointCount).toBe(0);
  });
});
