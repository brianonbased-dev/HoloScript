import { describe, expect, it } from 'vitest';
import { TropicalActivationTrait } from '../traits/TropicalActivationTrait.js';

describe('TropicalActivationTrait', () => {
  it('maps spike rates to ReLU-style activations in max-plus mode', () => {
    const trait = new TropicalActivationTrait();
    const output = trait.forward(new Float32Array([-1, 0.5, 2]), {
      variant: 'max-plus',
      gain: 2,
      threshold: 0.5,
    });

    expect(Array.from(output)).toEqual([0, 0, 3]);
  });

  it('maps spike rates to min-plus dual activations in min-plus mode', () => {
    const trait = new TropicalActivationTrait();
    const output = trait.forward(new Float32Array([-1, 0.5, 2]), {
      variant: 'min-plus',
      gain: 2,
      threshold: 0.5,
    });

    expect(Array.from(output)).toEqual([-3, 0, 0]);
  });

  it('converts positive activations to earlier spike times', () => {
    const trait = new TropicalActivationTrait();
    const timings = trait.toSpikeTiming(new Float32Array([4, 2, 0]), 8);

    expect(timings[0]).toBeCloseTo(2);
    expect(timings[1]).toBeCloseTo(4);
    expect(timings[2]).toBe(Number.POSITIVE_INFINITY);
  });
});
