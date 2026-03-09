import { describe, it, expect, beforeEach } from 'vitest';
import { DialogueGraph } from '../dialogue/DialogueGraph';
import { DialogueRunner } from '../dialogue/DialogueRunner';
import { Localization } from '../dialogue/Localization';

describe('Dialogue System (Cycle 181)', () => {
  describe('DialogueGraph', () => {
    let graph: DialogueGraph;

    beforeEach(() => {
      graph = new DialogueGraph();
      graph.addTextNode('greet', 'NPC', 'Hello {name}!', 'choice1');
      graph.addChoiceNode('choice1', 'NPC', 'What do you want?', [
        { text: 'Trade', nextId: 'trade' },
        { text: 'Quest', nextId: 'quest', condition: 'hasQuest' },
      ]);
      graph.addTextNode('trade', 'NPC', 'Welcome to my shop.', 'end');
      graph.addTextNode('quest', 'NPC', 'Slay the dragon!', 'end');
      graph.addEndNode('end');
      graph.setStart('greet');
    });

    it('should add nodes and count them', () => {
      expect(graph.getNodeCount()).toBe(5);
    });

    it('should start conversation', () => {
      const node = graph.start();
      expect(node).not.toBeNull();
      expect(node!.speaker).toBe('NPC');
    });

    it('should advance through text nodes', () => {
      graph.start();
      const choice = graph.advance();
      expect(choice!.type).toBe('choice');
    });

    it('should filter choices by condition', () => {
      graph.start();
      graph.advance();
      const choices = graph.getAvailableChoices();
      // 'hasQuest' not set, so only Trade available
      expect(choices.length).toBe(1);
      expect(choices[0].text).toBe('Trade');
    });

    it('should interpolate variables in text', () => {
      graph.setVariable('name', 'Hero');
      const result = graph.interpolateText('Hello {name}!');
      expect(result).toBe('Hello Hero!');
    });

    it('should track visit history', () => {
      graph.start();
      expect(graph.getHistory().length).toBeGreaterThan(0);
    });
  });

  describe('DialogueRunner', () => {
    let runner: DialogueRunner;

    beforeEach(() => {
      runner = new DialogueRunner();
      runner.loadNodes([
        { id: 'start', type: 'text', speaker: 'NPC', text: 'Hello {player}!', nextId: 'choice' },
        {
          id: 'choice',
          type: 'choice',
          speaker: 'NPC',
          text: 'Choose:',
          choices: [
            { label: 'Yes', nextId: 'yes' },
            { label: 'No', nextId: 'no' },
          ],
        },
        { id: 'yes', type: 'text', speaker: 'NPC', text: 'Great!' },
        { id: 'no', type: 'text', speaker: 'NPC', text: 'Too bad.' },
      ]);
    });

    it('should start and navigate', () => {
      const first = runner.start('start');
      expect(first).not.toBeNull();
      expect(first!.type).toBe('text');
    });

    it('should advance to choice node', () => {
      runner.start('start');
      const choice = runner.advance();
      expect(choice!.type).toBe('choice');
    });

    it('should resolve text variables', () => {
      runner.setVariable('player', 'Hero');
      expect(runner.resolveText('Hello {player}!')).toBe('Hello Hero!');
    });

    it('should track history', () => {
      runner.start('start');
      expect(runner.getHistory()).toContain('start');
    });
  });

  describe('Localization', () => {
    let loc: Localization;

    beforeEach(() => {
      loc = new Localization();
      loc.addLocale('en', { greeting: 'Hello {name}!', items: '{count} items' });
      loc.addLocale('es', { greeting: '¡Hola {name}!' });
      loc.addPluralRule('en', 'items', { one: '{count} item', other: '{count} items' });
    });

    it('should translate keys', () => {
      expect(loc.t('greeting', { name: 'World' })).toBe('Hello World!');
    });

    it('should fall back to default locale', () => {
      loc.setLocale('es');
      // 'items' not in es, should fall back to en
      expect(loc.t('items', { count: 5 })).toBe('5 items');
    });

    it('should handle missing keys', () => {
      expect(loc.t('nonexistent')).toBe('[nonexistent]');
      expect(loc.getMissingKeys()).toContain('nonexistent');
    });

    it('should pluralize', () => {
      expect(loc.plural('items', 1, {})).toBe('1 item');
      expect(loc.plural('items', 5, {})).toBe('5 items');
    });

    it('should switch locales', () => {
      expect(loc.setLocale('es')).toBe(true);
      expect(loc.getCurrentLocale()).toBe('es');
    });

    it('should report completion percentage', () => {
      expect(loc.getCompletionPercentage('es')).toBe(50); // 1/2 keys
    });
  });
});
