import { describe, expect, it } from 'vitest';
import {
  checkVisualCoherence,
  crossFamilyConsistency,
  occlusionImpliesNotVisible,
} from '../consistency';
import type { MeaningResolution } from '../contract';
import type { OcclusionRecovery, UAALAccessRecovery, UAALContainmentIR } from '../semantic';

const occ = (occluded: boolean, occluder: string | null): MeaningResolution<OcclusionRecovery> => ({
  query: 'occluded',
  status: 'resolved',
  answer: { occluded, occluder },
});
const acc = (visual: boolean): MeaningResolution<UAALAccessRecovery> => ({
  query: 'access',
  status: 'resolved',
  answer: { access: { visual, audible: true }, blocker: { visual: null, audible: null } },
});
const abstain = (): MeaningResolution<never> => ({
  query: 'q',
  status: 'unresolvable',
  reason: 'underdetermined',
});

describe('cross-family consistency — the meta-semantic layer', () => {
  describe('occlusionImpliesNotVisible (pure predicate)', () => {
    it('FLAGS the impossible scene: occluded behind an opaque barrier yet visually accessible', () => {
      const v = occlusionImpliesNotVisible(occ(true, 'box'), acc(true));
      expect(v.coherent).toBe(false);
      expect(v.detail).toContain('box');
    });

    it('coherent when occluded and not visible (the forced direction holds)', () => {
      expect(occlusionImpliesNotVisible(occ(true, 'box'), acc(false)).coherent).toBe(true);
    });

    it('coherent when not occluded — the converse is deliberately NOT asserted (access may block via non-opaque)', () => {
      expect(occlusionImpliesNotVisible(occ(false, null), acc(false)).coherent).toBe(true);
      expect(occlusionImpliesNotVisible(occ(false, null), acc(true)).coherent).toBe(true);
    });

    it('vacuously coherent when either resolver abstains — an abstention cannot contradict a verdict', () => {
      expect(occlusionImpliesNotVisible(abstain(), acc(true)).coherent).toBe(true);
      expect(occlusionImpliesNotVisible(occ(true, 'box'), abstain()).coherent).toBe(true);
    });
  });

  describe('checkVisualCoherence + crossFamilyConsistency (over real scenes)', () => {
    const scene = (opaque: boolean): UAALContainmentIR => ({
      entities: [
        { id: 'agent', kind: 'agent' },
        { id: 'coin', kind: 'object' },
        { id: 'box', kind: 'container', opaque },
        { id: 'room', kind: 'region' },
      ],
      containment: [
        { inner: 'coin', outer: 'box' },
        { inner: 'box', outer: 'room' },
        { inner: 'agent', outer: 'room' },
      ],
      query: { agent: 'agent', object: 'coin' },
    });

    it('a coin in an opaque box is occluded AND not visually accessible — the two resolvers agree', () => {
      const v = checkVisualCoherence(scene(true), 'agent', 'coin');
      expect(v.coherent).toBe(true);
      expect(v.detail).toContain('coherent');
    });

    it('a coin in a transparent box is neither occluded nor blocked — coherent', () => {
      expect(checkVisualCoherence(scene(false), 'agent', 'coin').coherent).toBe(true);
    });

    it('crossFamilyConsistency aggregates with zero violations on a well-formed scene', () => {
      const result = crossFamilyConsistency(scene(true), { agent: 'agent', object: 'coin' });
      expect(result.coherent).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.checks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
