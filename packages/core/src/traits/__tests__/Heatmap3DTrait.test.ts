import { describe, it, expect, beforeEach } from 'vitest';
import { heatmap3dHandler } from '../Heatmap3DTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
} from './traitTestHelpers';

describe('Heatmap3DTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    data_source: 'data.json',
    color_map: 'viridis' as const,
    opacity: 0.7,
    resolution: 32,
    interpolation: 'linear' as const,
    range: { min: 0, max: 1 },
    auto_range: true,
    animated: false,
    animation_duration: 500,
    legend: true,
    legend_position: 'bottom-right' as const,
    height_extrusion: 0,
  };

  beforeEach(() => {
    node = createMockNode('hm');
    ctx = createMockContext();
    attachTrait(heatmap3dHandler, node, cfg, ctx);
  });

  it('creates renderer and loads data on attach', () => {
    expect(getEventCount(ctx, 'heatmap_create')).toBe(1);
    expect(getEventCount(ctx, 'heatmap_load_data')).toBe(1);
    expect(getEventCount(ctx, 'heatmap_show_legend')).toBe(1);
  });

  it('data loaded with auto range', () => {
    const data = [
      { position: [0, 0, 0] as [number, number, number], value: 10 },
      { position: [1, 0, 0] as [number, number, number], value: 50 },
    ];
    sendEvent(heatmap3dHandler, node, cfg, ctx, { type: 'heatmap_data_loaded', data });
    const s = (node as any).__heatmap3dState;
    expect(s.isLoaded).toBe(true);
    expect(s.minValue).toBe(10);
    expect(s.maxValue).toBe(50);
  });

  it('update renders when needsUpdate', () => {
    sendEvent(heatmap3dHandler, node, cfg, ctx, {
      type: 'heatmap_data_loaded',
      data: [{ position: [0, 0, 0], value: 1 }],
    });
    updateTrait(heatmap3dHandler, node, cfg, ctx, 0.016);
    expect(getEventCount(ctx, 'heatmap_render')).toBe(1);
    expect(getEventCount(ctx, 'on_heatmap_update')).toBe(1);
  });

  it('add point expands range', () => {
    sendEvent(heatmap3dHandler, node, cfg, ctx, {
      type: 'heatmap_add_point',
      point: { position: [1, 1, 1], value: 100 },
    });
    expect((node as any).__heatmap3dState.maxValue).toBe(100);
  });

  it('set range manually', () => {
    sendEvent(heatmap3dHandler, node, cfg, ctx, { type: 'heatmap_set_range', min: -5, max: 5 });
    expect((node as any).__heatmap3dState.minValue).toBe(-5);
    expect(getEventCount(ctx, 'heatmap_update_legend')).toBe(1);
  });

  it('set colormap emits change', () => {
    sendEvent(heatmap3dHandler, node, cfg, ctx, {
      type: 'heatmap_set_colormap',
      colorMap: 'plasma',
    });
    expect(getEventCount(ctx, 'heatmap_change_colormap')).toBe(1);
  });

  it('clear empties data', () => {
    sendEvent(heatmap3dHandler, node, cfg, ctx, {
      type: 'heatmap_data_loaded',
      data: [{ position: [0, 0, 0], value: 1 }],
    });
    sendEvent(heatmap3dHandler, node, cfg, ctx, { type: 'heatmap_clear' });
    expect((node as any).__heatmap3dState.dataPoints.length).toBe(0);
  });

  it('query emits info', () => {
    sendEvent(heatmap3dHandler, node, cfg, ctx, { type: 'heatmap_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'heatmap_info')).toBe(1);
  });

  it('detach destroys texture', () => {
    (node as any).__heatmap3dState.textureHandle = 'tex1';
    heatmap3dHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect(getEventCount(ctx, 'heatmap_destroy')).toBe(1);
    expect((node as any).__heatmap3dState).toBeUndefined();
  });
});
