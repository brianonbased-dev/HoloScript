import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogueRunner, DialogueNode } from '../../dialogue/DialogueRunner';

describe('Narrative Flow & Dialogue Runner', () => {
  let runner: DialogueRunner;

  beforeEach(() => {
    runner = new DialogueRunner();
  });

  it('runs linear dialogue with text substitution', () => {
    const nodes: DialogueNode[] = [
      { id: 'start', type: 'text', speaker: 'NPC', text: 'Hello, {playerName}!', nextId: 'end' },
      { id: 'end', type: 'text', speaker: 'NPC', text: 'Goodbye.' },
    ];

    runner.loadNodes(nodes);
    runner.setVariable('playerName', 'Altair');

    const firstNode = runner.start('start');
    expect(firstNode).toBeDefined();
    expect(runner.resolveText(firstNode!.text!)).toBe('Hello, Altair!');

    const nextNode = runner.advance();
    expect(nextNode).toBeDefined();
    expect(nextNode?.id).toBe('end');

    expect(runner.advance()).toBeNull();
    expect(runner.isFinished()).toBe(true);
  });

  it('resolves state conditions in branching nodes correctly', () => {
    const nodes: DialogueNode[] = [
      {
        id: 'check_quest',
        type: 'branch',
        condition: 'hasCompletedQuest',
        trueNextId: 'reward',
        falseNextId: 'quest_offer',
      },
      { id: 'reward', type: 'text', text: 'Thank you for saving the village!' },
      { id: 'quest_offer', type: 'text', text: 'Please help us, our village is under attack!' },
    ];

    runner.loadNodes(nodes);

    // Case 1: False Condition
    runner.setVariable('hasCompletedQuest', false);
    let node = runner.start('check_quest');
    expect(node?.id).toBe('quest_offer');

    // Case 2: True Condition
    runner.setVariable('hasCompletedQuest', true);
    node = runner.start('check_quest');
    expect(node?.id).toBe('reward');
  });

  it('filters available choices based on conditions', () => {
    const nodes: DialogueNode[] = [
      {
        id: 'shop',
        type: 'choice',
        choices: [
          { label: 'Buy Potion', nextId: 'buy', condition: 'hasGold' },
          { label: 'Leave', nextId: 'leave' },
        ],
      },
      { id: 'buy', type: 'text', text: 'Here you go.' },
      { id: 'leave', type: 'text', text: 'See you next time.' },
    ];

    runner.loadNodes(nodes);

    // Without gold
    runner.setVariable('hasGold', false);
    runner.start('shop');
    let choices = runner.getAvailableChoices(runner.getCurrentNode()!);
    expect(choices.length).toBe(1);
    expect(choices[0].label).toBe('Leave');

    // With gold
    runner.setVariable('hasGold', true);
    choices = runner.getAvailableChoices(runner.getCurrentNode()!);
    expect(choices.length).toBe(2);
    expect(choices[0].label).toBe('Buy Potion');

    // Advance to 'Buy Potion'
    const result = runner.advance(0);
    expect(result?.id).toBe('buy');
  });

  it('triggers specific events within the flow and continues', () => {
    const nodes: DialogueNode[] = [
      { id: 'start', type: 'text', nextId: 'give_item' },
      { id: 'give_item', type: 'event', event: 'ITEM_RECEIVED', nextId: 'end' },
      { id: 'end', type: 'text' },
    ];

    const eventCallback = vi.fn();

    runner.loadNodes(nodes);
    runner.onEvent(eventCallback);

    runner.start('start');

    // Advancing should hit the event node, trigger the callback, and auto-advance to "end"
    const node = runner.advance();

    expect(eventCallback).toHaveBeenCalledWith('ITEM_RECEIVED', 'give_item');
    expect(node?.id).toBe('end');
  });
});
