/**
 * Crossfade-easing tests (Rive harvest R4).
 *
 * A transition's `easing` flows AnimationTransition -> CrossfadeState ->
 * updateLayer, which now eases the blend weight via the shipped `applyEasing`
 * instead of raw linear progress. `linear` (the default) reproduces the prior
 * weighting exactly; `spring`/`bounce` make transitions overshoot/rebound.
 *
 * **See**: packages/core/src/traits/AnimationStateMachine.ts (updateLayer)
 */

import { describe, it, expect } from 'vitest';
import { AnimationStateMachine } from '../AnimationStateMachine';
import { applyEasing } from '../../runtime/easing';
import type { ActiveAnimation, AnimationClipDef, CrossfadeState } from '../AnimationTypes';

function mkAnim(state: string): ActiveAnimation {
  return {
    clip: { name: state, duration: 1 } as AnimationClipDef,
    state,
    time: 0,
    normalizedTime: 0,
    weight: 0,
    speed: 1,
    layer: 0,
  };
}

/** Advance a single crossfade by `dt` (duration 1) and return the blended anims. */
function runCrossfade(easing: string | undefined, dt: number) {
  const sm = new AnimationStateMachine();
  const from = mkAnim('A');
  const to = mkAnim('B');
  const crossfades = new Map<number, CrossfadeState | null>([
    [0, { from, to, progress: 0, duration: 1, ...(easing ? { easing } : {}) }],
  ]);
  const active = new Map<number, ActiveAnimation | null>();
  sm.updateLayer(
    0,
    dt,
    active,
    crossfades,
    () => {},
    () => {}
  );
  return { from, to };
}

describe('AnimationStateMachine.updateLayer — crossfade easing', () => {
  it('linear (no easing) reproduces raw-progress weights (no regression)', () => {
    const { from, to } = runCrossfade(undefined, 0.4);
    expect(to.weight).toBeCloseTo(0.4);
    expect(from.weight).toBeCloseTo(0.6);
  });

  it('applies the named easing curve to the blend weight', () => {
    const { from, to } = runCrossfade('easeIn', 0.5);
    expect(to.weight).toBeCloseTo(applyEasing(0.5, 'easeIn')); // 0.25
    expect(to.weight).toBeCloseTo(0.25);
    expect(from.weight).toBeCloseTo(0.75);
  });

  it('spring easing overshoots the blend mid-crossfade (the harvest payoff)', () => {
    const { to } = runCrossfade('spring', 0.4);
    expect(to.weight).toBeCloseTo(applyEasing(0.4, 'spring'));
    expect(to.weight).toBeGreaterThan(1); // spring overshoots past the destination
  });
});
