/**
 * DialogueGraph — Production Test Suite
 *
 * Covers: node management, flow control, branching, choices,
 * variables, text interpolation, events, completion, history.
 */
import { describe, it, expect, vi } from 'vitest';
import { DialogueGraph } from '../DialogueGraph';

describe('DialogueGraph — Production', () => {
  // ─── Node Management ──────────────────────────────────────────────
  it('addTextNode registers node', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'Alice', 'Hello!', null);
    expect(dg.getNodeCount()).toBe(1);
  });

  // ─── Linear Flow ──────────────────────────────────────────────────
  it('linear dialogue advances through text nodes', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'Alice', 'Hi!', 'n2');
    dg.addTextNode('n2', 'Bob', 'Hey!', 'end');
    dg.addEndNode('end');
    dg.setStart('n1');
    const first = dg.start();
    expect(first!.text).toBe('Hi!');
    const second = dg.advance();
    expect(second!.text).toBe('Hey!');
    const endNode = dg.advance(); // reaches end node
    expect(endNode!.type).toBe('end');
    dg.advance(); // advance past end node → sets currentNodeId = null
    expect(dg.isComplete()).toBe(true);
  });

  // ─── Choice Nodes ─────────────────────────────────────────────────
  it('choice node presents options and follows selection', () => {
    const dg = new DialogueGraph();
    dg.addChoiceNode('c1', 'Alice', 'Pick one:', [
      { text: 'Option A', nextId: 'a' },
      { text: 'Option B', nextId: 'b' },
    ]);
    dg.addTextNode('a', 'Alice', 'You chose A', null);
    dg.addTextNode('b', 'Alice', 'You chose B', null);
    dg.setStart('c1');
    dg.start();
    expect(dg.getAvailableChoices().length).toBe(2);
    const next = dg.advance(1); // choose B
    expect(next!.text).toBe('You chose B');
  });

  // ─── Branch Nodes ─────────────────────────────────────────────────
  it('branch node follows true path when variable is truthy', () => {
    const dg = new DialogueGraph();
    dg.addBranchNode('br', 'hasKey', 'yes', 'no');
    dg.addTextNode('yes', 'NPC', 'Door opens!', null);
    dg.addTextNode('no', 'NPC', 'Locked.', null);
    dg.setStart('br');
    dg.setVariable('hasKey', true);
    const result = dg.start(); // auto-advances through branch
    expect(result!.text).toBe('Door opens!');
  });

  it('branch node follows false path when variable missing', () => {
    const dg = new DialogueGraph();
    dg.addBranchNode('br', 'hasKey', 'yes', 'no');
    dg.addTextNode('yes', 'NPC', 'Door opens!', null);
    dg.addTextNode('no', 'NPC', 'Locked.', null);
    dg.setStart('br');
    const result = dg.start();
    expect(result!.text).toBe('Locked.');
  });

  // ─── Variables & Interpolation ────────────────────────────────────
  it('setVariable + getVariable', () => {
    const dg = new DialogueGraph();
    dg.setVariable('name', 'Brian');
    expect(dg.getVariable('name')).toBe('Brian');
  });

  it('interpolateText substitutes variables', () => {
    const dg = new DialogueGraph();
    dg.setVariable('hero', 'Alduin');
    expect(dg.interpolateText('Hello, {hero}!')).toBe('Hello, Alduin!');
  });

  it('interpolateText preserves missing variables', () => {
    const dg = new DialogueGraph();
    expect(dg.interpolateText('Hello, {unknown}!')).toBe('Hello, {unknown}!');
  });

  // ─── Event Nodes ──────────────────────────────────────────────────
  it('event node fires listener and auto-advances', () => {
    const dg = new DialogueGraph();
    const listener = vi.fn();
    dg.onEvent(listener);
    dg.addEventNode('ev', 'quest_start', { questId: 'q1' }, 'text');
    dg.addTextNode('text', 'NPC', 'Go forth!', null);
    dg.setStart('ev');
    const result = dg.start();
    expect(listener).toHaveBeenCalledWith('quest_start', { questId: 'q1' });
    expect(result!.text).toBe('Go forth!');
  });

  // ─── History & Visited ────────────────────────────────────────────
  it('tracks visited nodes and history', () => {
    const dg = new DialogueGraph();
    dg.addTextNode('n1', 'A', 'Hi', 'n2');
    dg.addTextNode('n2', 'B', 'Bye', null);
    dg.setStart('n1');
    dg.start();
    dg.advance();
    expect(dg.getVisitedCount()).toBe(2);
    expect(dg.getHistory()).toEqual(['n1', 'n2']);
  });

  // ─── Conditional Choices ──────────────────────────────────────────
  it('conditional choice filtered by variable', () => {
    const dg = new DialogueGraph();
    dg.addChoiceNode('c1', 'NPC', 'Options:', [
      { text: 'Secret', nextId: 'secret', condition: 'hasPerk' },
      { text: 'Normal', nextId: 'normal' },
    ]);
    dg.addTextNode('secret', 'NPC', 'Secret!', null);
    dg.addTextNode('normal', 'NPC', 'Normal.', null);
    dg.setStart('c1');
    dg.start();
    expect(dg.getAvailableChoices().length).toBe(1); // hasPerk not set
    dg.setVariable('hasPerk', true);
    expect(dg.getAvailableChoices().length).toBe(2);
  });
});
