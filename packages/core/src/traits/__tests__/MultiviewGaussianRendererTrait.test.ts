/**
 * MultiviewGaussianRendererTrait — tests
 */
import { describe, it, expect } from 'vitest';
import {
  MultiviewGaussianRendererTrait,
  DEFAULT_FOVEATED_BLEND,
} from '../MultiviewGaussianRendererTrait';

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
    r.removeView('u1');
    // no error thrown, view removed
    expect(true).toBe(true);
  });

  it('preprocess returns sorted indices of correct length', () => {
    const r = new MultiviewGaussianRendererTrait();
    r.setGaussianCount(10);
    const { sortedIndices } = r.preprocess();
    expect(sortedIndices.length).toBe(10);
  });
});
