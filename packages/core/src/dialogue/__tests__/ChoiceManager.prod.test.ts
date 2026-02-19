/**
 * ChoiceManager — Production Test Suite
 *
 * Covers: recordChoice, reputation, relationships,
 * flags, consequences, queries.
 */
import { describe, it, expect } from 'vitest';
import { ChoiceManager } from '../ChoiceManager';

describe('ChoiceManager — Production', () => {
  // ─── Record Choice ────────────────────────────────────────────────
  it('recordChoice stores choice', () => {
    const cm = new ChoiceManager();
    const c = cm.recordChoice('d1', 'n1', 'Be nice');
    expect(c.id).toBe('choice_0');
    expect(cm.getChoiceCount()).toBe(1);
  });

  // ─── Reputation Consequence ───────────────────────────────────────
  it('reputation consequence modifies faction', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'Help villagers', [
      { type: 'reputation', target: 'villagers', value: 10 },
    ]);
    expect(cm.getReputation('villagers')).toBe(10);
  });

  it('multiple reputation changes accumulate', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'a', [{ type: 'reputation', target: 'f1', value: 5 }]);
    cm.recordChoice('d2', 'n2', 'b', [{ type: 'reputation', target: 'f1', value: -3 }]);
    expect(cm.getReputation('f1')).toBe(2);
  });

  // ─── Relationship Consequence ─────────────────────────────────────
  it('relationship consequence modifies affinity', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'Compliment', [
      { type: 'relationship', target: 'npc_alice', value: 5 },
    ]);
    expect(cm.getRelationship('npc_alice')).toBe(5);
  });

  // ─── Flag Consequence ─────────────────────────────────────────────
  it('flag consequence sets flag', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'Take key', [
      { type: 'flag', target: 'hasKey', value: true },
    ]);
    expect(cm.getFlag('hasKey')).toBe(true);
    expect(cm.hasFlag('hasKey')).toBe(true);
  });

  it('setFlag manually', () => {
    const cm = new ChoiceManager();
    cm.setFlag('questComplete');
    expect(cm.getFlag('questComplete')).toBe(true);
  });

  // ─── Queries ──────────────────────────────────────────────────────
  it('getChoicesForDialogue filters by dialogueId', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'a');
    cm.recordChoice('d2', 'n2', 'b');
    cm.recordChoice('d1', 'n3', 'c');
    expect(cm.getChoicesForDialogue('d1').length).toBe(2);
  });

  it('hasChosen checks dialogue+node', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'a');
    expect(cm.hasChosen('d1', 'n1')).toBe(true);
    expect(cm.hasChosen('d1', 'n2')).toBe(false);
  });

  it('getRecentChoices returns last N', () => {
    const cm = new ChoiceManager();
    for (let i = 0; i < 10; i++) cm.recordChoice('d', `n${i}`, `choice ${i}`);
    expect(cm.getRecentChoices(3).length).toBe(3);
  });

  it('unknown faction returns 0 reputation', () => {
    const cm = new ChoiceManager();
    expect(cm.getReputation('unknown')).toBe(0);
  });

  it('getAllReputations returns map', () => {
    const cm = new ChoiceManager();
    cm.recordChoice('d1', 'n1', 'a', [{ type: 'reputation', target: 'f1', value: 5 }]);
    expect(cm.getAllReputations().size).toBe(1);
  });
});
