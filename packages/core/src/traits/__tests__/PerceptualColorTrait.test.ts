import { beforeEach, describe, expect, it } from 'vitest';
import { perceptualColorHandler } from '../PerceptualColorTrait';
import {
  attachTrait,
  createMockContext,
  createMockNode,
  getEventCount,
  getLastEvent,
  sendEvent,
} from './traitTestHelpers';

describe('PerceptualColorTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('pc');
    ctx = createMockContext();
  });

  it('emits a compiler-ready color pass on attach', () => {
    attachTrait(perceptualColorHandler, node, {}, ctx);

    const state = node.__perceptualColorState as Record<string, unknown>;
    const event = getLastEvent(ctx, 'perceptual_color_apply') as Record<string, unknown>;

    expect(state.revisions).toBe(1);
    expect(event.colorMap).toBe('viridis');
    expect((event.compilerColorPass as Record<string, unknown>).source).toBe('color_map');
    expect(getEventCount(ctx, 'on_perceptual_color_change')).toBe(1);
  });

  it('recomputes from event overrides', () => {
    attachTrait(perceptualColorHandler, node, {}, ctx);

    sendEvent(perceptualColorHandler, node, {}, ctx, {
      type: 'perceptual_color_recompute',
      mode: 'palette',
      palette: ['#000000', '#FFFFFF'],
      steps: 3,
      neutral_axis: true,
    });

    const event = getLastEvent(ctx, 'perceptual_color_apply') as Record<string, unknown>;
    const pass = event.compilerColorPass as {
      source: string;
      palette?: { nearestNeutral?: string[] };
    };

    expect(event.revision).toBe(2);
    expect(pass.source).toBe('palette');
    expect(pass.palette?.nearestNeutral).toHaveLength(2);
  });

  it('answers query events with the last applied state', () => {
    attachTrait(perceptualColorHandler, node, {}, ctx);
    sendEvent(perceptualColorHandler, node, {}, ctx, {
      type: 'perceptual_color_query',
      queryId: 'q1',
    });

    const info = getLastEvent(ctx, 'perceptual_color_info') as Record<string, unknown>;
    expect(info.queryId).toBe('q1');
    expect(info.revisions).toBe(1);
    expect(info.lastApplied).toBeDefined();
  });

  it('cleans up state on detach', () => {
    attachTrait(perceptualColorHandler, node, {}, ctx);
    perceptualColorHandler.onDetach?.(
      node as never,
      perceptualColorHandler.defaultConfig!,
      ctx as never
    );

    expect(node.__perceptualColorState).toBeUndefined();
    expect(getEventCount(ctx, 'perceptual_color_detach')).toBe(1);
  });
});
