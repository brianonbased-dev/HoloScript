import { describe, it, expect } from 'vitest';
import { DialogueGraph } from '../dialogue/DialogueGraph';
import { ChoiceManager } from '../dialogue/ChoiceManager';
import { Localization } from '../dialogue/Localization';

describe('Cycle 127: Dialogue System', () => {
  // -------------------------------------------------------------------------
  // DialogueGraph
  // -------------------------------------------------------------------------

  it('should navigate linear dialogue', () => {
    const graph = new DialogueGraph();
    graph.addTextNode('start', 'NPC', 'Hello adventurer!', 'mid');
    graph.addTextNode('mid', 'NPC', 'Safe travels!', 'end');
    graph.addEndNode('end');
    graph.setStart('start');

    const first = graph.start();
    expect(first?.text).toBe('Hello adventurer!');

    const second = graph.advance();
    expect(second?.text).toBe('Safe travels!');

    const endNode = graph.advance();
    expect(endNode?.type).toBe('end');

    const done = graph.advance();
    expect(done).toBeNull();
    expect(graph.isComplete()).toBe(true);
  });

  it('should handle branching with choices', () => {
    const graph = new DialogueGraph();
    graph.addTextNode('greet', 'NPC', 'Will you help?', null);
    graph.addChoiceNode('choose', 'Player', 'Your answer:', [
      { text: 'Yes', nextId: 'accept' },
      { text: 'No', nextId: 'reject' },
    ]);
    graph.addTextNode('accept', 'NPC', 'Great!', 'end');
    graph.addTextNode('reject', 'NPC', 'Shame.', 'end');
    graph.addEndNode('end');

    // Update greet to link to choose
    graph.addTextNode('greet', 'NPC', 'Will you help?', 'choose');
    graph.setStart('greet');

    graph.start();
    graph.advance(); // Move to choice node
    const result = graph.advance(0); // Choose "Yes"
    expect(result?.text).toBe('Great!');
  });

  it('should interpolate variables', () => {
    const graph = new DialogueGraph();
    graph.setVariable('playerName', 'Zara');
    const result = graph.interpolateText('Welcome, {playerName}! You have {gold} gold.');
    expect(result).toBe('Welcome, Zara! You have {gold} gold.');
  });

  // -------------------------------------------------------------------------
  // ChoiceManager
  // -------------------------------------------------------------------------

  it('should record choices and apply consequences', () => {
    const mgr = new ChoiceManager();
    mgr.recordChoice('quest1', 'node3', 'Help the village', [
      { type: 'reputation', target: 'villagers', value: 10 },
      { type: 'relationship', target: 'elder', value: 5 },
      { type: 'flag', target: 'quest1_helped', value: true },
    ]);

    expect(mgr.getReputation('villagers')).toBe(10);
    expect(mgr.getRelationship('elder')).toBe(5);
    expect(mgr.getFlag('quest1_helped')).toBe(true);
    expect(mgr.hasChosen('quest1', 'node3')).toBe(true);
  });

  it('should track multiple choices over time', () => {
    const mgr = new ChoiceManager();
    mgr.recordChoice('d1', 'n1', 'A', [{ type: 'reputation', target: 'guild', value: 5 }]);
    mgr.recordChoice('d1', 'n2', 'B', [{ type: 'reputation', target: 'guild', value: -3 }]);
    mgr.recordChoice('d2', 'n1', 'C', []);

    expect(mgr.getReputation('guild')).toBe(2);
    expect(mgr.getChoicesForDialogue('d1')).toHaveLength(2);
    expect(mgr.getChoiceCount()).toBe(3);
  });

  // -------------------------------------------------------------------------
  // Localization
  // -------------------------------------------------------------------------

  it('should translate with locale and fallback', () => {
    const i18n = new Localization();
    i18n.addLocale('en', { greeting: 'Hello', farewell: 'Goodbye' });
    i18n.addLocale('es', { greeting: 'Hola' }); // Missing farewell

    i18n.setLocale('es');
    expect(i18n.t('greeting')).toBe('Hola');
    expect(i18n.t('farewell')).toBe('Goodbye'); // Fallback to en
  });

  it('should interpolate parameters', () => {
    const i18n = new Localization();
    i18n.addLocale('en', { welcome: 'Hello, {name}! Level {level}.' });

    expect(i18n.t('welcome', { name: 'Hero', level: 5 })).toBe('Hello, Hero! Level 5.');
  });

  it('should handle pluralization', () => {
    const i18n = new Localization();
    i18n.addLocale('en', {});
    i18n.addPluralRule('en', 'items', {
      zero: 'No items',
      one: '{count} item',
      other: '{count} items',
    });

    expect(i18n.plural('items', 0)).toBe('No items');
    expect(i18n.plural('items', 1)).toBe('1 item');
    expect(i18n.plural('items', 5)).toBe('5 items');
  });

  it('should report completion percentage', () => {
    const i18n = new Localization();
    i18n.addLocale('en', { a: '1', b: '2', c: '3', d: '4' });
    i18n.addLocale('fr', { a: '1', b: '2' }); // 50% complete

    expect(i18n.getCompletionPercentage('fr')).toBe(50);
  });
});
