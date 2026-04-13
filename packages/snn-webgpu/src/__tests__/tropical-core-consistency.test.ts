import { describe, expect, it } from 'vitest';
import { TropicalActivationTrait } from '../traits/TropicalActivationTrait.js';
import { TropicalShortestPaths, type TropicalCSRGraph } from '../graph/TropicalShortestPaths.js';
import { MinPlusSemiring, MaxPlusSemiring } from '../../../core/src/compiler/traits/Semiring.ts';

describe('tropical cross-package consistency (core <-> snn-webgpu)', () => {
  it('max-plus activation agrees with semiring additive projection', () => {
    const trait = new TropicalActivationTrait();
    const input = new Float32Array([0.2, 0.9, 1.6]);
    const threshold = 0.5;

    const out = trait.forward(input, {
      variant: 'max-plus',
      gain: 1,
      threshold,
    });

    for (let i = 0; i < input.length; i++) {
      const shifted = input[i] - threshold;
      const expected = MaxPlusSemiring.add(0, shifted);
      expect(out[i]).toBeCloseTo(expected, 6);
    }
  });

  it('min-plus activation agrees with semiring additive projection', () => {
    const trait = new TropicalActivationTrait();
    const input = new Float32Array([0.2, 0.9, 1.6]);
    const threshold = 0.5;

    const out = trait.forward(input, {
      variant: 'min-plus',
      gain: 1,
      threshold,
    });

    for (let i = 0; i < input.length; i++) {
      const shifted = input[i] - threshold;
      const expected = MinPlusSemiring.add(0, shifted);
      expect(out[i]).toBeCloseTo(expected, 6);
    }
  });

  it('SSSP CPU shortest path agrees with min-plus semiring composition', () => {
    const graph: TropicalCSRGraph = {
      // 0 -> 1 (2), 0 -> 2 (10), 1 -> 2 (3)
      rowPtr: new Uint32Array([0, 2, 3, 3]),
      colIdx: new Uint32Array([1, 2, 2]),
      values: new Float32Array([2, 10, 3]),
    };

    const dist = TropicalShortestPaths.computeSSSPCPU(graph, 0);

    const direct = 10;
    const viaOne = MinPlusSemiring.mul(2, 3);
    const expected = MinPlusSemiring.add(direct, viaOne);

    expect(dist[2]).toBeCloseTo(expected, 6);
  });
});
