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
import { canonicalProvenanceJson, type TraitApplication } from '../traits/ProvenanceSemiring';

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
});
