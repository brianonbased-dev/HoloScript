import { describe, expect, it } from 'vitest';
import {
  interfaceCardKindMismatches,
  outcomeKindsFromSource,
  renderInterfaceCard,
  type InterfaceCardSpec,
} from '../interface-card';
import { spreadOf, withinFalseAlarmTolerance } from '../receipt';

const SOURCE = `composition "Gate" {
  state { open: false }
  logic {
    action push(force) {
      if (force < 1) {
        return { allowed: false, outcome: "too_weak" }
      }
      if (state.open) {
        return { allowed: true, outcome: "already_open" }
      }
      state.open = true
      return { allowed: true, outcome: "opened" }
    }
  }
}
`;

const SPEC: InterfaceCardSpec = {
  title: 'Gate',
  publicState: ['open'],
  actions: [
    {
      name: 'push',
      params: ['force'],
      outcomes: [
        { name: 'opened', kind: 'accepted' },
        { name: 'already_open', kind: 'accepted' },
        { name: 'too_weak', kind: 'refused' },
      ],
      extraAnswerFields: [{ outcome: 'opened', fields: ['by'] }],
    },
  ],
  observations: [{ name: 'look', params: ['viewerId'], answerFields: ['viewer', 'open'] }],
  events: [{ name: 'gate_opened', fields: ['force'] }],
};

describe('back-translation interface card', () => {
  it('marks every outcome with its kind and keeps the card names-only', () => {
    const card = renderInterfaceCard(SPEC);
    expect(card).toContain('Behaviour name: "Gate"');
    expect(card).toContain(
      '- push(force) — outcomes: opened (accepted), already_open (accepted), too_weak (refused); a opened answer also has the field: by'
    );
    expect(card).toContain('- accepted: the answer has allowed = true.');
    expect(card).toContain('- refused: the answer has allowed = false.');
    expect(card).toContain('- look(viewerId) — answer fields: viewer, open');
    expect(card).toContain('- gate_opened: force');
    expect(card).not.toContain('if (');
  });

  it('reads outcome kinds from a program', () => {
    const kinds = outcomeKindsFromSource(SOURCE);
    expect([...kinds.get('too_weak')!]).toEqual(['refused']);
    expect([...kinds.get('opened')!]).toEqual(['accepted']);
    expect(interfaceCardKindMismatches(SPEC, SOURCE)).toEqual([]);
  });

  it('flags a card whose kinds disagree with the program (fault feed)', () => {
    const wrong: InterfaceCardSpec = {
      ...SPEC,
      actions: [
        {
          ...SPEC.actions[0],
          outcomes: [
            { name: 'opened', kind: 'accepted' },
            { name: 'already_open', kind: 'refused' },
          ],
        },
      ],
    };
    expect(interfaceCardKindMismatches(wrong, SOURCE)).toEqual([
      'push: outcome already_open is marked refused but the program returns it as accepted',
      'outcome too_weak is returned but not on the card',
    ]);
  });

  it('computes spread and tolerance', () => {
    expect(spreadOf([])).toEqual({ min: 0, max: 0, mean: 0 });
    expect(spreadOf([1, 3, 2])).toEqual({ min: 1, max: 3, mean: 2 });
    const tol = { maxPer20Situations: 1, why: 'x' };
    expect(withinFalseAlarmTolerance({ falseAlarms: { situations: 20, divergentSituations: 1 } } as never, tol)).toBe(true);
    expect(withinFalseAlarmTolerance({ falseAlarms: { situations: 20, divergentSituations: 2 } } as never, tol)).toBe(false);
  });
});
