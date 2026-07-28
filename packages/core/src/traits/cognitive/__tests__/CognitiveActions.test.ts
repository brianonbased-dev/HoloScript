import { describe, it, expect } from 'vitest';
import {
  COGNITIVE_VERBS,
  COGNITIVE_EVENT_MAP,
  COGNITIVE_COMPLETE_TO_VERB,
  isCognitiveVerb,
  isBrainKeyword,
  nearestCognitiveVerb,
  compileCognitiveDispatch,
  type HoloCognitiveAction,
} from '../CognitiveActions';

describe('CognitiveActions — verb vocabulary', () => {
  it('exposes the five cognitive verbs', () => {
    expect([...COGNITIVE_VERBS]).toEqual(['llm_call', 'recall', 'rag_query', 'plan', 'reflect']);
  });

  it('isCognitiveVerb recognizes verbs and rejects others', () => {
    expect(isCognitiveVerb('llm_call')).toBe(true);
    expect(isCognitiveVerb('plan')).toBe(true);
    expect(isCognitiveVerb('transition')).toBe(false);
    expect(isCognitiveVerb('llm_agennt')).toBe(false); // typo must not pass
  });

  it('every verb maps to a request + complete event binding', () => {
    for (const verb of COGNITIVE_VERBS) {
      const b = COGNITIVE_EVENT_MAP[verb];
      expect(b.request).toBeTruthy();
      expect(b.complete).toBeTruthy();
      expect(b.trait).toBeTruthy();
    }
  });

  it('reverse complete→verb index is consistent with the forward map', () => {
    for (const verb of COGNITIVE_VERBS) {
      const complete = COGNITIVE_EVENT_MAP[verb].complete;
      expect(COGNITIVE_COMPLETE_TO_VERB[complete]).toContain(verb);
    }
  });

  it('isBrainKeyword recognizes only `brain`', () => {
    expect(isBrainKeyword('brain')).toBe(true);
    expect(isBrainKeyword('brian')).toBe(false);
    expect(isBrainKeyword('Brain')).toBe(false);
  });

  it('nearestCognitiveVerb catches near-miss typos but not exact verbs or far words', () => {
    expect(nearestCognitiveVerb('recal')).toBe('recall'); // 1 edit
    expect(nearestCognitiveVerb('llm_cal')).toBe('llm_call'); // 1 edit
    expect(nearestCognitiveVerb('paln')).toBe('plan'); // transposition
    expect(nearestCognitiveVerb('recall')).toBeUndefined(); // exact verb is not a typo
    expect(nearestCognitiveVerb('patrol')).toBeUndefined(); // far from any verb
    expect(nearestCognitiveVerb('go')).toBeUndefined(); // too short
  });
});

describe('CognitiveActions — dispatch compilation', () => {
  const owner = { id: 'agent-1' };
  const make = (
    verb: HoloCognitiveAction['verb'],
    config: Record<string, unknown>
  ): HoloCognitiveAction => ({
    kind: 'cognitive',
    verb,
    config,
  });

  it('llm_call → llm_prompt with message (maps prompt → message)', () => {
    const { event, payload } = compileCognitiveDispatch(
      make('llm_call', { prompt: 'What next?' }),
      'r1',
      owner
    );
    expect(event).toBe('llm_prompt');
    expect(payload.message).toBe('What next?');
    expect(payload.requestId).toBe('r1');
  });

  it('recall → memory_recall with nested payload (maps limit → top_k)', () => {
    const { event, payload } = compileCognitiveDispatch(
      make('recall', { query: 'prior plans', limit: 5 }),
      'r2',
      owner
    );
    expect(event).toBe('memory_recall');
    expect((payload.payload as Record<string, unknown>).query).toBe('prior plans');
    expect((payload.payload as Record<string, unknown>).top_k).toBe(5);
  });

  it('rag_query → rag_query with question (maps query → question)', () => {
    const { event, payload } = compileCognitiveDispatch(
      make('rag_query', { query: 'how does X work' }),
      'r3',
      owner
    );
    expect(event).toBe('rag_query');
    expect(payload.question).toBe('how does X work');
  });

  it('plan → goap_set_state with state object', () => {
    const { event, payload } = compileCognitiveDispatch(
      make('plan', { state: { has_key: true } }),
      'r4',
      owner
    );
    expect(event).toBe('goap_set_state');
    expect(payload.state).toEqual({ has_key: true });
  });

  it('reflect → llm_prompt composed self-evaluation message', () => {
    const { event, payload } = compileCognitiveDispatch(
      make('reflect', { of: 'the plan', criteria: 'feasibility' }),
      'r5',
      owner
    );
    expect(event).toBe('llm_prompt');
    expect(typeof payload.message).toBe('string');
    expect(payload.message as string).toContain('the plan');
    expect(payload.message as string).toContain('feasibility');
  });
});
