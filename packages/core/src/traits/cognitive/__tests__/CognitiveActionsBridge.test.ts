import { describe, it, expect } from 'vitest';
import {
  cognitiveActionsToBTNodes,
  compileCognitiveDispatch,
  COGNITIVE_EVENT_MAP,
  type HoloCognitiveAction,
} from '../CognitiveActions';

/**
 * Phase 2.1(a) — the bridge from a brain state's parsed `cognitiveActions`
 * (the PARSE side) to executable `type:'cognitive'` behavior-tree nodes (the
 * EXECUTE side, consumed by BehaviorTreeTrait.tickCognitive). Before this bridge
 * the two surfaces were disconnected: `state { llm_call {} }` parsed into
 * `brainState.cognitiveActions` but reached no runtime.
 */
describe('cognitiveActionsToBTNodes (Phase 2.1 bridge)', () => {
  it('maps each cognitive action to a type:cognitive BT node preserving verb + config', () => {
    const actions: HoloCognitiveAction[] = [
      { kind: 'cognitive', verb: 'recall', config: { query: 'prior plans', limit: 5 } },
      { kind: 'cognitive', verb: 'llm_call', config: { prompt: 'decide', tools: ['write_file'] } },
    ];
    const nodes = cognitiveActionsToBTNodes(actions);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({ type: 'cognitive', verb: 'recall', config: { query: 'prior plans', limit: 5 } });
    expect(nodes[1]).toMatchObject({ type: 'cognitive', verb: 'llm_call', config: { prompt: 'decide', tools: ['write_file'] } });
  });

  it('lifts await + result_key from config (result_key | result | into)', () => {
    const [a, b, c] = cognitiveActionsToBTNodes([
      { kind: 'cognitive', verb: 'llm_call', config: { prompt: 'x', await: true, result_key: 'decision' } },
      { kind: 'cognitive', verb: 'recall', config: { query: 'q', result: 'memories' } },
      { kind: 'cognitive', verb: 'rag_query', config: { query: 'q', into: 'docs' } },
    ]);
    expect(a.await).toBe(true);
    expect(a.result_key).toBe('decision');
    expect(b.result_key).toBe('memories');
    expect(c.result_key).toBe('docs');
  });

  it('omits await when not requested and result_key when absent', () => {
    const [node] = cognitiveActionsToBTNodes([{ kind: 'cognitive', verb: 'plan', config: { state: { hp: 1 } } }]);
    expect(node.await).toBeUndefined();
    expect(node.result_key).toBeUndefined();
  });

  it('skips malformed / non-cognitive entries and returns [] for empty input', () => {
    expect(cognitiveActionsToBTNodes(undefined)).toEqual([]);
    expect(cognitiveActionsToBTNodes([])).toEqual([]);
    const nodes = cognitiveActionsToBTNodes([
      { kind: 'cognitive', verb: 'reflect', config: { of: 'the artifact' } },
      // @ts-expect-error — exercise the runtime guard against a bad verb
      { kind: 'cognitive', verb: 'not_a_verb', config: {} },
    ]);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].verb).toBe('reflect');
  });

  it('produces nodes that compileCognitiveDispatch can execute (round-trip to the real trait event)', () => {
    // The whole point of the bridge: its output nodes are execution-compatible
    // with the verified dispatch. Feed each produced node back through
    // compileCognitiveDispatch and assert it actuates the EXACT trait event.
    const actions: HoloCognitiveAction[] = (
      ['llm_call', 'recall', 'rag_query', 'plan', 'reflect'] as const
    ).map((verb) => ({ kind: 'cognitive', verb, config: { prompt: 'p', query: 'q', state: {} } }));

    for (const node of cognitiveActionsToBTNodes(actions)) {
      const { event } = compileCognitiveDispatch(
        { kind: 'cognitive', verb: node.verb, config: node.config },
        'req-test',
        { id: 'owner' }
      );
      expect(event).toBe(COGNITIVE_EVENT_MAP[node.verb].request);
    }
  });
});
