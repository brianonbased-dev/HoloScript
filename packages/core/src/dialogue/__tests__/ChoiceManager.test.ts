import { describe, it, expect, beforeEach } from 'vitest';
import { ChoiceManager, type ChoiceConsequence } from '../ChoiceManager';

describe('ChoiceManager', () => {
  let mgr: ChoiceManager;

  beforeEach(() => {
    mgr = new ChoiceManager();
  });

  it('recordChoice stores choice', () => {
    mgr.recordChoice('dlg1', 'n1', 'Be brave');
    expect(mgr.getChoiceCount()).toBe(1);
  });

  it('recordChoice returns choice with id', () => {
    const c = mgr.recordChoice('dlg1', 'n1', 'Yes');
    expect(c.id).toContain('choice_');
    expect(c.choiceText).toBe('Yes');
  });

  it('applies reputation consequence', () => {
    mgr.recordChoice('dlg1', 'n1', 'Help them', [
      { type: 'reputation', target: 'villagers', value: 10 },
    ]);
    expect(mgr.getReputation('villagers')).toBe(10);
  });

  it('stacks reputation changes', () => {
    mgr.recordChoice('d1', 'n1', 'x', [{ type: 'reputation', target: 'f1', value: 5 }]);
    mgr.recordChoice('d1', 'n2', 'y', [{ type: 'reputation', target: 'f1', value: -3 }]);
    expect(mgr.getReputation('f1')).toBe(2);
  });

  it('applies relationship consequence', () => {
    mgr.recordChoice('d1', 'n1', 'Compliment', [
      { type: 'relationship', target: 'npc1', value: 5 },
    ]);
    expect(mgr.getRelationship('npc1')).toBe(5);
  });

  it('applies flag consequence', () => {
    mgr.recordChoice('d1', 'n1', 'Unlock door', [
      { type: 'flag', target: 'door_opened', value: true },
    ]);
    expect(mgr.getFlag('door_opened')).toBe(true);
    expect(mgr.hasFlag('door_opened')).toBe(true);
  });

  it('setFlag and getFlag', () => {
    mgr.setFlag('quest_complete');
    expect(mgr.getFlag('quest_complete')).toBe(true);
    mgr.setFlag('quest_complete', false);
    expect(mgr.getFlag('quest_complete')).toBe(false);
  });

  it('getFlag returns false for unknown', () => {
    expect(mgr.getFlag('nope')).toBe(false);
    expect(mgr.hasFlag('nope')).toBe(false);
  });

  it('getChoicesForDialogue filters by dialogueId', () => {
    mgr.recordChoice('dlg1', 'n1', 'A');
    mgr.recordChoice('dlg2', 'n1', 'B');
    mgr.recordChoice('dlg1', 'n2', 'C');
    expect(mgr.getChoicesForDialogue('dlg1').length).toBe(2);
  });

  it('hasChosen checks specific dialogue+node', () => {
    mgr.recordChoice('dlg1', 'n1', 'A');
    expect(mgr.hasChosen('dlg1', 'n1')).toBe(true);
    expect(mgr.hasChosen('dlg1', 'n2')).toBe(false);
  });

  it('getRecentChoices returns last N', () => {
    mgr.recordChoice('d1', 'n1', 'A');
    mgr.recordChoice('d1', 'n2', 'B');
    mgr.recordChoice('d1', 'n3', 'C');
    const recent = mgr.getRecentChoices(2);
    expect(recent.length).toBe(2);
    expect(recent[0].choiceText).toBe('B');
  });

  it('getAllReputations returns copy', () => {
    mgr.recordChoice('d', 'n', 'x', [{ type: 'reputation', target: 'f', value: 1 }]);
    const reps = mgr.getAllReputations();
    expect(reps.size).toBe(1);
    reps.clear();
    expect(mgr.getAllReputations().size).toBe(1); // Original unaffected
  });
});
