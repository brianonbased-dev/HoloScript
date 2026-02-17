import { describe, it, expect, beforeEach } from 'vitest';
import { DialogueRunner } from '../DialogueRunner';
import type { DialogueNode } from '../DialogueRunner';

function textNode(id: string, text: string, nextId?: string, speaker = 'NPC'): DialogueNode {
  return { id, type: 'text', speaker, text, nextId };
}

function choiceNode(id: string, choices: Array<{ label: string; nextId: string }>): DialogueNode {
  return { id, type: 'choice', speaker: 'NPC', text: 'Pick:', choices };
}

describe('DialogueRunner', () => {
  let runner: DialogueRunner;

  beforeEach(() => { runner = new DialogueRunner(); });

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  it('loadNodes stores nodes', () => {
    runner.loadNodes([textNode('a', 'Hello')]);
    runner.start('a');
    expect(runner.getCurrentNode()?.id).toBe('a');
  });

  // ---------------------------------------------------------------------------
  // Starting
  // ---------------------------------------------------------------------------

  it('start returns the starting node', () => {
    runner.loadNodes([textNode('start', 'Hi')]);
    const node = runner.start('start');
    expect(node).not.toBeNull();
    expect(node!.id).toBe('start');
  });

  it('getCurrentNode returns active node', () => {
    runner.loadNodes([textNode('n1', 'Text')]);
    runner.start('n1');
    expect(runner.getCurrentNode()?.text).toBe('Text');
  });

  it('isFinished is false initially', () => {
    runner.loadNodes([textNode('a', 'Hello', 'b'), textNode('b', 'World')]);
    runner.start('a');
    expect(runner.isFinished()).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Advancing
  // ---------------------------------------------------------------------------

  it('advance moves to next node', () => {
    runner.loadNodes([
      textNode('a', 'First', 'b'),
      textNode('b', 'Second'),
    ]);
    runner.start('a');
    const next = runner.advance();
    expect(next?.id).toBe('b');
  });

  it('advance at end finishes dialogue', () => {
    runner.loadNodes([textNode('only', 'Solo')]);
    runner.start('only');
    runner.advance(); // no nextId → finished
    expect(runner.isFinished()).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Choices
  // ---------------------------------------------------------------------------

  it('getAvailableChoices returns options', () => {
    const cn = choiceNode('c1', [
      { label: 'Option A', nextId: 'a' },
      { label: 'Option B', nextId: 'b' },
    ]);
    runner.loadNodes([cn, textNode('a', 'A'), textNode('b', 'B')]);
    runner.start('c1');
    const choices = runner.getAvailableChoices(runner.getCurrentNode()!);
    expect(choices).toHaveLength(2);
    expect(choices[0].label).toBe('Option A');
  });

  it('advance with choiceIndex follows branch', () => {
    runner.loadNodes([
      choiceNode('c', [
        { label: 'Go A', nextId: 'a' },
        { label: 'Go B', nextId: 'b' },
      ]),
      textNode('a', 'Path A'),
      textNode('b', 'Path B'),
    ]);
    runner.start('c');
    const next = runner.advance(1); // Choose B
    expect(next?.id).toBe('b');
    expect(next?.text).toBe('Path B');
  });

  // ---------------------------------------------------------------------------
  // Branch Nodes (conditional)
  // ---------------------------------------------------------------------------

  it('branch follows true path when condition met', () => {
    runner.loadNodes([
      { id: 'br', type: 'branch', condition: 'hasKey', trueNextId: 'yes', falseNextId: 'no' },
      textNode('yes', 'You have the key'),
      textNode('no', 'No key'),
    ]);
    runner.setVariable('hasKey', true);
    const node = runner.start('br');
    expect(node?.id).toBe('yes');
  });

  it('branch follows false path when condition unmet', () => {
    runner.loadNodes([
      { id: 'br', type: 'branch', condition: 'hasKey', trueNextId: 'yes', falseNextId: 'no' },
      textNode('yes', 'You have the key'),
      textNode('no', 'No key'),
    ]);
    // hasKey not set → falsy
    const node = runner.start('br');
    expect(node?.id).toBe('no');
  });

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  it('event node fires callback', () => {
    let firedEvent = '';
    runner.onEvent((event) => { firedEvent = event; });
    runner.loadNodes([
      { id: 'ev', type: 'event', event: 'door_open', nextId: 'after' },
      textNode('after', 'Door opened'),
    ]);
    runner.start('ev');
    expect(firedEvent).toBe('door_open');
  });

  // ---------------------------------------------------------------------------
  // Variables & Text Substitution
  // ---------------------------------------------------------------------------

  it('setVariable / getVariable stores values', () => {
    runner.setVariable('gold', 100);
    expect(runner.getVariable('gold')).toBe(100);
  });

  it('resolveText substitutes variables', () => {
    runner.setVariable('name', 'Hero');
    const text = runner.resolveText('Hello, {name}!');
    expect(text).toBe('Hello, Hero!');
  });

  it('resolveText preserves unknown vars', () => {
    const text = runner.resolveText('Value: {unknown}');
    expect(text).toBe('Value: {unknown}');
  });

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  it('getHistory tracks visited node ids', () => {
    runner.loadNodes([
      textNode('a', 'Hello', 'b'),
      textNode('b', 'World'),
    ]);
    runner.start('a');
    runner.advance();
    const history = runner.getHistory();
    expect(history).toContain('a');
    expect(history).toContain('b');
  });
});
