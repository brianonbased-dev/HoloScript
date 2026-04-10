/**
 * DialogueRunner — Production Test Suite
 *
 * Covers: loadNodes, start, advance, branching, events,
 * text resolution, choice filtering, history, isFinished.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogueRunner, type DialogueNode } from '../DialogueRunner';

function textNode(id: string, text: string, nextId?: string): DialogueNode {
  return { id, type: 'text', speaker: 'NPC', text, nextId };
}

describe('DialogueRunner — Production', () => {
  // ─── Basic Flow ───────────────────────────────────────────────────
  it('start returns first node', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([textNode('n1', 'Hello')]);
    const node = dr.start('n1');
    expect(node!.text).toBe('Hello');
  });

  it('advance moves through linear dialogue', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([textNode('n1', 'Hi', 'n2'), textNode('n2', 'Bye')]);
    dr.start('n1');
    const n2 = dr.advance();
    expect(n2!.text).toBe('Bye');
    dr.advance(); // no nextId → finished
    expect(dr.isFinished()).toBe(true);
  });

  // ─── Branching ────────────────────────────────────────────────────
  it('branch follows true path', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([
      { id: 'br', type: 'branch', condition: 'hasKey', trueNextId: 'yes', falseNextId: 'no' },
      textNode('yes', 'Open!'),
      textNode('no', 'Locked.'),
    ]);
    dr.setVariable('hasKey', true);
    const node = dr.start('br');
    expect(node!.text).toBe('Open!');
  });

  it('branch follows false path when var missing', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([
      { id: 'br', type: 'branch', condition: 'hasKey', trueNextId: 'yes', falseNextId: 'no' },
      textNode('yes', 'Open!'),
      textNode('no', 'Locked.'),
    ]);
    const node = dr.start('br');
    expect(node!.text).toBe('Locked.');
  });

  // ─── Choice Nodes ─────────────────────────────────────────────────
  it('choice node allows selection', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([
      {
        id: 'c1',
        type: 'choice',
        speaker: 'NPC',
        text: 'Pick:',
        choices: [
          { label: 'A', nextId: 'a' },
          { label: 'B', nextId: 'b' },
        ],
      },
      textNode('a', 'Chose A'),
      textNode('b', 'Chose B'),
    ]);
    dr.start('c1');
    const node = dr.advance(1);
    expect(node!.text).toBe('Chose B');
  });

  it('conditional choice filtered by variable', () => {
    const dr = new DialogueRunner();
    const choiceNode: DialogueNode = {
      id: 'c1',
      type: 'choice',
      speaker: 'NPC',
      text: 'Pick:',
      choices: [
        { label: 'Secret', nextId: 's', condition: 'hasPerk' },
        { label: 'Normal', nextId: 'n' },
      ],
    };
    dr.loadNodes([choiceNode, textNode('s', 'S'), textNode('n', 'N')]);
    dr.start('c1');
    expect(dr.getAvailableChoices(choiceNode).length).toBe(1);
    dr.setVariable('hasPerk', true);
    expect(dr.getAvailableChoices(choiceNode).length).toBe(2);
  });

  // ─── Events ───────────────────────────────────────────────────────
  it('event node fires callback and auto-advances', () => {
    const dr = new DialogueRunner();
    const cb = vi.fn();
    dr.onEvent(cb);
    dr.loadNodes([
      { id: 'ev', type: 'event', event: 'quest_start', nextId: 'n1' },
      textNode('n1', 'Go forth!'),
    ]);
    const node = dr.start('ev');
    expect(cb).toHaveBeenCalledWith('quest_start', 'ev');
    expect(node!.text).toBe('Go forth!');
  });

  // ─── Text Substitution ────────────────────────────────────────────
  it('resolveText substitutes variables', () => {
    const dr = new DialogueRunner();
    dr.setVariable('hero', 'Cloud');
    expect(dr.resolveText('Hello, {hero}!')).toBe('Hello, Cloud!');
  });

  it('resolveText preserves missing vars', () => {
    const dr = new DialogueRunner();
    expect(dr.resolveText('Hello, {missing}!')).toBe('Hello, {missing}!');
  });

  // ─── History ──────────────────────────────────────────────────────
  it('getHistory tracks visited node IDs', () => {
    const dr = new DialogueRunner();
    dr.loadNodes([textNode('n1', 'a', 'n2'), textNode('n2', 'b')]);
    dr.start('n1');
    dr.advance();
    expect(dr.getHistory()).toEqual(['n1', 'n2']);
  });

  // ─── Variables ────────────────────────────────────────────────────
  it('set/getVariable round-trips', () => {
    const dr = new DialogueRunner();
    dr.setVariable('x', 42);
    expect(dr.getVariable('x')).toBe(42);
  });
});
