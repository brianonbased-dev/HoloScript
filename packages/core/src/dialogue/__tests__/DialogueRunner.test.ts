import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogueRunner, type DialogueNode } from '../DialogueRunner';

const simpleDialogue: DialogueNode[] = [
  { id: 'start', type: 'text', speaker: 'NPC', text: 'Hello, {name}!', nextId: 'choice1' },
  {
    id: 'choice1',
    type: 'choice',
    text: 'What do you say?',
    choices: [
      { label: 'Greet', nextId: 'greet' },
      { label: 'Secret', nextId: 'secret', condition: 'hasKey' },
    ],
  },
  { id: 'greet', type: 'text', speaker: 'NPC', text: 'Nice to meet you!', nextId: 'end' },
  { id: 'secret', type: 'text', speaker: 'NPC', text: 'You found the key!' },
  { id: 'end', type: 'event', event: 'dialogue_complete', nextId: undefined },
  { id: 'branch1', type: 'branch', condition: 'isEvil', trueNextId: 'evil', falseNextId: 'good' },
  { id: 'evil', type: 'text', text: 'You are evil!' },
  { id: 'good', type: 'text', text: 'You are good!' },
];

describe('DialogueRunner', () => {
  let runner: DialogueRunner;

  beforeEach(() => {
    runner = new DialogueRunner();
    runner.loadNodes(simpleDialogue);
    runner.setVariable('name', 'Player');
  });

  it('start returns first node', () => {
    const node = runner.start('start');
    expect(node!.id).toBe('start');
    expect(node!.speaker).toBe('NPC');
  });

  it('resolveText substitutes variables', () => {
    expect(runner.resolveText('Hello, {name}!')).toBe('Hello, Player!');
  });

  it('resolveText leaves unknown variables as-is', () => {
    expect(runner.resolveText('{unknown}')).toBe('{unknown}');
  });

  it('advance moves to next text node', () => {
    runner.start('start');
    const choice = runner.advance();
    expect(choice!.type).toBe('choice');
  });

  it('advance with choice index selects branch', () => {
    runner.start('start');
    runner.advance(); // → choice1
    const result = runner.advance(0); // Greet
    expect(result!.id).toBe('greet');
  });

  it('conditional choices filter by variable', () => {
    runner.start('start');
    runner.advance(); // → choice1
    const choices = runner.getAvailableChoices(runner.getCurrentNode()!);
    expect(choices.length).toBe(1); // 'Secret' hidden (no hasKey)
    runner.setVariable('hasKey', true);
    const withKey = runner.getAvailableChoices(runner.getCurrentNode()!);
    expect(withKey.length).toBe(2);
  });

  it('branch node follows condition', () => {
    runner.setVariable('isEvil', true);
    const node = runner.start('branch1');
    expect(node!.id).toBe('evil');
  });

  it('branch node follows false path', () => {
    const node = runner.start('branch1');
    expect(node!.id).toBe('good');
  });

  it('event node fires callback', () => {
    const cb = vi.fn();
    runner.onEvent(cb);
    runner.start('start');
    runner.advance(); // → choice1
    runner.advance(0); // → greet
    runner.advance(); // → end (event node)
    expect(cb).toHaveBeenCalledWith('dialogue_complete', 'end');
  });

  it('isFinished is true at dead end', () => {
    runner.start('start');
    runner.advance(); // → choice1
    runner.advance(0); // → greet
    runner.advance(); // → end (event, no nextId → finished)
    expect(runner.isFinished()).toBe(true);
  });

  it('getHistory tracks visited nodes', () => {
    runner.start('start');
    runner.advance();
    const history = runner.getHistory();
    expect(history).toContain('start');
    expect(history).toContain('choice1');
  });

  it('advance returns null when finished', () => {
    runner.start('secret'); // No nextId
    expect(runner.advance()).toBeNull();
    expect(runner.isFinished()).toBe(true);
  });
});
