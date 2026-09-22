/**
 * task_1790058854739_8jh1 (adversarial review of #312): add() left-folds
 * multiply() in arrival order, and the merging strategies built their result
 * pairwise, so three contributions to one property serialised differently by
 * arrival order ('A+B+C' against 'A+C+B'), and float addition moved the value
 * with it. DistributedTransformGraph hashes provenance, so the same traits in
 * a different order hashed two ways. Every arrival order must now produce one
 * serialisation, and the value must be the reduction in sorted-leaf order.
 */
import { describe, it, expect } from 'vitest';
import { ProvenanceSemiring, type TraitApplication } from '../traits/ProvenanceSemiring';

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [item, ...rest])
  );
}

const distinct = (values: string[]) => new Set(values);

describe('ProvenanceSemiring canonical n-ary merge (8jh1)', () => {
  it('vec-component-sum (a default rule) serialises one way for all six arrival orders, with the value reduced in sorted order', () => {
    const semiring = new ProvenanceSemiring();
    const traits: TraitApplication[] = [
      { name: 'thrust', config: { velocity: [0.1, 0, 0] } },
      { name: 'drift', config: { velocity: [0.2, 0, 0] } },
      { name: 'wind', config: { velocity: [0.3, 0, 0] } },
    ];
    const seen = distinct(permutations(traits).map((order) => JSON.stringify(semiring.add(order).provenance.velocity)));
    expect(seen.size).toBe(1);
    const only = JSON.parse([...seen][0]);
    expect(only.source).toBe('drift+thrust+wind');
    // Reduced in sorted-leaf order: drift (0.2) + thrust (0.1) + wind (0.3); the folded
    // 0.1 + 0.2 + 0.3 is 0.6000000000000001 in floating point, a different byte string.
    expect(only.value[0]).toBe(0.2 + 0.1 + 0.3);
    expect(only.contributions.map((leaf: { source: string }) => leaf.source)).toEqual(['drift', 'thrust', 'wind']);
  });

  it('sum and multiply rules serialise one way for every arrival order', () => {
    // Properties with no default rule, so the constructor's rules are the ones that apply.
    const semiring = new ProvenanceSemiring([
      { property: 'payload', strategy: 'sum' },
      { property: 'gain', strategy: 'multiply' },
    ]);
    const traits: TraitApplication[] = [
      { name: 'b-hull', config: { payload: 0.1, gain: 1.1 } },
      { name: 'a-cargo', config: { payload: 0.2, gain: 1.2 } },
      { name: 'c-crew', config: { payload: 0.3, gain: 1.3 } },
    ];
    const results = permutations(traits).map((order) => semiring.add(order).provenance);
    expect(distinct(results.map((p) => JSON.stringify(p.payload))).size).toBe(1);
    expect(distinct(results.map((p) => JSON.stringify(p.gain))).size).toBe(1);
    expect(results[0].payload.source).toBe('a-cargo+b-hull+c-crew');
    expect(results[0].payload.value).toBe(0.2 + 0.1 + 0.3);
    expect(results[0].gain.source).toBe('a-cargo*b-hull*c-crew');
    expect(results[0].gain.value).toBe(1.2 * 1.1 * 1.3);
  });

  it('tropical and vector max/min strategies serialise one way for every arrival order', () => {
    const semiring = new ProvenanceSemiring([
      { property: 'latency', strategy: 'tropical-min-plus' },
      { property: 'bounds', strategy: 'vec-component-max' },
      { property: 'floor', strategy: 'vec-component-min' },
    ]);
    const traits: TraitApplication[] = [
      { name: 'n2', config: { latency: 5, bounds: [1, 9, 3], floor: [4, 2, 8] } },
      { name: 'n1', config: { latency: 3, bounds: [7, 2, 3], floor: [1, 5, 9] } },
      { name: 'n3', config: { latency: 4, bounds: [2, 2, 6], floor: [6, 6, 1] } },
    ];
    const results = permutations(traits).map((order) => semiring.add(order).provenance);
    for (const key of ['latency', 'bounds', 'floor']) {
      expect(distinct(results.map((p) => JSON.stringify(p[key]))).size).toBe(1);
    }
    expect(results[0].latency.source).toBe('n1⊗n2⊗n3');
    expect(results[0].bounds).toMatchObject({ source: 'n1⊕maxn2⊕maxn3', value: [7, 9, 6] });
    expect(results[0].floor).toMatchObject({ source: 'n1⊕minn2⊕minn3', value: [1, 2, 1] });
  });

  it('two operands keep the pairwise spelling, so nothing that read A+B changes', () => {
    const semiring = new ProvenanceSemiring();
    const [ab, ba] = [
      semiring.add([{ name: 'b', config: { velocity: [1, 0, 0] } }, { name: 'a', config: { velocity: [2, 0, 0] } }]),
      semiring.add([{ name: 'a', config: { velocity: [2, 0, 0] } }, { name: 'b', config: { velocity: [1, 0, 0] } }]),
    ];
    expect(ab.provenance.velocity.source).toBe('a+b');
    expect(JSON.stringify(ab.provenance.velocity)).toBe(JSON.stringify(ba.provenance.velocity));
    expect(ab.config.velocity).toEqual([3, 0, 0]);
  });
});
