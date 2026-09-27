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
      { name: 'b-drift', config: { velocity: [0.2, 0, 0] } },
      { name: 'a-thrust', config: { velocity: [0.1, 0, 0] } },
      { name: 'c-wind', config: { velocity: [0.3, 0, 0] } },
    ];
    const seen = distinct(permutations(traits).map((order) => JSON.stringify(semiring.add(order).provenance.velocity)));
    expect(seen.size).toBe(1);
    const only = JSON.parse([...seen][0]);
    expect(only.source).toBe('a-thrust+b-drift+c-wind');
    // Reduced left to right in sorted-leaf order: (0.1 + 0.2) + 0.3 is 0.6000000000000001,
    // while the reverse order (0.3 + 0.2) + 0.1 is exactly 0.6, so a reduction in any other
    // order fails here. (The earlier 0.2, 0.1, 0.3 example gave 0.6000000000000001 both ways,
    // so it could not fail: claude3's review of #318.)
    expect(only.value[0]).toBe(0.1 + 0.2 + 0.3);
    expect(only.value[0]).not.toBe(0.3 + 0.2 + 0.1);
    expect(only.contributions.map((leaf: { source: string }) => leaf.source)).toEqual(['a-thrust', 'b-drift', 'c-wind']);
  });

  it('sum and multiply rules serialise one way for every arrival order', () => {
    // Properties with no default rule, so the constructor's rules are the ones that apply.
    const semiring = new ProvenanceSemiring([
      { property: 'payload', strategy: 'sum' },
      { property: 'gain', strategy: 'multiply' },
    ]);
    const traits: TraitApplication[] = [
      { name: 'b-hull', config: { payload: 0.2, gain: 1.1 } },
      { name: 'a-cargo', config: { payload: 0.1, gain: 1.2 } },
      { name: 'c-crew', config: { payload: 0.3, gain: 1.3 } },
    ];
    const results = permutations(traits).map((order) => semiring.add(order).provenance);
    expect(distinct(results.map((p) => JSON.stringify(p.payload))).size).toBe(1);
    expect(distinct(results.map((p) => JSON.stringify(p.gain))).size).toBe(1);
    expect(results[0].payload.source).toBe('a-cargo+b-hull+c-crew');
    expect(results[0].payload.value).toBe(0.1 + 0.2 + 0.3);
    expect(results[0].payload.value).not.toBe(0.3 + 0.2 + 0.1);
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

// claude3's review of #318 (P1): the pairwise "equal values are one fact" rule ran against the
// running total, so a total that happened to equal the next value swallowed it. The rule now
// runs over the leaf set, and every arrival order gives one value and one serialisation.
describe('equal values are one fact over the leaf set, never against a running total', () => {
  const sumRule = () => new ProvenanceSemiring([{ property: 'load', strategy: 'sum' }]);

  it('sum(A=2, B=3, C=5) is 10 from A+B+C in all six orders (C was dropped in two)', () => {
    const traits: TraitApplication[] = [
      { name: 'A', config: { load: 2 } },
      { name: 'B', config: { load: 3 } },
      { name: 'C', config: { load: 5 } },
    ];
    const seen = distinct(permutations(traits).map((order) => JSON.stringify(sumRule().add(order).provenance.load)));
    expect(seen.size).toBe(1);
    expect(JSON.parse([...seen][0])).toMatchObject({ value: 10, source: 'A+B+C' });
  });

  it('sum(A=2, B=4, C=4) counts the equal 4 once in all six orders (it gave 10 in some, 6 in others)', () => {
    const traits: TraitApplication[] = [
      { name: 'A', config: { load: 2 } },
      { name: 'B', config: { load: 4 } },
      { name: 'C', config: { load: 4 } },
    ];
    const seen = distinct(permutations(traits).map((order) => JSON.stringify(sumRule().add(order).provenance.load)));
    expect(seen.size).toBe(1);
    // B and C carry one fact; the tie-break keeps B (the smaller source), as the pairwise rule does.
    expect(JSON.parse([...seen][0])).toMatchObject({ value: 6, source: 'A+B' });
  });

  it('two plain equal operands still give what main gave: sum(2, 2) is 2, the tie-break winner itself', () => {
    const context = { authorityLevel: 50, agentId: 'agent-b' };
    const result = sumRule().add([
      { name: 'A', config: { load: 2 }, context: { authorityLevel: 50, agentId: 'agent-z' } },
      { name: 'B', config: { load: 2 }, context },
    ]);
    expect(result.config.load).toBe(2);
    expect(result.provenance.load).toEqual({ value: 2, source: 'B', context });
  });

  it('a tropical merge picks its context over every leaf, one way in all six orders', () => {
    const semiring = () => new ProvenanceSemiring([{ property: 'latency', strategy: 'tropical-min-plus' }]);
    // Equal authority, no agent or op ids: the tie-break falls to the source, and the joined
    // running-total name ('a⊗b1') used to be compared against the next leaf ('a1').
    const traits: TraitApplication[] = [
      { name: 'b1', config: { latency: 3 }, context: { authorityLevel: 50, sourceType: 'system' } },
      { name: 'a1', config: { latency: 2 }, context: { authorityLevel: 50, sourceType: 'agent' } },
      { name: 'a', config: { latency: 1 }, context: { authorityLevel: 50, sourceType: 'user' } },
    ];
    const seen = distinct(permutations(traits).map((order) => JSON.stringify(semiring().add(order).provenance.latency)));
    expect(seen.size).toBe(1);
    expect(JSON.parse([...seen][0]).context).toEqual({ authorityLevel: 50, sourceType: 'user' });
  });
});
