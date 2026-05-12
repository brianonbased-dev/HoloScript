/**
 * MultiviewGaussianRendererTrait — tests
 */
import { describe, it, expect } from 'vitest';
import {
  MultiviewGaussianRendererTrait,
  DEFAULT_FOVEATED_BLEND,
  LOCAL_WEBCAM_VIEW_ID,
  multiviewGaussianRendererHandler,
} from '../MultiviewGaussianRendererTrait';
import { attachTrait, createMockContext, createMockNode, getLastEvent, sendEvent } from './traitTestHelpers';

const makeView = (userId: string) => ({
  userId,
  eyePosition: [0, 0, 0] as [number, number, number],
  eyeDirection: [0, 0, -1] as [number, number, number],
  foveationCenter: [0, 0] as [number, number],
  foveationRadius: 0.3,
  ipd: 0.063,
});

describe('MultiviewGaussianRendererTrait', () => {
  it('traitName is "MultiviewGaussianRenderer"', () => {
    const r = new MultiviewGaussianRendererTrait();
    expect(r.traitName).toBe('MultiviewGaussianRenderer');
  });

  it('DEFAULT_FOVEATED_BLEND has expected innerRadius', () => {
    expect(DEFAULT_FOVEATED_BLEND.innerRadius).toBe(0.15);
  });

  it('addView and removeView manage view map', () => {
    const r = new MultiviewGaussianRendererTrait();
    r.addView(makeView('u1'));
    r.addView(makeView('u2'));
    expect(r.getViewCount()).toBe(2);
    r.removeView('u1');
    expect(r.getViewCount()).toBe(1);
    expect(r.getViewConfig('u1')).toBeNull();
    expect(r.getViewConfig('u2')?.userId).toBe('u2');
  });

  it('preprocess returns sorted indices of correct length', () => {
    const r = new MultiviewGaussianRendererTrait();
    r.setGaussianCount(10);
    const { sortedIndices } = r.preprocess();
    expect(sortedIndices.length).toBe(10);
    expect(Array.from(sortedIndices)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('accepts webcam foveal-center events as a local multiview view', () => {
    const node = createMockNode('multiview-node');
    const ctx = createMockContext();

    attachTrait(multiviewGaussianRendererHandler, node, {}, ctx);
    sendEvent(multiviewGaussianRendererHandler, node, {}, ctx, {
      type: 'foveal_center_update',
      foveal_center: [0.25, -0.5],
    });

    const instance = (node as Record<string, unknown>)
      .__multiview_gaussian_renderer_instance as MultiviewGaussianRendererTrait;
    const view = instance.getViewConfig(LOCAL_WEBCAM_VIEW_ID);
    expect(view?.foveationCenter).toEqual([0.25, -0.5]);

    const emitted = getLastEvent(ctx, 'multiview_gaussian_renderer_foveal_center_updated');
    expect((emitted as Record<string, unknown>).foveationCenter).toEqual([0.25, -0.5]);
  });

  it('accepts trait-bus payload foveal-center events', () => {
    const node = createMockNode('multiview-node');
    const ctx = createMockContext();

    attachTrait(multiviewGaussianRendererHandler, node, {}, ctx);
    sendEvent(multiviewGaussianRendererHandler, node, {}, ctx, {
      type: 'foveal_center_update',
      payload: {
        userId: 'viewer-a',
        foveal_center: [-0.15, 0.4],
      },
    });

    const instance = (node as Record<string, unknown>)
      .__multiview_gaussian_renderer_instance as MultiviewGaussianRendererTrait;
    const view = instance.getViewConfig('viewer-a');
    expect(view?.foveationCenter).toEqual([-0.15, 0.4]);
  });
});
