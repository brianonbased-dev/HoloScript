/**
 * DialogTrait Tests
 *
 * Tests for conversational NPC dialog system.
 *
 * @version 3.1.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  DialogTrait,
  type DialogTree,
  type DialogNode,
  type DialogChoice,
  type DialogCondition,
  type DialogAction,
  type DialogConfig,
} from '../DialogTrait';

describe('DialogTrait', () => {
  let dialog: DialogTrait;

  beforeEach(() => {
    dialog = new DialogTrait();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const config = dialog.getConfig();

      expect(config.typingSpeed).toBe(50);
      expect(config.allowSkip).toBe(true);
      expect(config.showChoiceNumbers).toBe(true);
      expect(config.inputMode).toBe('any');
      expect(config.maxHistory).toBe(100);
      expect(config.autoSaveVariables).toBe(true);
    });

    it('should accept custom config', () => {
      dialog = new DialogTrait({
        typingSpeed: 100,
        allowSkip: false,
        inputMode: 'voice',
      });

      const config = dialog.getConfig();
      expect(config.typingSpeed).toBe(100);
      expect(config.allowSkip).toBe(false);
      expect(config.inputMode).toBe('voice');
    });

    it('should initialize variables from config', () => {
      dialog = new DialogTrait({
        variables: {
          playerName: 'Hero',
          gold: 100,
        },
      });

      expect(dialog.getVariable('playerName')).toBe('Hero');
      expect(dialog.getVariable('gold')).toBe(100);
    });

    it('should load trees from config', () => {
      const tree: DialogTree = {
        id: 'test-tree',
        name: 'Test Tree',
        startNode: 'start',
        nodes: {
          start: {
            type: 'text',
            text: 'Hello!',
          },
        },
      };

      dialog = new DialogTrait({
        trees: [tree],
      });

      expect(dialog.getTree('test-tree')).toBeDefined();
      expect(dialog.getTreeIds()).toContain('test-tree');
    });
  });

  describe('state management', () => {
    it('should start in inactive state', () => {
      expect(dialog.getState()).toBe('inactive');
      expect(dialog.isActive()).toBe(false);
    });

    it('should change state when dialog starts', () => {
      const tree: DialogTree = {
        id: 'tree-1',
        name: 'Test',
        startNode: 'start',
        nodes: {
          start: { type: 'text', text: 'Hi!' },
        },
      };

      dialog.addTree(tree);
      dialog.start('tree-1');

      expect(dialog.getState()).toBe('active');
      expect(dialog.isActive()).toBe(true);
    });
  });

  describe('tree management', () => {
    it('should add a dialog tree', () => {
      const tree: DialogTree = {
        id: 'greeting',
        name: 'Greeting Dialog',
        startNode: 'hello',
        nodes: {
          hello: { type: 'text', text: 'Hello!' },
        },
      };

      dialog.addTree(tree);

      expect(dialog.getTree('greeting')).toBeDefined();
      expect(dialog.getTreeIds()).toContain('greeting');
    });

    it('should remove a dialog tree', () => {
      const tree: DialogTree = {
        id: 'to-remove',
        name: 'Temp',
        startNode: 'start',
        nodes: {
          start: { type: 'text', text: 'Temp' },
        },
      };

      dialog.addTree(tree);
      expect(dialog.getTree('to-remove')).toBeDefined();

      dialog.removeTree('to-remove');
      expect(dialog.getTree('to-remove')).toBeUndefined();
    });

    it('should get all tree IDs', () => {
      dialog.addTree({
        id: 'tree-a',
        name: 'A',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'A' } },
      });
      dialog.addTree({
        id: 'tree-b',
        name: 'B',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'B' } },
      });

      const ids = dialog.getTreeIds();
      expect(ids).toContain('tree-a');
      expect(ids).toContain('tree-b');
      expect(ids).toHaveLength(2);
    });
  });

  describe('dialog flow', () => {
    beforeEach(() => {
      const tree: DialogTree = {
        id: 'shop',
        name: 'Shop Dialog',
        startNode: 'greeting',
        nodes: {
          greeting: {
            type: 'choice',
            text: 'Welcome! What do you need?',
            choices: [
              { text: 'Buy items', next: 'buy' },
              { text: 'Sell items', next: 'sell' },
              { text: 'Leave', next: null },
            ],
          },
          buy: {
            type: 'text',
            text: 'Browse my wares!',
            next: 'greeting',
          },
          sell: {
            type: 'text',
            text: 'Show me what you have.',
            next: 'greeting',
          },
        },
      };

      dialog.addTree(tree);
    });

    it('should start a dialog', () => {
      const result = dialog.start('shop');

      expect(result).toBe(true);
      expect(dialog.isActive()).toBe(true);
    });

    it('should not start with invalid tree ID', () => {
      const result = dialog.start('nonexistent');

      expect(result).toBe(false);
      expect(dialog.isActive()).toBe(false);
    });

    it('should start at custom node if specified', () => {
      dialog.start('shop', 'buy');

      const node = dialog.getCurrentNode();
      expect(node?.text).toBe('Browse my wares!');
    });

    it('should return current node', () => {
      dialog.start('shop');

      const node = dialog.getCurrentNode();
      expect(node).toBeDefined();
      expect(node?.type).toBe('choice');
      expect(node?.text).toContain('Welcome');
    });

    it('should get available choices', () => {
      dialog.start('shop');

      const choices = dialog.getAvailableChoices();
      expect(choices).toHaveLength(3);
      expect(choices[0].text).toBe('Buy items');
      expect(choices[1].text).toBe('Sell items');
      expect(choices[2].text).toBe('Leave');
    });

    it('should navigate to node when choice selected', () => {
      dialog.start('shop');
      dialog.selectChoice(0);

      const node = dialog.getCurrentNode();
      expect(node?.text).toBe('Browse my wares!');
    });

    it('should end dialog when choice next is null', () => {
      dialog.start('shop');
      dialog.selectChoice(2); // "Leave" choice

      // Dialog state goes through 'ended' then immediately back to 'inactive'
      expect(dialog.isActive()).toBe(false);
      expect(dialog.getState()).toBe('inactive');
    });
  });

  describe('variables', () => {
    it('should set and get variables', () => {
      dialog.setVariable('health', 100);
      dialog.setVariable('name', 'Player');

      expect(dialog.getVariable('health')).toBe(100);
      expect(dialog.getVariable('name')).toBe('Player');
    });

    it('should return undefined for nonexistent variable', () => {
      expect(dialog.getVariable('missing')).toBeUndefined();
    });

    it('should get all variables', () => {
      dialog.setVariable('a', 1);
      dialog.setVariable('b', 2);

      const vars = dialog.getVariables();
      expect(vars.a).toBe(1);
      expect(vars.b).toBe(2);
    });

    it('should clear all variables', () => {
      dialog.setVariable('temp', 'value');
      expect(dialog.getVariable('temp')).toBe('value');

      dialog.clearVariables();
      expect(dialog.getVariable('temp')).toBeUndefined();
    });
  });

  describe('events', () => {
    it('should register event listeners', () => {
      const callback = vi.fn();
      dialog.on('start', callback);

      const tree: DialogTree = {
        id: 'test',
        name: 'Test',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'Hi' } },
      };
      dialog.addTree(tree);
      dialog.start('test');

      expect(callback).toHaveBeenCalled();
      const event = callback.mock.calls[0][0];
      expect(event.type).toBe('start');
      expect(event.treeId).toBe('test');
    });

    it('should remove event listeners', () => {
      const callback = vi.fn();
      dialog.on('start', callback);
      dialog.off('start', callback);

      const tree: DialogTree = {
        id: 'test',
        name: 'Test',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'Hi' } },
      };
      dialog.addTree(tree);
      dialog.start('test');

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('history', () => {
    it('should track dialog history', () => {
      const tree: DialogTree = {
        id: 'multi',
        name: 'Multi',
        startNode: 'a',
        nodes: {
          a: { type: 'text', text: 'A', next: 'b' },
          b: { type: 'text', text: 'B', next: 'c' },
          c: { type: 'text', text: 'C' },
        },
      };

      dialog.addTree(tree);
      dialog.start('multi');

      // Continue through nodes
      dialog.continue();
      dialog.continue();

      const history = dialog.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it('should limit history size', () => {
      dialog = new DialogTrait({ maxHistory: 5 });

      const nodes: Record<string, DialogNode> = {};
      for (let i = 0; i < 10; i++) {
        nodes[`node-${i}`] = {
          type: 'text',
          text: `Node ${i}`,
          next: i < 9 ? `node-${i + 1}` : undefined,
        };
      }

      dialog.addTree({
        id: 'long',
        name: 'Long Dialog',
        startNode: 'node-0',
        nodes,
      });

      dialog.start('long');

      // Navigate through all nodes
      for (let i = 0; i < 9; i++) {
        dialog.continue();
      }

      const history = dialog.getHistory();
      expect(history.length).toBeLessThanOrEqual(5);
    });
  });

  describe('pause and resume', () => {
    beforeEach(() => {
      dialog.addTree({
        id: 'pausable',
        name: 'Pausable',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'Hello' } },
      });
      dialog.start('pausable');
    });

    it('should pause dialog', () => {
      dialog.pause();
      expect(dialog.getState()).toBe('paused');
    });

    it('should resume dialog', () => {
      dialog.pause();
      dialog.resume();
      expect(dialog.getState()).toBe('active');
    });
  });

  describe('end dialog', () => {
    it('should end dialog', () => {
      dialog.addTree({
        id: 'endable',
        name: 'Endable',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'Hello' } },
      });

      dialog.start('endable');
      expect(dialog.isActive()).toBe(true);

      dialog.end();
      // After end(), state goes to 'ended' then immediately 'inactive'
      expect(dialog.isActive()).toBe(false);
      expect(dialog.getState()).toBe('inactive');
    });
  });

  describe('end as reset', () => {
    it('should reset dialog state via end', () => {
      dialog.setVariable('test', 'value');
      dialog.addTree({
        id: 'test',
        name: 'Test',
        startNode: 'start',
        nodes: { start: { type: 'text', text: 'Hi' } },
      });
      dialog.start('test');

      dialog.end();

      expect(dialog.getState()).toBe('inactive');
      expect(dialog.getCurrentNode()).toBeNull();
    });
  });
});

describe('DialogCondition evaluation', () => {
  let dialog: DialogTrait;

  beforeEach(() => {
    dialog = new DialogTrait({
      variables: {
        level: 10,
        gold: 500,
        hasKey: true,
        faction: 'alliance',
      },
    });
  });

  it('should evaluate == condition', () => {
    const tree: DialogTree = {
      id: 'cond',
      name: 'Conditional',
      startNode: 'start',
      nodes: {
        start: {
          type: 'choice',
          text: 'Test',
          choices: [
            {
              text: 'Faction option',
              next: 'faction',
              condition: { variable: 'faction', operator: '==', value: 'alliance' },
            },
          ],
        },
        faction: { type: 'text', text: 'Alliance!' },
      },
    };

    dialog.addTree(tree);
    dialog.start('cond');

    const choices = dialog.getAvailableChoices();
    expect(choices).toHaveLength(1);
  });

  it('should evaluate >= condition', () => {
    const tree: DialogTree = {
      id: 'level-check',
      name: 'Level Check',
      startNode: 'start',
      nodes: {
        start: {
          type: 'choice',
          text: 'Options',
          choices: [
            {
              text: 'High level option',
              next: 'high',
              condition: { variable: 'level', operator: '>=', value: 10 },
            },
            {
              text: 'VIP option',
              next: 'vip',
              condition: { variable: 'level', operator: '>=', value: 50 },
            },
          ],
        },
        high: { type: 'text', text: 'High level' },
        vip: { type: 'text', text: 'VIP' },
      },
    };

    dialog.addTree(tree);
    dialog.start('level-check');

    const choices = dialog.getAvailableChoices();
    expect(choices).toHaveLength(1); // Only level 10+ shows, not 50+
    expect(choices[0].text).toBe('High level option');
  });
});

describe('DialogAction execution', () => {
  let dialog: DialogTrait;

  beforeEach(() => {
    dialog = new DialogTrait();
  });

  it('should execute set_variable action on node enter', () => {
    const tree: DialogTree = {
      id: 'action-test',
      name: 'Action Test',
      startNode: 'start',
      nodes: {
        start: {
          type: 'text',
          text: 'Setting variable',
          onEnter: [{ type: 'set_variable', target: 'visited', value: true }],
        },
      },
    };

    dialog.addTree(tree);
    dialog.start('action-test');

    expect(dialog.getVariable('visited')).toBe(true);
  });
});
