/**
 * DialogueStress.prod.test.ts
 *
 * Verifies that the Dialogue state machine gracefully handles extreme load,
 * deep nesting, massive choice lists, rapid cyclic transitions, and
 * variable substitution stress testing.
 */
import { describe, it, expect } from 'vitest';
import { DialogueRunner, type DialogueNode } from '../DialogueRunner';

function createTextNode(id: string, text: string, nextId?: string): DialogueNode {
  return { id, type: 'text', speaker: 'NPC', text, nextId };
}

describe('Cycle 185: Dialogue State Machine Stress Tests', () => {
  // --- Depth and Volume ---

  it('handles deeply nested linear progression (10,000 nodes)', () => {
    const dr = new DialogueRunner();
    const nodes: DialogueNode[] = [];
    for (let i = 0; i < 10000; i++) {
      nodes.push(createTextNode(`n${i}`, `Line ${i}`, i < 9999 ? `n${i + 1}` : undefined));
    }
    dr.loadNodes(nodes);

    let count = 0;
    dr.start('n0');
    while (!dr.isFinished() && count < 15000) {
      dr.advance();
      count++;
    }
    expect(count).toBe(10000);
    expect(dr.isFinished()).toBe(true);
  });

  it('handles massive choice branching (5,000 choices on one node)', () => {
    const dr = new DialogueRunner();
    const choices = [];
    for (let i = 0; i < 5000; i++) {
      choices.push({ label: `Choice ${i}`, nextId: `res${i}` });
    }
    const root: DialogueNode = {
      id: 'root',
      type: 'choice',
      speaker: 'NPC',
      text: 'Pick:',
      choices,
    };
    dr.loadNodes([root, createTextNode('res4999', 'You found it')]);

    dr.start('root');
    const available = dr.getAvailableChoices(root);
    expect(available.length).toBe(5000);

    const result = dr.advance(4999);
    expect(result?.text).toBe('You found it');
  });

  it('filters massive choice lists based on conditions stress', () => {
    const dr = new DialogueRunner();
    dr.setVariable('even_only', true);

    const choices = [];
    for (let i = 0; i < 1000; i++) {
      choices.push({
        label: `Choice ${i}`,
        nextId: `res${i}`,
        condition: i % 2 === 0 ? 'even_only' : 'odd_only',
      });
    }
    const root: DialogueNode = {
      id: 'root',
      type: 'choice',
      speaker: 'NPC',
      text: 'Odds or Evens',
      choices,
    };
    dr.loadNodes([root]);
    dr.start('root');

    const available = dr.getAvailableChoices(root);
    expect(available.length).toBe(500); // Only evens
  });

  it('resolves text variables across 1,000 nodes in under 50ms', () => {
    const dr = new DialogueRunner();
    dr.setVariable('hero', 'Alice');
    dr.setVariable('villain', 'Bob');
    dr.setVariable('mc', 'Charlie');

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      dr.resolveText('Hello {hero}, beware of {villain} according to {mc}!');
    }
    const end = performance.now();
    expect(end - start).toBeLessThan(50);
  });

  it('handles cyclic conversation without stack overflow', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([
      createTextNode('n1', 'Loop 1', 'n2'),
      createTextNode('n2', 'Loop 2', 'n3'),
      createTextNode('n3', 'Loop 3', 'n1'), // cycle
    ]);
    dr.start('n1');

    for (let i = 0; i < 1000; i++) {
      const node = dr.advance();
      expect(node).not.toBeNull();
    }
    expect(dr.getHistory().length).toBe(1001);
  });

  it('stops smoothly when jumping to a non-existent node', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([createTextNode('n1', 'A', 'void')]);
    dr.start('n1');
    const result = dr.advance();
    expect(result).toBeNull();
    expect(dr.isFinished()).toBe(true);
  });

  it('resolves 100 sequential truthy branch nodes cleanly', () => {
    const dr = new DialogueRunner();
    dr.setVariable('flag', true);
    const nodes: DialogueNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({
        id: `b${i}`,
        type: 'branch',
        condition: 'flag',
        trueNextId: `b${i + 1}`,
        falseNextId: 'end',
      });
    }
    nodes.push(createTextNode('b100', 'Success'));
    dr.loadNodes(nodes);

    const result = dr.start('b0');
    expect(result?.text).toBe('Success');
  });

  it('resolves 100 sequential falsy branch nodes cleanly', () => {
    const dr = new DialogueRunner();
    dr.setVariable('flag', false);
    const nodes: DialogueNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({
        id: `b${i}`,
        type: 'branch',
        condition: 'flag',
        trueNextId: 'end',
        falseNextId: `b${i + 1}`,
      });
    }
    nodes.push(createTextNode('b100', 'Falsy Path Success'));
    dr.loadNodes(nodes);

    const result = dr.start('b0');
    expect(result?.text).toBe('Falsy Path Success');
  });

  it('returns appropriate choices array when rapidly reloading nodes', () => {
    const dr = new DialogueRunner();
    // Load 1
    dr.loadNodes([{ id: 'c1', type: 'choice', choices: [{ label: '1', nextId: '1' }] }]);
    dr.start('c1');
    expect(dr.getAvailableChoices(dr.getCurrentNode()!).length).toBe(1);

    // Load 2
    dr.loadNodes([
      {
        id: 'c1',
        type: 'choice',
        choices: [
          { label: '1', nextId: '1' },
          { label: '2', nextId: '2' },
        ],
      },
    ]);
    dr.start('c1');
    expect(dr.getAvailableChoices(dr.getCurrentNode()!).length).toBe(2);
  });

  it('handles resolving text with multiple missing variables without failure', () => {
    const dr = new DialogueRunner();
    const result = dr.resolveText('{a} {b} {c} {d}');
    expect(result).toBe('{a} {b} {c} {d}');
  });

  it('clears history correctly when starting new dialogue after massive run', () => {
    const dr = new DialogueRunner();
    const nodes: DialogueNode[] = [];
    for (let i = 0; i < 100; i++) {
      nodes.push(createTextNode(`n${i}`, `L`, i < 99 ? `n${i + 1}` : undefined));
    }
    dr.loadNodes(nodes);
    dr.start('n0');
    for (let i = 0; i < 100; i++) dr.advance();

    expect(dr.getHistory().length).toBe(100);
    dr.start('n0');
    expect(dr.getHistory().length).toBe(1);
  });

  it('event node fires 1,000 consecutive events', () => {
    const dr = new DialogueRunner();
    let counter = 0;
    dr.onEvent((evt) => {
      if (evt === 'ping') counter++;
    });

    const nodes: DialogueNode[] = [];
    for (let i = 0; i < 1000; i++) {
      nodes.push({ id: `e${i}`, type: 'event', event: 'ping', nextId: `e${i + 1}` });
    }
    nodes.push(createTextNode('e1000', 'End'));
    dr.loadNodes(nodes);
    dr.start('e0');
    expect(counter).toBe(1000);
  });

  it('gets undefined when trying to advance choice on non-choice node', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([createTextNode('n1', 'Text')]);
    dr.start('n1');
    const result = dr.advance(0);
    expect(result).toBeNull();
  });

  it('falls back if choice index is out of bounds', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([
      { id: 'c', type: 'choice', choices: [{ label: '1', nextId: 't' }] },
      createTextNode('t', 'End'),
    ]);
    dr.start('c');
    const result = dr.advance(5);
    expect(result).toBeNull();
  });

  // Dynamic injection testing
  for (let phase = 0; phase < 11; phase++) {
    it(`runs random stress phase ${phase} with isolated variables`, () => {
      const dr = new DialogueRunner();
      dr.setVariable('phase', phase);
      dr.loadNodes([
        {
          id: 'start',
          type: 'branch',
          condition: 'phase',
          trueNextId: 'text',
          falseNextId: 'text',
        },
        createTextNode('text', 'Phase {phase}', 'end'),
      ]);
      const node = dr.start('start');
      expect(dr.resolveText(node!.text)).toBe(`Phase ${phase}`);
    });
  }
});
