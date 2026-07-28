import { describe, expect, it } from 'vitest';
import { semanticGate } from '../gate';
import type { UAALSemanticGateIR } from '../gate';

const othello: UAALSemanticGateIR = {
  entities: [
    { id: 'iago', kind: 'agent' },
    { id: 'othello', kind: 'agent' },
    { id: 'desdemona', kind: 'agent' },
  ],
  propositions: [
    { id: 'unfaithful', text: 'Desdemona is unfaithful', negates: 'faithful' },
    { id: 'faithful', text: 'Desdemona is faithful' },
    { id: 'planted', text: 'Iago planted the handkerchief' },
  ],
  events: [{ id: 'handkerchief', facts: ['planted', 'faithful'], multiPerspective: true }],
  beliefs: [
    { id: 'b_oth', agent: 'othello', prop: 'unfaithful', confidence: 0.9 },
    { id: 'b_iago', agent: 'iago', prop: 'planted', confidence: 1.0 },
    { id: 'b_iago_models_oth', agent: 'iago', prop: 'unfaithful', confidence: 0.9, about: 'b_oth' },
  ],
  perspectives: [
    {
      id: 'pv_oth',
      agent: 'othello',
      event: 'handkerchief',
      sees: ['planted'],
      frames: 'proof of betrayal',
      feels: ['jealousy'],
    },
    {
      id: 'pv_des',
      agent: 'desdemona',
      event: 'handkerchief',
      sees: ['planted', 'faithful'],
      frames: 'innocent loss',
      feels: ['confusion'],
    },
  ],
  causal: [
    { cause: 'b_iago', effect: 'b_oth', mechanism: 'deception' },
    { cause: 'b_oth', effect: 'em_jealousy', mechanism: 'appraisal' },
  ],
  emotions: [
    { id: 'em_jealousy', agent: 'othello', valence: -0.8, cause: 'b_oth' },
    { id: 'em_confusion', agent: 'desdemona', valence: -0.3, cause: 'handkerchief' },
  ],
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe('semanticGate', () => {
  it('accepts a grounded multi-perspective false-belief scene', () => {
    const result = semanticGate(othello);

    expect(result.pass).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.metrics.falseBeliefs).toBe(2);
    expect(result.metrics.nestedToM).toBe(1);
    expect(result.richness.join('\n')).toContain('false belief');
  });

  it('rejects perception that invents facts outside the event', () => {
    const broken = clone(othello);
    broken.perspectives![0].sees = ['unfaithful'];

    const result = semanticGate(broken);

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('perception ungrounded'))).toBe(true);
  });

  it('rejects unresolved references and out-of-range confidence', () => {
    const broken = clone(othello);
    broken.beliefs!.push({ id: 'bad', agent: 'nobody', prop: 'missing', confidence: 2 });

    const result = semanticGate(broken);

    expect(result.pass).toBe(false);
    expect(result.errors).toContain("belief bad.agent: unresolved ref 'nobody'");
    expect(result.errors).toContain("belief bad.prop: unresolved ref 'missing'");
    expect(result.errors).toContain('belief bad: confidence out of [0,1]');
  });

  it('rejects identical interiority on multi-perspective events', () => {
    const broken = clone(othello);
    broken.perspectives![1].frames = broken.perspectives![0].frames;
    broken.perspectives![1].feels = broken.perspectives![0].feels;

    const result = semanticGate(broken);

    expect(result.pass).toBe(false);
    expect(result.errors).toContain(
      'event handkerchief: perspectives share identical interiority (not multi-perspective)'
    );
  });

  it('rejects causal cycles', () => {
    const broken = clone(othello);
    broken.causal!.push({ cause: 'em_jealousy', effect: 'b_iago' });

    const result = semanticGate(broken);

    expect(result.pass).toBe(false);
    expect(result.errors.some((error) => error.includes('causal graph has a cycle'))).toBe(true);
  });
});
