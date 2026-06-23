/**
 * Unit tests for the `stagger` animation primitive.
 *
 * `stagger N` ripples a container's direct children so they animate in sequence
 * (child i offset by i*N) instead of all at once. Pure-helper coverage of the
 * offset math and the `__animatedTransform` window shift.
 *
 * **See**: packages/core/src/animation/stagger.ts
 */

import { describe, it, expect } from 'vitest';
import { staggerOffsets, applyStaggerToChildren } from '../stagger';

describe('staggerOffsets', () => {
  it('produces [from, from+step, from+2*step, …]', () => {
    const o = staggerOffsets(4, 0.1);
    expect(o).toHaveLength(4);
    o.forEach((v, i) => expect(v).toBeCloseTo(i * 0.1, 10));
  });

  it('honors a non-zero `from`', () => {
    const o = staggerOffsets(3, 0.05, 0.5);
    expect(o[0]).toBeCloseTo(0.5);
    expect(o[1]).toBeCloseTo(0.55);
    expect(o[2]).toBeCloseTo(0.6);
  });

  it('returns [] for non-positive count', () => {
    expect(staggerOffsets(0, 0.1)).toEqual([]);
    expect(staggerOffsets(-2, 0.1)).toEqual([]);
  });
});

describe('applyStaggerToChildren', () => {
  const animatedChild = (edge0: number, edge1: number) => ({
    props: {
      __animatedTransform: [
        { prop: 'scaleUniform', target: 'developmentalTime', edge0, edge1, from: 0, to: 1 },
      ],
    },
  });

  it('offsets each child window by index * step', () => {
    const children = [animatedChild(0.1, 0.5), animatedChild(0.1, 0.5), animatedChild(0.1, 0.5)];
    applyStaggerToChildren(children, 0.08);
    const edge0 = (c: (typeof children)[number]) =>
      (c.props.__animatedTransform[0] as { edge0: number }).edge0;
    expect(edge0(children[0])).toBeCloseTo(0.1); // index 0 → no shift
    expect(edge0(children[1])).toBeCloseTo(0.18); // +1 * 0.08
    expect(edge0(children[2])).toBeCloseTo(0.26); // +2 * 0.08
    expect((children[2].props.__animatedTransform[0] as { edge1: number }).edge1).toBeCloseTo(0.66);
  });

  it('leaves static (non-animated) children untouched', () => {
    const staticChild = { props: { color: 'red' } };
    const animated = animatedChild(0.2, 0.6);
    applyStaggerToChildren([staticChild, animated], 0.1);
    expect(staticChild).toEqual({ props: { color: 'red' } }); // unchanged
    // index 1 → +0.1
    expect((animated.props.__animatedTransform[0] as { edge0: number }).edge0).toBeCloseTo(0.3);
  });

  it('is a no-op when step is 0 (the false case — distinguishes from staggered)', () => {
    const child = animatedChild(0.1, 0.5);
    applyStaggerToChildren([child], 0);
    expect((child.props.__animatedTransform[0] as { edge0: number }).edge0).toBeCloseTo(0.1);
  });
});
