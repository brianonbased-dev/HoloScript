import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DialogueGraph } from '../DialogueGraph';

describe('DialogueGraph', () => {
  let g: DialogueGraph;

  beforeEach(() => { g = new DialogueGraph(); });

  // --- Node Management ---
  it('addTextNode stores node', () => {
    g.addTextNode('t1', 'NPC', 'Hello!', null);
    expect(g.getNodeCount()).toBe(1);
  });

  it('addChoiceNode stores node', () => {
    g.addChoiceNode('c1', 'NPC', 'Pick one', [
      { text: 'A', nextId: 'a' },
      { text: 'B', nextId: 'b' },
    ]);
    expect(g.getNodeCount()).toBe(1);
  });

  it('addBranchNode stores node', () => {
    g.addBranchNode('br1', 'hasKey', 'yes', 'no');
    expect(g.getNodeCount()).toBe(1);
  });

  it('addEventNode stores node', () => {
    g.addEventNode('ev1', 'quest_start', { id: 42 }, null);
    expect(g.getNodeCount()).toBe(1);
  });

  it('addEndNode stores node', () => {
    g.addEndNode('end1');
    expect(g.getNodeCount()).toBe(1);
  });

  // --- Linear Flow ---
  it('start returns first node', () => {
    g.addTextNode('t1', 'NPC', 'Hello', 't2');
    g.addTextNode('t2', 'NPC', 'Bye', null);
    g.setStart('t1');
    const node = g.start();
    expect(node).toBeDefined();
    expect(node!.id).toBe('t1');
    expect(node!.text).toBe('Hello');
  });

  it('advance follows linear chain', () => {
    g.addTextNode('a', 'N', 'one', 'b');
    g.addTextNode('b', 'N', 'two', 'c');
    g.addEndNode('c');
    g.setStart('a');
    g.start();
    const b = g.advance();
    expect(b!.id).toBe('b');
    const c = g.advance(); // reaches end node — returned from processCurrentNode
    // End node is returned first, then another advance returns null
    if (c === null) {
      // If processCurrentNode auto-advanced through end
      expect(g.isComplete()).toBe(true);
    } else {
      expect(c.id).toBe('c');
      expect(g.advance()).toBeNull(); // now it ends
    }
  });

  it('start with no start node returns null', () => {
    expect(g.start()).toBeNull();
  });

  // --- Choices ---
  it('advance with choiceIndex follows branch', () => {
    g.addChoiceNode('c1', 'N', 'Choose', [
      { text: 'Left', nextId: 'l' },
      { text: 'Right', nextId: 'r' },
    ]);
    g.addTextNode('l', 'N', 'Went left', null);
    g.addTextNode('r', 'N', 'Went right', null);
    g.setStart('c1');
    g.start();
    const result = g.advance(1); // choose right
    expect(result!.id).toBe('r');
  });

  it('getAvailableChoices returns choices on choice node', () => {
    g.addChoiceNode('c1', 'N', 'Pick', [
      { text: 'A', nextId: 'a' },
      { text: 'B', nextId: 'b' },
    ]);
    g.setStart('c1');
    g.start();
    expect(g.getAvailableChoices()).toHaveLength(2);
  });

  it('getAvailableChoices filters by condition', () => {
    g.addChoiceNode('c1', 'N', 'Pick', [
      { text: 'A', nextId: 'a' },
      { text: 'B', nextId: 'b', condition: 'hasKey' },
    ]);
    g.setStart('c1');
    g.start();
    // hasKey is falsy → only one choice available
    expect(g.getAvailableChoices()).toHaveLength(1);
    // Set variable to make it truthy
    g.setVariable('hasKey', true);
    expect(g.getAvailableChoices()).toHaveLength(2);
  });

  // --- Branches (condition nodes) ---
  it('branch auto-advances based on condition', () => {
    g.addBranchNode('br1', 'flag', 'yes', 'no');
    g.addTextNode('yes', 'N', 'Yes path', null);
    g.addTextNode('no', 'N', 'No path', null);
    g.setStart('br1');

    g.setVariable('flag', false);
    const result = g.start(); // auto-advances through branch
    expect(result!.id).toBe('no');
  });

  it('branch takes true path when variable is truthy', () => {
    g.addBranchNode('br1', 'flag', 'yes', 'no');
    g.addTextNode('yes', 'N', 'Y', null);
    g.addTextNode('no', 'N', 'N', null);
    g.setStart('br1');
    g.setVariable('flag', true);
    const result = g.start();
    expect(result!.id).toBe('yes');
  });

  // --- Events ---
  it('event node fires listener and auto-advances', () => {
    const listener = vi.fn();
    g.onEvent(listener);
    g.addEventNode('ev1', 'found_key', { key: 'gold' }, 'text1');
    g.addTextNode('text1', 'N', 'Got it!', null);
    g.setStart('ev1');
    const result = g.start(); // auto-advances through event
    expect(listener).toHaveBeenCalledWith('found_key', { key: 'gold' });
    expect(result!.id).toBe('text1');
  });

  // --- Variables & Interpolation ---
  it('setVariable / getVariable', () => {
    g.setVariable('name', 'Alice');
    expect(g.getVariable('name')).toBe('Alice');
  });

  it('interpolateText replaces variables', () => {
    g.setVariable('name', 'Bob');
    expect(g.interpolateText('Hello, {name}!')).toBe('Hello, Bob!');
  });

  it('interpolateText keeps unset variables', () => {
    expect(g.interpolateText('Hello, {unknown}!')).toBe('Hello, {unknown}!');
  });

  // --- History & Visited ---
  it('history tracks visited node ids', () => {
    g.addTextNode('a', 'N', '1', 'b');
    g.addTextNode('b', 'N', '2', null);
    g.setStart('a');
    g.start();
    g.advance();
    expect(g.getHistory()).toEqual(['a', 'b']);
  });

  it('getVisitedCount counts unique visited nodes', () => {
    g.addTextNode('a', 'N', '1', 'b');
    g.addTextNode('b', 'N', '2', null);
    g.setStart('a');
    g.start();
    g.advance();
    expect(g.getVisitedCount()).toBe(2);
  });

  it('isComplete returns true after dialogue ends', () => {
    g.addTextNode('a', 'N', '1', null);
    g.setStart('a');
    g.start();
    g.advance(); // goes to null
    expect(g.isComplete()).toBe(true);
  });

  it('isComplete returns false when no history', () => {
    expect(g.isComplete()).toBe(false);
  });

  // --- getCurrentNode ---
  it('getCurrentNode returns null before start', () => {
    expect(g.getCurrentNode()).toBeNull();
  });

  it('getCurrentNode returns current after start', () => {
    g.addTextNode('a', 'N', '1', null);
    g.setStart('a');
    g.start();
    expect(g.getCurrentNode()!.id).toBe('a');
  });
});
