/**
 * task_1790058854739_97yq (adversarial review of #312): the state hash was
 * fnv1a32(JSON.stringify(provenance)), and each provenance entry carries the
 * caller's `context` and `value` by reference with their own key order intact.
 * Two agents that build the same logical context as {authorityLevel, agentId}
 * and {agentId, authorityLevel} therefore produced different bytes and a
 * different stateHash for one and the same composition. The hash site now
 * serialises canonically: keys sorted at every depth, Dates as ISO strings.
 */
import { describe, it, expect } from 'vitest';
import { DistributedTransformGraph } from '../traits/DistributedTransformGraph';
import {
  ProvenanceSemiring,
  canonicalProvenanceJson,
  type TraitApplication,
} from '../traits/ProvenanceSemiring';

function graphAfter(traits: TraitApplication[]): string {
  const graph = new DistributedTransformGraph({ nodeId: 'node-a' });
  graph.localCompose(traits);
  return graph.exportLocalState()!.stateHash;
}

describe('DistributedTransformGraph canonical state hash (97yq)', () => {
  it('hashes one composition one way when the context keys arrive in a different order', () => {
    const ordered: TraitApplication[] = [
      { name: 'physics', config: { mass: 2 }, context: { authorityLevel: 50, agentId: 'agent-x', opId: 'op-1' } },
    ];
    const reordered: TraitApplication[] = [
      { name: 'physics', config: { mass: 2 }, context: { opId: 'op-1', agentId: 'agent-x', authorityLevel: 50 } },
    ];
    expect(graphAfter(ordered)).toBe(graphAfter(reordered));
  });

  it('hashes one composition one way when a nested value object has a different key order', () => {
    const a: TraitApplication[] = [{ name: 'style', config: { theme: { primary: 'red', accent: 'blue' } } }];
    const b: TraitApplication[] = [{ name: 'style', config: { theme: { accent: 'blue', primary: 'red' } } }];
    expect(graphAfter(a)).toBe(graphAfter(b));
    // ...and a genuinely different value still hashes differently.
    const c: TraitApplication[] = [{ name: 'style', config: { theme: { accent: 'green', primary: 'red' } } }];
    expect(graphAfter(a)).not.toBe(graphAfter(c));
  });

  it('serialises keys sorted at every depth and a Date as its ISO string, never {}', () => {
    const when = new Date('2026-09-22T12:00:00.000Z');
    const text = canonicalProvenanceJson({ z: { b: 1, a: [{ y: 2, x: when }] }, a: 'first' });
    expect(text).toBe('{"a":"first","z":{"a":[{"x":"2026-09-22T12:00:00.000Z","y":2}],"b":1}}');
    expect(canonicalProvenanceJson({ b: 1, a: 2 })).toBe(canonicalProvenanceJson({ a: 2, b: 1 }));
  });

  // claude3's review of #318: sorting inside a JSON replacer broke JSON's own semantics.
  it('keeps what JSON keeps: an own __proto__ key, a boxed primitive, and the TypeError a cycle throws', () => {
    const protoA = JSON.parse('{"__proto__":{"secret":"AAA"},"a":2}');
    const protoB = JSON.parse('{"__proto__":{"secret":"BBB"},"a":2}');
    expect(canonicalProvenanceJson(protoA)).toBe('{"__proto__":{"secret":"AAA"},"a":2}');
    expect(canonicalProvenanceJson(protoA)).not.toBe(canonicalProvenanceJson(protoB));
    expect(canonicalProvenanceJson({ n: new Number(1) })).toBe('{"n":1}');
    expect(canonicalProvenanceJson({ n: new Number(1) })).not.toBe(canonicalProvenanceJson({ n: new Number(2) }));
    const cycle: Record<string, unknown> = { a: 1 };
    cycle.self = cycle;
    expect(() => canonicalProvenanceJson(cycle)).toThrow(TypeError);
  });
});

// claude3's review of #318 (P1): mergeActiveNodes re-merged each node's TOTAL, so two partial
// sums that happened to be equal were taken as one fact.
describe('DistributedTransformGraph re-merges nodes from their leaf contributions', () => {
  const sumGraph = (nodeId: string) =>
    new DistributedTransformGraph({
      nodeId,
      semiring: new ProvenanceSemiring([{ property: 'load', strategy: 'sum' }]),
    });

  it('leaves 0.1..0.4 split {a,d} / {b,c} across two nodes merge to their full sum, not 0.5', () => {
    const nodeA = sumGraph('node-a');
    const nodeB = sumGraph('node-b');
    nodeA.localCompose([
      { name: 'a', config: { load: 0.1 } },
      { name: 'd', config: { load: 0.4 } },
    ]);
    nodeB.localCompose([
      { name: 'b', config: { load: 0.2 } },
      { name: 'c', config: { load: 0.3 } },
    ]);
    nodeA.receiveRemoteState(nodeB.exportLocalState()!);
    const merged = nodeA.mergeActiveNodes().composition;
    expect(merged.provenance.load.source).toBe('a+b+c+d');
    expect(merged.config.load).toBe(0.1 + 0.2 + 0.3 + 0.4);
  });

  it('the same leaf seen by two nodes is one fact', () => {
    const nodeA = sumGraph('node-a');
    const nodeB = sumGraph('node-b');
    nodeA.localCompose([{ name: 'a', config: { load: 0.1 } }, { name: 'b', config: { load: 0.2 } }]);
    nodeB.localCompose([{ name: 'a', config: { load: 0.1 } }, { name: 'c', config: { load: 0.3 } }]);
    nodeA.receiveRemoteState(nodeB.exportLocalState()!);
    const merged = nodeA.mergeActiveNodes().composition;
    expect(merged.provenance.load.source).toBe('a+b+c');
    expect(merged.config.load).toBe(0.1 + 0.2 + 0.3);
  });
});
