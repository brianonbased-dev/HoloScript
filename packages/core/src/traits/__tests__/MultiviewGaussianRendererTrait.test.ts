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

  // ===========================================================================
  // P.043 shared-sort preprocess() — real centroid sort + visibility bitmask
  //
  // G.GOLD.013 — test the false case for computed assertions. preprocess()
  // must fall back to iota when positions OR views are missing, AND produce
  // a real centroid-distance sort + per-view visibility bitmask when both
  // are present. Tests cover both branches explicitly.
  // ===========================================================================
  describe('preprocess() — shared centroid sort + visibility bitmask (P.043)', () => {
    /** Two gaussians on the +Z axis at distance 1 and 5 from the origin. */
    const twoGaussiansOnZ = (): Float32Array =>
      new Float32Array([
        0, 0, 1, // gaussian 0 (close)
        0, 0, 5, // gaussian 1 (far)
      ]);

    const viewAtOriginLookingDownZ = (userId: string) => ({
      userId,
      eyePosition: [0, 0, 0] as [number, number, number],
      eyeDirection: [0, 0, 1] as [number, number, number], // looking +Z
      foveationCenter: [0, 0] as [number, number],
      foveationRadius: 0.3,
      ipd: 0.063,
    });

    const viewAtOriginLookingDownNegZ = (userId: string) => ({
      userId,
      eyePosition: [0, 0, 0] as [number, number, number],
      eyeDirection: [0, 0, -1] as [number, number, number], // looking -Z
      foveationCenter: [0, 0] as [number, number],
      foveationRadius: 0.3,
      ipd: 0.063,
    });

    it('FALSE CASE: positions set but no views → falls back to iota', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianPositions(twoGaussiansOnZ()); // sets count=2 automatically
      const result = r.preprocess();
      expect(Array.from(result.sortedIndices)).toEqual([0, 1]);
      expect(result.visibilityBitmasks).toBeUndefined();
      expect(result.viewOrder).toBeUndefined();
      expect(r.getVisibilityBitmasks()).toBeNull();
      expect(r.getViewOrder()).toEqual([]);
    });

    it('FALSE CASE: views set but no positions → falls back to iota', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianCount(2);
      r.addView(viewAtOriginLookingDownZ('viewer-1'));
      const result = r.preprocess();
      expect(Array.from(result.sortedIndices)).toEqual([0, 1]);
      expect(result.visibilityBitmasks).toBeUndefined();
    });

    it('TRUE CASE: views + positions → back-to-front centroid sort', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianPositions(twoGaussiansOnZ());
      r.addView(viewAtOriginLookingDownZ('viewer-1'));
      const result = r.preprocess();
      // Far gaussian (index 1) before close gaussian (index 0) for alpha-compositing.
      expect(Array.from(result.sortedIndices)).toEqual([1, 0]);
      expect(result.visibilityBitmasks).toBeDefined();
      expect(result.viewOrder).toEqual(['viewer-1']);
    });

    it('visibility bitmask: gaussian in view cone is bit-set; behind eye is bit-cleared', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianPositions(twoGaussiansOnZ());
      r.addView(viewAtOriginLookingDownZ('forward')); // looks +Z, sees both gaussians
      r.addView(viewAtOriginLookingDownNegZ('backward')); // looks -Z, sees neither
      const result = r.preprocess();
      const bm = result.visibilityBitmasks!;
      const order = result.viewOrder!;
      const forwardBit = order.indexOf('forward');
      const backwardBit = order.indexOf('backward');
      // Both gaussians visible to "forward" view
      expect(bm[0] & (1 << forwardBit)).not.toBe(0);
      expect(bm[1] & (1 << forwardBit)).not.toBe(0);
      // Neither visible to "backward" view (both are behind it)
      expect(bm[0] & (1 << backwardBit)).toBe(0);
      expect(bm[1] & (1 << backwardBit)).toBe(0);
    });

    it('getPerViewIndices filters the shared sort by per-view visibility', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianPositions(twoGaussiansOnZ());
      r.addView(viewAtOriginLookingDownZ('forward'));
      r.addView(viewAtOriginLookingDownNegZ('backward'));
      const result = r.preprocess();
      const perView = r.getPerViewIndices(result.sortedIndices);
      // "forward" view sees both gaussians, in back-to-front order.
      expect(Array.from(perView.get('forward')!)).toEqual([1, 0]);
      // "backward" view sees none.
      expect(Array.from(perView.get('backward')!)).toEqual([]);
    });

    it('getPerViewIndices: with no bitmask each view sees the full sort', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianCount(3);
      r.addView(viewAtOriginLookingDownZ('only'));
      const { sortedIndices } = r.preprocess();
      // No positions → no bitmask → fallback returns the shared array for the view.
      const perView = r.getPerViewIndices(sortedIndices);
      expect(Array.from(perView.get('only')!)).toEqual([0, 1, 2]);
    });

    it('setGaussianPositions rejects misaligned input', () => {
      const r = new MultiviewGaussianRendererTrait();
      // 5 elements is not a multiple of 3 (xyz per gaussian).
      expect(() => r.setGaussianPositions(new Float32Array([1, 2, 3, 4, 5]))).toThrow(
        /not divisible by 3/
      );
    });

    it('setGaussianPositions infers gaussianCount when previously zero', () => {
      const r = new MultiviewGaussianRendererTrait();
      r.setGaussianPositions(new Float32Array([0, 0, 0, 1, 1, 1, 2, 2, 2]));
      // 9 floats / 3 = 3 gaussians; iota fallback (no view yet) confirms count.
      const { sortedIndices } = r.preprocess();
      expect(sortedIndices.length).toBe(3);
    });
  });
});
